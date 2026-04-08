/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ChunkEmbedding } from '../ai/ai.service';
import { SupabaseService } from '../supabase/supabase.service';

export interface DocumentMatch {
  id: number;
  content: string;
  similarity: number;
  filename: string;
}

export interface DocumentSummary {
  filename: string;
  totalChunks: number;
  uploadedAt: string;
}

@Injectable()
export class DocumentsRepository {
  constructor(private readonly supabaseService: SupabaseService) {}

  async save(
    embeddings: ChunkEmbedding[],
    filename: string,
    organizationId: string,
  ): Promise<void> {
    const rows = embeddings.map(({ chunk, embedding }) => ({
      organization_id: organizationId,
      filename,
      content: chunk,
      embedding,
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

  async searchSimilar(
    embedding: number[],
    organizationId: string,
    matchCount = 5,
    threshold = 0.5,
  ): Promise<DocumentMatch[]> {
    const { data, error } = await this.supabaseService.client.rpc(
      'match_documents',
      {
        query_embedding: embedding,
        match_count: matchCount,
        match_threshold: threshold,
        p_organization_id: organizationId,
      },
    );

    if (error) {
      throw new InternalServerErrorException(
        `Erro na busca semântica: ${error.message}`,
      );
    }

    return data as DocumentMatch[];
  }

  async findAllByOrganization(
    organizationId: string,
  ): Promise<DocumentSummary[]> {
    const { data, error } = await this.supabaseService.client
      .from('documents')
      .select('filename, created_at')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao listar documentos: ${error.message}`,
      );
    }

    // Agrupa por filename e conta chunks
    const map = new Map<string, { totalChunks: number; uploadedAt: string }>();

    for (const row of (data ?? []) as {
      filename: string;
      created_at: string;
    }[]) {
      const existing = map.get(row.filename);
      if (existing) {
        existing.totalChunks += 1;
      } else {
        map.set(row.filename, { totalChunks: 1, uploadedAt: row.created_at });
      }
    }

    return Array.from(map.entries()).map(([filename, info]) => ({
      filename,
      totalChunks: info.totalChunks,
      uploadedAt: info.uploadedAt,
    }));
  }

  async deleteByFilename(
    filename: string,
    organizationId: string,
  ): Promise<void> {
    const { error } = await this.supabaseService.client
      .from('documents')
      .delete()
      .eq('filename', filename)
      .eq('organization_id', organizationId);

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao deletar documento: ${error.message}`,
      );
    }
  }
}
