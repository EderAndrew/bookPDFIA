import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { CrawlerService } from './crawler.service';
import { LibDocsRepository } from './lib-docs.repository';
import { NpmStrategy } from './strategies/npm.strategy';
import { DocsStrategy } from './strategies/docs.strategy';

@Module({
  imports: [AiModule, SupabaseModule],
  providers: [CrawlerService, LibDocsRepository, NpmStrategy, DocsStrategy],
  exports: [CrawlerService, LibDocsRepository],
})
export class CrawlerModule {}
