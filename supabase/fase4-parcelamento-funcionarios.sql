-- ================================================================
-- CoisaPet — Fase 4: Parcelamento, Hierarquia de Usuários e Funcionários
-- ================================================================
-- Execute no SQL Editor do Supabase após os SQLs anteriores
-- ================================================================


-- ────────────────────────────────────────────────────────────────
-- 1. ATUALIZAR ROLES — nova hierarquia completa
-- ────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'administrativo', 'atendimento', 'producao'));

-- Atualiza usuários com role 'gerencia' (legado) para 'administrativo'
UPDATE public.profiles SET role = 'administrativo' WHERE role = 'gerencia';

COMMENT ON COLUMN public.profiles.role IS
  'admin = Diretor (acesso total) | administrativo = Administrativo (financeiro + operacional) | atendimento = Atendimento (pedidos) | producao = Produção (ponto, banco de horas)';


-- ────────────────────────────────────────────────────────────────
-- 2. PARCELAMENTO — adicionar colunas na tabela bills
-- ────────────────────────────────────────────────────────────────
ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS installment_group_id UUID,
  -- UUID compartilhado entre todas as parcelas de um mesmo parcelamento
  ADD COLUMN IF NOT EXISTS installment_number   INTEGER,
  -- número desta parcela (1, 2, 3...)
  ADD COLUMN IF NOT EXISTS installment_total    INTEGER;
  -- total de parcelas do grupo (ex: 3)

COMMENT ON COLUMN public.bills.installment_group_id IS 'Agrupa parcelas de um mesmo parcelamento';
COMMENT ON COLUMN public.bills.installment_number   IS 'Número desta parcela dentro do grupo (1-based)';
COMMENT ON COLUMN public.bills.installment_total    IS 'Total de parcelas no grupo';

CREATE INDEX IF NOT EXISTS idx_bills_installment_group ON public.bills(installment_group_id);


-- ────────────────────────────────────────────────────────────────
-- 3. ATUALIZAR get_my_role() — inclui novos roles
-- (função já existe, apenas garantindo que está atualizada)
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;


-- ────────────────────────────────────────────────────────────────
-- 4. ATUALIZAR POLICIES DO FINANCEIRO — novo role 'administrativo'
-- (administrativo substitui 'gerencia')
-- ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "financeiro_fornecedores"  ON public.suppliers;
DROP POLICY IF EXISTS "financeiro_categorias"    ON public.expense_categories;
DROP POLICY IF EXISTS "financeiro_contas"        ON public.bills;
DROP POLICY IF EXISTS "financeiro_pagamentos"    ON public.bill_payments;
DROP POLICY IF EXISTS "financeiro_comprovantes"  ON public.bill_attachments;

CREATE POLICY "financeiro_fornecedores" ON public.suppliers
  FOR ALL TO authenticated
  USING (get_my_role() IN ('admin','administrativo'))
  WITH CHECK (get_my_role() IN ('admin','administrativo'));

CREATE POLICY "financeiro_categorias" ON public.expense_categories
  FOR ALL TO authenticated
  USING (get_my_role() IN ('admin','administrativo'))
  WITH CHECK (get_my_role() IN ('admin','administrativo'));

CREATE POLICY "financeiro_contas" ON public.bills
  FOR ALL TO authenticated
  USING (get_my_role() IN ('admin','administrativo'))
  WITH CHECK (get_my_role() IN ('admin','administrativo'));

CREATE POLICY "financeiro_pagamentos" ON public.bill_payments
  FOR ALL TO authenticated
  USING (get_my_role() IN ('admin','administrativo'))
  WITH CHECK (get_my_role() IN ('admin','administrativo'));

CREATE POLICY "financeiro_comprovantes" ON public.bill_attachments
  FOR ALL TO authenticated
  USING (get_my_role() IN ('admin','administrativo'))
  WITH CHECK (get_my_role() IN ('admin','administrativo'));


-- ────────────────────────────────────────────────────────────────
-- 5. FUNCIONÁRIOS
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.employees (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT        NOT NULL,
  role       TEXT        NOT NULL DEFAULT 'producao',
  -- cargo interno: 'admin' | 'administrativo' | 'atendimento' | 'producao'
  job_title  TEXT,
  -- título do cargo livre (ex: "Marceneiro", "Atendente", "Gerente")
  phone      TEXT,
  email      TEXT,
  cpf        TEXT,
  hire_date  DATE,
  -- data de contratação
  hourly_rate NUMERIC(10,2),
  -- valor hora (para cálculo de banco de horas)
  notes      TEXT,
  active     BOOLEAN     NOT NULL DEFAULT true,
  -- vínculo com usuário do sistema (opcional)
  profile_id UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT employees_role_check
    CHECK (role IN ('admin','administrativo','atendimento','producao'))
);

COMMENT ON TABLE  public.employees            IS 'Funcionários da CoisaPet';
COMMENT ON COLUMN public.employees.role       IS 'Hierarquia: admin | administrativo | atendimento | producao';
COMMENT ON COLUMN public.employees.profile_id IS 'Vínculo com usuário do sistema (opcional)';

CREATE TRIGGER set_employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- Admin e administrativo gerenciam funcionários
CREATE POLICY "gestao_funcionarios" ON public.employees
  FOR ALL TO authenticated
  USING (get_my_role() IN ('admin','administrativo'))
  WITH CHECK (get_my_role() IN ('admin','administrativo'));

-- Produção e atendimento veem apenas o próprio registro
CREATE POLICY "producao_ve_proprio_registro" ON public.employees
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid());


-- ────────────────────────────────────────────────────────────────
-- 6. REGISTROS DE PONTO
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.time_records (
  id               UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id      UUID          NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date             DATE          NOT NULL,
  clock_in         TIME,
  -- hora de entrada
  clock_out        TIME,
  -- hora de saída
  break_minutes    INTEGER       NOT NULL DEFAULT 60,
  -- minutos de intervalo (padrão: 1h)
  expected_minutes INTEGER       NOT NULL DEFAULT 480,
  -- carga horária esperada em minutos (padrão: 8h = 480min)
  notes            TEXT,
  created_by       UUID          REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT time_records_unique_day UNIQUE (employee_id, date)
  -- apenas 1 registro por funcionário por dia
);

-- Coluna computada: minutos trabalhados (entrada - saída - intervalo)
-- Calculamos no frontend para flexibilidade

COMMENT ON TABLE public.time_records IS 'Registros de ponto diário dos funcionários';

CREATE INDEX IF NOT EXISTS idx_time_records_employee ON public.time_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_time_records_date     ON public.time_records(date DESC);

CREATE TRIGGER set_time_records_updated_at
  BEFORE UPDATE ON public.time_records
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.time_records ENABLE ROW LEVEL SECURITY;

-- Admin e administrativo gerenciam todos os pontos
CREATE POLICY "gestao_todos_pontos" ON public.time_records
  FOR ALL TO authenticated
  USING (get_my_role() IN ('admin','administrativo'))
  WITH CHECK (get_my_role() IN ('admin','administrativo'));

-- Produção e atendimento veem/registram apenas o próprio ponto
CREATE POLICY "producao_ve_proprio_ponto" ON public.time_records
  FOR SELECT TO authenticated
  USING (
    employee_id IN (
      SELECT id FROM public.employees WHERE profile_id = auth.uid()
    )
  );
