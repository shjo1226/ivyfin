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
import { ChatService } from './chat.service';
import { ConsultationService } from '../consultation/consultation.service';
import { PrismaService } from '../prisma/prisma.service';

interface ChatSession {
  userId: string;
  userName: string;
  userBirthDate: string | null;
  consultationId: string;
  messages: Array<{ role: string; content: string }>;
}

type ChatResponseMode = 'streaming' | 'analysis';

@WebSocketGateway({
  namespace: '/chat',
  cors: {
    origin: '*',
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private sessions = new Map<string, ChatSession>();

  constructor(
    private chatService: ChatService,
    private consultationService: ConsultationService,
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  private getResponseMode(
    message: string,
    history: Array<{ role: string; content: string }>,
  ): ChatResponseMode {
    const normalized = message.replace(/\s+/g, ' ').trim();
    const analysisPattern =
      /(분석|요약|정리|리포트|결과|설계|추천|플랜|비교|보장\s*점검|보험료\s*절감|리모델링)/;

    if (analysisPattern.test(normalized)) {
      return 'analysis';
    }

    const userTurns = history.filter((item) => item.role === 'user').length;
    if (userTurns >= 6 && normalized.length >= 20) {
      return 'analysis';
    }

    return 'streaming';
  }

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.query?.token as string);

      if (!token) {
        this.logger.warn('No token provided');
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

      // Create consultation record
      const consultation = await this.consultationService.create(
        user.id,
        'chat',
      );

      this.sessions.set(client.id, {
        userId: user.id,
        userName: user.name,
        userBirthDate: user.birthDate ?? null,
        consultationId: consultation.id,
        messages: [],
      });

      this.logger.log(`Client connected: ${client.id} (${user.name})`);
      client.emit('connected', {
        consultationId: consultation.id,
        userName: user.name,
      });

      // Send initial greeting
      const greeting = await this.chatService.generateResponse(
        [{ role: 'user', content: '상담을 시작합니다.' }],
        user.name,
        user.birthDate,
      );

      const session = this.sessions.get(client.id);
      if (session) {
        session.messages.push(
          { role: 'user', content: '상담을 시작합니다.' },
          { role: 'assistant', content: greeting },
        );
      }

      client.emit('message', {
        role: 'assistant',
        content: greeting,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error('Connection error:', error);
      client.emit('error', { message: '연결에 실패했습니다.' });
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const session = this.sessions.get(client.id);
    if (session) {
      await this.consultationService.interrupt(session.consultationId, {
        messages: session.messages,
      });
      this.sessions.delete(client.id);
    }
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('message')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { content: string },
  ) {
    const session = this.sessions.get(client.id);
    if (!session) {
      client.emit('error', { message: '세션을 찾을 수 없습니다.' });
      return;
    }

    session.messages.push({ role: 'user', content: data.content });

    const responseMode = this.getResponseMode(data.content, session.messages);
    client.emit('typing', { isTyping: true, mode: responseMode });

    try {
      let fullResponse = '';

      if (responseMode === 'analysis') {
        fullResponse = await this.chatService.generateResponse(
          session.messages,
          session.userName,
          session.userBirthDate,
        );
      } else {
        for await (const chunk of this.chatService.generateStreamResponse(
          session.messages,
          session.userName,
          session.userBirthDate,
        )) {
          fullResponse += chunk;
          client.emit('stream', { content: chunk });
        }
      }

      session.messages.push({ role: 'assistant', content: fullResponse });

      await this.consultationService.update(session.consultationId, {
        messages: session.messages,
      });

      client.emit('message', {
        role: 'assistant',
        content: fullResponse,
        mode: responseMode,
        timestamp: new Date().toISOString(),
      });

      client.emit('typing', { isTyping: false, mode: responseMode });

    } catch (error) {
      this.logger.error('Message handling error:', error);
      client.emit('typing', { isTyping: false, mode: responseMode });
      client.emit('message', {
        role: 'assistant',
        content: '죄송합니다. 잠시 문제가 발생했습니다. 다시 말씀해주세요.',
        timestamp: new Date().toISOString(),
      });
    }
  }

  @SubscribeMessage('end-consultation')
  async handleEndConsultation(@ConnectedSocket() client: Socket) {
    const session = this.sessions.get(client.id);
    if (session) {
      await this.consultationService.submit(session.consultationId, {
        messages: session.messages,
      });
      this.sessions.delete(client.id);
      client.emit('consultation-ended', {
        message: '상담이 종료되었습니다. 감사합니다.',
      });
    }
  }
}
