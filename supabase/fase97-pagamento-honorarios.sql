-- ================================================================
-- Fase 97 (06/10/2026) — Pagamento de Honorários via Pix
-- ================================================================
-- Pedido do Raphael: chave Pix na ficha do colaborador + tela onde o
-- diretor (Clara) gera o Pix "copia e cola"/QR com o valor do mês
-- pré-preenchido, paga no banco e anexa o comprovante.
--
-- Integração com o que já existe: o salário cadastrado na ficha já gera
-- lançamentos "pendente" em director_entries (Fin. Diretoria). Ao pagar,
-- a tela marca ESSE lançamento como pago (paid_amount, paid_at,
-- receipt_url, recipient_pix) — não cria conta nova, pra não duplicar.
-- Se não houver lançamento do mês, cria um já pago.
-- ================================================================

ALTER TABLE public.system_users ADD COLUMN IF NOT EXISTS pix_key      TEXT;
ALTER TABLE public.system_users ADD COLUMN IF NOT EXISTS pix_key_type TEXT;  -- cpf · cnpj · telefone · email · aleatoria
ALTER TABLE public.system_users ADD COLUMN IF NOT EXISTS pix_holder   TEXT;  -- nome do titular (conferência)

CREATE TABLE IF NOT EXISTS public.employee_payments (
  id                UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id       UUID        NOT NULL,  -- system_users.id (sem FK: criar FK pelo MCP dá timeout)
  ref_month         INT         NOT NULL CHECK (ref_month BETWEEN 1 AND 12),  -- competência (mês trabalhado)
  ref_year          INT         NOT NULL,
  default_amount    NUMERIC(12,2),          -- valor calculado pelo sistema
  amount            NUMERIC(12,2) NOT NULL, -- valor efetivamente cobrado no Pix
  calc_note         TEXT,                   -- como o valor padrão foi calculado
  edit_reason       TEXT,                   -- obrigatório quando amount <> default_amount
  pix_key           TEXT,
  pix_payload       TEXT,                   -- Pix copia e cola gerado
  status            TEXT        NOT NULL DEFAULT 'gerado' CHECK (status IN ('gerado', 'pago')),
  receipt_path      TEXT,                   -- comprovante (bucket employee-docs)
  paid_at           TIMESTAMPTZ,
  paid_by           UUID,
  paid_by_name      TEXT,
  director_entry_id UUID,
  created_by        UUID,
  created_by_name   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, ref_month, ref_year)
);

CREATE INDEX IF NOT EXISTS idx_employee_payments_ref ON public.employee_payments(ref_year, ref_month);

-- Mesmo padrão do resto do app (auth própria com chave anon); quem vê a
-- tela é controlado no front (só diretor).
ALTER TABLE public.employee_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "app_all_employee_payments" ON public.employee_payments;
CREATE POLICY "app_all_employee_payments" ON public.employee_payments
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
