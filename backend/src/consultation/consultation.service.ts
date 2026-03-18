import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ConsultationService {
  private readonly logger = new Logger(ConsultationService.name);
  private genAI: GoogleGenAI;

  constructor(private prisma: PrismaService) {
    this.genAI = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY || '',
    });
  }

  async create(userId: string, type: 'chat' | 'voice') {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('사용자를 찾을 수 없습니다.');
    }

    const record = await this.prisma.consultationRecord.create({
      data: {
        userId,
        sourceType: type,
        status: 'collecting',
        customerName: user.name,
        customerPhone: user.phone,
        customerBirthDate: user.birthDate,
      },
    });

    return this.prisma.consultation.create({
      data: {
        userId,
        recordId: record.id,
        type,
        status: 'collecting',
      },
    });
  }

  async findById(id: string) {
    return this.prisma.consultation.findUnique({
      where: { id },
      include: { user: true },
    });
  }

  async findByUserId(userId: string) {
    return this.prisma.consultation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findRecords() {
    return this.prisma.consultationRecord.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: true,
        consultations: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async exportRecordsCsv() {
    const records = await this.findRecords();
    const headers = [
      '접수ID',
      '상태',
      '상담유형',
      '고객명',
      '연락처',
      '생년월일',
      '관심분야',
      '최근 병력',
      '복용 약',
      '현재 보험 요약',
      '월 보험료',
      '방문 지역',
      '방문 주소',
      '주소 구분',
      '희망 연도',
      '희망 월',
      '희망 일',
      '희망 시간대',
      '희망 시간',
      '메모',
      '생성일시',
      '수정일시',
    ];

    const escapeCsv = (value: unknown) => {
      const raw = value == null ? '' : String(value);
      return `"${raw.replace(/"/g, '""')}"`;
    };

    const statusMap: Record<string, string> = {
      collecting: '상담중',
      submitted: '상담완료',
      interrupted: '상담중단',
    };

    const typeMap: Record<string, string> = {
      chat: '채팅',
      voice: '음성',
    };

    const rows = records.map((record) => [
      record.id,
      statusMap[record.status] || record.status,
      typeMap[record.sourceType] || record.sourceType,
      record.customerName,
      record.customerPhone,
      record.customerBirthDate,
      record.interestAreas?.join(', '),
      record.recentMedicalHistory,
      record.currentMedicationStatus,
      record.currentInsuranceSummary,
      record.monthlyPremium,
      record.visitRegion,
      record.visitAddress,
      record.visitAddressType,
      record.preferredVisitYear,
      record.preferredVisitMonth,
      record.preferredVisitDay,
      record.preferredVisitTimePeriod,
      record.preferredVisitTime,
      record.notes,
      record.createdAt.toISOString(),
      record.updatedAt.toISOString(),
    ]);

    return [
      '\uFEFF' + headers.map(escapeCsv).join(','),
      ...rows.map((row) => row.map(escapeCsv).join(',')),
    ].join('\n');
  }

  async findRecordById(id: string) {
    return this.prisma.consultationRecord.findUnique({
      where: { id },
      include: {
        user: true,
        consultations: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async findRecordByIdAndUserId(id: string, userId: string) {
    return this.prisma.consultationRecord.findFirst({
      where: { id, userId },
      include: {
        consultations: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async findRecordsByUserId(userId: string) {
    return this.prisma.consultationRecord.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        consultations: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async update(id: string, data: any) {
    const consultation = await this.prisma.consultation.update({
      where: { id },
      data,
    });

    if (data.messages) {
      await this.syncRecordFromConsultation(id, data.messages);
    }

    return consultation;
  }

  async submit(id: string, summary?: any) {
    const consultation = await this.prisma.consultation.update({
      where: { id },
      data: {
        status: 'submitted',
        summary,
      },
      include: {
        record: true,
      },
    });

    if (consultation.recordId) {
      const recordId = consultation.recordId;
      await this.prisma.consultationRecord.update({
        where: { id: recordId },
        data: {
          status: 'submitted',
        },
      });
    }

    if (summary?.messages) {
      await this.syncRecordFromConsultation(id, summary.messages);
    }

    const updatedRecord = consultation.recordId
      ? await this.prisma.consultationRecord.findUnique({
          where: { id: consultation.recordId as string },
        })
      : null;

    this.logger.log(
      `[상담 종료/최종 저장] ID: ${id}, 데이터: ${JSON.stringify(updatedRecord, null, 2)}`,
    );

    return consultation;
  }

  async interrupt(id: string, summary?: any) {
    const consultation = await this.prisma.consultation.update({
      where: { id },
      data: {
        status: 'interrupted',
        summary,
      },
      include: {
        record: true,
      },
    });

    if (consultation.recordId) {
      const recordId = consultation.recordId;
      await this.prisma.consultationRecord.update({
        where: { id: recordId },
        data: {
          status: 'interrupted',
        },
      });
    }

    if (summary?.messages) {
      await this.syncRecordFromConsultation(id, summary.messages);
    }

    return consultation;
  }

  private normalizeJsonResponse(text: string) {
    const trimmed = text.trim();
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');

    if (start === -1 || end === -1 || end <= start) {
      throw new Error('JSON 응답을 찾지 못했습니다.');
    }

    return JSON.parse(trimmed.slice(start, end + 1));
  }

  async syncRecordFromConsultation(
    consultationId: string,
    messages: Array<{ role: string; content: string }>,
  ) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
      include: {
        user: true,
        record: true,
      },
    });

    if (!consultation?.record || messages.length === 0) {
      return;
    }

    try {
      const transcript = messages
        .map((message) => `${message.role === 'user' ? '고객' : '상담사'}: ${message.content}`)
        .join('\n');

      const prompt = `
다음 보험 상담 대화에서 구조화된 상담 내역만 추출하세요.
반드시 JSON만 반환하세요.
값이 확실하지 않으면 null로 두세요.
interestAreas는 문자열 배열입니다.
customerConfirmed, birthDateConfirmed는 true/false로 반환하세요.
preferredVisitYear, preferredVisitMonth, preferredVisitDay는 숫자 또는 null입니다.

기본 고객 정보:
- name: ${consultation.user.name}
- phone: ${consultation.user.phone}
- birthDate: ${consultation.user.birthDate ?? ''}

반환 JSON 스키마:
{
  "customerConfirmed": boolean,
  "birthDateConfirmed": boolean,
  "recentMedicalHistory": string | null,
  "currentMedicationStatus": string | null,
  "currentInsuranceSummary": string | null,
  "monthlyPremium": string | null,
  "interestAreas": string[],
  "visitRegion": string | null,
  "visitAddress": string | null,
  "visitAddressType": string | null,
  "preferredVisitYear": number | null,
  "preferredVisitMonth": number | null,
  "preferredVisitDay": number | null,
  "preferredVisitTime": string | null,
  "preferredVisitTimePeriod": string | null,
  "notes": string | null
}

대화:
${transcript}
`;

      const response = await this.genAI.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });

      const extracted = this.normalizeJsonResponse(response.text || '{}');

      await this.prisma.consultationRecord.update({
        where: { id: consultation.record.id },
        data: {
          customerConfirmed:
            typeof extracted.customerConfirmed === 'boolean'
              ? extracted.customerConfirmed
              : consultation.record.customerConfirmed,
          birthDateConfirmed:
            typeof extracted.birthDateConfirmed === 'boolean'
              ? extracted.birthDateConfirmed
              : consultation.record.birthDateConfirmed,
          recentMedicalHistory: extracted.recentMedicalHistory ?? undefined,
          currentMedicationStatus:
            extracted.currentMedicationStatus ?? undefined,
          currentInsuranceSummary:
            extracted.currentInsuranceSummary ?? undefined,
          monthlyPremium: extracted.monthlyPremium ?? undefined,
          interestAreas: Array.isArray(extracted.interestAreas)
            ? extracted.interestAreas
            : consultation.record.interestAreas,
          visitRegion: extracted.visitRegion ?? undefined,
          visitAddress: extracted.visitAddress ?? undefined,
          visitAddressType: extracted.visitAddressType ?? undefined,
          preferredVisitYear: extracted.preferredVisitYear ?? undefined,
          preferredVisitMonth: extracted.preferredVisitMonth ?? undefined,
          preferredVisitDay: extracted.preferredVisitDay ?? undefined,
          preferredVisitTime: extracted.preferredVisitTime ?? undefined,
          preferredVisitTimePeriod:
            extracted.preferredVisitTimePeriod ?? undefined,
          notes: extracted.notes ?? undefined,
          extractedSnapshot: extracted,
        },
      });

      this.logger.log(
        `[데이터 수집/중간 로그] 상담 ID: ${consultationId}, 추출 데이터: ${JSON.stringify(extracted, null, 2)}`,
      );
    } catch (error) {
      this.logger.warn(
        `상담 내역 구조화 추출 실패 (${consultationId}): ${String(error)}`,
      );
    }
  }
}
