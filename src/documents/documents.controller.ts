import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/roles.guard';
import { DocumentsService } from './documents.service';
import { AskDto } from './dto/ask.dto';

@Controller()
@UseGuards(AuthGuard, RolesGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post('documents/upload')
  @Roles('admin')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file) {
      throw new BadRequestException('Nenhum arquivo enviado.');
    }

    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('O arquivo deve ser um PDF.');
    }

    return this.documentsService.processPdf(file, user.organization_id);
  }

  @Delete('documents/:filename')
  @Roles('admin')
  deleteDocument(
    @Param('filename') filename: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentsService.deleteDocument(filename, user.organization_id);
  }

  @Get('documents')
  listDocuments(@CurrentUser() user: AuthenticatedUser) {
    return this.documentsService.listDocuments(user.organization_id);
  }

  @Post('chat')
  ask(@Body() dto: AskDto, @CurrentUser() user: AuthenticatedUser) {
    return this.documentsService.ask(dto.question, user.organization_id);
  }
}
