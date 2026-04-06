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
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE documents (
  id bigserial PRIMARY KEY,
  content TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  metadata JSONB
);

CREATE INDEX ON documents
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(1536),
  match_count int DEFAULT 5
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
  - `saveEmbeddings(embeddings, filename)` — inserts rows into `documents`; `filename` is stored in the `metadata` column
  - `searchSimilar(embedding, matchCount?)` — calls `match_documents` RPC for semantic search, returns `DocumentMatch[]`

**`PdfModule`** (`src/pdf/`) — imports `AiModule` and `SupabaseModule`
- `PdfController`
  - `POST /pdf/upload` — multipart `file` field, `application/pdf` only; returns `{ textLength, totalChunks }`
  - `POST /pdf/ask` — JSON body `{ question: string }`; returns `{ answer: string }`
- `PdfService`
  - `processPdf` — parses PDF (`pdf-parse` v1.1.1), chunks text (size 500, overlap 100), embeds all chunks in one batch call, saves to Supabase. **Note:** currently slices to first 10 chunks (`TODO: remover limite após testes`)
  - `ask` — embeds the question, calls `searchSimilar`, joins top matches as context, calls `AiService.chat`

**`AppModule`** imports `AiModule`, `SupabaseModule`, `PdfModule`. Server listens on `PORT` or 3000.

**Testing:** Unit specs (`*.spec.ts`) live alongside source files in `src/`. E2E specs live in `test/` with a separate `jest-e2e.json` config.

**Code style:** single quotes, trailing commas (Prettier). ESLint uses `typescript-eslint` recommended type-checked rules with `@typescript-eslint/no-explicit-any` disabled.

**Language:** User-facing strings and error messages are written in Portuguese (e.g., `"Nenhum arquivo enviado."`, `"Erro ao salvar embeddings"`). Keep new error messages in Portuguese.

**Cross-module types:** `ChunkEmbedding` is defined and exported from `src/ai/ai.service.ts` and imported directly by `SupabaseService`. `DocumentMatch` is defined in `src/supabase/supabase.service.ts`.

**Not yet implemented:** Code generation endpoint.
