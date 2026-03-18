import { Injectable, Logger } from '@nestjs/common';
import {
  ActivityHandling,
  EndSensitivity,
  GoogleGenAI,
  Modality,
  Session,
  StartSensitivity,
  TurnCoverage,
} from '@google/genai';
import { VOICE_SYSTEM_PROMPT } from '../common/prompts/voice-consultation-prompt';

export interface VoiceTranscriptEvent {
  role: 'user' | 'assistant';
  text: string;
  replace?: boolean;
}

@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);
  private genAI: GoogleGenAI;
  private readonly modelName: string;
  private readonly voiceName?: string;

  constructor() {
    this.genAI = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY || '',
    });
    this.modelName = this.buildModelName();
    this.voiceName = process.env.GEMINI_VOICE?.trim() || undefined;
  }

  private buildModelName(): string {
    const rawModel =
      process.env.GEMINI_MODEL?.trim() ||
      'gemini-2.5-flash-native-audio-preview-09-2025';

    return rawModel.startsWith('models/') ? rawModel : `models/${rawModel}`;
  }

  private formatBirthDate(birthDate?: string | null): string {
    if (!birthDate) {
      return '등록된 생년월일';
    }

    const digits = birthDate.replace(/\D/g, '');
    if (digits.length === 8) {
      return `${digits.slice(0, 4)}년 ${digits.slice(4, 6)}월 ${digits.slice(6, 8)}일`;
    }

    return birthDate;
  }

  private buildSystemPrompt(customerName: string, birthDate?: string | null): string {
    return VOICE_SYSTEM_PROMPT
      .replace(/\{고객이름\}/g, customerName)
      .replace(/\{생년월일\}/g, this.formatBirthDate(birthDate));
  }

  private sanitizeTranscriptText(text: string): string {
    return text
      .replace(/\b(?:filtration_duration|latency|timestamp|confidence|segment_duration)[\w.:/-]*\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async createLiveSession(
    customerName: string,
    birthDate: string | null | undefined,
    onAudio: (data: string) => void,
    onTranscript: (event: VoiceTranscriptEvent) => void,
    onInterrupted: () => void,
    onToolCall: (functionCalls: any[]) => void,
    onError: (error: any) => void,
    onClose: () => void,
  ): Promise<Session> {
    const systemPrompt = this.buildSystemPrompt(customerName, birthDate);
    const speechConfig = this.voiceName
      ? {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: this.voiceName,
          },
        },
      }
      : undefined;

    this.logger.log(`Connecting Gemini Live with model: ${this.modelName}`);

    const session = await this.genAI.live.connect({
      model: this.modelName,
      callbacks: {
        onmessage: (message: any) => {
          const content = message.serverContent;

          if (content?.interrupted) {
            onInterrupted();
          }

          if (content?.modelTurn?.parts) {
            for (const part of content.modelTurn.parts) {
              if (part.inlineData?.data) {
                onAudio(part.inlineData.data);
              }
            }
          }

          if (content?.inputTranscription?.text) {
            const sanitizedText = this.sanitizeTranscriptText(
              content.inputTranscription.text,
            );
            if (sanitizedText) {
              onTranscript({
                role: 'user',
                text: sanitizedText,
                replace: true,
              });
            }
          }

          if (content?.outputTranscription?.text) {
            const sanitizedText = this.sanitizeTranscriptText(
              content.outputTranscription.text,
            );
            if (sanitizedText) {
              onTranscript({
                role: 'assistant',
                text: sanitizedText,
                replace: false,
              });
            }
          }

          if (message.toolCall) {
            const functionCalls = message.toolCall.functionCalls || [];
            if (functionCalls.length > 0) {
              onToolCall(functionCalls);
            }
          }
        },
        onerror: (e: any) => {
          this.logger.error(
            `Gemini Live session error (${this.modelName}):`,
            e,
          );
          onError(e);
        },
        onclose: () => {
          this.logger.log(`Gemini Live session closed (${this.modelName})`);
          onClose();
        },
      },
      config: {
        responseModalities: [Modality.AUDIO],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        ...(speechConfig ? { speechConfig } : {}),
        realtimeInputConfig: {
          automaticActivityDetection: {
            disabled: false,
            silenceDurationMs: 800,
            prefixPaddingMs: 300,
            startOfSpeechSensitivity:
              StartSensitivity.START_SENSITIVITY_UNSPECIFIED,
            endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
          },
          activityHandling: ActivityHandling.START_OF_ACTIVITY_INTERRUPTS,
          turnCoverage: TurnCoverage.TURN_INCLUDES_ONLY_ACTIVITY,
        },
        tools: [
          {
            functionDeclarations: [
              {
                name: 'end_call',
                description:
                  '마무리 멘트를 전달한 후 통화를 종료합니다. 고객이 추가 질문이 있으면 먼저 응답한 후 다시 호출하세요.',
                parameters: {
                  type: 'object' as any,
                  properties: {
                    reason: {
                      type: 'string' as any,
                      description: '통화 종료 사유',
                    },
                  },
                },
              },
            ],
          },
        ],
      },
    });

    return session;
  }
}
