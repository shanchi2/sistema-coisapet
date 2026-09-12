-- ================================================================
-- CoisaPet — Fase 45: check de sincronização manual pro Shopee
-- ================================================================
-- Execute no SQL Editor do Supabase.
--
-- Contexto (ver coisapet.md): a tela "Histórico de Atualizações"
-- (/ml/historico) agora agrupa as mudanças por anúncio; o time de
-- Atendimento usa essa tela pra replicar manualmente as mudanças do ML
-- pra Shopee, e precisa marcar "já fiz esse" (check) por anúncio.
--
-- 1 linha por item_id só. Comparado com `MAX(updated_at)` das mudanças
-- daquele item (calculado na hora, via ml-insights) — se surgir uma
-- mudança NOVA depois do `checked_at`, o item volta a aparecer como
-- pendente sozinho, sem precisar de nenhuma lógica extra aqui.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.ml_item_sync_checks (
  item_id    TEXT PRIMARY KEY,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checked_by TEXT -- nome de quem marcou (texto livre, vem do frontend)
);

COMMENT ON TABLE public.ml_item_sync_checks IS 'Marca de "já sincronizei esse anúncio pra Shopee manualmente" por item_id — usada pelo Atendimento na tela /ml/historico. Só acessada pela edge function ml-insights via service role, sem GRANT pra anon.';
