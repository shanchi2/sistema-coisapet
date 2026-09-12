-- ================================================================
-- CoisaPet — Fase 53: Favoritos do menu lateral (por usuário)
-- ================================================================
-- Execute no SQL Editor do Supabase.
--
-- Contexto (ver coisapet.md): o grupo "Principal" do sidebar virou
-- "Favoritos" — só fica o Dashboard fixo + os módulos que cada usuário
-- marcar com a bandeirinha (igual o Mercado Livre faz no painel deles).
-- Fica salvo por usuário (não por navegador) pra acompanhar a pessoa
-- entre os PCs de casa/escritório/notebook.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.user_sidebar_favorites (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES public.system_users(id) ON DELETE CASCADE,
  nav_to     TEXT        NOT NULL, -- rota do item favoritado (ex: '/financeiro')
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, nav_to)
);

COMMENT ON TABLE public.user_sidebar_favorites IS 'Módulos que o usuário marcou como favorito no sidebar (bandeirinha) — aparecem fixados no grupo "Favoritos", além do lugar original.';

CREATE INDEX IF NOT EXISTS idx_user_sidebar_favorites_user_id ON public.user_sidebar_favorites(user_id);

-- RLS — mesmo padrão de toda tabela nova nesse app: login é 100%
-- custom (RPC user_login), nunca sessão real do Supabase Auth, então
-- toda chamada sai como role `anon`. Sem enforcement por linha aqui
-- (não tem como, com auth custom) — o filtro por usuário é feito no
-- app (WHERE user_id = ...), igual o resto do sistema.
ALTER TABLE public.user_sidebar_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_acesso_total_user_sidebar_favorites"
  ON public.user_sidebar_favorites FOR ALL
  TO anon USING (true) WITH CHECK (true);
