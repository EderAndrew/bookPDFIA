/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable } from '@nestjs/common';
import pdf from 'pdf-parse';
import { AiService } from '../ai/ai.service';
import { DocumentMatch, SupabaseService } from '../supabase/supabase.service';

const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 100;

@Injectable()
export class PdfService {
  constructor(
    private readonly aiService: AiService,
    private readonly supabaseService: SupabaseService,
  ) {}

  async processPdf(file: Express.Multer.File): Promise<{
    textLength: number;
    totalChunks: number;
  }> {
    const data = await pdf(file.buffer);
    const cleanedText = this.cleanText(data.text);
    const chunks = this.chunkText(cleanedText);

    const embeddings = await this.aiService.embedBatch(chunks);
    await this.supabaseService.saveEmbeddings(embeddings, file.originalname);

    return {
      textLength: data.text.length,
      totalChunks: chunks.length,
    };
  }

  async ask(question: string): Promise<{ answer: string }> {
    const questionEmbedding = await this.aiService.embed(question);
    const matches: DocumentMatch[] =
      await this.supabaseService.searchSimilar(questionEmbedding);

    const context: string = matches.map((m) => m.content).join('\n\n');
    const answer = await this.aiService.chat(context, question);

    return { answer };
  }

  // RegExp via construtor para evitar a regra no-control-regex do ESLint
  private readonly reControlChars = new RegExp(
    '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', // eslint-disable-line no-control-regex
    'g',
  );

  cleanText(text: string): string {
    return text
      .replace(this.reControlChars, '')
      .replace(/[\uFFFD\uD800-\uDFFF]/g, '')
      .replace(/[\uE000-\uF8FF]/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/^ +$/gm, '')
      .trim();
  }

  chunkText(text: string): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = start + CHUNK_SIZE;
      const chunk = text.slice(start, end).trim();

      if (chunk.length > 0) {
        chunks.push(chunk);
      }

      start += CHUNK_SIZE - CHUNK_OVERLAP;
    }

    return chunks;
  }
}
