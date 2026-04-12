import { BadRequestException, Injectable } from '@nestjs/common';
import { basename, resolve } from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import { AiService } from '../ai/ai.service';
import {
  DocumentMatch,
  DocumentsRepository,
  DocumentSummary,
} from './documents.repository';
import { cleanText, chunkText, isTextValid } from './document-processing.utils';

// Aponta para o worker real — necessário em Node.js com pdfjs-dist v4+

pdfjsLib.GlobalWorkerOptions.workerSrc = `file://${resolve(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')}`;

const SEARCH_MATCH_COUNT = 8;
const SEARCH_SIMILARITY_THRESHOLD = 0.4;

@Injectable()
export class DocumentsService {
  constructor(
    private readonly aiService: AiService,
    private readonly documentsRepository: DocumentsRepository,
  ) {}

  private isPdfBuffer(buffer: Buffer): boolean {
    return (
      buffer.length >= 4 && buffer.slice(0, 4).toString('ascii') === '%PDF'
    );
  }

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
        .filter((item): item is TextItem => 'str' in item)
        .map((item) => item.str)
        .filter((str) => str.trim().length > 0)
        .join(' ');

      fullText += pageText + '\n\n';
    }

    return fullText;
  }

  async processPdf(
    file: Express.Multer.File,
    organizationId: string,
  ): Promise<{ textLength: number; totalChunks: number }> {
    if (!this.isPdfBuffer(file.buffer)) {
      throw new BadRequestException('O arquivo enviado não é um PDF válido.');
    }

    const rawText = await this.extractTextFromPdf(file.buffer);

    if (!isTextValid(rawText)) {
      throw new BadRequestException(
        'Não foi possível extrair o texto deste PDF. O arquivo pode estar corrompido ou ser um PDF escaneado.',
      );
    }

    const cleanedText = cleanText(rawText);
    const chunks = chunkText(cleanedText);

    const safeFilename = basename(file.originalname).replace(
      /[^a-zA-Z0-9._-]/g,
      '_',
    );

    const embeddings = await this.aiService.embedBatch(chunks);
    await this.documentsRepository.save(
      embeddings,
      safeFilename,
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
        SEARCH_MATCH_COUNT,
        SEARCH_SIMILARITY_THRESHOLD,
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
}
