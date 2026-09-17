-- ================================================================
-- CoisaPet — Fase 59: Priorização de produtos na Atualização de Mídia
-- ================================================================
-- Execute no SQL Editor do Supabase (ou supabase db query --linked --file).
--
-- Contexto (ver coisapet.md): pedido do Raphael — separar na lista os
-- produtos já marcados como prioridade (a Isa foca numa média de 3 a 5
-- por semana) dos demais, pra não depender de "lembrar" qual já foi
-- combinado.
-- ================================================================

ALTER TABLE public.product_media_status
  ADD COLUMN IF NOT EXISTS is_priority     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS prioritized_at  TIMESTAMPTZ;

COMMENT ON COLUMN public.product_media_status.is_priority IS 'Produto marcado pra Isa focar essa semana (meta informal: 3-5 por vez).';
COMMENT ON COLUMN public.product_media_status.prioritized_at IS 'Quando foi marcado como prioridade — usado pra ordenar a lista (mais recente primeiro).';
