-- ================================================================
-- CoisaPet — Fase 17: Marca pedidos Full (despachados pelo próprio ML)
-- ================================================================
-- Execute no SQL Editor do Supabase.
--
-- Pedido Full = o Mercado Livre já guarda o estoque no centro de
-- distribuição dele e despacha sozinho — a CoisaPet não separa nem
-- embala esse pedido. Sem essa marcação, ele entrava no picklist como
-- qualquer pedido normal (bug real: aconteceu em 2026-08-24).
-- ================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS is_full BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.orders.is_full IS 'true = pedido Full (logistic_type=fulfillment na API do ML) — o ML despacha sozinho, nunca deve gerar produção/picklist';

CREATE INDEX IF NOT EXISTS idx_orders_is_full ON public.orders(is_full) WHERE is_full = true;

-- ── Confirma ──────────────────────────────────────────────────────
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'is_full';
