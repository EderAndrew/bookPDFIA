-- ============================================================
-- Fase 1 — DocAI: projects, project_dependencies, lib_docs
-- ============================================================

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
  id          BIGSERIAL   PRIMARY KEY,
  lib_name    TEXT        NOT NULL,
  version     TEXT        NOT NULL,
  content     TEXT        NOT NULL,
  embedding   vector(1536) NOT NULL,
  source_url  TEXT        NOT NULL,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON lib_docs
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- evita duplicatas: mesma lib+version+página
CREATE UNIQUE INDEX ON lib_docs (lib_name, version, source_url);

-- ============================================================
-- Função de busca semântica filtrada por lib e versão
-- ============================================================
CREATE OR REPLACE FUNCTION match_lib_docs(
  query_embedding  vector(1536),
  p_lib_name       TEXT,
  p_version        TEXT,
  match_count      int   DEFAULT 5,
  match_threshold  float DEFAULT 0.5
)
RETURNS TABLE (
  id         bigint,
  content    TEXT,
  similarity float,
  source_url TEXT
)
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
