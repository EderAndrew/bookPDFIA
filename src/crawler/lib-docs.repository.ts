/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export interface LibDocMatch {
  id: number;
  content: string;
  similarity: number;
  source_url: string;
}

interface LibDocRow {
  libName: string;
  version: string;
  content: string;
  embedding: number[];
  sourceUrl: string;
}

@Injectable()
export class LibDocsRepository {
  constructor(private readonly supabaseService: SupabaseService) {}

  async save(docs: LibDocRow[]): Promise<void> {
    if (!docs.length) return;

    const { libName, version } = docs[0];

    // Remove docs anteriores para permitir re-crawl limpo
    const { error: deleteError } = await this.supabaseService.client
      .from('lib_docs')
      .delete()
      .eq('lib_name', libName)
      .eq('version', version);

    if (deleteError) {
      throw new InternalServerErrorException(
        `Erro ao limpar lib_docs: ${deleteError.message}`,
      );
    }

    const rows = docs.map((d) => ({
      lib_name: d.libName,
      version: d.version,
      content: d.content,
      embedding: d.embedding,
      source_url: d.sourceUrl,
    }));

    const { error } = await this.supabaseService.client
      .from('lib_docs')
      .insert(rows);

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao salvar lib_docs: ${error.message}`,
      );
    }
  }

  async searchSimilar(
    embedding: number[],
    libName: string,
    version: string,
    matchCount = 5,
    threshold = 0.5,
  ): Promise<LibDocMatch[]> {
    const { data, error } = await this.supabaseService.client.rpc(
      'match_lib_docs',
      {
        query_embedding: embedding,
        p_lib_name: libName,
        p_version: version,
        match_count: matchCount,
        match_threshold: threshold,
      },
    );

    if (error) {
      throw new InternalServerErrorException(
        `Erro na busca semântica (lib_docs): ${error.message}`,
      );
    }

    return data as LibDocMatch[];
  }

  async existsByLibVersion(libName: string, version: string): Promise<boolean> {
    const { count, error } = await this.supabaseService.client
      .from('lib_docs')
      .select('id', { count: 'exact', head: true })
      .eq('lib_name', libName)
      .eq('version', version);

    if (error) return false;
    return (count ?? 0) > 0;
  }
}
