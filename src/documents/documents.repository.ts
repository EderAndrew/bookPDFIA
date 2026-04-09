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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { data, error } = await this.supabaseService.client.rpc(
      'list_documents_by_organization',
      { p_organization_id: organizationId },
    );

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao listar documentos: ${error.message}`,
      );
    }

    return (
      data as { filename: string; total_chunks: number; uploaded_at: string }[]
    ).map((row) => ({
      filename: row.filename,
      totalChunks: row.total_chunks,
      uploadedAt: row.uploaded_at,
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
