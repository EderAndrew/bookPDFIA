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
pnpm run start:debug                 # Debug mode with watch
```

## Purpose

This API is part of the **CodeBookAI** project. It receives uploads of programming documentation or book PDFs, processes the content, and exposes endpoints for Q&A and code generation grounded in the uploaded PDF. It also crawls npm library documentation to support project-scoped Q&A.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | Yes | OpenAI API key used by `AiService` to generate embeddings |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Yes | Supabase service role key (bypasses RLS) |
| `PORT` | No | HTTP port (default: 3000) |

## Supabase setup

Run this SQL in the Supabase SQL editor before starting the API:

```sql
-- PDF documents table
CREATE TABLE documents (
  id bigserial PRIMARY KEY,
  content text,
  embedding vector(1536),
  metadata jsonb,
  user_id UUID REFERENCES auth.users(id)
);
CREATE INDEX ON documents(user_id);

-- Library docs table (crawler output)
CREATE TABLE lib_docs (
  id bigserial PRIMARY KEY,
  lib_name text,
  version text,
  content text,
  embedding vector(1536),
  source_url text,
  UNIQUE (lib_name, version, source_url)
);

-- Projects and dependencies tables
CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  user_id UUID REFERENCES auth.users(id)
);
CREATE TABLE project_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id),
  lib_name text,
  version text,
  doc_status text DEFAULT 'pending'  -- pending | crawling | indexed | failed
);

-- RPC for PDF Q&A
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(1536),
  match_count int DEFAULT 5,
  match_threshold float DEFAULT 0.75,
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (id bigint, content TEXT, similarity float)
LANGUAGE sql STABLE AS $$
  SELECT id, content, 1 - (embedding <=> query_embedding) AS similarity
  FROM documents
  WHERE (p_user_id IS NULL OR user_id = p_user_id)
    AND 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

-- RPC for library docs Q&A
CREATE OR REPLACE FUNCTION match_lib_docs(
  query_embedding vector(1536),
  p_lib_name text,
  p_version text,
  match_count int DEFAULT 5,
  match_threshold float DEFAULT 0.5
)
RETURNS TABLE (id bigint, content text, similarity float, source_url text)
LANGUAGE sql STABLE AS $$
  SELECT id, content, 1 - (embedding <=> query_embedding) AS similarity, source_url
  FROM lib_docs
  WHERE lib_name = p_lib_name AND version = p_version
    AND 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;
```

## Architecture

NestJS REST API bootstrapped with `helmet` and `ValidationPipe({ whitelist: true })`. All endpoints except `POST /auth/register` and `POST /auth/login` require a `Bearer <token>` header. `AuthGuard` validates the token via `supabase.auth.getUser(token)` and injects the user into `request.user`. The `@CurrentUser()` decorator extracts it.

**`AiModule`** (`src/ai/`)
- `AiService`
  - `embed(text)` — single embedding via `text-embedding-3-small`
  - `embedBatch(texts)` — batch embeddings, returns `ChunkEmbedding[]`
  - `chat(context, question)` — RAG answer via `gpt-4o`; answers only from provided context; prompts in Portuguese

**`SupabaseModule`** (`src/supabase/`)
- `SupabaseService` — wraps `@supabase/supabase-js`; exposes `.client` for direct use
  - `saveEmbeddings(embeddings, filename, userId?)` — inserts rows into `documents`
  - `searchSimilar(embedding, userId?, matchCount?, threshold?)` — calls `match_documents` RPC; defaults: `matchCount=5`, `threshold=0.5`

**`AuthModule`** (`src/auth/`)
- `POST /auth/register` — `{ email, password, name }` → `{ user, session }`
- `POST /auth/login` — `{ email, password }` → `{ user, session }`
- `POST /auth/logout` — (auth required) signs out the user via Supabase admin API
- `AuthRepository` delegates directly to Supabase Auth SDK
- `AuthGuard` + `@CurrentUser()` decorator are exported from this module and used across all other modules

**`UsersModule`** (`src/users/`)
- `GET /users/me` — returns the authenticated user's profile

**`ProjectsModule`** (`src/projects/`)
- `POST /projects` — `{ name, packageJson }` — parses `dependencies` + `devDependencies` from the submitted `package.json`, creates a project, saves deps, then fires off `CrawlerService.crawlLib` in background (via `setImmediate`) for each dependency
- `GET /projects` — list user's projects
- `GET /projects/:id` — get single project with dependencies (includes `doc_status`)
- `POST /projects/:id/recrawl` — re-triggers crawling for all dependencies of a project
- `ProjectsRepository` — direct Supabase queries against `projects` and `project_dependencies`

**`CrawlerModule`** (`src/crawler/`)
- `CrawlerService.crawlLib(libName, version, projectDepId)` — checks `lib_docs` for existing index; if missing, uses `NpmStrategy` to resolve the doc URL from the npm registry, then `DocsStrategy` to extract text chunks, then batch-embeds and saves to `lib_docs` via `LibDocsRepository`. Updates `project_dependencies.doc_status` throughout (`pending → crawling → indexed | failed`).
- `NpmStrategy` — fetches npm registry metadata to find the documentation URL
- `DocsStrategy` — multi-page HTTP crawl (up to 20 pages) with cheerio extraction; chunks at size 1000 / overlap 200 (distinct from PDF chunking). Only follows same-hostname links matching known doc path patterns (`/docs`, `/api`, `/guide`, etc.)
- `LibDocsRepository` — wraps `lib_docs` table; `save()` upserts on `(lib_name, version, source_url)`; `searchSimilar()` calls `match_lib_docs` RPC
- **Circular dependency note:** `CrawlerService` injects `SupabaseService` directly (instead of `ProjectsService`) to update `project_dependencies.doc_status`, specifically to avoid a circular dependency between `CrawlerModule` and `ProjectsModule`.

**`PdfModule`** (`src/pdf/`) — imports `AiModule`, `SupabaseModule`, `ProjectsModule`, `CrawlerModule`
- `POST /pdf/upload` — multipart `file` field, `application/pdf` only; returns `{ textLength, totalChunks }`
- `POST /pdf/ask` — `{ question }` — RAG Q&A over user's uploaded PDFs
- `POST /pdf/ask-with-context` — `{ question, projectId }` — RAG Q&A that also searches `lib_docs` for each dependency in the project, returning `{ answer, sources: [{libName, version}] }`
- `PdfService` — extracts text via `pdfjs-dist` (legacy build, Node.js worker), validates with `isTextValid`, cleans, chunks (size 500, overlap 100), embeds batch, saves to Supabase
- `DocumentRepository` — wraps `documents` table queries
- `cleanText` / `chunkText` / `isTextValid` are public on `PdfService` (useful for unit testing); `isTextValid` rejects scanned PDFs by checking ratio of non-Latin characters

**`AppModule`** imports `ConfigModule.forRoot({ isGlobal: true })`, `AiModule`, `SupabaseModule`, `AuthModule`, `UsersModule`, `ProjectsModule`, `CrawlerModule`, `PdfModule`.

**Testing:** Unit specs (`*.spec.ts`) live alongside source files in `src/`. E2E specs live in `test/` with a separate `jest-e2e.json` config.

**Code style:** single quotes, trailing commas (Prettier). ESLint uses `typescript-eslint` recommended type-checked rules with `@typescript-eslint/no-explicit-any` disabled.

**Language:** User-facing strings and error messages are in Portuguese (e.g., `"Nenhum arquivo enviado."`, `"Credenciais inválidas."`). Keep new error messages in Portuguese.

**Cross-module types:** `ChunkEmbedding` is defined and exported from `src/ai/ai.service.ts`. `DocumentMatch` is defined in `src/pdf/document.repository.ts`. `LibDocMatch` is defined in `src/crawler/lib-docs.repository.ts`.

**Not yet implemented:** Code generation endpoint.
