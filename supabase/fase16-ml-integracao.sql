-- ================================================================
-- CoisaPet — Fase 16: Integração automática com a API do Mercado Livre
-- ================================================================
-- Execute no SQL Editor do Supabase
--
-- Depois de rodar este arquivo, ainda faltam 2 passos manuais no painel
-- do Supabase (Studio):
--   1. Settings → Edge Functions → Secrets: cadastrar ML_CLIENT_ID e
--      ML_CLIENT_SECRET (gerados em developers.mercadolivre.com.br).
--   2. Database → Webhooks: criar um webhook em INSERT na tabela
--      ml_webhook_events, tipo "HTTP Request", apontando pra Edge
--      Function ml-process-webhook — mesmo padrão já usado hoje pra
--      disparar send-notification-email a partir de inserts em
--      `notifications`.
-- ================================================================

-- ── 1. Token da conta ML conectada ────────────────────────────────
-- Ao contrário das outras tabelas deste projeto, esta NÃO tem GRANT
-- pra anon — client_secret/refresh_token dão acesso à conta do
-- vendedor inteira, então só o service_role (usado dentro das Edge
-- Functions) pode ler ou escrever aqui. RLS ligado e sem nenhuma
-- policy = ninguém além do service_role entra.
CREATE TABLE IF NOT EXISTS public.ml_integration (
  id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ml_user_id      TEXT        NOT NULL,
  ml_nickname     TEXT,
  access_token    TEXT        NOT NULL,
  refresh_token   TEXT        NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  scope           TEXT,
  connected_by    UUID        REFERENCES public.system_users(id) ON DELETE SET NULL,
  connected_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_sync_at    TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.ml_integration IS 'Token OAuth da conta Mercado Livre conectada — NUNCA dar GRANT a anon, só service_role (Edge Functions) acessa';

ALTER TABLE public.ml_integration ENABLE ROW LEVEL SECURITY;

-- ── 2. Status exposto ao front (sem token nenhum) ─────────────────
-- SECURITY DEFINER: roda com privilégio do dono (bypassa o RLS acima)
-- mas só devolve os 3 campos não-sensíveis.
CREATE OR REPLACE FUNCTION public.ml_connection_status()
RETURNS TABLE (connected boolean, ml_nickname text, last_sync_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT true, i.ml_nickname, i.last_sync_at
    FROM public.ml_integration i
    ORDER BY i.connected_at DESC
    LIMIT 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::text, NULL::timestamptz;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ml_connection_status() TO anon;

-- Desconecta a conta ML (apaga o token). Não expõe o token em nenhum
-- momento — só permite apagar. A tela só mostra o botão pra admin,
-- mesmo nível de confiança no client que o resto do sistema já usa
-- hoje (ex: apagar lote inteiro de pedidos também é só um DELETE via
-- anon key, ver deleteBatchOrders em useOrders.js).
CREATE OR REPLACE FUNCTION public.ml_disconnect()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.ml_integration;
$$;

GRANT EXECUTE ON FUNCTION public.ml_disconnect() TO anon;

-- ── 3. Fila de eventos de webhook ──────────────────────────────────
-- O ML exige resposta em até 500ms no callback do webhook — a Edge
-- Function ml-webhook só grava a notificação aqui e responde 200. O
-- processamento pesado (chamar a API, gravar o pedido) acontece
-- depois, disparado pelo Database Webhook configurado no passo 2 do
-- topo deste arquivo.
CREATE TABLE IF NOT EXISTS public.ml_webhook_events (
  id             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  topic          TEXT        NOT NULL,
  resource       TEXT        NOT NULL,
  ml_user_id     TEXT,
  application_id TEXT,
  attempts       INTEGER     DEFAULT 0,
  status         TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','error')),
  error_msg      TEXT,
  raw_payload    JSONB,
  received_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at   TIMESTAMPTZ
);

COMMENT ON TABLE public.ml_webhook_events IS 'Fila das notificações recebidas do ML — sem GRANT a anon, só service_role';

ALTER TABLE public.ml_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_ml_webhook_events_status ON public.ml_webhook_events(status, received_at);

-- ── 4. Confirma ──────────────────────────────────────────────────
SELECT table_name, 'OK' as status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('ml_integration','ml_webhook_events')
ORDER BY table_name;
