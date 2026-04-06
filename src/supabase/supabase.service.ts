/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ChunkEmbedding } from '../ai/ai.service';

export interface DocumentMatch {
  id: number;
  content: string;
  similarity: number;
}

@Injectable()
export class SupabaseService {
  private readonly client: SupabaseClient;

  constructor() {
    this.client = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!,
    );
  }

  async saveEmbeddings(
    embeddings: ChunkEmbedding[],
    filename: string,
  ): Promise<void> {
    const rows = embeddings.map(({ chunk, embedding }) => ({
      content: chunk,
      embedding,
      metadata: { filename },
    }));

    const { error } = await this.client.from('documents').insert(rows);

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao salvar embeddings: ${error.message}`,
      );
    }
  }

  async searchSimilar(
    embedding: number[],
    matchCount = 5,
  ): Promise<DocumentMatch[]> {
    const { data, error } = await this.client.rpc('match_documents', {
      query_embedding: embedding,
      match_count: matchCount,
    });

    if (error) {
      throw new InternalServerErrorException(
        `Erro na busca semântica: ${error.message}`,
      );
    }

    return data as DocumentMatch[];
  }
}
