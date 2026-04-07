import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { AuthModule } from '../auth/auth.module';
import { CrawlerModule } from '../crawler/crawler.module';
import { ProjectsModule } from '../projects/projects.module';
import { PdfController } from './pdf.controller';
import { PdfService } from './pdf.service';
import { DocumentRepository } from './document.repository';

@Module({
  imports: [
    AiModule,
    SupabaseModule,
    AuthModule,
    ProjectsModule,
    CrawlerModule,
  ],
  controllers: [PdfController],
  providers: [PdfService, DocumentRepository],
  exports: [PdfService],
})
export class PdfModule {}
