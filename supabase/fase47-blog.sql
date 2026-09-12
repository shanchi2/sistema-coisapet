-- ================================================================
-- CoisaPet — Fase 47: Blog (CMS interno, substituindo o WordPress)
-- ================================================================
-- Execute no SQL Editor do Supabase.
--
-- Contexto (ver coisapet.md): o WordPress do blog está degradando. A
-- ideia é ter uma área "Blog" dentro do próprio sistema pra gerar e
-- gerenciar os posts — com geração de conteúdo por IA (ChatGPT/OpenAI,
-- mesmo padrão já usado em ml-insights), um painel de SEO tipo Yoast, e
-- sugestão de hyperlinks pra produtos próprios dentro do texto.
--
-- Importante (decisão do Raphael, 09/09): por enquanto o sistema só
-- MANTÉM o conteúdo (esta tabela). Quem exibe pro público é o site
-- principal (coisapet-site, projeto PHP à parte) — ele vai ler esses
-- posts publicados de algum jeito (API própria ou direto no Supabase),
-- isso ainda não foi decidido/implementado. Aqui é só o CMS.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.blog_posts (
  id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,

  title         TEXT        NOT NULL,
  slug          TEXT        NOT NULL UNIQUE,
  excerpt       TEXT,
  content_html  TEXT        NOT NULL DEFAULT '',
  cover_image_url TEXT,

  -- SEO
  focus_keyword   TEXT,
  meta_title      TEXT,
  meta_description TEXT,
  tags            TEXT[]    NOT NULL DEFAULT '{}',

  -- Insumos usados na geração por IA (fica guardado pra poder gerar de
  -- novo ou entender depois "o que foi pedido pra IA" nesse post)
  ai_context        TEXT,
  ai_target_words   INTEGER,
  ai_generated      BOOLEAN   NOT NULL DEFAULT false,

  status        TEXT        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','trash')),
  published_at  TIMESTAMPTZ,

  author_id     UUID,
  author_name   TEXT,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.blog_posts IS 'Posts do Blog interno (substitui o WordPress) — conteúdo, SEO e metadados de geração por IA. Publicação pro público é feita pelo site principal, lendo esta tabela.';

CREATE INDEX IF NOT EXISTS idx_blog_posts_status       ON public.blog_posts(status);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published_at ON public.blog_posts(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug         ON public.blog_posts(slug);

CREATE TRIGGER set_blog_posts_updated_at
  BEFORE UPDATE ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- RLS — mesmo padrão descoberto na Fase 46 (Chapas): o app nunca
-- estabelece sessão real do Supabase Auth (login 100% custom via RPC),
-- então toda chamada sai como `anon` de verdade. Policy explícita
-- `TO anon`, nunca `TO authenticated` (ver coisapet_rls_anon_only_auth
-- na memória do Claude).
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_acessa_blog_posts"
  ON public.blog_posts FOR ALL
  TO anon USING (true) WITH CHECK (true);

-- Bucket público pra imagem de capa dos posts (precisa ser público,
-- diferente de bucket como 'drive' — o site principal vai exibir essa
-- imagem direto pro público, não só o sistema interno).
INSERT INTO storage.buckets (id, name, public)
VALUES ('blog-covers', 'blog-covers', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "blog_covers_select" ON storage.objects FOR SELECT
  TO anon, authenticated USING (bucket_id = 'blog-covers');
CREATE POLICY "blog_covers_insert" ON storage.objects FOR INSERT
  TO anon, authenticated WITH CHECK (bucket_id = 'blog-covers');
CREATE POLICY "blog_covers_update" ON storage.objects FOR UPDATE
  TO anon, authenticated USING (bucket_id = 'blog-covers');
CREATE POLICY "blog_covers_delete" ON storage.objects FOR DELETE
  TO anon, authenticated USING (bucket_id = 'blog-covers');
