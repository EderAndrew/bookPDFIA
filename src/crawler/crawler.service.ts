import { Injectable, Logger } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { SupabaseService } from '../supabase/supabase.service';
import { LibDocsRepository } from './lib-docs.repository';
import { NpmStrategy } from './strategies/npm.strategy';
import { DocsStrategy } from './strategies/docs.strategy';

type DepStatus = 'pending' | 'crawling' | 'indexed' | 'failed';

@Injectable()
export class CrawlerService {
  private readonly logger = new Logger(CrawlerService.name);

  constructor(
    private readonly aiService: AiService,
    private readonly libDocsRepository: LibDocsRepository,
    private readonly npmStrategy: NpmStrategy,
    private readonly docsStrategy: DocsStrategy,
    // SupabaseService injetado diretamente para atualizar o status da dependência
    // sem gerar dependência circular entre CrawlerModule e ProjectsModule
    private readonly supabaseService: SupabaseService,
  ) {}

  async crawlLib(
    libName: string,
    version: string,
    projectDepId: string,
  ): Promise<void> {
    try {
      const alreadyIndexed = await this.libDocsRepository.existsByLibVersion(
        libName,
        version,
      );

      if (alreadyIndexed) {
        this.logger.log(`[${libName}@${version}] Já indexado — reutilizando.`);
        await this.updateDepStatus(projectDepId, 'indexed');
        return;
      }

      this.logger.log(`[${libName}@${version}] Buscando URL da documentação...`);
      const docUrl = await this.npmStrategy.findDocUrl(libName);

      if (!docUrl) {
        this.logger.warn(`[${libName}@${version}] URL da documentação não encontrada.`);
        await this.updateDepStatus(projectDepId, 'failed');
        return;
      }

      this.logger.log(`[${libName}@${version}] Iniciando crawling: ${docUrl}`);
      await this.updateDepStatus(projectDepId, 'crawling');

      const chunks = await this.docsStrategy.extractContent(docUrl);

      if (!chunks.length) {
        this.logger.warn(`[${libName}@${version}] Nenhum conteúdo extraído de ${docUrl}.`);
        await this.updateDepStatus(projectDepId, 'failed');
        return;
      }

      this.logger.log(
        `[${libName}@${version}] ${chunks.length} chunks extraídos. Gerando embeddings em batch...`,
      );

      const embeddings = await this.aiService.embedBatch(chunks);

      const docs = embeddings.map(({ chunk, embedding }) => ({
        libName,
        version,
        content: chunk,
        embedding,
        sourceUrl: docUrl,
      }));

      await this.libDocsRepository.save(docs);
      await this.updateDepStatus(projectDepId, 'indexed');

      this.logger.log(`[${libName}@${version}] Indexação concluída. ${docs.length} docs salvos.`);
    } catch (err) {
      this.logger.error(
        `[${libName}@${version}] Erro durante crawling: ${String(err)}`,
      );
      await this.updateDepStatus(projectDepId, 'failed').catch(() => undefined);
    }
  }

  private async updateDepStatus(depId: string, status: DepStatus): Promise<void> {
    await this.supabaseService.client
      .from('project_dependencies')
      .update({ doc_status: status })
      .eq('id', depId);
  }
}
