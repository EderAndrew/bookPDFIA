import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AiModule } from './ai/ai.module';
import { PdfModule } from './pdf/pdf.module';
import { SupabaseModule } from './supabase/supabase.module';

@Module({
  imports: [AiModule, SupabaseModule, PdfModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
