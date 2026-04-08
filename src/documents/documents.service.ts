/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { BadRequestException, Injectable } from '@nestjs/common';
import { resolve } from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { AiService } from '../ai/ai.service';
import {
  DocumentMatch,
  DocumentsRepository,
  DocumentSummary,
} from './documents.repository';

// Aponta para o worker real — necessário em Node.js com pdfjs-dist v4+
pdfjsLib.GlobalWorkerOptions.workerSrc = `file://${resolve(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')}`;

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;

@Injectable()
export class DocumentsService {
  constructor(
    private readonly aiService: AiService,
    private readonly documentsRepository: DocumentsRepository,
  ) {}

  private async extractTextFromPdf(buffer: Buffer): Promise<string> {
    const data = new Uint8Array(buffer);
    const cMapUrl = `file://${resolve(process.cwd(), 'node_modules/pdfjs-dist/cmaps/')}/`;
    const standardFontDataUrl = `file://${resolve(process.cwd(), 'node_modules/pdfjs-dist/standard_fonts/')}/`;
    const loadingTask = pdfjsLib.getDocument({
      data,
      cMapUrl,
      cMapPacked: true,
      standardFontDataUrl,
      useSystemFonts: true,
    });
    const pdfDoc = await loadingTask.promise;
    let fullText = '';

    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const textContent = await page.getTextContent();

      const pageText = textContent.items
        .map((item: any) => item.str)
        .filter((str: string) => str.trim().length > 0)
        .join(' ');

      fullText += pageText + '\n\n';
    }

    return fullText;
  }

  async processPdf(
    file: Express.Multer.File,
    organizationId: string,
  ): Promise<{ textLength: number; totalChunks: number }> {
    const rawText = await this.extractTextFromPdf(file.buffer);

    if (!this.isTextValid(rawText)) {
      throw new BadRequestException(
        'Não foi possível extrair o texto deste PDF. O arquivo pode estar corrompido ou ser um PDF escaneado.',
      );
    }

    const cleanedText = this.cleanText(rawText);
    const chunks = this.chunkText(cleanedText);

    const embeddings = await this.aiService.embedBatch(chunks);
    await this.documentsRepository.save(
      embeddings,
      file.originalname,
      organizationId,
    );

    return {
      textLength: rawText.length,
      totalChunks: chunks.length,
    };
  }

  async ask(
    question: string,
    organizationId: string,
  ): Promise<{ answer: string; sources: { filename: string }[] }> {
    const questionEmbedding = await this.aiService.embed(question);
    const matches: DocumentMatch[] =
      await this.documentsRepository.searchSimilar(
        questionEmbedding,
        organizationId,
        8, // mais contexto = respostas mais completas
        0.4, // threshold menor = não perde trechos relevantes em docs técnicos
      );

    if (!matches.length) {
      return {
        answer:
          'Não encontrei informações sobre isso na documentação da sua organização.',
        sources: [],
      };
    }

    const context = matches
      .map((m, i) => `[Trecho ${i + 1} — ${m.filename}]\n${m.content}`)
      .join('\n\n');

    const answer = await this.aiService.chat(context, question);

    const seen = new Set<string>();
    const sources = matches
      .filter((m) => {
        if (seen.has(m.filename)) return false;
        seen.add(m.filename);
        return true;
      })
      .map((m) => ({ filename: m.filename }));

    return { answer, sources };
  }

  listDocuments(organizationId: string): Promise<DocumentSummary[]> {
    return this.documentsRepository.findAllByOrganization(organizationId);
  }

  deleteDocument(filename: string, organizationId: string): Promise<void> {
    return this.documentsRepository.deleteByFilename(filename, organizationId);
  }

  // ---------------------------------------------------------------
  // Helpers (públicos para facilitar testes unitários)
  // ---------------------------------------------------------------

  private readonly reControlChars = new RegExp(
    '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', // eslint-disable-line no-control-regex
    'g',
  );

  cleanText(text: string): string {
    return text
      .replace(this.reControlChars, '')
      .replace(/[\uFFFD\uD800-\uDFFF]/g, '')
      .replace(/[\uE000-\uF8FF]/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/^ +$/gm, '')
      .trim();
  }

  chunkText(text: string): string[] {
    const paragraphs = text
      .split(/\n{2,}/)
      .map((p) => p.replace(/\n/g, ' ').trim())
      .filter((p) => p.length > 30);

    const chunks: string[] = [];
    let current = '';

    for (const paragraph of paragraphs) {
      if ((current + '\n\n' + paragraph).length <= CHUNK_SIZE) {
        current = current ? current + '\n\n' + paragraph : paragraph;
      } else {
        if (current) {
          chunks.push(current.trim());
        }

        if (paragraph.length > CHUNK_SIZE) {
          let start = 0;

          while (start < paragraph.length) {
            chunks.push(paragraph.slice(start, start + CHUNK_SIZE).trim());
            start += CHUNK_SIZE - CHUNK_OVERLAP;
          }
          current = '';
        } else {
          current = paragraph;
        }
      }
    }

    if (current) chunks.push(current.trim());
    return chunks;
  }

  isTextValid(text: string): boolean {
    const printable = text.replace(/\s/g, '');
    if (printable.length === 0) return false;
    const nonLatin = printable
      .split('')
      .filter((c) => c.charCodeAt(0) > 300).length;
    return nonLatin / printable.length < 0.2;
  }
}
