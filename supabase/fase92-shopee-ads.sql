-- ================================================================
-- CoisaPet — Fase 92: Shopee Ads (Publicidade) — créditos, saldo, log
-- ================================================================
-- Execute no SQL Editor do Supabase.
--
-- Contexto (ver coisapet.md, 02/10): módulo novo /shopee/ads. A API da
-- Shopee lê saldo e desempenho das campanhas, mas NÃO tem endpoint pra
-- recarregar crédito (recarga é pagamento, só no Seller Center). Então o
-- "controle de créditos" mora aqui:
--   1. shopee_ads_credits            — recargas lançadas pela equipe
--   2. shopee_ads_balance_snapshots  — saldo real lido da API (cron 3/3h
--                                      + toda vez que abre a aba)
--   3. shopee_ads_settings           — limite de alerta, orçamento mensal,
--                                      metas de ROAS/ACOS (linha única)
--   4. shopee_ads_actions_log        — toda edição de campanha feita
--                                      pelo sistema (pausar, orçamento...)
-- ================================================================

-- ── 1. Recargas de crédito ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shopee_ads_credits (
  id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  data            DATE        NOT NULL DEFAULT CURRENT_DATE,
  valor           NUMERIC(12,2) NOT NULL CHECK (valor > 0),   -- valor pago
  bonus           NUMERIC(12,2) NOT NULL DEFAULT 0,           -- crédito grátis/bônus recebido junto
  tipo            TEXT        NOT NULL DEFAULT 'recarga'
                  CHECK (tipo IN ('recarga','recarga_automatica','bonus','estorno','ajuste')),
  forma_pagamento TEXT,                                       -- pix, cartão, boleto, saldo Shopee...
  observacao      TEXT,
  bill_id         UUID        REFERENCES public.bills(id) ON DELETE SET NULL, -- conta criada no Financeiro (opcional)
  created_by      UUID        REFERENCES public.system_users(id) ON DELETE SET NULL,
  created_by_name TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shopee_ads_credits_data ON public.shopee_ads_credits(data DESC);

-- ── 2. Histórico do saldo real (lido da API) ─────────────────────
CREATE TABLE IF NOT EXISTS public.shopee_ads_balance_snapshots (
  id             BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  captured_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  balance        NUMERIC(12,2) NOT NULL,
  auto_top_up    BOOLEAN,
  campaign_surge BOOLEAN,
  source         TEXT        -- 'cron' | 'tela'
);
CREATE INDEX IF NOT EXISTS idx_shopee_ads_snapshots_at ON public.shopee_ads_balance_snapshots(captured_at DESC);

-- ── 3. Configurações (linha única id=1) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.shopee_ads_settings (
  id                    INTEGER     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  low_balance_threshold NUMERIC(12,2) DEFAULT 50,   -- avisa no sino abaixo disso
  monthly_budget        NUMERIC(12,2),              -- teto de gasto do mês (nosso controle)
  target_roas           NUMERIC(8,2) DEFAULT 8,     -- campanha abaixo disso = "atenção"
  max_acos              NUMERIC(8,2) DEFAULT 15,    -- em %, campanha acima disso = "atenção"
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_name       TEXT
);
INSERT INTO public.shopee_ads_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ── 4. Log de edições de campanha feitas pelo sistema ────────────
CREATE TABLE IF NOT EXISTS public.shopee_ads_actions_log (
  id          BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_id TEXT        NOT NULL,
  action      TEXT        NOT NULL,
  detail      JSONB,
  user_name   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shopee_ads_log_campaign ON public.shopee_ads_actions_log(campaign_id, created_at DESC);

-- ── RLS ──────────────────────────────────────────────────────────
-- App não usa sessão do Supabase Auth — policy precisa ser TO anon
-- (mesmo padrão da fase88). Snapshots e log: só leitura pelo app,
-- escrita só pela edge function (service_role).
ALTER TABLE public.shopee_ads_credits            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopee_ads_balance_snapshots  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopee_ads_settings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopee_ads_actions_log        ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shopee_ads_credits_all ON public.shopee_ads_credits;
CREATE POLICY shopee_ads_credits_all ON public.shopee_ads_credits
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS shopee_ads_settings_all ON public.shopee_ads_settings;
CREATE POLICY shopee_ads_settings_all ON public.shopee_ads_settings
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS shopee_ads_snapshots_read ON public.shopee_ads_balance_snapshots;
CREATE POLICY shopee_ads_snapshots_read ON public.shopee_ads_balance_snapshots
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS shopee_ads_log_read ON public.shopee_ads_actions_log;
CREATE POLICY shopee_ads_log_read ON public.shopee_ads_actions_log
  FOR SELECT TO anon, authenticated USING (true);

-- ── Cron: snapshot de saldo + alerta de saldo baixo a cada 3h ────
-- (deslocado 45min dos outros crons da Shopee/ML pra não bater junto)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'shopee-ads-balance-check-periodico';

SELECT cron.schedule(
  'shopee-ads-balance-check-periodico',
  '45 */3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://lcybmdiqxmbqeuyeuhdj.supabase.co/functions/v1/shopee-ads-balance-check',
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  $$
);
