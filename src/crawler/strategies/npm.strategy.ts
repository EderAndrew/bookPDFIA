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

      // Prefere campo explícito de docs, se existir
      const docsUrl: unknown = data.docs;
      if (typeof docsUrl === 'string' && docsUrl.startsWith('http')) {
        return docsUrl;
      }

      const homepage: unknown = data.homepage;
      if (typeof homepage === 'string' && homepage.startsWith('http')) {
        // Se a homepage não aponta para uma rota de docs, tenta /docs
        const url = new URL(homepage);
        if (url.pathname === '/' || url.pathname === '') {
          const docsCandidate = `${url.origin}/docs`;
          try {
            await axios.head(docsCandidate, { timeout: 5000 });
            return docsCandidate;
          } catch {
            // /docs não existe, usa a homepage mesmo
          }
        }
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
