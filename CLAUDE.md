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

This API is part of the **CodeBookAI** project. It receives uploads of programming documentation or book PDFs, processes the content, and exposes endpoints for RAG-based Q&A grounded in the uploaded PDFs. The system is multi-tenant: each organization has its own isolated document space.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | Yes | OpenAI API key used by `AiService` to generate embeddings |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Yes | Supabase service role key (bypasses RLS) |
| `PORT` | No | HTTP port (default: 3000) |
| `ALLOWED_ORIGINS` | No | Comma-separated CORS origins (e.g. `https://app.empresa.com`). If absent, CORS is blocked. |

## Supabase setup

Run this SQL in the Supabase SQL editor before starting the API:

```sql
-- Organizations table
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- User profiles (synced from auth.users)
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  organization_id uuid REFERENCES organizations(id),
  role text NOT NULL DEFAULT 'user',  -- 'admin' | 'user'
  full_name text,
  created_at timestamptz DEFAULT now()
);

-- PDF document chunks with embeddings (scoped per organization)
CREATE TABLE documents (
  id bigserial PRIMARY KEY,
  organization_id uuid REFERENCES organizations(id),
  filename text,
  content text,
  embedding vector(1536),
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX ON documents(organization_id);

-- RPC for RAG similarity search
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(1536),
  match_count int DEFAULT 5,
  match_threshold float DEFAULT 0.5,
  p_organization_id uuid DEFAULT NULL
)
RETURNS TABLE (id bigint, content text, similarity float, filename text)
LANGUAGE sql STABLE AS $$
  SELECT id, content, 1 - (embedding <=> query_embedding) AS similarity, filename
  FROM documents
  WHERE (p_organization_id IS NULL OR organization_id = p_organization_id)
    AND 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;
```

## Architecture

NestJS REST API bootstrapped with `helmet` and `ValidationPipe({ whitelist: true })`. All endpoints except `POST /auth/register` and `POST /auth/login` require a `Bearer <token>` header. `AuthGuard` validates the token via `supabase.auth.getUser(token)`, looks up the user's profile (role + organization), and injects an `AuthenticatedUser` into `request.user`. `RolesGuard` + `@Roles()` decorator enforce role-based access on top.

**Multi-tenancy model:** Registration always creates a new organization and sets the registering user as `admin`. All document operations are scoped by `organization_id` drawn from `request.user`.

**`AuthenticatedUser` interface** (defined in `src/auth/roles.guard.ts`):
```ts
{ id: string; role: 'admin' | 'user'; organization_id: string }
```

**`AiModule`** (`src/ai/`)
- `AiService`
  - `embed(text)` — single embedding via `text-embedding-3-small`
  - `embedBatch(texts)` — batch embeddings, returns `ChunkEmbedding[]`
  - `chat(context, question)` — RAG answer via `gpt-4o`; answers only from provided context; prompts in Portuguese
- `ChunkEmbedding` is exported from here and used by `DocumentsRepository`

**`SupabaseModule`** (`src/supabase/`)
- `SupabaseService` — two-client design to prevent session contamination:
  - `.client` — singleton with service-role key, `persistSession: false`; used for PostgREST queries and admin auth operations (e.g. `signOut`, `getUser`)
  - `.createAuthClient()` — returns a **new** client per call; must be used for user-facing `signIn`/`signUp` so that user sessions never bleed into the singleton

**`OrganizationsModule`** (`src/organizations/`)
- `OrganizationsRepository` — CRUD against the `organizations` table (`create`, `findById`, `findAll`, `delete`)
- `OrganizationsService` — thin wrapper exposing `createOrganization`, `findById`, `delete`; used by `AuthService` at registration time (with org rollback on user creation failure)

**`AuthModule`** (`src/auth/`)
- `POST /auth/register` — `{ email, password, full_name, organization_name }` → creates org first, then calls `signUp` (standard flow, requires email confirmation) with `role: 'admin'` in user metadata; rolls back (deletes org) if user creation fails → `{ message, user, organization }`
- `POST /auth/login` — `{ email, password }` → `{ user, session }`
- `POST /auth/logout` — (auth required) signs out via Supabase admin API
- `GET /auth/me` — (auth required) returns `{ profile, organization }`
- `AuthGuard` (`src/auth/guards/auth.guard.ts`) — validates `Bearer` token via `authRepository.getUser(token)`, loads profile, injects `AuthenticatedUser` into `request.user`
- `AuthRepository` — delegates to Supabase Auth SDK: `createAdminUser` (admin API, auto-confirms email; not used by current register flow), `signUp`, `signIn`, `signOut`, `getUser`
- `ProfileRepository` — reads `profiles` table; used by `AuthGuard` to load `role` and `organization_id` on every authenticated request
- `RolesGuard` + `@Roles('admin')` decorator — applied on top of `AuthGuard`; throws 403 if role not satisfied
- `@CurrentUser()` decorator (`src/auth/decorators/current-user.decorator.ts`) — extracts `request.user` typed as `AuthenticatedUser`

**`DocumentsModule`** (`src/documents/`)
- `POST /documents/upload` — `@Roles('admin')` — multipart `file`, `application/pdf` only, 50 MB limit; returns `{ textLength, totalChunks }`
- `GET /documents` — lists all documents for the user's organization (grouped by filename with chunk count)
- `DELETE /documents/:filename` — `@Roles('admin')` — deletes all chunks for that filename within the organization
- `POST /chat` — `{ question }` — RAG Q&A over the organization's documents; returns `{ answer, sources: [{filename}] }`
- `DocumentsService` — extracts text via `pdfjs-dist` (legacy build, Node.js worker), validates with `isTextValid`, cleans, chunks (size 1000, overlap 200), embeds batch, saves to `documents` table. `cleanText` / `chunkText` / `isTextValid` are public for unit testing; `isTextValid` rejects scanned PDFs by checking ratio of non-Latin characters (threshold: < 20%).
- `DocumentsRepository` — wraps all `documents` table queries; `searchSimilar` calls `match_documents` RPC with `p_organization_id` (8 results, 0.4 similarity threshold)

**Rate limiting:** `ThrottlerGuard` is registered globally via `APP_GUARD` (100 req / 60 s). Auth endpoints override this with `@Throttle`: `POST /auth/register` → 5/min, `POST /auth/login` → 10/min.

**`AppModule`** imports `ConfigModule.forRoot({ isGlobal: true })`, `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])`, `AiModule`, `SupabaseModule`, `AuthModule`, `OrganizationsModule`, `DocumentsModule`.

**Testing:** Unit specs (`*.spec.ts`) live alongside source files in `src/`. E2E specs live in `test/` with a separate `jest-e2e.json` config.

**Code style:** single quotes, trailing commas (Prettier). ESLint uses `typescript-eslint` recommended type-checked rules with `@typescript-eslint/no-explicit-any` disabled.

**Language:** User-facing strings and error messages are in Portuguese (e.g., `"Nenhum arquivo enviado."`, `"Credenciais inválidas."`). Keep new error messages in Portuguese.

**Not yet implemented:** Code generation endpoint; npm library crawler (`lib_docs`); project/dependency management.

## Key design decisions

- `SupabaseService` uses a two-client design: singleton with service-role key (PostgREST) + `createAuthClient()` per call for signIn/signUp — prevents session contamination between users
- Prompt injection protection via `<pergunta_do_usuario>` tags + explicit instruction in `AiService` system prompt
- Upload validates PDF magic bytes (`isPdfBuffer`) in addition to MIME type — MIME type alone is insufficient since it is client-controlled
- `isTextValid` rejects scanned PDFs by checking that non-Latin characters (charCode > 300) make up less than 20% of printable characters

## Known security gaps

- **HIGH:** `SUPABASE_SERVICE_KEY` in `.env` starts with `sb_publishable_` (anon key prefix) — verify it is actually the service role key (`sb_secret_`); if not, RLS is not bypassed and `auth.admin.*` operations will fail
- **MEDIUM:** `LoginDto.password` has no `@MaxLength` — allows arbitrarily long strings to reach Supabase Auth (`src/auth/dto/login.dto.ts`)
- **MEDIUM:** `POST /chat` has no `@Throttle` override — expensive endpoint (embed + GPT-4o) only has the global 100 req/60s IP-based cap
- **LOW:** `SupabaseService` uses `process.env!` — switch to `ConfigService.getOrThrow()` for fail-fast boot when env vars are missing
- **LOW:** `AiService` uses `configService.get()` instead of `getOrThrow()` — app boots with `apiKey: undefined` if `OPENAI_API_KEY` is absent

## Contexto atual de desenvolvimento

**Última atualização:** 2026-04-10

### Commits recentes
```
1665749 Claude command created
e280227 fix: resolve contaminação de sessão no cliente Supabase singleton
54e4444 fix: corrige SupabaseService para nunca persistir sessão de usuário
4117baa refactor: clean code e correções de qualidade
962d2e2 security: corrige vulnerabilidades importantes de segurança
```

### Modificações não commitadas nessa sessão
- `package.json`, `pnpm-lock.yaml` — `pnpm.overrides` adicionado para lodash; `lodash@4.17.23` removido do lockfile
- `src/documents/documents.repository.ts` — `error.message` sanitizado em 4 locais; Logger adicionado
- `src/organizations/organizations.repository.ts` — `error.message` sanitizado em 3 locais; Logger adicionado
- `CLAUDE.md` — seção "Known security gaps" adicionada; contexto efêmero de sessão anterior removido
- `src/auth/auth.service.ts`, `src/auth/dto/register.dto.ts`, `src/auth/profile.repository.ts` — correções de sessões anteriores ainda não commitadas

### O que foi feito nessa sessão
- **`/init`** — CLAUDE.md revisado: seção de contexto efêmero removida, "Known security gaps" permanente adicionada, item do axios (já corrigido) removido
- **`/security-scan`** — scan completo; 8 problemas encontrados: CRITICAL (credenciais reais no `.env`), HIGH (formato do `SUPABASE_SERVICE_KEY`, vazamento de `error.message`, lodash 4.17.23), MEDIUM (`LoginDto.password` sem MaxLength, `POST /chat` sem throttle), LOW (`process.env!`, `configService.get()`)
- **Corrigido** `documents.repository.ts` e `organizations.repository.ts` — `error.message` do Supabase não é mais exposto ao cliente; erros são logados internamente e o cliente recebe mensagem genérica

### Pendências de segurança
- [ ] **HIGH:** Verificar `SUPABASE_SERVICE_KEY` no `.env` — valor começa com `sb_publishable_` (formato de chave anon), deveria ser `sb_secret_` (service role). Se incorreto, RLS não é bypassado e `auth.admin.*` falha
- [ ] **MEDIUM:** `LoginDto.password` sem `@MaxLength(128)` — `src/auth/dto/login.dto.ts` linha 8
- [ ] **MEDIUM:** `POST /chat` sem `@Throttle` — endpoint caro (embed + GPT-4o) usa apenas o limite global de 100/60s
- [ ] **LOW:** `SupabaseService` — substituir `process.env!` por `ConfigService.getOrThrow()` — `src/supabase/supabase.service.ts`
- [ ] **LOW:** `AiService` — substituir `configService.get()` por `configService.getOrThrow()` — `src/ai/ai.service.ts` linha 18
