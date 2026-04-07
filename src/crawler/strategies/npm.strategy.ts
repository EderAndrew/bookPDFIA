/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class NpmStrategy {
  private readonly logger = new Logger(NpmStrategy.name);

  async findDocUrl(libName: string): Promise<string | null> {
    try {
      // Scoped packages: @scope/pkg → @scope%2Fpkg
      const encoded = libName.startsWith('@')
        ? libName.replace('/', '%2F')
        : libName;

      const { data } = await axios.get(
        `https://registry.npmjs.org/${encoded}`,
        { timeout: 8000 },
      );

      const homepage: unknown = data.homepage;
      if (typeof homepage === 'string' && homepage.startsWith('http')) {
        return homepage;
      }

      const repoUrl: unknown = data.repository?.url;
      if (typeof repoUrl === 'string') {
        return repoUrl
          .replace(/^git\+/, '')
          .replace(/^git:\/\/github\.com/, 'https://github.com')
          .replace(/\.git$/, '');
      }

      return null;
    } catch (err) {
      this.logger.warn(
        `Falha ao consultar npm registry para ${libName}: ${String(err)}`,
      );
      return null;
    }
  }
}
