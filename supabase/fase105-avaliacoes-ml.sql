-- Avaliações do Mercado Livre (10/10). A API do ML só entrega avaliação
-- anúncio por anúncio (/reviews/item/{id}) — então a edge function
-- `ml-reviews` varre os anúncios aos poucos (cron) e guarda aqui, pra tela
-- /marketplaces/avaliacoes mostrar tudo junto com a Shopee.
-- O ML não deixa o vendedor responder avaliação — é só leitura.

CREATE TABLE IF NOT EXISTS public.ml_reviews (
  id            bigint PRIMARY KEY,
  item_id       text NOT NULL,
  rate          int,
  title         text,
  content       text,
  created_at_ml timestamptz,
  likes         int DEFAULT 0,
  dislikes      int DEFAULT 0,
  status        text,
  raw           jsonb,
  synced_at     timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ml_reviews_created_idx ON public.ml_reviews (created_at_ml DESC);
CREATE INDEX IF NOT EXISTS ml_reviews_item_idx ON public.ml_reviews (item_id);

CREATE TABLE IF NOT EXISTS public.ml_review_items (
  item_id        text PRIMARY KEY,
  rating_average numeric,
  total          int DEFAULT 0,
  levels         jsonb,
  synced_at      timestamptz DEFAULT now()
);

-- Leitura pelo front (sem R$, sem dado pessoal do comprador); escrita só service role
ALTER TABLE public.ml_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ml_review_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ml_reviews_read ON public.ml_reviews;
CREATE POLICY ml_reviews_read ON public.ml_reviews FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS ml_review_items_read ON public.ml_review_items;
CREATE POLICY ml_review_items_read ON public.ml_review_items FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.ml_reviews, public.ml_review_items TO anon, authenticated;

-- Cron (aplicado 10/10, jobid 9): busca as avaliações a cada 6h. Com 236
-- anúncios e 2 chamadas simultâneas (o ML devolve 429 se for mais rápido),
-- cada rodada cobre ~100-200 anúncios, começando pelos mais antigos.
-- SELECT cron.schedule('ml-reviews-sync', '23 */6 * * *', $$ SELECT net.http_post(
--   url := 'https://lcybmdiqxmbqeuyeuhdj.supabase.co/functions/v1/ml-reviews',
--   body := '{"action":"sync"}'::jsonb,
--   headers := '{"Content-Type":"application/json","Authorization":"Bearer <anon key>"}'::jsonb,
--   timeout_milliseconds := 150000); $$);
