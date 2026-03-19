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
  isCleaningUp: boolean;
  endCallTimeout: ReturnType<typeof setTimeout> | null;
  endCallFinalizeTimeout: ReturnType<typeof setTimeout> | null;
  transcripts: Array<{ role: string; content: string }>;
  suppressUserTranscriptUntil: number;
  isEndCallPending: boolean;
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

  private appendTranscriptChunk(currentText: string, chunk: string) {
    const base = currentText.trim();
    const next = chunk.trim();

    if (!base) {
      return next;
    }

    if (!next) {
      return base;
    }

    if (/^[,.:;!?)]/.test(next) || /[\s(]$/.test(base)) {
      return `${base}${next}`;
    }

    return `${base} ${next}`;
  }

  private buildInitialGreeting(userName: string) {
    return `안녕하세요. GA코리아입니다. ${userName} 고객님 되시죠? 저희 쪽으로 보험 점검 서비스 신청해주셔서 연락드린 상담원입니다. 잠시 통화 괜찮으실까요?`;
  }

  private buildFinalClosingPrompt() {
    return '고객에게 짧게 감사 인사만 한 번 자연스럽게 말씀하고 마무리하세요. 추가 질문은 하지 말고, end_call은 다시 호출하지 마세요.';
  }

  private hasRecentClosingMessage(session: VoiceSession) {
    const recentAssistantMessages = session.transcripts
      .filter((item) => item.role === 'assistant')
      .slice(-2)
      .map((item) => item.content);

    const closingKeywords = [
      '감사합니다',
      '좋은 하루',
      '연락드릴',
      '전화 잘 부탁',
      '마무리',
    ];

    return recentAssistantMessages.some((message) =>
      closingKeywords.some((keyword) => message.includes(keyword)),
    );
  }

  private cancelPendingEndCall(session: VoiceSession, reason: string) {
    if (session.endCallTimeout) {
      clearTimeout(session.endCallTimeout);
      session.endCallTimeout = null;
    }

    if (session.endCallFinalizeTimeout) {
      clearTimeout(session.endCallFinalizeTimeout);
      session.endCallFinalizeTimeout = null;
    }

    this.logger.log(`Pending end_call cleared: ${reason}`);
  }

  private logTranscriptChunk(role: 'user' | 'assistant', text: string) {
    if (role === 'assistant') {
      this.logger.log(`[Voice AI 응답] ${text}`);
      return;
    }

    this.logger.log(`[Voice 고객 발화] ${text}`);
  }

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
          const voiceSession = this.sessions.get(client.id);
          if (!voiceSession) {
            return;
          }

          if (
            event.role === 'user' &&
            voiceSession.suppressUserTranscriptUntil > Date.now()
          ) {
            return;
          }

          client.emit('transcript', event);
          this.logTranscriptChunk(event.role, event.text);

          const last = voiceSession.transcripts[voiceSession.transcripts.length - 1];
          if (event.replace && last && last.role === event.role) {
            last.content = event.text.trim();
          } else if (!event.replace && last && last.role === event.role) {
            last.content = this.appendTranscriptChunk(last.content, event.text);
          } else if (
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
        // onInterrupted callback
        () => {
          const voiceSession = this.sessions.get(client.id);
          if (!voiceSession) {
            return;
          }

          this.cancelPendingEndCall(
            voiceSession,
            'Gemini VAD detected customer interruption',
          );
          voiceSession.isEndCallPending = false;
          client.emit('end-call-cancelled', {
            message: '고객 응답이 감지되어 통화 종료가 취소되었습니다.',
          });
          client.emit('interrupted');
          this.logger.log(`Gemini interruption detected for ${client.id}`);
        },
        // onTurnComplete callback
        () => {
          const voiceSession = this.sessions.get(client.id);
          if (!voiceSession || !voiceSession.isEndCallPending) {
            return;
          }

          this.logger.log(`Turn complete for ${client.id}, starting final end_call sequence`);
          // 2초 후 통화 종료 시작, 추가 2초 지연 후 실제 종료
          voiceSession.endCallTimeout = setTimeout(() => {
            voiceSession.endCallFinalizeTimeout = setTimeout(async () => {
              if (this.sessions.has(client.id)) {
                client.emit('call-ended', {
                  message: '통화가 종료되었습니다.',
                });
                await this.cleanupSession(client, 'submitted');
              }
            }, 2000);
          }, 2000);
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
                this.cancelPendingEndCall(
                  voiceSession,
                  'Scheduling a new end_call',
                );
                voiceSession.isEndCallPending = true;
              }

              // Send tool response back to Gemini
              if (voiceSession?.geminiSession) {
                voiceSession.geminiSession.sendToolResponse({
                  functionResponses: [
                    {
                      id: fc.id,
                      name: 'end_call',
                      response: { success: true },
                    },
                  ],
                });
                if (!this.hasRecentClosingMessage(voiceSession)) {
                  voiceSession.geminiSession.sendClientContent({
                    turns: [
                      {
                        role: 'user',
                        parts: [
                          {
                            text: this.buildFinalClosingPrompt(),
                          },
                        ],
                      },
                    ],
                    turnComplete: true,
                  });
                }
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
        async () => {
          this.logger.log(`Gemini session closed for ${client.id}`);
          const voiceSession = this.sessions.get(client.id);
          if (!voiceSession) {
            return;
          }

          if (voiceSession.isCleaningUp) {
            return;
          }

          voiceSession.geminiSession = null;
          client.emit('error', {
            message: '음성 상담 세션이 종료되었습니다. 다시 연결해주세요.',
          });
          await this.cleanupSession(client, 'interrupted');
        },
      );

      this.sessions.set(client.id, {
        userId: user.id,
        userName: user.name,
        consultationId: consultation.id,
        geminiSession: geminiSession,
        isCleaningUp: false,
        endCallTimeout: null,
        endCallFinalizeTimeout: null,
        transcripts: [],
        suppressUserTranscriptUntil: 0,
        isEndCallPending: false,
      });

      this.logger.log(`Voice client connected: ${client.id} (${user.name})`);
      client.emit('connected', {
        consultationId: consultation.id,
        userName: user.name,
      });

      // Trigger initial greeting automatically
      if (geminiSession) {
        const greeting = this.buildInitialGreeting(user.name);
        this.logger.log(`Sending initial greeting for ${client.id}: ${greeting}`);

        geminiSession.sendClientContent({
          turns: [
            {
              role: 'user',
              parts: [
                {
                  text: `다음 문장을 첫 인사로 그대로 말한 뒤 고객 응답을 기다리세요. ${greeting}`,
                },
              ],
            },
          ],
          turnComplete: true,
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
      this.cancelPendingEndCall(session, 'New text input received');
      session.suppressUserTranscriptUntil = Date.now() + 3000;
      session.transcripts.push({ role: 'user', content: text });
      client.emit('transcript', { role: 'user', text, replace: true });
      this.logTranscriptChunk('user', text);

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
      session.isCleaningUp = true;
      this.cancelPendingEndCall(session, 'Cleaning up voice session');
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
