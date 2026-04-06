# CodeBookAI — PDF API

API REST construída com NestJS para processar PDFs de documentações e livros de programação, gerar embeddings e habilitar busca semântica para um chat inteligente (RAG pipeline).

## Como funciona

```
Upload PDF → extração de texto → chunking → embeddings (OpenAI) → armazenamento (Supabase pgvector)
                                                                          ↓
                                               Pergunta → embedding → busca semântica → resposta (em breve)
```

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

Execute o SQL abaixo no **SQL Editor** do seu projeto Supabase antes de rodar a API:

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
RETURNS TABLE (id bigint, content TEXT, similarity float)
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

## Rodando o projeto

```bash
# desenvolvimento (hot reload)
pnpm run start:dev

# produção
pnpm run build
pnpm run start:prod
```

## Endpoints

### `POST /pdf/upload`

Faz upload de um PDF, extrai o texto, divide em chunks, gera embeddings via OpenAI e salva no Supabase.

**Request:** `multipart/form-data`

| Campo | Tipo | Descrição |
|---|---|---|
| `file` | `File` | Arquivo PDF (`application/pdf`) |

**Response `200`:**

```json
{
  "textLength": 48320,
  "totalChunks": 121
}
```

**Erros:**

| Status | Mensagem |
|---|---|
| `400` | `"Nenhum arquivo enviado."` |
| `400` | `"O arquivo deve ser um PDF."` |
| `500` | `"Erro ao salvar embeddings: ..."` |

## Testes

```bash
pnpm run test          # unitários
pnpm run test:e2e      # e2e
pnpm run test:cov      # cobertura
```

## Roadmap

- [ ] `POST /chat/ask` — Q&A com base no conteúdo do PDF (busca semântica + LLM)
- [ ] `POST /chat/code` — geração de código com contexto do PDF
- [ ] Associar chunks ao PDF de origem (`pdf_id` na tabela `documents`)
