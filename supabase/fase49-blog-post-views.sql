-- ================================================================
-- CoisaPet — Fase 49: Analytics do Blog (visualizações por post)
-- ================================================================
-- Execute no SQL Editor do Supabase.
--
-- Contexto (ver coisapet.md): já existe `product_clicks` (tela
-- "Cliques no Site" / "Analytics do Site") rastreando clique nos
-- botões de venda (Shopee/ML/WhatsApp/Clô). Pedido do Raphael (09/09):
-- estender esse controle pro Blog — saber quantas vezes cada post foi
-- visto, mesmo já tendo o Google Search Console (controle PRÓPRIO,
-- dentro do sistema, não depende do Google).
--
-- Tabela enxuta de propósito — só o essencial pra contar visualização
-- e saber de onde veio o visitante. NÃO guarda o título do post aqui
-- (isso já existe em blog_posts, ligado por slug) — evita duplicar e
-- ficar desatualizado se o post for renomeado.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.blog_post_views (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug       TEXT        NOT NULL,
  referrer   TEXT,
  viewed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.blog_post_views IS 'Visualização de página do Blog (1 linha por pageview) — registrada pelo site público (coisapet-site, PHP) via insert direto na API REST do Supabase. Ligada a blog_posts por slug (sem FK de propósito: o post pode já ter sido apagado/renomeado, e o histórico de views não deve sumir junto).';

CREATE INDEX IF NOT EXISTS idx_blog_post_views_slug      ON public.blog_post_views(slug);
CREATE INDEX IF NOT EXISTS idx_blog_post_views_viewed_at ON public.blog_post_views(viewed_at);

-- RLS — mesmo padrão de toda tabela nova nesse app (o site público
-- insere com a chave anon, igual toda leitura/escrita do resto do
-- sistema). Só INSERT e SELECT fazem sentido aqui (nunca UPDATE/DELETE
-- de fora — é log de evento, não cadastro).
ALTER TABLE public.blog_post_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_insere_blog_post_views"
  ON public.blog_post_views FOR INSERT
  TO anon WITH CHECK (true);

CREATE POLICY "anon_le_blog_post_views"
  ON public.blog_post_views FOR SELECT
  TO anon USING (true);
