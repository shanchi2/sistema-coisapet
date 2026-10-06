-- ================================================================
-- Fase 96 (06/10/2026) — Cliques (e exibições) dos BANNERS do Blog
-- ================================================================
-- Pedido do Raphael: saber quando o leitor clica no banner de produto do
-- post (que leva direto pra Shopee/ML), em QUAL post, QUAL produto e pra
-- QUAL plataforma.
--
-- Reaproveita `blog_banner_events` (fase68). Desde o banner por post
-- (fase90) o `coisapet-site` monta o banner sozinho e não chama mais a
-- function blog-banner — por isso as exibições pararam em 21/09 e
-- clique nunca foi gravado. Agora o próprio site grava os 2 eventos
-- (impression ao mostrar, click no clique) via REST com a chave anon.
--
-- Também liga RLS: antes a tabela estava sem RLS e com GRANT ALL pro
-- anon (qualquer um podia apagar/editar). Agora anon só insere e lê.
-- ================================================================

ALTER TABLE public.blog_banner_events ADD COLUMN IF NOT EXISTS coupon_shown BOOLEAN;
ALTER TABLE public.blog_banner_events ADD COLUMN IF NOT EXISTS href TEXT;
CREATE INDEX IF NOT EXISTS idx_blog_banner_events_post ON public.blog_banner_events(post_slug);

ALTER TABLE public.blog_banner_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_insere_blog_banner_events" ON public.blog_banner_events;
CREATE POLICY "anon_insere_blog_banner_events" ON public.blog_banner_events
  FOR INSERT TO anon, authenticated WITH CHECK (event_type IN ('impression', 'click'));
DROP POLICY IF EXISTS "anon_le_blog_banner_events" ON public.blog_banner_events;
CREATE POLICY "anon_le_blog_banner_events" ON public.blog_banner_events
  FOR SELECT TO anon, authenticated USING (true);

-- Tabela criada e descartada no mesmo dia (vazia) — ficou só blog_banner_events.
DROP TABLE IF EXISTS public.blog_banner_clicks;
