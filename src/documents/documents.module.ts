import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { AuthModule } from '../auth/auth.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { DocumentsRepository } from './documents.repository';

@Module({
  imports: [AiModule, SupabaseModule, AuthModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentsRepository],
  exports: [DocumentsService],
})
export class DocumentsModule {}
