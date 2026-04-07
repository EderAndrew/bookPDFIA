/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, NotFoundException } from '@nestjs/common';
import { CrawlerService } from '../crawler/crawler.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectsRepository } from './projects.repository';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly projectsRepository: ProjectsRepository,
    private readonly crawlerService: CrawlerService,
  ) {}

  async createProject(dto: CreateProjectDto, userId: string) {
    const deps = this.extractDeps(dto.packageJson);

    const project = await this.projectsRepository.create(dto.name, userId);
    const savedDeps = deps.length
      ? await this.projectsRepository.saveDependencies(
          project.id as string,
          deps,
        )
      : [];

    // Dispara crawling em background para cada dependência
    setImmediate(() => {
      for (const dep of savedDeps) {
        this.crawlerService
          .crawlLib(
            dep.lib_name as string,
            dep.version as string,
            dep.id as string,
          )
          .catch(console.error);
      }
    });

    return { ...project, project_dependencies: savedDeps };
  }

  async getProjects(userId: string) {
    return this.projectsRepository.findAllByUser(userId);
  }

  async recrawlProject(projectId: string, userId: string) {
    const project = await this.projectsRepository.findById(projectId, userId);

    if (!project) {
      throw new NotFoundException('Projeto não encontrado.');
    }

    const deps = (project.project_dependencies as any[]) ?? [];
    const toRecrawl = deps.filter(
      (d) => d.doc_status === 'pending' || d.doc_status === 'failed',
    );

    setImmediate(() => {
      for (const dep of toRecrawl) {
        this.crawlerService
          .crawlLib(
            dep.lib_name as string,
            dep.version as string,
            dep.id as string,
          )
          .catch(console.error);
      }
    });

    return { queued: toRecrawl.length };
  }

  async getProject(projectId: string, userId: string) {
    const project = await this.projectsRepository.findById(projectId, userId);

    if (!project) {
      throw new NotFoundException('Projeto não encontrado.');
    }

    return project;
  }

  // ---------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------

  private extractDeps(
    packageJson: Record<string, unknown>,
  ): { libName: string; version: string }[] {
    const dependencies = (packageJson.dependencies ?? {}) as Record<
      string,
      string
    >;
    const devDependencies = (packageJson.devDependencies ?? {}) as Record<
      string,
      string
    >;

    return Object.entries({ ...dependencies, ...devDependencies }).map(
      ([libName, version]) => ({
        libName,
        version: this.cleanVersion(version),
      }),
    );
  }

  private cleanVersion(version: string): string {
    // Remove prefixos: ^, ~, >=, <=, >, <, =
    return version.replace(/^[~^>=<]+/, '').trim();
  }
}
