import { Controller, Get, Param } from '@nestjs/common';
import { ConsultationService } from './consultation.service';

@Controller('consultations')
export class ConsultationController {
  constructor(private readonly consultationService: ConsultationService) {}

  @Get('records')
  async getRecords() {
    return this.consultationService.findRecords();
  }

  @Get('records/:id')
  async getRecordById(@Param('id') id: string) {
    return this.consultationService.findRecordById(id);
  }

  @Get('users/:userId/records')
  async getRecordsByUser(@Param('userId') userId: string) {
    return this.consultationService.findRecordsByUserId(userId);
  }
}
