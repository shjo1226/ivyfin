import { Module } from '@nestjs/common';
import { VoiceGateway } from './voice.gateway';
import { VoiceService } from './voice.service';
import { ConsultationModule } from '../consultation/consultation.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [ConsultationModule, AuthModule],
  providers: [VoiceGateway, VoiceService],
})
export class VoiceModule {}
