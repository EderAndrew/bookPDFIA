import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectsService } from './projects.service';

@Controller('projects')
@UseGuards(AuthGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  createProject(
    @Body() dto: CreateProjectDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.projectsService.createProject(dto, user.id);
  }

  @Get()
  getProjects(@CurrentUser() user: { id: string }) {
    return this.projectsService.getProjects(user.id);
  }

  @Get(':id')
  getProject(
    @Param('id') projectId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.projectsService.getProject(projectId, user.id);
  }

  @Post(':id/recrawl')
  recrawlProject(
    @Param('id') projectId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.projectsService.recrawlProject(projectId, user.id);
  }
}
