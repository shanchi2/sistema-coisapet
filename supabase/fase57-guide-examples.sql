-- ================================================================
-- CoisaPet — Fase 57: Galeria de exemplos visuais do guia de imagens
-- ================================================================
-- Execute no SQL Editor do Supabase (ou supabase db query --linked --file).
--
-- Contexto (ver coisapet.md): o Raphael quer anexar exemplos visuais
-- (guias prontos gerados por IA pra Kit 3 Acessórios, Substrato Aspen,
-- Banheirinha de Terra, Rodinha Silenciosa, Terrário etc) direto no
-- módulo de Atualização de Mídia, pra Isa consultar como referência
-- visual além do texto do guia. Reaproveita o bucket `product-photos`
-- (path `guide-examples/`), só a tabela é nova.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.media_guide_examples (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  image_url   TEXT        NOT NULL,
  title       TEXT,
  sort_order  INT         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.media_guide_examples IS 'Galeria de exemplos visuais (guias prontos) anexados como referência pro time seguir ao fotografar produtos — não é por produto, é referência geral do padrão.';

ALTER TABLE public.media_guide_examples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_acessa_media_guide_examples"
  ON public.media_guide_examples FOR ALL
  TO anon USING (true) WITH CHECK (true);
