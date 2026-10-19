-- Parcerias com influencers (20/10). A Meta só entrega métricas de post
-- collab pra QUEM publicou (a influencer) e, na conexão "login do Instagram",
-- não existe business_discovery nem collaborative_media (testado na API).
-- Então: cadastro das influencers + cada post (link, data, formato) com os
-- números que ela manda (prints) — e as marcações de foto da @coisapet
-- (GET /<IG_ID>/tags, isso a API entrega) entram sozinhas em ig_tagged_media.
CREATE TABLE IF NOT EXISTS public.ig_influencers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE, name text, contact text, city text, coupon text, notes text,
  active boolean NOT NULL DEFAULT true,
  created_by text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.ig_influencer_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id uuid REFERENCES public.ig_influencers(id) ON DELETE CASCADE,
  permalink text, posted_at timestamptz NOT NULL,
  format text NOT NULL DEFAULT 'REELS' CHECK (format IN ('REELS','CAROUSEL','IMAGE','STORIES')),
  kind text NOT NULL DEFAULT 'collab' CHECK (kind IN ('collab','marcacao','mencao','stories')),
  reach int, views int, likes int, comments int, shares int, saves int, link_clicks int, coupon_uses int,
  prints jsonb NOT NULL DEFAULT '[]', tagged_media_id text, notes text,
  created_by text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS ig_influencer_posts_inf_idx ON public.ig_influencer_posts (influencer_id, posted_at DESC);
CREATE TABLE IF NOT EXISTS public.ig_tagged_media (
  id text PRIMARY KEY, username text, caption text, media_type text, media_product_type text,
  media_url text, permalink text, posted_at timestamptz, like_count int, comments_count int,
  updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.ig_influencers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ig_influencer_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ig_tagged_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY ig_influencers_all ON public.ig_influencers FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY ig_influencer_posts_all ON public.ig_influencer_posts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY ig_tagged_media_read ON public.ig_tagged_media FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ig_influencers, public.ig_influencer_posts TO anon, authenticated;
GRANT SELECT ON public.ig_tagged_media TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.ig_tagged_media FROM anon, authenticated;
