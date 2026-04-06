import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { load } from 'cheerio';

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;
const MIN_CHUNK_LENGTH = 80;

@Injectable()
export class DocsStrategy {
  private readonly logger = new Logger(DocsStrategy.name);

  async extractContent(url: string): Promise<string[]> {
    try {
      const { data: html } = await axios.get<string>(url, {
        timeout: 12000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DocAI/1.0)' },
      });

      const $ = load(html);

      // Remove elementos não relevantes
      $(
        'nav, footer, header, script, style, iframe, noscript, ' +
          '.sidebar, .menu, .nav, .navigation, .toc, .ads, ' +
          '[role="navigation"], [role="banner"], [role="contentinfo"]',
      ).remove();

      // Tenta extrair o conteúdo principal
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

      if (!cleaned) return [];

      return this.chunk(cleaned);
    } catch (err) {
      this.logger.warn(`Falha ao extrair conteúdo de ${url}: ${String(err)}`);
      return [];
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
