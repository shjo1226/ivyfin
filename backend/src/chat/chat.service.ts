import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { CHAT_SYSTEM_PROMPT } from '../common/prompts/chat-consultation-prompt';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private genAI: GoogleGenAI;

  constructor() {
    this.genAI = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY || '',
    });
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
    return CHAT_SYSTEM_PROMPT
      .replace(/\{고객이름\}/g, customerName)
      .replace(/\{생년월일\}/g, this.formatBirthDate(birthDate));
  }

  async generateResponse(
    messages: Array<{ role: string; content: string }>,
    customerName: string,
    birthDate?: string | null,
  ): Promise<string> {
    try {
      const systemPrompt = this.buildSystemPrompt(customerName, birthDate);

      const contents = messages.map((msg) => ({
        role: msg.role === 'user' ? ('user' as const) : ('model' as const),
        parts: [{ text: msg.content }],
      }));

      const response = await this.genAI.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents,
        config: {
          systemInstruction: systemPrompt,
        },
      });

      return response.text || '죄송합니다. 응답을 생성하지 못했습니다.';
    } catch (error) {
      this.logger.error('Gemini API error:', error);
      throw error;
    }
  }

  async *generateStreamResponse(
    messages: Array<{ role: string; content: string }>,
    customerName: string,
    birthDate?: string | null,
  ): AsyncGenerator<string> {
    try {
      const systemPrompt = this.buildSystemPrompt(customerName, birthDate);

      const contents = messages.map((msg) => ({
        role: msg.role === 'user' ? ('user' as const) : ('model' as const),
        parts: [{ text: msg.content }],
      }));

      const response = await this.genAI.models.generateContentStream({
        model: 'gemini-2.5-flash-lite',
        contents,
        config: {
          systemInstruction: systemPrompt,
        },
      });

      for await (const chunk of response) {
        if (chunk.text) {
          yield chunk.text;
        }
      }
    } catch (error) {
      this.logger.error('Gemini streaming error:', error);
      throw error;
    }
  }
}
