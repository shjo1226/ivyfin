import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Session } from '@google/genai';
import { VoiceService, VoiceTranscriptEvent } from './voice.service';
import { ConsultationService } from '../consultation/consultation.service';
import { PrismaService } from '../prisma/prisma.service';

interface VoiceSession {
  userId: string;
  userName: string;
  consultationId: string;
  geminiSession: Session | null;
  endCallTimeout: ReturnType<typeof setTimeout> | null;
  transcripts: Array<{ role: string; content: string }>;
}

@WebSocketGateway({
  namespace: '/voice',
  cors: {
    origin: '*',
  },
})
export class VoiceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(VoiceGateway.name);
  private sessions = new Map<string, VoiceSession>();

  private shouldAppendTranscript(
    transcripts: Array<{ role: string; content: string }>,
    role: 'user' | 'assistant',
    text: string,
  ) {
    const normalized = text.trim();
    if (!normalized) {
      return false;
    }

    const last = transcripts[transcripts.length - 1];
    if (!last) {
      return true;
    }

    if (last.role !== role) {
      return true;
    }

    const lastNormalized = last.content.trim();
    if (lastNormalized === normalized) {
      return false;
    }

    if (
      normalized.startsWith(lastNormalized) ||
      lastNormalized.startsWith(normalized)
    ) {
      last.content = normalized;
      return false;
    }

    return true;
  }

  constructor(
    private voiceService: VoiceService,
    private consultationService: ConsultationService,
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.query?.token as string);

      if (!token) {
        client.emit('error', { message: '인증이 필요합니다.' });
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user) {
        client.emit('error', { message: '사용자를 찾을 수 없습니다.' });
        client.disconnect();
        return;
      }

      const consultation = await this.consultationService.create(
        user.id,
        'voice',
      );

      // Create Gemini Live session with callbacks
      const geminiSession = await this.voiceService.createLiveSession(
        user.name,
        user.birthDate,
        // onAudio callback
        (base64Data: string) => {
          client.emit('audio', {
            data: base64Data,
            mimeType: 'audio/pcm;rate=24000',
          });
        },
        // onTranscript callback
        (event: VoiceTranscriptEvent) => {
          client.emit('transcript', event);
          const voiceSession = this.sessions.get(client.id);
          if (
            voiceSession &&
            this.shouldAppendTranscript(
              voiceSession.transcripts,
              event.role,
              event.text,
            )
          ) {
            voiceSession.transcripts.push({
              role: event.role,
              content: event.text.trim(),
            });
          }
        },
        // onToolCall callback
        (functionCalls: any[]) => {
          for (const fc of functionCalls) {
            if (fc.name === 'end_call') {
              this.logger.log(
                `end_call tool called for ${client.id}: ${fc.args?.reason}`,
              );
              client.emit('end-call-initiated', {
                reason: fc.args?.reason || '상담이 완료되었습니다.',
              });

              const voiceSession = this.sessions.get(client.id);
              if (voiceSession) {
                if (voiceSession.endCallTimeout) {
                  clearTimeout(voiceSession.endCallTimeout);
                }
                // 5초 후 통화 종료 시작, 2초 지연 후 실제 종료
                voiceSession.endCallTimeout = setTimeout(async () => {
                  setTimeout(async () => {
                    if (this.sessions.has(client.id)) {
                      client.emit('call-ended', {
                        message: '통화가 종료되었습니다.',
                      });
                      await this.cleanupSession(client, 'submitted');
                    }
                  }, 2000);
                }, 5000);
              }

              // Send tool response back to Gemini
              if (voiceSession?.geminiSession) {
                voiceSession.geminiSession.sendToolResponse({
                  functionResponses: [
                    {
                      name: 'end_call',
                      response: { success: true },
                    },
                  ],
                });
              }
            }
          }
        },
        // onError callback
        (error: any) => {
          this.logger.error('Gemini session error:', error);
          client.emit('error', { message: '음성 처리 중 오류가 발생했습니다.' });
        },
        // onClose callback
        () => {
          this.logger.log(`Gemini session closed for ${client.id}`);
        },
      );

      this.sessions.set(client.id, {
        userId: user.id,
        userName: user.name,
        consultationId: consultation.id,
        geminiSession: geminiSession,
        endCallTimeout: null,
        transcripts: [],
      });

      this.logger.log(`Voice client connected: ${client.id} (${user.name})`);
      client.emit('connected', {
        consultationId: consultation.id,
        userName: user.name,
      });

      // Trigger initial greeting automatically
      if (geminiSession) {
        geminiSession.sendRealtimeInput({
          text: '안녕하세요, 인사를 시작해주세요.',
        });
      }
    } catch (error) {
      this.logger.error('Voice connection error:', error);
      client.emit('error', { message: '음성 연결에 실패했습니다.' });
      client.disconnect();
    }
  }

  @SubscribeMessage('audio')
  async handleAudio(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { data: string; mimeType?: string },
  ) {
    const session = this.sessions.get(client.id);
    if (!session?.geminiSession) {
      return;
    }

    try {
      // Cancel pending end_call if user is speaking
      if (session.endCallTimeout) {
        clearTimeout(session.endCallTimeout);
        session.endCallTimeout = null;
        this.logger.log('end_call cancelled - user is speaking');
      }

      // Send audio to Gemini Live API using sendRealtimeInput
      const audioBuffer = Buffer.from(data.data, 'base64');
      session.geminiSession.sendRealtimeInput({
        audio: {
          data: audioBuffer.toString('base64'),
          mimeType: data.mimeType || 'audio/pcm;rate=16000',
        },
      });
    } catch (error) {
      this.logger.error('Audio processing error:', error);
    }
  }

  @SubscribeMessage('text-input')
  async handleTextInput(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { text: string },
  ) {
    const session = this.sessions.get(client.id);
    const text = data.text?.trim();

    if (!session?.geminiSession || !text) {
      return;
    }

    try {
      if (session.endCallTimeout) {
        clearTimeout(session.endCallTimeout);
        session.endCallTimeout = null;
      }

      session.transcripts.push({ role: 'user', content: text });
      client.emit('transcript', { role: 'user', text });

      session.geminiSession.sendRealtimeInput({ text });
    } catch (error) {
      this.logger.error('Text input processing error:', error);
      client.emit('error', { message: '텍스트 입력 처리 중 오류가 발생했습니다.' });
    }
  }

  @SubscribeMessage('end-call')
  async handleEndCall(@ConnectedSocket() client: Socket) {
    await this.cleanupSession(client, 'submitted');
    client.emit('call-ended', { message: '통화가 종료되었습니다.' });
  }

  private async cleanupSession(
    client: Socket,
    finalStatus: 'submitted' | 'interrupted' = 'interrupted',
  ) {
    const session = this.sessions.get(client.id);
    if (session) {
      if (session.endCallTimeout) {
        clearTimeout(session.endCallTimeout);
      }
      if (session.geminiSession) {
        try {
          session.geminiSession.close();
        } catch (e) {
          this.logger.warn('Error closing Gemini session:', e);
        }
      }
      if (finalStatus === 'submitted') {
        await this.consultationService.submit(session.consultationId, {
          messages: session.transcripts,
        });
      } else {
        await this.consultationService.interrupt(session.consultationId, {
          messages: session.transcripts,
        });
      }
      this.sessions.delete(client.id);
    }
  }

  async handleDisconnect(client: Socket) {
    await this.cleanupSession(client, 'interrupted');
    this.logger.log(`Voice client disconnected: ${client.id}`);
  }
}
