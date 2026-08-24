-- ================================================================
-- CoisaPet — Setup inicial do banco de dados no Supabase
-- ================================================================
-- Como usar:
--   1. Acesse seu projeto no Supabase
--   2. Vá em SQL Editor → New Query
--   3. Cole todo o conteúdo deste arquivo e clique em Run
-- ================================================================


-- ────────────────────────────────────────────────────────────────
-- TABELA: profiles
-- Estende o auth.users do Supabase com dados extras do usuário
-- ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID        NOT NULL PRIMARY KEY
                          REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL DEFAULT 'Novo Usuário',
  role        TEXT        NOT NULL DEFAULT 'operador',
  avatar_url  TEXT,
  active      BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Garante que o role seja um dos valores permitidos
  CONSTRAINT profiles_role_check
    CHECK (role IN ('admin', 'operador', 'financeiro'))
);

-- Documentação das colunas
COMMENT ON TABLE  public.profiles       IS 'Perfis dos usuários do sistema CoisaPet';
COMMENT ON COLUMN public.profiles.role  IS 'admin = acesso total | operador = produção | financeiro = módulo financeiro';


-- ────────────────────────────────────────────────────────────────
-- FUNÇÃO + TRIGGER: cria profile automaticamente ao cadastrar user
-- Quando o Supabase Auth cria um usuário em auth.users,
-- este trigger insere automaticamente um registro em profiles.
-- O nome vem de raw_user_meta_data (passado no signUp).
-- ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', 'Novo Usuário'),
    'operador'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Remove trigger anterior se existir, depois recria
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- ────────────────────────────────────────────────────────────────
-- FUNÇÃO + TRIGGER: atualiza updated_at automaticamente
-- ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();


-- ────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY (RLS)
-- Garante que cada usuário só acesse o que tem permissão.
-- IMPORTANTE: o Supabase exige que o RLS esteja ativo para
-- que as policies funcionem.
-- ────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Usuário lê o próprio perfil
CREATE POLICY "usuario_le_proprio_perfil"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Usuário atualiza o próprio perfil
CREATE POLICY "usuario_atualiza_proprio_perfil"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Admin lê todos os perfis
CREATE POLICY "admin_le_todos_perfis"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
    )
  );

-- Admin atualiza qualquer perfil
CREATE POLICY "admin_atualiza_qualquer_perfil"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
    )
  );


-- ────────────────────────────────────────────────────────────────
-- PROMOVER USUÁRIO PARA ADMIN
-- Depois de criar seu primeiro usuário em:
--   Supabase → Authentication → Users → Add user
-- Execute o comando abaixo substituindo o e-mail:
-- ────────────────────────────────────────────────────────────────

-- UPDATE public.profiles
-- SET
--   role = 'admin',
--   name = 'Administrador'   -- troque pelo nome real
-- WHERE id = (
--   SELECT id FROM auth.users
--   WHERE email = 'seu@email.com'  -- troque pelo seu e-mail
-- );


-- ────────────────────────────────────────────────────────────────
-- PRÓXIMAS TABELAS (criadas nas fases seguintes)
-- ────────────────────────────────────────────────────────────────
--
-- FASE 2 — Matéria-Prima:
--   raw_materials          → cadastro de insumos
--   raw_material_movements → entradas e saídas de estoque
--
-- FASE 3 — Produtos:
--   products               → produtos finais (ex: terrário)
--   bill_of_materials      → ficha técnica (produto × insumo)
--
-- FASE 4 — Pedidos:
--   orders                 → cabeçalho do pedido
--   order_items            → itens de cada pedido
--
-- FASE 5 — Produção:
--   production_orders      → ordens de produção
--
-- FASE 6 — Financeiro:
--   financial_entries      → lançamentos (receitas e despesas)
--
-- FASE 7 — Funcionários:
--   employees              → cadastro da equipe
--   time_records           → registros de ponto
--
-- ────────────────────────────────────────────────────────────────
