# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install          # Install dependencies
pnpm run start:dev    # Run in watch mode (development)
pnpm run build        # Compile to dist/
pnpm run start:prod   # Run compiled output

pnpm run lint         # ESLint with auto-fix
pnpm run format       # Prettier format src/ and test/

pnpm run test                        # Unit tests (jest, rootDir: src/)
pnpm run test:watch                  # Unit tests in watch mode
pnpm run test:cov                    # Unit tests with coverage
pnpm run test:e2e                    # E2E tests (test/jest-e2e.json)
pnpm run test -- --testPathPattern=app  # Run a single spec file
```

## Purpose

This API is part of the **CodeBookAI** project. It receives uploads of programming documentation or book PDFs, processes the content, and exposes endpoints for Q&A and code generation grounded in the uploaded PDF.

Core capabilities to build:
- PDF upload and text extraction
- Content chunking and vector embedding (RAG pipeline)
- Q&A: answer questions based on the PDF content
- Code generation: generate code examples based on the PDF context

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | Yes | OpenAI API key used by `AiService` to generate embeddings |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Yes | Supabase service role key (bypasses RLS) |
| `PORT` | No | HTTP port (default: 3000) |

## Supabase setup

The `documents` table and `match_documents` RPC function must exist before running the API. Run this SQL in the Supabase SQL editor:

```sql
-- 1. Adicionar coluna user_id
ALTER TABLE documents ADD COLUMN user_id UUID REFERENCES auth.users(id);

-- 2. Índice para filtrar por user_id eficientemente
CREATE INDEX ON documents(user_id);

-- 3. Função atualizada
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(1536),
  match_count int DEFAULT 5,
  match_threshold float DEFAULT 0.75,
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  content TEXT,
  similarity float
)
LANGUAGE sql STABLE AS $$
  SELECT
    id,
    content,
    1 - (embedding <=> query_embedding) AS similarity
  FROM documents
  WHERE
    (p_user_id IS NULL OR user_id = p_user_id)
    AND 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;
```

## Architecture

NestJS REST API with three feature modules:

**`AiModule`** (`src/ai/`)
- `AiService` — wraps OpenAI SDK.
  - `embed(text)` — single embedding via `text-embedding-3-small`
  - `embedBatch(texts)` — batch embeddings in one OpenAI call, returns `ChunkEmbedding[]`
  - `chat(context, question)` — RAG answer via `gpt-4o`; prompt is in Portuguese, answers based only on provided context

**`SupabaseModule`** (`src/supabase/`)
- `SupabaseService` — wraps `@supabase/supabase-js`.
  - `saveEmbeddings(embeddings, filename, userId?)` — inserts rows into `documents`; `filename` stored in `metadata`, `userId` in `user_id` column (nullable until auth is implemented)
  - `searchSimilar(embedding, userId?, matchCount?, threshold?)` — calls `match_documents` RPC with `p_user_id`; defaults: `matchCount=5`, `threshold=0.5`; when `userId` is null the RPC returns results across all users

**`PdfModule`** (`src/pdf/`) — imports `AiModule` and `SupabaseModule`
- `PdfController`
  - `POST /pdf/upload` — multipart `file` field, `application/pdf` only; returns `{ textLength, totalChunks }`
  - `POST /pdf/ask` — JSON body `{ question: string }`; returns `{ answer: string }`
- `PdfService`
  - `processPdf(file, userId?)` — extracts text via `pdfjs-dist` (legacy build, Node.js worker), validates with `isTextValid`, cleans, chunks (size 500, overlap 100), embeds all chunks in one batch call, saves to Supabase
  - `ask(question, userId?)` — embeds the question, calls `searchSimilar`, joins top matches as context, calls `AiService.chat`
  - `cleanText` / `chunkText` / `isTextValid` — public methods (useful for unit testing in isolation); `isTextValid` rejects scanned PDFs by checking ratio of non-Latin characters

**`AppModule`** imports `ConfigModule.forRoot({ isGlobal: true })`, `AiModule`, `SupabaseModule`, `PdfModule`. Server listens on `PORT` or 3000.

**Testing:** Unit specs (`*.spec.ts`) live alongside source files in `src/`. E2E specs live in `test/` with a separate `jest-e2e.json` config.

**Code style:** single quotes, trailing commas (Prettier). ESLint uses `typescript-eslint` recommended type-checked rules with `@typescript-eslint/no-explicit-any` disabled.

**Language:** User-facing strings and error messages are written in Portuguese (e.g., `"Nenhum arquivo enviado."`, `"Erro ao salvar embeddings"`). Keep new error messages in Portuguese.

**Cross-module types:** `ChunkEmbedding` is defined and exported from `src/ai/ai.service.ts` and imported directly by `SupabaseService`. `DocumentMatch` is defined in `src/supabase/supabase.service.ts`.

**Not yet implemented:** Code generation endpoint.
