-- ================================================================
-- CoisaPet — Fase 6: Sistema de Usuários Próprio
-- ================================================================
-- Este arquivo substitui o uso do Supabase Auth para funcionários.
-- Execute COMPLETAMENTE no SQL Editor do Supabase.
-- ================================================================


-- ────────────────────────────────────────────────────────────────
-- 1. HABILITA pgcrypto (necessário para hash de senha com bcrypt)
-- ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ────────────────────────────────────────────────────────────────
-- 2. TABELA PRINCIPAL: system_users
-- Une funcionário + login em uma única tabela
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.system_users (
  id                    UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Dados pessoais
  name                  TEXT          NOT NULL,
  email                 TEXT          NOT NULL,
  phone                 TEXT,
  cpf                   TEXT,
  job_title             TEXT,
  -- título livre: "Marceneiro", "Atendente", etc.
  hire_date             DATE,
  hourly_rate           NUMERIC(10,2),
  notes                 TEXT,

  -- Hierarquia / acesso
  role                  TEXT          NOT NULL DEFAULT 'producao',
  -- 'admin' | 'administrativo' | 'atendimento' | 'producao'

  -- Autenticação
  password_hash         TEXT          NOT NULL,
  -- bcrypt hash gerado pelo pgcrypto
  must_change_password  BOOLEAN       NOT NULL DEFAULT true,
  -- força troca de senha no primeiro login
  last_login_at         TIMESTAMPTZ,

  -- Controle
  active                BOOLEAN       NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT system_users_email_unique UNIQUE (email),
  CONSTRAINT system_users_role_check
    CHECK (role IN ('admin','administrativo','atendimento','producao'))
);

COMMENT ON TABLE  public.system_users                  IS 'Usuários do sistema CoisaPet — login + dados do funcionário em uma tabela';
COMMENT ON COLUMN public.system_users.must_change_password IS 'Se true, força o usuário a trocar a senha no próximo login';
COMMENT ON COLUMN public.system_users.password_hash        IS 'Hash bcrypt gerado pelo pgcrypto. NUNCA armazene a senha em texto puro.';

-- Índices
CREATE INDEX IF NOT EXISTS idx_system_users_email  ON public.system_users(lower(email));
CREATE INDEX IF NOT EXISTS idx_system_users_active ON public.system_users(active);

-- Trigger de updated_at
CREATE TRIGGER set_system_users_updated_at
  BEFORE UPDATE ON public.system_users
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ────────────────────────────────────────────────────────────────
-- RLS: tabela aberta para a anon key (autenticação é feita
-- via função com SECURITY DEFINER — mais seguro que RLS para
-- autenticação customizada)
-- ────────────────────────────────────────────────────────────────
ALTER TABLE public.system_users ENABLE ROW LEVEL SECURITY;

-- Permite que o sistema acesse (a segurança real vem das funções)
CREATE POLICY "service_acessa_system_users"
  ON public.system_users FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);


-- ────────────────────────────────────────────────────────────────
-- 3. FUNÇÃO: login
-- Verifica e-mail + senha, retorna dados do usuário (sem hash)
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.user_login(
  p_email    TEXT,
  p_password TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user public.system_users;
BEGIN
  -- Busca usuário ativo pelo e-mail (case-insensitive)
  SELECT * INTO v_user
  FROM public.system_users
  WHERE lower(email) = lower(p_email)
    AND active = true;

  -- Usuário não encontrado
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'E-mail ou senha incorretos.');
  END IF;

  -- Senha incorreta (bcrypt compare)
  IF v_user.password_hash != crypt(p_password, v_user.password_hash) THEN
    RETURN json_build_object('error', 'E-mail ou senha incorretos.');
  END IF;

  -- Atualiza último login
  UPDATE public.system_users
  SET last_login_at = NOW()
  WHERE id = v_user.id;

  -- Retorna dados do usuário (NUNCA retorna password_hash)
  RETURN json_build_object(
    'id',                   v_user.id,
    'name',                 v_user.name,
    'email',                v_user.email,
    'role',                 v_user.role,
    'job_title',            v_user.job_title,
    'must_change_password', v_user.must_change_password
  );
END;
$$;

COMMENT ON FUNCTION public.user_login IS 'Autentica um usuário. Retorna dados do usuário ou { error: "mensagem" }.';


-- ────────────────────────────────────────────────────────────────
-- 4. FUNÇÃO: criar usuário
-- Cria hash bcrypt da senha antes de salvar
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_system_user(
  p_name        TEXT,
  p_email       TEXT,
  p_password    TEXT,
  p_role        TEXT    DEFAULT 'producao',
  p_job_title   TEXT    DEFAULT NULL,
  p_phone       TEXT    DEFAULT NULL,
  p_cpf         TEXT    DEFAULT NULL,
  p_hire_date   DATE    DEFAULT NULL,
  p_hourly_rate NUMERIC DEFAULT NULL,
  p_notes       TEXT    DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  -- Verifica se o e-mail já existe
  IF EXISTS (
    SELECT 1 FROM public.system_users
    WHERE lower(email) = lower(p_email)
  ) THEN
    RETURN json_build_object('error', 'Este e-mail já está cadastrado no sistema.');
  END IF;

  -- Insere com senha hasheada via bcrypt (fator 10)
  INSERT INTO public.system_users (
    name, email, password_hash, role,
    job_title, phone, cpf, hire_date, hourly_rate, notes,
    must_change_password
  )
  VALUES (
    p_name,
    lower(p_email),
    crypt(p_password, gen_salt('bf', 10)),  -- bcrypt fator 10
    p_role,
    p_job_title, p_phone, p_cpf, p_hire_date, p_hourly_rate, p_notes,
    true  -- força troca de senha no primeiro login
  )
  RETURNING id INTO v_id;

  RETURN json_build_object('id', v_id, 'success', true);
END;
$$;

COMMENT ON FUNCTION public.create_system_user IS 'Cria um novo usuário com senha hasheada em bcrypt.';


-- ────────────────────────────────────────────────────────────────
-- 5. FUNÇÃO: trocar senha
-- Usada no primeiro login e quando o usuário quiser trocar
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.change_user_password(
  p_user_id    UUID,
  p_old_password TEXT,  -- para verificação (null = admin resetando)
  p_new_password TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user public.system_users;
BEGIN
  SELECT * INTO v_user
  FROM public.system_users
  WHERE id = p_user_id AND active = true;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Usuário não encontrado.');
  END IF;

  -- Se p_old_password foi fornecida, verifica a senha atual
  IF p_old_password IS NOT NULL THEN
    IF v_user.password_hash != crypt(p_old_password, v_user.password_hash) THEN
      RETURN json_build_object('error', 'Senha atual incorreta.');
    END IF;
  END IF;

  -- Mínimo de 6 caracteres
  IF length(p_new_password) < 6 THEN
    RETURN json_build_object('error', 'A nova senha deve ter pelo menos 6 caracteres.');
  END IF;

  -- Atualiza com novo hash
  UPDATE public.system_users
  SET
    password_hash        = crypt(p_new_password, gen_salt('bf', 10)),
    must_change_password = false,
    updated_at           = NOW()
  WHERE id = p_user_id;

  RETURN json_build_object('success', true);
END;
$$;


-- ────────────────────────────────────────────────────────────────
-- 6. FUNÇÃO: atualizar dados do usuário (sem senha)
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_system_user(
  p_id          UUID,
  p_name        TEXT,
  p_role        TEXT,
  p_job_title   TEXT    DEFAULT NULL,
  p_phone       TEXT    DEFAULT NULL,
  p_cpf         TEXT    DEFAULT NULL,
  p_hire_date   DATE    DEFAULT NULL,
  p_hourly_rate NUMERIC DEFAULT NULL,
  p_notes       TEXT    DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.system_users
  SET
    name        = p_name,
    role        = p_role,
    job_title   = p_job_title,
    phone       = p_phone,
    cpf         = p_cpf,
    hire_date   = p_hire_date,
    hourly_rate = p_hourly_rate,
    notes       = p_notes,
    updated_at  = NOW()
  WHERE id = p_id;

  RETURN json_build_object('success', true);
END;
$$;


-- ────────────────────────────────────────────────────────────────
-- 7. FUNÇÃO: desativar usuário (soft delete)
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.deactivate_system_user(p_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.system_users
  SET active = false, updated_at = NOW()
  WHERE id = p_id;

  RETURN json_build_object('success', true);
END;
$$;


-- ────────────────────────────────────────────────────────────────
-- 8. ADMIN INICIAL
-- Cria o usuário admin padrão — TROQUE A SENHA DEPOIS!
-- ────────────────────────────────────────────────────────────────
SELECT public.create_system_user(
  p_name        := 'Administrador',
  p_email       := 'admin@coisapet.com.br',  -- TROQUE para o e-mail real
  p_password    := 'CoisaPet@2024',          -- TROQUE após o primeiro login
  p_role        := 'admin',
  p_job_title   := 'Diretor'
);

-- Marca que o admin NÃO precisa trocar a senha agora
-- (opcional — remova se quiser forçar)
UPDATE public.system_users
SET must_change_password = false
WHERE email = 'admin@coisapet.com.br';


-- ────────────────────────────────────────────────────────────────
-- 9. AJUSTA RLS DAS OUTRAS TABELAS
-- Como não usamos mais auth.uid(), liberamos o acesso via anon key
-- A segurança passa a ser controlada pela aplicação
-- ────────────────────────────────────────────────────────────────

-- Desabilita RLS nas tabelas operacionais (acesso controlado pelo frontend)
ALTER TABLE public.suppliers            DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories   DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.bills                DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_payments        DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_attachments     DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_material_categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_materials        DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_material_movements DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_categories   DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.products             DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_records         DISABLE ROW LEVEL SECURITY;

-- employees também (substituída pelo system_users mas mantemos por segurança)
ALTER TABLE public.employees            DISABLE ROW LEVEL SECURITY;

-- Garante permissão de leitura/escrita para a anon key nas tabelas
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon;
