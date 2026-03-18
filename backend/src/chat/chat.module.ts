import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { ConsultationModule } from '../consultation/consultation.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [ConsultationModule, AuthModule],
  providers: [ChatGateway, ChatService],
})
export class ChatModule {}
