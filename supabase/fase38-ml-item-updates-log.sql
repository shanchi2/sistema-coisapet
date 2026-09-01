-- ================================================================
-- CoisaPet — Fase 38: log de "última atualização" por anúncio ML
-- ================================================================
-- Execute no SQL Editor do Supabase.
--
-- Contexto (ver coisapet.md): Raphael pediu pra ver, na tela de Saúde
-- do Anúncio, quando foi a última vez que O NOSSO SISTEMA mexeu
-- naquele anúncio (ficha técnica, título/descrição, preço/estoque,
-- criação, entrada/saída de campanha) — o `last_updated` do próprio
-- item no ML muda por qualquer motivo (inclusive coisa que o ML faz
-- sozinho), não serve pra saber "o que a gente mexeu".
-- ================================================================

CREATE TABLE IF NOT EXISTS public.ml_item_updates (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id    TEXT        NOT NULL,
  action     TEXT        NOT NULL, -- 'attributes' | 'content' | 'quick_fields' | 'create' | 'promotion_join' | 'promotion_leave'
  detail     JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ml_item_updates_item_id_idx ON public.ml_item_updates (item_id, updated_at DESC);

COMMENT ON TABLE public.ml_item_updates IS 'Log de gravações feitas pelo sistema CoisaPet em anúncios do Mercado Livre (ficha técnica, título/descrição, preço/estoque, criação, campanhas) — só pra mostrar "última atualização" na tela. Só acessada pela edge function ml-insights via service role, sem GRANT pra anon.';
