-- ================================================================
-- CoisaPet — Fase 62: Log de alterações de anúncio da Shopee
-- ================================================================
-- Execute no SQL Editor do Supabase (ou supabase db query --linked --file).
--
-- Contexto (ver coisapet.md): espelha `ml_item_updates` — registra
-- escrita real feita via shopee-insights (pausar/reativar anúncio, e o
-- que vier depois). Usado tanto pra auditoria quanto pra telas tipo
-- "última alteração há X dias" (mesmo padrão do ML).
-- ================================================================

CREATE TABLE IF NOT EXISTS public.shopee_item_updates (
  id          BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id     TEXT        NOT NULL,
  action      TEXT        NOT NULL,
  detail      JSONB,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shopee_item_updates_item_id ON public.shopee_item_updates(item_id);

COMMENT ON TABLE public.shopee_item_updates IS 'Log de alterações reais feitas via shopee-insights (pausar/reativar anúncio etc) — sem GRANT a anon, só service_role.';

ALTER TABLE public.shopee_item_updates ENABLE ROW LEVEL SECURITY;
