import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { PdfController } from './pdf.controller';
import { PdfService } from './pdf.service';

@Module({
  imports: [AiModule, SupabaseModule],
  controllers: [PdfController],
  providers: [PdfService],
  exports: [PdfService],
})
export class PdfModule {}
