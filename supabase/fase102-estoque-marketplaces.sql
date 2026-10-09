-- Fase 102 — Estoque dos anúncios ML × Shopee num lugar só (09/10)
--
-- Foto do estoque de CADA VARIAÇÃO de todos os anúncios ativos/pausados
-- das duas plataformas, gravada pela Edge Function `marketplace-stock`
-- (cron de hora em hora + botão). A tela "Estoque nos Marketplaces" lê
-- daqui e cruza com o ritmo de venda (orders/order_items, por SKU).

CREATE TABLE IF NOT EXISTS public.marketplace_stock (
  id           BIGSERIAL PRIMARY KEY,
  platform     TEXT NOT NULL,              -- ml | shopee
  item_id      TEXT NOT NULL,              -- MLB… / item_id da Shopee
  variation_id TEXT NOT NULL DEFAULT '',   -- '' = anúncio sem variação
  title        TEXT,
  variation    TEXT,                       -- "Rosa", "Branco / G"…
  sku          TEXT,
  stock        INTEGER,                    -- disponível pra venda agora
  status       TEXT,                       -- active | paused | …
  sub_status   TEXT,                       -- ML: out_of_stock etc.
  is_full      BOOLEAN NOT NULL DEFAULT FALSE,
  thumbnail    TEXT,
  permalink    TEXT,
  synced_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS marketplace_stock_platform_idx ON public.marketplace_stock(platform);
CREATE INDEX IF NOT EXISTS marketplace_stock_sku_idx ON public.marketplace_stock(sku);

CREATE TABLE IF NOT EXISTS public.marketplace_stock_sync (
  platform  TEXT PRIMARY KEY,
  synced_at TIMESTAMPTZ,
  result    TEXT,
  error     TEXT
);

-- Só leitura pelo app; quem grava é a Edge Function (service role)
ALTER TABLE public.marketplace_stock      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_stock_sync ENABLE ROW LEVEL SECURITY;
CREATE POLICY marketplace_stock_read      ON public.marketplace_stock      FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY marketplace_stock_sync_read ON public.marketplace_stock_sync FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.marketplace_stock, public.marketplace_stock_sync TO anon, authenticated;

-- Cron: de hora em hora (minuto 37)
-- SELECT cron.schedule('marketplace-stock-sync', '37 * * * *', $$ SELECT net.http_post(
--   url := 'https://lcybmdiqxmbqeuyeuhdj.supabase.co/functions/v1/marketplace-stock',
--   body := '{}'::jsonb, headers := '{"Content-Type": "application/json"}'::jsonb,
--   timeout_milliseconds := 150000); $$);
