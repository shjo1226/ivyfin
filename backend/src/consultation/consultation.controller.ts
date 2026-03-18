import {
  Controller,
  Get,
  Param,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { ConsultationService } from './consultation.service';

@Controller('consultations')
export class ConsultationController {
  constructor(private readonly consultationService: ConsultationService) {}

  @Get('records')
  async getRecords() {
    return this.consultationService.findRecords();
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me/records')
  async getMyRecords(@Request() req: any) {
    return this.consultationService.findRecordsByUserId(req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me/records/:id')
  async getMyRecordById(@Request() req: any, @Param('id') id: string) {
    return this.consultationService.findRecordByIdAndUserId(id, req.user.id);
  }

  @Get('admin/records')
  async getAdminRecords() {
    return this.consultationService.findRecords();
  }

  @Get('admin/records/export')
  async exportAdminRecords(@Res() res: Response) {
    const csv = await this.consultationService.exportRecordsCsv();
    const fileName = `consultation-records-${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}"`,
    );
    res.send(csv);
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
