import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
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
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  ask(@Body() dto: AskDto, @CurrentUser() user: AuthenticatedUser) {
    return this.documentsService.ask(dto.question, user.organization_id);
  }
}
