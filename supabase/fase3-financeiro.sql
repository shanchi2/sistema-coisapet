-- ================================================================
-- CoisaPet — Fase 3 (REVISADO): Financeiro com Pagamentos Parciais
-- ================================================================
-- Este arquivo SUBSTITUI a versão anterior do fase3-financeiro.sql
-- Execute no SQL Editor do Supabase após o setup.sql da Fase 1.
-- ================================================================

-- Atualiza roles para incluir gerencia
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'gerencia', 'operador'));

-- 1. FORNECEDORES
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  cnpj TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "financeiro_fornecedores" ON public.suppliers FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','gerencia')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','gerencia')));

-- 2. CATEGORIAS DE DESPESA
CREATE TABLE IF NOT EXISTS public.expense_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6B7280',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_expense_categories_updated_at BEFORE UPDATE ON public.expense_categories FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "financeiro_categorias" ON public.expense_categories FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','gerencia')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','gerencia')));

-- 3. CONTAS A PAGAR
-- MUDANCA: status 'parcial' adicionado. paid_at/paid_amount removidos (vao para bill_payments)
CREATE TABLE IF NOT EXISTS public.bills (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  category_id UUID REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'aberto',
  notes TEXT,
  recurrent BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT bills_status_check CHECK (status IN ('aberto','parcial','pago','vencido','cancelado'))
);
CREATE INDEX IF NOT EXISTS idx_bills_status   ON public.bills(status);
CREATE INDEX IF NOT EXISTS idx_bills_due_date ON public.bills(due_date);
CREATE INDEX IF NOT EXISTS idx_bills_supplier ON public.bills(supplier_id);
CREATE INDEX IF NOT EXISTS idx_bills_category ON public.bills(category_id);
CREATE TRIGGER set_bills_updated_at BEFORE UPDATE ON public.bills FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "financeiro_contas" ON public.bills FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','gerencia')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','gerencia')));

-- 4. PAGAMENTOS (parciais ou totais)
CREATE TABLE IF NOT EXISTS public.bill_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bill_id UUID NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  paid_at DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  paid_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT bill_payments_amount_positive CHECK (amount > 0)
);
CREATE INDEX IF NOT EXISTS idx_bill_payments_bill ON public.bill_payments(bill_id);
CREATE INDEX IF NOT EXISTS idx_bill_payments_date ON public.bill_payments(paid_at DESC);
ALTER TABLE public.bill_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "financeiro_pagamentos" ON public.bill_payments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','gerencia')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','gerencia')));

-- 5. TRIGGER: recalcula status da conta apos cada pagamento inserido
CREATE OR REPLACE FUNCTION public.handle_bill_payment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_amount NUMERIC; v_paid NUMERIC; v_status TEXT;
BEGIN
  SELECT amount INTO v_amount FROM public.bills WHERE id = NEW.bill_id;
  SELECT COALESCE(SUM(amount),0) INTO v_paid FROM public.bill_payments WHERE bill_id = NEW.bill_id;
  IF v_paid >= v_amount THEN v_status := 'pago';
  ELSIF v_paid > 0 THEN v_status := 'parcial';
  ELSE SELECT CASE WHEN due_date < CURRENT_DATE THEN 'vencido' ELSE 'aberto' END INTO v_status FROM public.bills WHERE id = NEW.bill_id;
  END IF;
  UPDATE public.bills SET status = v_status, updated_at = NOW() WHERE id = NEW.bill_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_bill_payment_insert AFTER INSERT ON public.bill_payments FOR EACH ROW EXECUTE FUNCTION public.handle_bill_payment();

-- 5b. TRIGGER: recalcula status apos deletar pagamento
CREATE OR REPLACE FUNCTION public.handle_bill_payment_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_amount NUMERIC; v_paid NUMERIC; v_status TEXT;
BEGIN
  SELECT amount INTO v_amount FROM public.bills WHERE id = OLD.bill_id;
  SELECT COALESCE(SUM(amount),0) INTO v_paid FROM public.bill_payments WHERE bill_id = OLD.bill_id;
  IF v_paid >= v_amount THEN v_status := 'pago';
  ELSIF v_paid > 0 THEN v_status := 'parcial';
  ELSE SELECT CASE WHEN due_date < CURRENT_DATE THEN 'vencido' ELSE 'aberto' END INTO v_status FROM public.bills WHERE id = OLD.bill_id;
  END IF;
  UPDATE public.bills SET status = v_status, updated_at = NOW() WHERE id = OLD.bill_id;
  RETURN OLD;
END;
$$;
CREATE TRIGGER on_bill_payment_delete AFTER DELETE ON public.bill_payments FOR EACH ROW EXECUTE FUNCTION public.handle_bill_payment_delete();

-- 6. COMPROVANTES
CREATE TABLE IF NOT EXISTS public.bill_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bill_id UUID NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES public.bill_payments(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER,
  storage_path TEXT NOT NULL,
  uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_attachments_bill    ON public.bill_attachments(bill_id);
CREATE INDEX IF NOT EXISTS idx_attachments_payment ON public.bill_attachments(payment_id);
ALTER TABLE public.bill_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "financeiro_comprovantes" ON public.bill_attachments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','gerencia')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','gerencia')));

-- 7. FUNCAO: marcar vencidas
CREATE OR REPLACE FUNCTION public.update_overdue_bills()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE affected INTEGER;
BEGIN
  UPDATE public.bills SET status = 'vencido', updated_at = NOW()
  WHERE status IN ('aberto','parcial') AND due_date < CURRENT_DATE;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

-- 8. VIEW: KPIs financeiros
CREATE OR REPLACE VIEW public.bills_summary AS
SELECT
  SUM(CASE WHEN b.status IN ('aberto','parcial','vencido') THEN b.amount - COALESCE(bp.paid,0) ELSE 0 END) AS total_pending,
  SUM(CASE WHEN b.status = 'vencido' THEN b.amount - COALESCE(bp.paid,0) ELSE 0 END)                      AS total_overdue,
  SUM(CASE WHEN b.status IN ('aberto','parcial') AND b.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7
           THEN b.amount - COALESCE(bp.paid,0) ELSE 0 END)                                                 AS due_next_7days,
  (SELECT COALESCE(SUM(amount),0) FROM public.bill_payments
   WHERE DATE_TRUNC('month',paid_at) = DATE_TRUNC('month',CURRENT_DATE))                                   AS paid_this_month,
  COUNT(*) FILTER (WHERE b.status = 'aberto')   AS count_open,
  COUNT(*) FILTER (WHERE b.status = 'parcial')  AS count_partial,
  COUNT(*) FILTER (WHERE b.status = 'vencido')  AS count_overdue
FROM public.bills b
LEFT JOIN (SELECT bill_id, SUM(amount) AS paid FROM public.bill_payments GROUP BY bill_id) bp ON bp.bill_id = b.id;

-- 9. STORAGE
INSERT INTO storage.buckets (id, name, public) VALUES ('bill-attachments','bill-attachments',false) ON CONFLICT (id) DO NOTHING;
CREATE POLICY "financeiro_storage_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='bill-attachments' AND EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role IN ('admin','gerencia')));
CREATE POLICY "financeiro_storage_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='bill-attachments' AND EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role IN ('admin','gerencia')));
CREATE POLICY "financeiro_storage_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='bill-attachments' AND EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role IN ('admin','gerencia')));

-- 10. DADOS INICIAIS
INSERT INTO public.expense_categories (name, color) VALUES
  ('Matéria-Prima','#F59E0B'),('Aluguel','#6366F1'),('Energia / Água','#0EA5E9'),
  ('Serviços','#8B5CF6'),('Folha de Pagamento','#10B981'),('Frete / Logística','#F97316'),
  ('Manutenção','#6B7280'),('Impostos / Taxas','#EF4444'),('Outros','#94A3B8')
ON CONFLICT DO NOTHING;
