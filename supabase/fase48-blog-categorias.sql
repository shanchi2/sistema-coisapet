-- ================================================================
-- CoisaPet — Fase 48: Categorias do Blog
-- ================================================================
-- Execute no SQL Editor do Supabase.
--
-- Contexto (ver coisapet.md): posts precisam ser filtráveis por
-- categoria (ex: "Cuidados", "Terrários", "Receitas") — diferente de
-- `blog_posts.tags` (livre, múltiplo, sem gestão central). Mesmo
-- padrão já usado em `product_categories` (id/nome/cor), pra manter
-- consistência com o resto do sistema.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.blog_categories (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT        NOT NULL,
  color      TEXT        NOT NULL DEFAULT '#6366F1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.blog_categories IS 'Categorias do Blog (1 por post) — pra filtrar a listagem. Diferente de blog_posts.tags (livre, múltiplas, sem gestão central).';

CREATE TRIGGER set_blog_categories_updated_at
  BEFORE UPDATE ON public.blog_categories
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.blog_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_blog_posts_category ON public.blog_posts(category_id);

-- RLS — mesmo padrão de toda tabela nova nesse app: o login é 100%
-- custom via RPC (nunca sessão real do Supabase Auth), então toda
-- chamada sai como `anon` de verdade. Policy explícita `TO anon`.
ALTER TABLE public.blog_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_acessa_blog_categories"
  ON public.blog_categories FOR ALL
  TO anon USING (true) WITH CHECK (true);
