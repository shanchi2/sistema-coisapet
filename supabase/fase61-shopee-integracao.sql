-- ================================================================
-- CoisaPet — Fase 61: Integração Shopee — conexão (Fase 1 do plano)
-- ================================================================
-- Execute no SQL Editor do Supabase (ou supabase db query --linked --file).
--
-- Contexto (ver coisapet.md): Raphael conseguiu acesso à API da Shopee
-- (16/09). Primeira peça da Fase 1 (sync de pedido em tempo real) —
-- mesmo desenho da integração ML: tabela de token (só service_role
-- acessa) + função SECURITY DEFINER que expõe só o status pro front +
-- fila de webhook events pra fase seguinte (sync de pedido de verdade).
-- ================================================================

-- ── 1. Token OAuth da loja Shopee conectada ────────────────────────
CREATE TABLE IF NOT EXISTS public.shopee_integration (
  id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id         TEXT        NOT NULL,
  shop_name       TEXT,
  access_token    TEXT        NOT NULL,
  refresh_token   TEXT        NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  is_sandbox      BOOLEAN     NOT NULL DEFAULT true,
  connected_by    UUID        REFERENCES public.system_users(id) ON DELETE SET NULL,
  connected_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_sync_at    TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.shopee_integration IS 'Token OAuth da loja Shopee conectada — NUNCA dar GRANT a anon, só service_role (Edge Functions) acessa. is_sandbox=true enquanto usarmos Test Partner_id/Key.';

ALTER TABLE public.shopee_integration ENABLE ROW LEVEL SECURITY;

-- ── 2. Status exposto ao front (sem token nenhum) ──────────────────
CREATE OR REPLACE FUNCTION public.shopee_connection_status()
RETURNS TABLE (connected boolean, shop_name text, is_sandbox boolean, last_sync_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT true, i.shop_name, i.is_sandbox, i.last_sync_at
    FROM public.shopee_integration i
    ORDER BY i.connected_at DESC
    LIMIT 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::text, NULL::boolean, NULL::timestamptz;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.shopee_connection_status() TO anon;

CREATE OR REPLACE FUNCTION public.shopee_disconnect()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.shopee_integration;
$$;

GRANT EXECUTE ON FUNCTION public.shopee_disconnect() TO anon;

-- ── 3. Fila de eventos de push/webhook (usada na próxima fase — sync
--       de pedido de verdade — já criada agora pra não precisar de
--       outra migration só pra isso) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shopee_webhook_events (
  id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code          INTEGER,       -- código do tipo de evento que a Shopee manda (push code)
  shop_id       TEXT,
  attempts      INTEGER     DEFAULT 0,
  status        TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','error')),
  error_msg     TEXT,
  raw_payload   JSONB,
  received_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at  TIMESTAMPTZ
);

COMMENT ON TABLE public.shopee_webhook_events IS 'Fila das notificações (push) recebidas da Shopee — sem GRANT a anon, só service_role. Ainda não processada (Fase 1 só cobre a conexão).';

ALTER TABLE public.shopee_webhook_events ENABLE ROW LEVEL SECURITY;
