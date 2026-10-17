-- MinhaCoisaPet: login + save na nuvem (17/10). Fica no MESMO projeto do
-- sistema (pedido do Raphael: não pagar outro projeto), mas isolado:
--   * tabelas game_* com RLS ligado e SEM policy + REVOKE de anon/authenticated
--     → a chave pública (anon) não lê nem grava nada aqui;
--   * só a Edge Function `game-api` (service role) mexe nelas;
--   * o jogo NÃO usa o Supabase Auth (nenhum jogador vira "authenticated" no
--     banco do sistema) — login próprio por código de 6 dígitos no e-mail
--     (Resend, mesmo remetente noreply@coisapet.com.br do sistema) e sessão
--     por token aleatório, guardando só o hash (mesmo esquema dos códigos da TV).
-- Dado pessoal guardado: só o e-mail (LGPD: botão "apagar minha conta").
CREATE TABLE IF NOT EXISTS public.game_players (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  age_ok        boolean NOT NULL DEFAULT false,   -- "tenho 12+ ou um responsável está junto"
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz
);

CREATE TABLE IF NOT EXISTS public.game_login_codes (
  id          bigserial PRIMARY KEY,
  email       text NOT NULL,
  code_hash   text NOT NULL,
  expires_at  timestamptz NOT NULL,
  attempts    int NOT NULL DEFAULT 0,
  used_at     timestamptz,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS game_login_codes_email_idx ON public.game_login_codes (email, created_at DESC);
CREATE INDEX IF NOT EXISTS game_login_codes_ip_idx ON public.game_login_codes (ip, created_at DESC);

CREATE TABLE IF NOT EXISTS public.game_sessions (
  id            bigserial PRIMARY KEY,
  player_id     uuid NOT NULL REFERENCES public.game_players(id) ON DELETE CASCADE,
  token_hash    text NOT NULL UNIQUE,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz
);

CREATE TABLE IF NOT EXISTS public.game_saves (
  player_id   uuid PRIMARY KEY REFERENCES public.game_players(id) ON DELETE CASCADE,
  pet         jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.game_players     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_login_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_sessions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_saves       ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.game_players, public.game_login_codes, public.game_sessions, public.game_saves FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.game_login_codes_id_seq, public.game_sessions_id_seq FROM anon, authenticated;
