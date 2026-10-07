-- Fase 99 — Extensão do Chrome "CoisaPet — Sincronizar Envios Full" (07/10)
--
-- A extensão sincroniza a Gestão de Envios Full sozinha quando alguém abre
-- a Central de Vendedores do ML. Cada computador usa um CÓDIGO PRÓPRIO,
-- gerado por um diretor na tela de Envios Full e revogável — nada de
-- senha fixa dentro da extensão (o zip dela fica público pra download).
-- Aqui só fica o hash SHA-256 do código; o código em si só aparece uma
-- vez, na hora de gerar.

CREATE TABLE IF NOT EXISTS public.ml_full_sync_tokens (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  label           TEXT        NOT NULL,                 -- ex: "PC do escritório"
  token_hash      TEXT        NOT NULL UNIQUE,          -- sha256 hex do código
  created_by      UUID,
  created_by_name TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at    TIMESTAMPTZ,
  last_result     TEXT,
  revoked_at      TIMESTAMPTZ
);
ALTER TABLE public.ml_full_sync_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ml_full_sync_tokens_all ON public.ml_full_sync_tokens;
CREATE POLICY ml_full_sync_tokens_all ON public.ml_full_sync_tokens
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT ALL ON public.ml_full_sync_tokens TO anon, authenticated;

-- De onde veio a última leitura de cada envio (favorito ou qual computador)
ALTER TABLE public.ml_full_inbound_shipments ADD COLUMN IF NOT EXISTS synced_by TEXT;
