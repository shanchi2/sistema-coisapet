-- ================================================================
-- CoisaPet — Fase 5: Troca de senha obrigatória no primeiro login
-- ================================================================
-- Execute no SQL Editor do Supabase
-- ================================================================

-- Adiciona coluna que força troca de senha no primeiro acesso
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.force_password_change IS
  'Se true, o sistema redireciona para tela de troca de senha no próximo login';
