-- Fase 101 — Valor real que entra na carteira (ML × Shopee) (07/10)
--
-- Pedido do Raphael: na tela ML × Shopee, ver "os valores reais que
-- entraram na carteira de cada plataforma … versus o que realmente foi
-- vendido". O faturamento da tela é bruto (qtd × preço); aqui guardamos o
-- LÍQUIDO de cada venda, direto das plataformas:
--   - ML: Mercado Pago /v1/payments/search — transaction_amount (bruto),
--     transaction_details.net_received_amount (líquido, já sem tarifa de
--     venda/envio/cupom), money_release_date/status (quando cai na conta).
--   - Shopee: payment.get_escrow_detail_batch — order_income.escrow_amount
--     (líquido) e payment.get_escrow_list (quando foi liberado na carteira).
-- Sincronizado pela Edge Function `marketplace-finance` (cron + botão).

CREATE TABLE IF NOT EXISTS public.marketplace_finance (
  platform      TEXT        NOT NULL,                 -- ml | shopee
  ref_id        TEXT        NOT NULL,                 -- ML: id do pagamento · Shopee: order_sn
  order_ref     TEXT,                                 -- ML: id do pedido · Shopee: order_sn
  sale_at       TIMESTAMPTZ,                          -- data da venda/pagamento
  status        TEXT,                                 -- approved / refunded / cancelled… (bruto da plataforma)
  gross         NUMERIC,                              -- valor da venda (o que o comprador pagou pelos produtos)
  net           NUMERIC,                              -- o que sobra pra CoisaPet depois das tarifas
  refunded      NUMERIC     DEFAULT 0,
  fees          JSONB,                                -- detalhamento das tarifas (auditoria)
  release_at    TIMESTAMPTZ,                          -- quando o dinheiro fica/ficou disponível na carteira
  released      BOOLEAN     NOT NULL DEFAULT FALSE,
  raw           JSONB,
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (platform, ref_id)
);
CREATE INDEX IF NOT EXISTS marketplace_finance_sale_idx    ON public.marketplace_finance(sale_at);
CREATE INDEX IF NOT EXISTS marketplace_finance_release_idx ON public.marketplace_finance(release_at);

-- Última sincronização por plataforma (pra tela mostrar "atualizado há X")
CREATE TABLE IF NOT EXISTS public.marketplace_finance_sync (
  platform   TEXT PRIMARY KEY,
  synced_at  TIMESTAMPTZ,
  result     TEXT,
  error      TEXT
);

ALTER TABLE public.marketplace_finance      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_finance_sync ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS marketplace_finance_read ON public.marketplace_finance;
DROP POLICY IF EXISTS marketplace_finance_sync_read ON public.marketplace_finance_sync;
-- Só leitura pelo app (quem grava é a Edge Function com service role);
-- a tela em si é só de diretor (controle no front, como o resto).
CREATE POLICY marketplace_finance_read ON public.marketplace_finance FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY marketplace_finance_sync_read ON public.marketplace_finance_sync FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.marketplace_finance, public.marketplace_finance_sync TO anon, authenticated;

-- Sincronização automática de hora em hora (minuto 17), últimos 45 dias:
-- SELECT cron.schedule('marketplace-finance-sync', '17 * * * *', $$ SELECT net.http_post(
--   url := 'https://lcybmdiqxmbqeuyeuhdj.supabase.co/functions/v1/marketplace-finance',
--   body := '{"action":"sync","days":45}'::jsonb, headers := '{"Content-Type": "application/json"}'::jsonb,
--   timeout_milliseconds := 150000); $$);
