import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { load } from 'cheerio';

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;
const MIN_CHUNK_LENGTH = 80;
const MAX_PAGES = 20;

const DOC_PATH_PATTERNS = [
  '/docs',
  '/guide',
  '/guides',
  '/api',
  '/reference',
  '/tutorial',
  '/tutorials',
  '/learn',
  '/getting-started',
  '/manual',
  '/handbook',
];

@Injectable()
export class DocsStrategy {
  private readonly logger = new Logger(DocsStrategy.name);

  async extractContent(startUrl: string): Promise<string[]> {
    const visited = new Set<string>();
    const queue: string[] = [startUrl];
    const allChunks: string[] = [];

    let base: URL;
    try {
      base = new URL(startUrl);
    } catch {
      this.logger.warn(`URL inválida: ${startUrl}`);
      return [];
    }

    while (queue.length > 0 && visited.size < MAX_PAGES) {
      const url = queue.shift()!;
      const normalized = url.split('#')[0]; // remove fragments
      if (visited.has(normalized)) continue;
      visited.add(normalized);

      const result = await this.fetchPage(normalized);
      if (!result) continue;

      allChunks.push(...result.chunks);

      for (const href of result.links) {
        try {
          const linkUrl = new URL(href, base.href);
          const linkNormalized = linkUrl.href.split('#')[0];

          if (
            linkUrl.hostname === base.hostname &&
            !visited.has(linkNormalized) &&
            !queue.includes(linkNormalized) &&
            this.isDocPath(linkUrl.pathname)
          ) {
            queue.push(linkNormalized);
          }
        } catch {
          // URL inválida, ignora
        }
      }
    }

    this.logger.log(
      `Crawling concluído: ${visited.size} páginas, ${allChunks.length} chunks — ${startUrl}`,
    );
    return allChunks;
  }

  private isDocPath(pathname: string): boolean {
    const lower = pathname.toLowerCase();
    return DOC_PATH_PATTERNS.some((p) => lower.startsWith(p) || lower.includes(p));
  }

  private async fetchPage(
    url: string,
  ): Promise<{ chunks: string[]; links: string[] } | null> {
    try {
      const { data: html } = await axios.get<string>(url, {
        timeout: 12000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DocAI/1.0)' },
      });

      const $ = load(html);

      // Coleta links antes de remover elementos
      const links: string[] = [];
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (href && !href.startsWith('mailto:') && !href.startsWith('javascript:')) {
          links.push(href);
        }
      });

      // Remove elementos não relevantes
      $(
        'nav, footer, header, script, style, iframe, noscript, ' +
          '.sidebar, .menu, .nav, .navigation, .toc, .ads, ' +
          '[role="navigation"], [role="banner"], [role="contentinfo"]',
      ).remove();

      const mainSelectors = [
        'main',
        'article',
        '[role="main"]',
        '.content',
        '.docs-content',
        '.documentation',
        '.markdown-body',
        '#content',
        'body',
      ];

      let rawText = '';
      for (const selector of mainSelectors) {
        const el = $(selector).first();
        if (el.length) {
          rawText = el.text();
          break;
        }
      }

      const cleaned = rawText
        .replace(/\t/g, ' ')
        .replace(/[ ]{2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      if (!cleaned) return { chunks: [], links };

      return { chunks: this.chunk(cleaned), links };
    } catch (err) {
      this.logger.warn(`Falha ao extrair conteúdo de ${url}: ${String(err)}`);
      return null;
    }
  }

  private chunk(text: string): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const slice = text.slice(start, start + CHUNK_SIZE).trim();
      if (slice.length >= MIN_CHUNK_LENGTH) {
        chunks.push(slice);
      }
      start += CHUNK_SIZE - CHUNK_OVERLAP;
    }

    return chunks;
  }
}
