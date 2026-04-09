# CodeBookAI — API

API REST multi-tenant construída com NestJS para criar chatbots corporativos inteligentes baseados em documentação interna. Empresas fazem upload de PDFs (financeiro, RH, jurídico, operacional) e seus usuários consultam o chatbot, que responde exclusivamente com base nos documentos cadastrados.

## Como funciona

```
PDF upload → extração de texto → limpeza → chunking → embedding (OpenAI)
                                                              ↓
                                                    Supabase (pgvector)
                                                              ↑
Pergunta → embedding → busca semântica (similarity search) → top-K chunks → GPT-4o → resposta
```

1. Um **admin** faz upload de um PDF via `POST /documents/upload`
2. O texto é extraído, limpo e dividido em chunks de ~1000 caracteres com overlap de 200
3. Cada chunk é transformado em vetor via `text-embedding-3-small` e salvo no Supabase com `pgvector`
4. Qualquer **usuário** da organização pode perguntar via `POST /chat`
5. A pergunta vira embedding → busca os 8 trechos mais similares filtrados pela organização → GPT-4o responde com base apenas nesses trechos
6. A resposta inclui as fontes (nome dos PDFs) usadas para compor a resposta

## Stack

- **NestJS** + TypeScript
- **Supabase** — PostgreSQL + Auth + pgvector
- **OpenAI** — `text-embedding-3-small` (embeddings) + `gpt-4o` (chat)
- Repository Pattern — Controller → Service → Repository → Supabase

## Modelo de acesso (multi-tenant)

| Role | Permissões |
|---|---|
| `admin` | Upload e remoção de documentos + todas as consultas |
| `user` | Apenas consultas ao chatbot |

- Cada empresa é uma **organização** isolada
- Usuários de uma organização **nunca** acessam dados de outra
- O `organization_id` sempre vem do token JWT — nunca do body da requisição

## Variáveis de ambiente

Crie um arquivo `.env` na raiz:

```env
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
PORT=3000
```

| Variável | Obrigatório | Descrição |
|---|---|---|
| `OPENAI_API_KEY` | Sim | Chave da API OpenAI |
| `SUPABASE_URL` | Sim | URL do projeto Supabase |
| `SUPABASE_SERVICE_KEY` | Sim | Service role key do Supabase (ignora RLS) |
| `PORT` | Não | Porta HTTP (padrão: 3000) |
| `ALLOWED_ORIGINS` | Não | Origens CORS permitidas, separadas por vírgula (ex: `https://app.empresa.com`). Se ausente, CORS fica bloqueado. |

## Setup

```bash
# Instalar dependências
pnpm install

# Desenvolvimento (watch mode)
pnpm run start:dev

# Build para produção
pnpm run build && pnpm run start:prod
```

## Banco de dados (Supabase)

Execute o SQL em `supabase/migrations/001_multi_tenant_refactor.sql` no **SQL Editor** do Supabase.

O script cria:
- Tabela `organizations`
- Tabela `profiles` (extensão de `auth.users` com `role` e `organization_id`)
- Tabela `documents` com índice `ivfflat` para busca vetorial por organização
- Função `match_documents` com filtro por `p_organization_id`
- Trigger `on_auth_user_created` — cria o profile automaticamente no cadastro via `user_metadata`

## Segurança

| Camada | Mecanismo |
|---|---|
| Upload de PDF | Validação de magic bytes (`%PDF`) — MIME type forjado pelo cliente é rejeitado |
| Tamanho de arquivo | Limite de **50 MB** por upload (rejeição automática pelo Multer) |
| Nome de arquivo | `basename` + sanitização (`[^a-zA-Z0-9._-]` → `_`) — previne path traversal |
| Chatbot | Pergunta isolada com delimitadores XML no prompt; `@MaxLength(1000)` no DTO |
| Erros internos | Mensagens do Supabase/OpenAI nunca chegam ao cliente; logadas internamente com `Logger` |
| Headers HTTP | `helmet` habilitado globalmente |
| Autenticação | Token validado via `supabase.auth.getUser()` a cada requisição |
| Multi-tenancy | `organization_id` extraído sempre do token JWT — nunca do body |
| Autorização | `RolesGuard` + `@Roles('admin')` em rotas de escrita |

## Autenticação

Todas as rotas (exceto `POST /auth/register` e `POST /auth/login`) exigem:

```
Authorization: Bearer <token>
```

O token é retornado no campo `session.access_token` após login.

## Rotas

| Método | Rota | Role | Descrição |
|---|---|---|---|
| `POST` | `/auth/register` | — | Cria organização + admin |
| `POST` | `/auth/login` | — | Login |
| `POST` | `/auth/logout` | * | Logout |
| `GET` | `/auth/me` | * | Dados do usuário, profile e organização |
| `POST` | `/documents/upload` | admin | Upload de PDF |
| `DELETE` | `/documents/:filename` | admin | Remove uma documentação |
| `GET` | `/documents` | * | Lista documentações da organização |
| `POST` | `/chat` | * | Pergunta ao chatbot |

### Exemplos

**Criar conta de admin com nova organização**
```http
POST /auth/register
Content-Type: application/json

{
  "full_name": "João Silva",
  "email": "joao@empresa.com",
  "password": "senha123",
  "organization_name": "Empresa Exemplo"
}
```

**Fazer upload de documentação** _(máx. 50 MB, apenas PDF real — validado por magic bytes)_
```http
POST /documents/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: politica_financeira.pdf
```

Resposta:
```json
{
  "textLength": 48320,
  "totalChunks": 121
}
```

**Consultar o chatbot**
```http
POST /chat
Authorization: Bearer <token>
Content-Type: application/json

{
  "question": "Qual o prazo para solicitação de reembolso de despesas?"
}
```

Resposta:
```json
{
  "answer": "De acordo com a Política Financeira, o prazo para solicitação de reembolso é de **30 dias corridos** a partir da data da despesa...",
  "sources": [
    { "filename": "politica_financeira.pdf" }
  ]
}
```

**Listar documentações da organização**
```http
GET /documents
Authorization: Bearer <token>
```

Resposta:
```json
[
  { "filename": "politica_financeira.pdf", "totalChunks": 121, "uploadedAt": "2024-06-01T..." },
  { "filename": "manual_rh.pdf", "totalChunks": 87, "uploadedAt": "2024-05-20T..." }
]
```

**Remover uma documentação**
```http
DELETE /documents/politica_financeira.pdf
Authorization: Bearer <token>
```

## Estrutura do projeto

```
src/
├── auth/
│   ├── guards/auth.guard.ts       # Valida token + carrega profile (role, org)
│   ├── roles.guard.ts             # Verifica @Roles('admin')
│   ├── roles.decorator.ts         # Decorator @Roles(...)
│   ├── profile.repository.ts      # Queries na tabela profiles
│   ├── auth.repository.ts         # Supabase Auth SDK
│   ├── auth.service.ts
│   ├── auth.controller.ts
│   └── dto/
├── organizations/
│   ├── organizations.repository.ts
│   ├── organizations.service.ts
│   └── organizations.module.ts
├── documents/
│   ├── documents.controller.ts    # Rotas /documents/* e /chat
│   ├── documents.service.ts       # PDF processing + RAG pipeline
│   ├── documents.repository.ts    # Queries + busca vetorial
│   └── dto/
├── ai/
│   └── ai.service.ts              # OpenAI embeddings + chat (gpt-4o)
└── supabase/
    └── supabase.service.ts        # Cliente Supabase
```

## Testes

```bash
pnpm run test           # Unitários
pnpm run test:e2e       # E2E
pnpm run test:cov       # Cobertura
```
