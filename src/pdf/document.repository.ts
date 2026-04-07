/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ChunkEmbedding } from '../ai/ai.service';
import { SupabaseService } from '../supabase/supabase.service';

export interface DocumentMatch {
  id: number;
  content: string;
  similarity: number;
}

@Injectable()
export class DocumentRepository {
  constructor(private readonly supabaseService: SupabaseService) {}

  async save(
    embeddings: ChunkEmbedding[],
    filename: string,
    userId?: string,
  ): Promise<void> {
    const rows = embeddings.map(({ chunk, embedding }) => ({
      content: chunk,
      embedding,
      user_id: userId ?? null,
      metadata: { filename },
    }));

    const { error } = await this.supabaseService.client
      .from('documents')
      .insert(rows);

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao salvar embeddings: ${error.message}`,
      );
    }
  }

  async search(
    embedding: number[],
    userId?: string,
    matchCount = 5,
    threshold = 0.5,
  ): Promise<DocumentMatch[]> {
    const { data, error } = await this.supabaseService.client.rpc(
      'match_documents',
      {
        query_embedding: embedding,
        match_count: matchCount,
        match_threshold: threshold,
        p_user_id: userId ?? null,
      },
    );

    if (error) {
      throw new InternalServerErrorException(
        `Erro na busca semântica: ${error.message}`,
      );
    }

    return data as DocumentMatch[];
  }
}
