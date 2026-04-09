-- =============================================================================
-- Migration: RPC para listar documentos agrupados por organização
-- Substitui o agrupamento em memória feito pelo DocumentsRepository
-- =============================================================================

CREATE OR REPLACE FUNCTION list_documents_by_organization(p_organization_id uuid)
RETURNS TABLE (filename text, total_chunks bigint, uploaded_at timestamptz)
LANGUAGE sql STABLE AS $$
  SELECT
    filename,
    COUNT(*)                  AS total_chunks,
    MIN(created_at)           AS uploaded_at
  FROM documents
  WHERE organization_id = p_organization_id
  GROUP BY filename
  ORDER BY MIN(created_at) DESC;
$$;
