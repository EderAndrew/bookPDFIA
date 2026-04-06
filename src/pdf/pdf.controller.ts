/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AskWithContextDto } from './dto/ask-with-context.dto';
import { PdfService } from './pdf.service';

@Controller('pdf')
@UseGuards(AuthGuard)
export class PdfController {
  constructor(private readonly pdfService: PdfService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: { id: string },
  ) {
    if (!file) {
      throw new BadRequestException('Nenhum arquivo enviado.');
    }

    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('O arquivo deve ser um PDF.');
    }

    return this.pdfService.processPdf(file, user.id);
  }

  @Post('ask')
  async ask(
    @Body('question') question: string,
    @CurrentUser() user: { id: string },
  ) {
    if (!question?.trim()) {
      throw new BadRequestException('A pergunta não pode ser vazia.');
    }

    return this.pdfService.ask(question, user.id);
  }

  @Post('ask-with-context')
  askWithContext(
    @Body() dto: AskWithContextDto,
    @CurrentUser() user: { id: string },
  ): Promise<{
    answer: string;
    sources: { libName: string; version: string }[];
  }> {
    return this.pdfService.askWithContext(dto.question, dto.projectId, user.id);
  }
}
