-- =============================================================================
-- Migration: Corrige bypass de multi-tenancy em match_documents
--
-- Problema: p_organization_id DEFAULT NULL + cláusula OR fazia a função
-- retornar documentos de TODAS as organizações quando NULL era passado.
-- Isso era acionável quando um usuário de org deletada (ON DELETE SET NULL)
-- ainda possuía JWT válido.
--
-- Correção: remove DEFAULT NULL (parâmetro obrigatório) e usa = direto.
-- =============================================================================

-- OR REPLACE não remove defaults de parâmetros existentes — DROP obrigatório
DROP FUNCTION IF EXISTS match_documents(vector, int, float, uuid);

CREATE FUNCTION match_documents(
  query_embedding   vector(1536),
  match_count       int,
  match_threshold   float,
  p_organization_id UUID
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
    organization_id = p_organization_id
    AND 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;
