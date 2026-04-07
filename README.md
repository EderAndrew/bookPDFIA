# CodeBookAI — PDF API

API REST construída com NestJS para processar documentações de bibliotecas e livros de programação via PDF ou crawling automático, gerar embeddings e habilitar busca semântica inteligente (RAG pipeline).

## Como funciona

```
Upload PDF → extração de texto → chunking → embeddings (OpenAI) → armazenamento (Supabase pgvector)
                                                                          ↓
                              Pergunta → embedding → busca semântica → resposta (GPT-4o)
```

```
package.json → extração de dependências → crawling de docs → embeddings → lib_docs (Supabase)
                                                                                  ↓
                  Pergunta + projectId → busca paralela nas deps indexadas → resposta (GPT-4o)
```

Toda operação é isolada por usuário: documentos e projetos são sempre associados ao `userId` extraído do token JWT do Supabase.

## Pré-requisitos

- Node.js 20+
- pnpm
- Conta OpenAI (API key)
- Projeto Supabase com extensão `pgvector`

## Instalação

```bash
pnpm install
```

Crie um arquivo `.env` na raiz do projeto:

```env
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
PORT=3000
```

## Configuração do Supabase

Execute os SQLs abaixo no **SQL Editor** do seu projeto Supabase antes de rodar a API.

### Tabela `documents` (upload de PDFs)

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE documents (
  id        BIGSERIAL   PRIMARY KEY,
  content   TEXT        NOT NULL,
  embedding vector(1536) NOT NULL,
  metadata  JSONB,
  user_id   UUID        REFERENCES auth.users(id)
);

CREATE INDEX ON documents (user_id);

CREATE INDEX ON documents
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(1536),
  match_count     int   DEFAULT 5,
  match_threshold float DEFAULT 0.5,
  p_user_id       UUID  DEFAULT NULL
)
RETURNS TABLE (id bigint, content TEXT, similarity float)
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

### Tabelas de projetos e docs de bibliotecas (Fase 1)

```sql
-- projects
CREATE TABLE projects (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON projects (user_id);

-- project_dependencies
CREATE TABLE project_dependencies (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  lib_name   TEXT        NOT NULL,
  version    TEXT        NOT NULL,
  doc_status TEXT        NOT NULL DEFAULT 'pending'
               CHECK (doc_status IN ('pending', 'crawling', 'indexed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON project_dependencies (project_id);

-- lib_docs
CREATE TABLE lib_docs (
  id         BIGSERIAL    PRIMARY KEY,
  lib_name   TEXT         NOT NULL,
  version    TEXT         NOT NULL,
  content    TEXT         NOT NULL,
  embedding  vector(1536) NOT NULL,
  source_url TEXT         NOT NULL,
  metadata   JSONB,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX ON lib_docs
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE OR REPLACE FUNCTION match_lib_docs(
  query_embedding vector(1536),
  p_lib_name      TEXT,
  p_version       TEXT,
  match_count     int   DEFAULT 5,
  match_threshold float DEFAULT 0.5
)
RETURNS TABLE (id bigint, content TEXT, similarity float, source_url TEXT)
LANGUAGE sql STABLE AS $$
  SELECT
    id,
    content,
    1 - (embedding <=> query_embedding) AS similarity,
    source_url
  FROM lib_docs
  WHERE
    lib_name = p_lib_name
    AND version = p_version
    AND 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;
```

## Rodando o projeto

```bash
# desenvolvimento (hot reload)
pnpm run start:dev

# produção
pnpm run build
pnpm run start:prod
```

## Autenticação

Todas as rotas (exceto `POST /auth/register` e `POST /auth/login`) exigem um token JWT no header:

```
Authorization: Bearer <token>
```

O token é retornado no campo `session.access_token` após login ou registro.

## Endpoints

### Autenticação

#### `POST /auth/register`

Cria uma nova conta.

**Request:** `application/json`

```json
{
  "name": "João Silva",
  "email": "joao@exemplo.com",
  "password": "senha123"
}
```

**Response `201`:**

```json
{
  "user": { "id": "uuid", "email": "joao@exemplo.com", "..." },
  "session": { "access_token": "eyJ...", "..." }
}
```

---

#### `POST /auth/login`

Autentica um usuário existente.

**Request:** `application/json`

```json
{
  "email": "joao@exemplo.com",
  "password": "senha123"
}
```

**Response `201`:**

```json
{
  "user": { "id": "uuid", "email": "joao@exemplo.com", "..." },
  "session": { "access_token": "eyJ...", "..." }
}
```

| Status | Mensagem |
|---|---|
| `401` | `"Credenciais inválidas."` |

---

#### `POST /auth/logout`

Invalida a sessão do usuário autenticado.

**Response `201`:**

```json
{ "message": "Logout realizado com sucesso." }
```

---

### Usuário

#### `GET /users/me`

Retorna o perfil do usuário autenticado.

**Response `200`:**

```json
{
  "id": "uuid",
  "email": "joao@exemplo.com",
  "name": "João Silva",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

---

### PDF

Todas as rotas de PDF exigem autenticação. Os documentos são isolados por usuário.

#### `POST /pdf/upload`

Faz upload de um PDF, extrai e limpa o texto, divide em chunks, gera embeddings em batch via OpenAI e salva no Supabase associado ao usuário autenticado.

**Request:** `multipart/form-data`

| Campo | Tipo | Descrição |
|---|---|---|
| `file` | `File` | Arquivo PDF (`application/pdf`) |

**Response `201`:**

```json
{
  "textLength": 48320,
  "totalChunks": 121
}
```

| Status | Mensagem |
|---|---|
| `400` | `"Nenhum arquivo enviado."` |
| `400` | `"O arquivo deve ser um PDF."` |
| `400` | `"Não foi possível extrair o texto deste PDF. O arquivo pode estar corrompido ou ser um PDF escaneado."` |
| `401` | `"Token não fornecido."` / `"Token inválido ou expirado."` |

---

#### `POST /pdf/ask`

Faz uma pergunta em linguagem natural. A API busca os chunks mais relevantes do usuário via busca semântica e responde usando GPT-4o com base no conteúdo do PDF enviado.

**Request:** `application/json`

```json
{
  "question": "Como funciona um array em Go?"
}
```

**Response `201`:**

```json
{
  "answer": "Em Go, um array é uma sequência de elementos de tamanho fixo..."
}
```

| Status | Mensagem |
|---|---|
| `400` | `"A pergunta não pode ser vazia."` |
| `401` | `"Token não fornecido."` / `"Token inválido ou expirado."` |

---

#### `POST /pdf/ask-with-context`

Faz uma pergunta com base nas dependências indexadas de um projeto. Busca em paralelo em todas as bibliotecas com `doc_status: "indexed"` e responde com GPT-4o indicando as fontes utilizadas.

**Request:** `application/json`

```json
{
  "question": "Como usar o hook useEffect no React?",
  "projectId": "uuid-do-projeto"
}
```

**Response `201`:**

```json
{
  "answer": "O hook useEffect é utilizado para executar efeitos colaterais...",
  "sources": [
    { "libName": "react", "version": "18.2.0" },
    { "libName": "react-dom", "version": "18.2.0" }
  ]
}
```

| Status | Mensagem |
|---|---|
| `400` | Validação do DTO (question vazio, projectId inválido) |
| `401` | `"Token não fornecido."` / `"Token inválido ou expirado."` |
| `404` | `"Nenhuma dependência indexada neste projeto."` |

---

### Projetos

Todas as rotas de projetos exigem autenticação. Projetos são isolados por usuário.

#### `POST /projects`

Cria um projeto e inicia o crawling automático de documentação de todas as dependências do `package.json` fornecido (em background, sem bloquear a resposta).

**Request:** `application/json`

```json
{
  "name": "Meu Projeto React",
  "packageJson": {
    "dependencies": {
      "react": "^18.2.0",
      "react-dom": "^18.2.0",
      "axios": "^1.6.0"
    },
    "devDependencies": {
      "typescript": "^5.0.0"
    }
  }
}
```

**Response `201`:**

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "name": "Meu Projeto React",
  "created_at": "2024-01-01T00:00:00.000Z",
  "project_dependencies": [
    { "id": "uuid", "lib_name": "react", "version": "18.2.0", "doc_status": "pending" },
    { "id": "uuid", "lib_name": "react-dom", "version": "18.2.0", "doc_status": "pending" },
    { "id": "uuid", "lib_name": "axios", "version": "1.6.0", "doc_status": "pending" },
    { "id": "uuid", "lib_name": "typescript", "version": "5.0.0", "doc_status": "pending" }
  ]
}
```

O crawling ocorre em background. Consulte `GET /projects/:id` para acompanhar o status de cada dependência (`pending` → `crawling` → `indexed` | `failed`).

---

#### `GET /projects`

Lista todos os projetos do usuário autenticado com suas dependências.

**Response `200`:** array de projetos com `project_dependencies`.

---

#### `GET /projects/:id`

Retorna um projeto específico com o status atualizado de cada dependência.

**Response `200`:**

```json
{
  "id": "uuid",
  "name": "Meu Projeto React",
  "project_dependencies": [
    { "lib_name": "react", "version": "18.2.0", "doc_status": "indexed" },
    { "lib_name": "axios", "version": "1.6.0", "doc_status": "failed" }
  ]
}
```

| Status | Mensagem |
|---|---|
| `404` | `"Projeto não encontrado."` |

---

#### `POST /projects/:id/recrawl`

Reenfileira para crawling todas as dependências do projeto com `doc_status` igual a `pending` ou `failed`, sem precisar recriar o projeto.

**Response `201`:**

```json
{ "queued": 2 }
```

| Status | Mensagem |
|---|---|
| `404` | `"Projeto não encontrado."` |

---

## Arquitetura

```
src/
  ai/              # AiService — embeddings (text-embedding-3-small) e chat (gpt-4o)
  auth/            # AuthModule — register, login, logout, AuthGuard, AuthRepository
  crawler/         # CrawlerModule — NpmStrategy, DocsStrategy, LibDocsRepository, CrawlerService
  pdf/             # PdfModule — upload, ask, ask-with-context, DocumentRepository
  projects/        # ProjectsModule — CRUD de projetos, ProjectsRepository
  supabase/        # SupabaseService — provedor do cliente Supabase (infra pura)
  users/           # UsersModule — perfil do usuário autenticado
```

Os módulos seguem o **repository pattern**: services dependem apenas de repositórios, nunca do cliente Supabase diretamente. A única exceção é `CrawlerService`, que usa `SupabaseService` diretamente para atualizar o status da dependência, evitando dependência circular com `ProjectsModule`.

### Fluxo de crawling

```
POST /projects
  └─ ProjectsService.createProject
       ├─ cria projeto e deps (status: pending)
       └─ setImmediate → CrawlerService.crawlLib (por dep, em paralelo)
            ├─ NpmStrategy  — consulta npm registry → extrai URL da doc (tenta /docs se homepage for raiz)
            ├─ DocsStrategy — crawl multi-página (até 20 páginas), segue links de docs internos
            ├─ AiService.embedBatch — uma chamada OpenAI por biblioteca
            └─ LibDocsRepository.save — deleta docs anteriores e insere os novos chunks
```

## Testes

```bash
pnpm run test          # unitários
pnpm run test:e2e      # e2e
pnpm run test:cov      # cobertura
```

## Roadmap

- [ ] `POST /pdf/code` — geração de código com contexto do PDF
- [x] Suporte a múltiplas páginas por biblioteca (crawling recursivo, até 20 páginas)
- [ ] Associar chunks ao PDF de origem (`pdf_id` na tabela `documents`)
- [ ] Listar PDFs enviados por usuário