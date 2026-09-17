-- ================================================================
-- CoisaPet — Fase 58: Exemplos do guia viram referência por check (1-9)
-- ================================================================
-- Execute no SQL Editor do Supabase (ou supabase db query --linked --file).
--
-- Contexto (ver coisapet.md): a galeria geral da fase 57 virou um mini
-- carrossel por check (Raphael separou as imagens dos 5 guias prontos —
-- Kit, Substrato, Banheirinha, Rodinha, Terrário — uma por check, até 5
-- por slot) que aparece ao lado do box de upload daquele check
-- específico, não mais um modal solto.
-- ================================================================

ALTER TABLE public.media_guide_examples
  ADD COLUMN IF NOT EXISTS check_slot SMALLINT CHECK (check_slot BETWEEN 1 AND 9);

CREATE INDEX IF NOT EXISTS media_guide_examples_check_slot_idx
  ON public.media_guide_examples (check_slot);

COMMENT ON COLUMN public.media_guide_examples.check_slot IS 'A qual dos 9 checks do guia essa imagem de referência pertence (1-9). Várias imagens por slot (até 5, uma por exemplo de produto) — navega em carrossel na tela.';
