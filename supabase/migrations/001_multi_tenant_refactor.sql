-- =============================================================================
-- Migration: Multi-tenant refactor
-- Remove: projects, project_dependencies, lib_docs
-- Create: organizations, profiles, documents (novo schema), match_documents fn, trigger
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Remove tabelas antigas (se existirem)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS project_dependencies CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS lib_docs CASCADE;
DROP TABLE IF EXISTS documents CASCADE;

-- ---------------------------------------------------------------------------
-- 2. organizations
-- ---------------------------------------------------------------------------
CREATE TABLE organizations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 3. profiles
-- (extensão do auth.users — criada automaticamente pelo trigger abaixo)
-- ---------------------------------------------------------------------------
CREATE TABLE profiles (
  id              UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID        REFERENCES organizations(id) ON DELETE SET NULL,
  role            TEXT        NOT NULL DEFAULT 'user'
                              CHECK (role IN ('admin', 'user')),
  full_name       TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON profiles(organization_id);

-- ---------------------------------------------------------------------------
-- 4. documents
-- ---------------------------------------------------------------------------
CREATE TABLE documents (
  id              BIGSERIAL   PRIMARY KEY,
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  filename        TEXT        NOT NULL,
  content         TEXT        NOT NULL,
  embedding       vector(1536) NOT NULL,
  metadata        JSONB,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON documents(organization_id);
CREATE INDEX ON documents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ---------------------------------------------------------------------------
-- 5. Função match_documents (filtra por organization_id)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding   vector(1536),
  match_count       int     DEFAULT 5,
  match_threshold   float   DEFAULT 0.75,
  p_organization_id UUID    DEFAULT NULL
)
RETURNS TABLE (
  id          bigint,
  content     text,
  similarity  float,
  filename    text
)
LANGUAGE sql STABLE AS $$
  SELECT
    id,
    content,
    1 - (embedding <=> query_embedding) AS similarity,
    filename
  FROM documents
  WHERE
    (p_organization_id IS NULL OR organization_id = p_organization_id)
    AND 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ---------------------------------------------------------------------------
-- 6. Trigger: cria profile automaticamente quando um usuário é registrado
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (id, organization_id, role, full_name)
  VALUES (
    NEW.id,
    (NEW.raw_user_meta_data->>'organization_id')::uuid,
    COALESCE(NEW.raw_user_meta_data->>'role', 'user'),
    NEW.raw_user_meta_data->>'full_name'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();
