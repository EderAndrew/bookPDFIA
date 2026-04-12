import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import { DocumentsService } from './documents.service';
import { AskDto } from './dto/ask.dto';

@Controller('chat')
@UseGuards(AuthGuard, RolesGuard)
export class ChatController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  ask(@Body() dto: AskDto, @CurrentUser() user: AuthenticatedUser) {
    return this.documentsService.ask(dto.question, user.organization_id);
  }
}
