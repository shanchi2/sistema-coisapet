-- Segurança do login (13/10). O sistema usa login próprio (system_users +
-- user_login) com a chave pública (anon) — o banco não sabia QUEM chamava
-- cada função. Isso deixava abertos:
--   • change_user_password com senha antiga vazia → qualquer um trocava a
--     senha de qualquer usuário (inclusive diretor)
--   • create_system_user → qualquer um criava uma conta de diretor
--   • password_hash legível e gravável direto pela API
-- Correção (fase 1):
--   1. user_login passa a emitir um TOKEN de sessão (aleatório, 32 bytes);
--      no banco fica só o hash sha256 em `user_sessions` (revogável).
--   2. Reset de senha de outra pessoa, criar e desativar usuário exigem o
--      token de alguém com acesso ao módulo "usuarios" (admin sempre).
--      Trocar a PRÓPRIA senha exige o token da própria pessoa.
--   3. password_hash some da API (sem SELECT/INSERT/UPDATE pra anon).
--      ATENÇÃO: os privilégios de system_users agora são por coluna — coluna
--      NOVA precisa de GRANT explícito (ver bloco no fim).
-- Fica pra fase 2: alterar `role`/`active` direto pela API ainda é possível
-- (precisa mover as edições de cadastro pra funções com token).

-- ── 1. Sessões ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_sessions (
  token_hash   text PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES public.system_users(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at   timestamptz
);
CREATE INDEX IF NOT EXISTS user_sessions_user_idx ON public.user_sessions (user_id);
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;  -- sem policy: só funções SECURITY DEFINER
REVOKE ALL ON public.user_sessions FROM anon, authenticated;

-- Quem é o dono do token (null se inválido, revogado, de usuário inativo
-- ou com mais de 180 dias)
CREATE OR REPLACE FUNCTION public.session_user_id(p_token text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
DECLARE v_id uuid;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN RETURN NULL; END IF;
  SELECT s.user_id INTO v_id
  FROM public.user_sessions s JOIN public.system_users u ON u.id = s.user_id
  WHERE s.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    AND s.revoked_at IS NULL AND s.created_at > now() - interval '180 days' AND u.active;
  IF v_id IS NOT NULL THEN
    UPDATE public.user_sessions SET last_seen_at = now()
    WHERE token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') AND last_seen_at < now() - interval '1 hour';
  END IF;
  RETURN v_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.session_user_id(text) FROM anon, authenticated, public;

-- Pode gerenciar usuários? (admin, ou cargo com o módulo "usuarios" ligado)
CREATE OR REPLACE FUNCTION public.session_can_manage_users(p_token text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_role text;
BEGIN
  SELECT u.role INTO v_role FROM public.system_users u WHERE u.id = public.session_user_id(p_token);
  IF v_role IS NULL THEN RETURN false; END IF;
  RETURN v_role = 'admin' OR EXISTS (SELECT 1 FROM public.role_permissions rp WHERE rp.role = v_role AND rp.module = 'usuarios' AND rp.enabled);
END $$;
REVOKE EXECUTE ON FUNCTION public.session_can_manage_users(text) FROM anon, authenticated, public;

-- Sair: revoga o token desse aparelho
CREATE OR REPLACE FUNCTION public.logout_session(p_token text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
  UPDATE public.user_sessions SET revoked_at = now()
  WHERE token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') AND revoked_at IS NULL;
$$;

-- ── 2. Login devolve o token ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.user_login(p_email text, p_password text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
DECLARE
  v_id uuid; v_name text; v_email text; v_role text; v_job_title text;
  v_must_change boolean; v_password_hash text; v_active boolean; v_token text;
BEGIN
  SELECT id, name, email, role, job_title, must_change_password, password_hash, active
  INTO v_id, v_name, v_email, v_role, v_job_title, v_must_change, v_password_hash, v_active
  FROM public.system_users WHERE lower(email) = lower(p_email);

  IF NOT FOUND OR v_active = false THEN
    RETURN json_build_object('error', 'E-mail ou senha incorretos.');
  END IF;
  -- 'NO_ACCESS' (cadastro sem acesso) não é um hash válido
  IF v_password_hash IS NULL OR v_password_hash NOT LIKE '$2%' OR v_password_hash != extensions.crypt(p_password, v_password_hash) THEN
    RETURN json_build_object('error', 'E-mail ou senha incorretos.');
  END IF;

  UPDATE public.system_users SET last_login_at = now() WHERE id = v_id;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO public.user_sessions (token_hash, user_id) VALUES (encode(extensions.digest(v_token, 'sha256'), 'hex'), v_id);

  RETURN json_build_object(
    'id', v_id, 'name', v_name, 'email', v_email, 'role', v_role,
    'job_title', v_job_title, 'must_change_password', v_must_change,
    'token', v_token
  );
END $$;

-- ── 3. Troca/reset de senha ──────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.change_user_password(uuid, text, text);
CREATE OR REPLACE FUNCTION public.change_user_password(p_user_id uuid, p_old_password text, p_new_password text, p_token text DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
DECLARE v_hash text; v_active boolean; v_caller uuid;
BEGIN
  SELECT password_hash, active INTO v_hash, v_active FROM public.system_users WHERE id = p_user_id;
  IF NOT FOUND OR v_active = false THEN
    RETURN json_build_object('error', 'Usuário não encontrado.');
  END IF;

  IF p_old_password IS NOT NULL THEN
    -- Quem sabe a senha atual pode trocar
    IF v_hash IS NULL OR v_hash NOT LIKE '$2%' OR v_hash != extensions.crypt(p_old_password, v_hash) THEN
      RETURN json_build_object('error', 'Senha atual incorreta.');
    END IF;
  ELSE
    -- Sem a senha atual: só a própria pessoa logada ou quem gerencia usuários
    v_caller := public.session_user_id(p_token);
    IF v_caller IS NULL THEN
      RETURN json_build_object('error', 'Sua sessão é antiga ou expirou — saia e entre de novo no sistema pra continuar.');
    END IF;
    IF v_caller <> p_user_id AND NOT public.session_can_manage_users(p_token) THEN
      RETURN json_build_object('error', 'Você não tem permissão pra trocar a senha de outra pessoa.');
    END IF;
  END IF;

  IF length(p_new_password) < 6 THEN
    RETURN json_build_object('error', 'A nova senha deve ter pelo menos 6 caracteres.');
  END IF;

  UPDATE public.system_users
  SET password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf')), must_change_password = false, updated_at = now()
  WHERE id = p_user_id;
  RETURN json_build_object('success', true);
END $$;

-- ── 4. Criar / desativar usuário ─────────────────────────────────────────
DROP FUNCTION IF EXISTS public.create_system_user(text, text, text, text, text, text, text, date, numeric, text);
CREATE OR REPLACE FUNCTION public.create_system_user(p_name text, p_email text, p_password text, p_role text,
  p_job_title text DEFAULT NULL, p_phone text DEFAULT NULL, p_cpf text DEFAULT NULL, p_hire_date date DEFAULT NULL,
  p_hourly_rate numeric DEFAULT NULL, p_notes text DEFAULT NULL, p_token text DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.session_can_manage_users(p_token) THEN
    RETURN json_build_object('error', 'Sem permissão pra cadastrar usuários (se você tem acesso, saia e entre de novo no sistema).');
  END IF;
  IF EXISTS (SELECT 1 FROM public.system_users WHERE lower(email) = lower(p_email) AND active = true) THEN
    RETURN json_build_object('error', 'Este e-mail já está cadastrado no sistema.');
  END IF;
  INSERT INTO public.system_users (name, email, password_hash, role, job_title, phone, cpf, hire_date, notes, must_change_password)
  VALUES (p_name, lower(p_email), extensions.crypt(p_password, extensions.gen_salt('bf')), p_role, p_job_title, p_phone, p_cpf, p_hire_date, p_notes, true)
  RETURNING id INTO v_id;
  RETURN json_build_object('id', v_id, 'success', true);
END $$;

DROP FUNCTION IF EXISTS public.deactivate_system_user(uuid);
CREATE OR REPLACE FUNCTION public.deactivate_system_user(p_id uuid, p_token text DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.session_can_manage_users(p_token) THEN
    RETURN json_build_object('error', 'Sem permissão pra remover usuários (se você tem acesso, saia e entre de novo no sistema).');
  END IF;
  UPDATE public.system_users SET active = false, updated_at = now() WHERE id = p_id;
  UPDATE public.user_sessions SET revoked_at = now() WHERE user_id = p_id AND revoked_at IS NULL;
  RETURN json_build_object('success', true);
END $$;

-- ── 5. password_hash fora da API ─────────────────────────────────────────
ALTER TABLE public.system_users ALTER COLUMN password_hash SET DEFAULT 'NO_ACCESS';
DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'system_users' AND column_name <> 'password_hash';
  EXECUTE 'REVOKE SELECT, INSERT, UPDATE ON public.system_users FROM anon, authenticated';
  EXECUTE format('GRANT SELECT (%1$s), INSERT (%1$s), UPDATE (%1$s) ON public.system_users TO anon, authenticated', cols);
END $$;
-- Coluna nova em system_users? Rode:
--   GRANT SELECT (nova_coluna), INSERT (nova_coluna), UPDATE (nova_coluna) ON public.system_users TO anon, authenticated;
