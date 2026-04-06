import { Injectable } from '@nestjs/common';
import pdf from 'pdf-parse';
import { AiService } from '../ai/ai.service';
import { SupabaseService } from '../supabase/supabase.service';

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
    const chunks = this.chunkText(data.text).slice(0, 10); // TODO: remover limite após testes

    const embeddings = await this.aiService.embedBatch(chunks);
    await this.supabaseService.saveEmbeddings(embeddings, file.originalname);

    return {
      textLength: data.text.length,
      totalChunks: chunks.length,
    };
  }

  chunkText(text: string): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = start + CHUNK_SIZE;
      chunks.push(text.slice(start, end));
      start += CHUNK_SIZE - CHUNK_OVERLAP;
    }

    return chunks;
  }
}
