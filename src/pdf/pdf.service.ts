/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { resolve } from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { AiService } from '../ai/ai.service';
import { LibDocsRepository } from '../crawler/lib-docs.repository';
import { ProjectsService } from '../projects/projects.service';
import { DocumentMatch, DocumentRepository } from './document.repository';

// Aponta para o worker real — necessário em Node.js com pdfjs-dist v4+
pdfjsLib.GlobalWorkerOptions.workerSrc = `file://${resolve(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')}`;

const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 100;

@Injectable()
export class PdfService {
  constructor(
    private readonly aiService: AiService,
    private readonly documentRepository: DocumentRepository,
    private readonly projectsService: ProjectsService,
    private readonly libDocsRepository: LibDocsRepository,
  ) {}

  private async extractTextFromPdf(buffer: Buffer): Promise<string> {
    const data = new Uint8Array(buffer);
    // cMapUrl e standardFontDataUrl são essenciais para PDFs com fontes Type1
    // e encodings customizados (ex: gerados por LaTeX) sem tabela ToUnicode
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
    userId?: string,
  ): Promise<{
    textLength: number;
    totalChunks: number;
  }> {
    const rawText = await this.extractTextFromPdf(file.buffer);

    if (!this.isTextValid(rawText)) {
      throw new BadRequestException(
        'Não foi possível extrair o texto deste PDF. O arquivo pode estar corrompido ou ser um PDF escaneado.',
      );
    }

    const cleanedText = this.cleanText(rawText);
    const chunks = this.chunkText(cleanedText);

    const embeddings = await this.aiService.embedBatch(chunks);
    await this.documentRepository.save(embeddings, file.originalname, userId);

    return {
      textLength: rawText.length,
      totalChunks: chunks.length,
    };
  }

  async ask(question: string, userId?: string): Promise<{ answer: string }> {
    const questionEmbedding = await this.aiService.embed(question);
    const matches: DocumentMatch[] = await this.documentRepository.search(
      questionEmbedding,
      userId,
    );

    if (!matches.length) {
      return {
        answer: 'Não encontrei informações sobre isso na sua documentação.',
      };
    }

    const context: string = matches
      .map((m, i) => `[Trecho ${i + 1}]\n${m.content}`)
      .join('\n\n');
    const answer = await this.aiService.chat(context, question);

    return { answer };
  }

  async askWithContext(
    question: string,
    projectId: string,
    userId: string,
  ): Promise<{
    answer: string;
    sources: { libName: string; version: string }[];
  }> {
    const project = await this.projectsService.getProject(projectId, userId);

    const deps = (project.project_dependencies as any[]) ?? [];
    const indexedDeps = deps.filter((d) => d.doc_status === 'indexed');

    if (!indexedDeps.length) {
      throw new NotFoundException(
        'Nenhuma dependência indexada neste projeto. Aguarde o processamento ou verifique o status.',
      );
    }

    const questionEmbedding = await this.aiService.embed(question);

    // Busca paralela em todas as dependências indexadas
    const matchesPerDep = await Promise.all(
      indexedDeps.map(async (dep) => {
        const matches = await this.libDocsRepository.searchSimilar(
          questionEmbedding,
          dep.lib_name as string,
          dep.version as string,
        );
        return matches.map((m) => ({
          ...m,
          libName: dep.lib_name as string,
          version: dep.version as string,
        }));
      }),
    );

    const allMatches = matchesPerDep
      .flat()
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 10);

    if (!allMatches.length) {
      return {
        answer:
          'Não encontrei documentação relevante para esta pergunta nas dependências do projeto.',
        sources: [],
      };
    }

    const context = allMatches
      .map(
        (m, i) => `[${m.libName}@${m.version} — Trecho ${i + 1}]\n${m.content}`,
      )
      .join('\n\n');

    // Fontes únicas presentes no contexto
    const seen = new Set<string>();
    const sources = allMatches
      .filter((m) => {
        const key = `${m.libName}@${m.version}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((m) => ({ libName: m.libName, version: m.version }));

    const libsDescription = sources
      .map((s) => `${s.libName}@${s.version}`)
      .join(', ');
    const answer = await this.aiService.chatWithLibContext(
      context,
      question,
      libsDescription,
      '',
    );

    return { answer, sources };
  }

  // ---------------------------------------------------------------
  // Helpers (públicos para facilitar testes unitários)
  // ---------------------------------------------------------------

  // RegExp via construtor para evitar a regra no-control-regex do ESLint
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
      .filter((p) => p.length > 30); //Ignora parágrafos muito curtos

    const chunks: string[] = [];
    let current = '';

    for (const paragraph of paragraphs) {
      if ((current + '\n\n' + paragraph).length <= CHUNK_SIZE) {
        current = current ? current + '\n\n' + paragraph : paragraph;
      } else {
        if (current) {
          chunks.push(current.trim());
        }

        // parágrafo maior que CHUNK_SIZE - divide com overlap
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
