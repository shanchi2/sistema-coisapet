-- ================================================================
-- CoisaPet — Fase 68: controle dos banners promocionais do blog
-- ================================================================
-- Execute no SQL Editor do Supabase.
--
-- Contexto (ver coisapet.md): a function `blog-banner` (fase anterior)
-- já sorteia produto+texto+link pra encaixar no meio dos posts, mas
-- tudo fixo no código (cupom, desconto, quais categorias entram). O
-- Raphael pediu uma tela de controle de verdade no painel de
-- Diretoria — liga/desliga, cupom, desconto, categorias, e
-- estatística de quantas vezes cada banner foi mostrado/clicado.
-- ================================================================

-- ── 1. Configuração (1 linha só) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.blog_banner_settings (
  id                TEXT PRIMARY KEY DEFAULT 'default',
  active            BOOLEAN NOT NULL DEFAULT true,
  coupon_code       TEXT NOT NULL DEFAULT 'CoisaPetBlog5',
  discount_label    TEXT NOT NULL DEFAULT '5%',
  category_ids      UUID[] NOT NULL DEFAULT '{}',
  include_rodinhas  BOOLEAN NOT NULL DEFAULT true,
  show_on_ml        BOOLEAN NOT NULL DEFAULT true,
  show_on_shopee    BOOLEAN NOT NULL DEFAULT true,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by        UUID REFERENCES public.system_users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.blog_banner_settings IS 'Configuração dos banners promocionais do blog (fase68) — 1 linha só (id=''default''). category_ids vazio = usa o padrão (Terrário + Substratos) na function.';

-- Preenche a linha única já com Terrário + Substratos como padrão
-- (mesmo escopo pedido originalmente: terrário, substrato, rodinha).
INSERT INTO public.blog_banner_settings (id, category_ids)
SELECT 'default', ARRAY(SELECT id FROM public.product_categories WHERE name IN ('Terrário', 'Substratos'))
ON CONFLICT (id) DO NOTHING;

GRANT ALL ON public.blog_banner_settings TO anon;

-- ── 2. Eventos (impressão/clique) — pra estatística ─────────────────
CREATE TABLE IF NOT EXISTS public.blog_banner_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type    TEXT NOT NULL CHECK (event_type IN ('impression', 'click')),
  product_id    UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name  TEXT, -- snapshot do nome na hora — sobrevive se o produto for removido depois
  platform      TEXT,
  post_slug     TEXT, -- opcional: de qual post veio, se o site público mandar
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.blog_banner_events IS 'Log de banner mostrado (impression, gravado pela própria function blog-banner) e clicado (click, precisa do site público chamar de volta — ainda não implementado do lado deles, fase68).';

CREATE INDEX IF NOT EXISTS idx_blog_banner_events_created ON public.blog_banner_events(created_at);
CREATE INDEX IF NOT EXISTS idx_blog_banner_events_type    ON public.blog_banner_events(event_type);

GRANT ALL ON public.blog_banner_events TO anon;
