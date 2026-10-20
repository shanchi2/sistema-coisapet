-- Estoque nos Marketplaces (20/10): cores/variações que a CoisaPet não
-- trabalha mais (ex.: Verde-claro, Gepeto) — ficam zeradas de propósito e
-- saem da lista. Lista da EMPRESA (não por navegador). `term` = parte da
-- variação normalizada (minúscula, sem acento, hífen → espaço).
CREATE TABLE IF NOT EXISTS public.marketplace_stock_hidden_variations (
  term text PRIMARY KEY, label text NOT NULL, created_by text, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.marketplace_stock_hidden_variations ENABLE ROW LEVEL SECURITY;
CREATE POLICY mkt_hidden_var_all ON public.marketplace_stock_hidden_variations FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketplace_stock_hidden_variations TO anon, authenticated;
