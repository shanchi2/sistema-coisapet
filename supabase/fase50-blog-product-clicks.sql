-- ================================================================
-- CoisaPet — Fase 50: Cliques em produto a partir do Blog
-- ================================================================
-- Execute no SQL Editor do Supabase.
--
-- Contexto (ver coisapet.md): já temos `blog_post_views` (quantas vezes
-- um post foi visto). Pedido do Raphael (09/09): também saber quando o
-- LEITOR clica num hyperlink de produto dentro do texto — fecha o funil
-- "post → interesse em produto", coisa que nem o Google Search Console
-- mostra (GSC não sabe o que acontece DEPOIS do clique no Google).
--
-- Registrado no CLIQUE do link (dentro da página do post, antes da
-- navegação) — não no acesso da página de produto — porque só assim dá
-- pra saber DE QUAL POST o interesse veio.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.blog_product_clicks (
  id           UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_slug    TEXT        NOT NULL,
  product_slug TEXT        NOT NULL,
  link_text    TEXT,
  clicked_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.blog_product_clicks IS 'Clique num hyperlink de produto dentro de um post do Blog — liga post_slug (blog_posts.slug) a product_slug (products.slug), sem FK de propósito (mesmo motivo de blog_post_views: post/produto pode já ter sido apagado/renomeado e o histórico não deve sumir). link_text guarda o trecho de texto que virou link, útil pra saber qual palavra converteu mais.';

CREATE INDEX IF NOT EXISTS idx_blog_product_clicks_post    ON public.blog_product_clicks(post_slug);
CREATE INDEX IF NOT EXISTS idx_blog_product_clicks_product ON public.blog_product_clicks(product_slug);
CREATE INDEX IF NOT EXISTS idx_blog_product_clicks_at      ON public.blog_product_clicks(clicked_at);

ALTER TABLE public.blog_product_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_insere_blog_product_clicks"
  ON public.blog_product_clicks FOR INSERT
  TO anon WITH CHECK (true);

CREATE POLICY "anon_le_blog_product_clicks"
  ON public.blog_product_clicks FOR SELECT
  TO anon USING (true);
