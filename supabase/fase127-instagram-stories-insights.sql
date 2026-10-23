-- fase127 — Instagram: stories + insights completos (23/10, pedido do Raphael)
--
-- Stories: a Meta só mostra os stories que estão NO AR (24h) e as métricas
-- deles também somem quando expiram. Então o cron guarda tudo aqui enquanto
-- o story está no ar (a cada ~15 min) e copia a imagem pro bucket
-- instagram-media (o link da Meta expira em poucos dias).
-- Insights: alcance/visualizações/interações por tipo de conteúdo (Reels,
-- posts, carrossel, stories), seguidores × não seguidores, comparação com
-- os 28 dias anteriores e métricas por dia (visualizações, contas engajadas,
-- interações, curtidas, comentários, compartilhamentos, salvos, cliques).
-- Como as outras ig_*: o front só LÊ; quem grava é a função (service role).
CREATE TABLE IF NOT EXISTS public.ig_stories (
  id           text PRIMARY KEY,
  media_type   text,
  permalink    text,
  posted_at    timestamptz,
  expires_at   timestamptz,
  media_url    text,          -- link original da Meta (expira)
  media_path   text,          -- cópia no bucket instagram-media (stories/<id>.jpg)
  insights     jsonb,         -- reach, views, replies, shares, total_interactions, follows, profile_visits
  navigation   jsonb,         -- tap_forward, tap_back, tap_exit, swipe_forward
  insights_at  timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ig_stories_posted_idx ON public.ig_stories (posted_at DESC);
ALTER TABLE public.ig_stories ENABLE ROW LEVEL SECURITY;
CREATE POLICY ig_stories_read ON public.ig_stories FOR SELECT TO anon, authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.ig_stories FROM anon, authenticated;
GRANT SELECT ON public.ig_stories TO anon, authenticated;

ALTER TABLE public.ig_account
  ADD COLUMN IF NOT EXISTS insights_28d jsonb,      -- quebras por tipo/seguidor + período anterior
  ADD COLUMN IF NOT EXISTS stories_sync_at timestamptz;
ALTER TABLE public.ig_account_daily
  ADD COLUMN IF NOT EXISTS metrics jsonb,           -- métricas do dia (total_value)
  ADD COLUMN IF NOT EXISTS metrics_at timestamptz;
