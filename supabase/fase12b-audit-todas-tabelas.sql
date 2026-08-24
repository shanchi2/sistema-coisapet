-- ================================================================
-- CoisaPet — Fase 12b: Auditoria em TODAS as tabelas
-- ================================================================
-- Execute APÓS o fase12-audit-log.sql
-- Adiciona triggers e descrições legíveis para todas as tabelas
-- ================================================================


-- ────────────────────────────────────────────────────────────────
-- Atualiza a função de trigger com descrições para todas as tabelas
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.audit_trigger_func()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   UUID;
  v_user_name TEXT;
  v_action    TEXT;
  v_record_id UUID;
  v_desc      TEXT;
  v_old       JSONB;
  v_new       JSONB;
BEGIN
  -- Lê o usuário da sessão
  BEGIN
    v_user_id := current_setting('app.current_user_id', true)::UUID;
    SELECT name INTO v_user_name FROM public.system_users WHERE id = v_user_id;
  EXCEPTION WHEN OTHERS THEN
    v_user_id   := NULL;
    v_user_name := 'Sistema';
  END;

  v_action := TG_OP;

  -- ── Monta record_id, old_data e new_data ─────────────────────
  IF TG_OP = 'DELETE' THEN
    v_record_id := OLD.id;
    v_old       := row_to_json(OLD)::JSONB;
    v_new       := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_record_id := NEW.id;
    v_old       := NULL;
    v_new       := row_to_json(NEW)::JSONB;
  ELSE -- UPDATE
    v_record_id := NEW.id;
    v_old       := row_to_json(OLD)::JSONB;
    v_new       := row_to_json(NEW)::JSONB;
  END IF;

  -- ── Descrição legível por tabela e operação ───────────────────
  CASE TG_TABLE_NAME

    -- CONTAS A PAGAR
    WHEN 'bills' THEN
      IF TG_OP = 'INSERT' THEN
        v_desc := format('Cadastrou conta "%s" — R$ %s',
          NEW.description, to_char(NEW.amount::numeric, 'FM999G999G990D00'));
      ELSIF TG_OP = 'DELETE' THEN
        v_desc := format('Excluiu conta "%s" — era R$ %s',
          OLD.description, to_char(OLD.amount::numeric, 'FM999G999G990D00'));
      ELSIF OLD.status <> NEW.status THEN
        v_desc := format('Alterou status de "%s": %s → %s', NEW.description, OLD.status, NEW.status);
      ELSIF OLD.amount <> NEW.amount THEN
        v_desc := format('Alterou valor de "%s": R$ %s → R$ %s',
          NEW.description,
          to_char(OLD.amount::numeric, 'FM999G999G990D00'),
          to_char(NEW.amount::numeric, 'FM999G999G990D00'));
      ELSE
        v_desc := format('Editou conta "%s"', NEW.description);
      END IF;

    -- PAGAMENTOS
    WHEN 'bill_payments' THEN
      IF TG_OP = 'INSERT' THEN
        v_desc := format('Registrou pagamento de R$ %s em %s',
          to_char(NEW.amount::numeric, 'FM999G999G990D00'),
          to_char(NEW.paid_at, 'DD/MM/YYYY'));
      ELSIF TG_OP = 'DELETE' THEN
        v_desc := format('Excluiu pagamento de R$ %s',
          to_char(OLD.amount::numeric, 'FM999G999G990D00'));
      ELSE
        v_desc := 'Editou pagamento';
      END IF;

    -- ANEXOS
    WHEN 'bill_attachments' THEN
      IF TG_OP = 'INSERT' THEN
        v_desc := format('Anexou arquivo "%s" (tipo: %s)', NEW.file_name, COALESCE(NEW.type, '?'));
      ELSIF TG_OP = 'DELETE' THEN
        v_desc := format('Removeu arquivo "%s"', OLD.file_name);
      ELSE
        v_desc := 'Editou anexo';
      END IF;

    -- FORNECEDORES
    WHEN 'suppliers' THEN
      IF TG_OP = 'INSERT' THEN
        v_desc := format('Cadastrou fornecedor "%s"', NEW.name);
      ELSIF TG_OP = 'DELETE' THEN
        v_desc := format('Excluiu fornecedor "%s"', OLD.name);
      ELSE
        v_desc := format('Editou fornecedor "%s"', NEW.name);
      END IF;

    -- TIPOS DE DESPESA
    WHEN 'expense_categories' THEN
      IF TG_OP = 'INSERT' THEN
        v_desc := format('Criou tipo de despesa "%s"', NEW.name);
      ELSIF TG_OP = 'DELETE' THEN
        v_desc := format('Excluiu tipo de despesa "%s"', OLD.name);
      ELSE
        v_desc := format('Editou tipo de despesa "%s"', NEW.name);
      END IF;

    -- MATÉRIA-PRIMA
    WHEN 'raw_materials' THEN
      IF TG_OP = 'INSERT' THEN
        v_desc := format('Cadastrou matéria-prima "%s" — estoque inicial: %s %s',
          NEW.name, NEW.stock_qty, NEW.unit);
      ELSIF TG_OP = 'DELETE' THEN
        v_desc := format('Excluiu matéria-prima "%s"', OLD.name);
      ELSIF OLD.stock_qty <> NEW.stock_qty THEN
        v_desc := format('Estoque de "%s": %s → %s %s',
          NEW.name, OLD.stock_qty, NEW.stock_qty, NEW.unit);
      ELSIF OLD.unit_cost <> NEW.unit_cost THEN
        v_desc := format('Custo de "%s": R$ %s → R$ %s',
          NEW.name,
          to_char(OLD.unit_cost::numeric, 'FM999G999G990D00'),
          to_char(NEW.unit_cost::numeric, 'FM999G999G990D00'));
      ELSE
        v_desc := format('Editou matéria-prima "%s"', NEW.name);
      END IF;

    -- CATEGORIAS DE MATÉRIA-PRIMA
    WHEN 'raw_material_categories' THEN
      IF TG_OP = 'INSERT' THEN
        v_desc := format('Criou categoria de insumo "%s"', NEW.name);
      ELSIF TG_OP = 'DELETE' THEN
        v_desc := format('Excluiu categoria de insumo "%s"', OLD.name);
      ELSE
        v_desc := format('Editou categoria de insumo "%s"', NEW.name);
      END IF;

    -- MOVIMENTAÇÕES DE ESTOQUE
    WHEN 'raw_material_movements' THEN
      IF TG_OP = 'INSERT' THEN
        v_desc := format('Movimentação de estoque: %s %s (%s)',
          NEW.quantity, COALESCE(NEW.unit, ''), COALESCE(NEW.type, ''));
      ELSIF TG_OP = 'DELETE' THEN
        v_desc := 'Excluiu movimentação de estoque';
      ELSE
        v_desc := 'Editou movimentação de estoque';
      END IF;

    -- PRODUTOS
    WHEN 'products' THEN
      IF TG_OP = 'INSERT' THEN
        v_desc := format('Cadastrou produto "%s" (SKU: %s)', NEW.name, COALESCE(NEW.sku, '—'));
      ELSIF TG_OP = 'DELETE' THEN
        v_desc := format('Excluiu produto "%s"', OLD.name);
      ELSIF OLD.sale_price <> NEW.sale_price THEN
        v_desc := format('Alterou preço de "%s": R$ %s → R$ %s',
          NEW.name,
          to_char(OLD.sale_price::numeric, 'FM999G999G990D00'),
          to_char(NEW.sale_price::numeric, 'FM999G999G990D00'));
      ELSE
        v_desc := format('Editou produto "%s"', NEW.name);
      END IF;

    -- CATEGORIAS DE PRODUTOS
    WHEN 'product_categories' THEN
      IF TG_OP = 'INSERT' THEN
        v_desc := format('Criou categoria de produto "%s"', NEW.name);
      ELSIF TG_OP = 'DELETE' THEN
        v_desc := format('Excluiu categoria de produto "%s"', OLD.name);
      ELSE
        v_desc := format('Editou categoria de produto "%s"', NEW.name);
      END IF;

    -- USUÁRIOS
    WHEN 'system_users' THEN
      IF TG_OP = 'INSERT' THEN
        v_desc := format('Cadastrou usuário "%s" (%s) — %s', NEW.name, NEW.email, NEW.role);
      ELSIF TG_OP = 'DELETE' THEN
        v_desc := format('Excluiu usuário "%s"', OLD.name);
      ELSIF OLD.active = true AND NEW.active = false THEN
        v_desc := format('Desativou usuário "%s"', NEW.name);
      ELSIF OLD.role <> NEW.role THEN
        v_desc := format('Alterou hierarquia de "%s": %s → %s', NEW.name, OLD.role, NEW.role);
      ELSIF OLD.must_change_password <> NEW.must_change_password THEN
        v_desc := format('Resetou senha de "%s"', NEW.name);
      ELSE
        v_desc := format('Editou usuário "%s"', NEW.name);
      END IF;

    -- FUNCIONÁRIOS
    WHEN 'employees' THEN
      IF TG_OP = 'INSERT' THEN
        v_desc := format('Cadastrou funcionário "%s" — %s', NEW.name, NEW.role);
      ELSIF TG_OP = 'DELETE' THEN
        v_desc := format('Excluiu funcionário "%s"', OLD.name);
      ELSIF OLD.active = true AND NEW.active = false THEN
        v_desc := format('Desativou funcionário "%s"', NEW.name);
      ELSE
        v_desc := format('Editou funcionário "%s"', NEW.name);
      END IF;

    ELSE
      IF TG_OP = 'INSERT' THEN
        v_desc := format('Inseriu registro em %s', TG_TABLE_NAME);
      ELSIF TG_OP = 'DELETE' THEN
        v_desc := format('Excluiu registro de %s', TG_TABLE_NAME);
      ELSE
        v_desc := format('Editou registro em %s', TG_TABLE_NAME);
      END IF;

  END CASE;

  -- Remove senha hash dos logs por segurança
  IF TG_TABLE_NAME = 'system_users' THEN
    v_old := v_old - 'password_hash';
    v_new := v_new - 'password_hash';
  END IF;

  INSERT INTO public.audit_log (
    user_id, user_name, action, table_name, record_id,
    description, old_data, new_data
  ) VALUES (
    v_user_id, v_user_name, v_action, TG_TABLE_NAME, v_record_id,
    v_desc, v_old, v_new
  );

  RETURN NULL;
END;
$$;


-- ────────────────────────────────────────────────────────────────
-- Remove triggers antigos e recria todos
-- ────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS audit_bills                  ON public.bills;
DROP TRIGGER IF EXISTS audit_bill_payments          ON public.bill_payments;
DROP TRIGGER IF EXISTS audit_bill_attachments       ON public.bill_attachments;
DROP TRIGGER IF EXISTS audit_suppliers              ON public.suppliers;
DROP TRIGGER IF EXISTS audit_expense_categories     ON public.expense_categories;
DROP TRIGGER IF EXISTS audit_raw_materials          ON public.raw_materials;
DROP TRIGGER IF EXISTS audit_raw_material_categories ON public.raw_material_categories;
DROP TRIGGER IF EXISTS audit_raw_material_movements ON public.raw_material_movements;
DROP TRIGGER IF EXISTS audit_products               ON public.products;
DROP TRIGGER IF EXISTS audit_product_categories     ON public.product_categories;
DROP TRIGGER IF EXISTS audit_system_users           ON public.system_users;
DROP TRIGGER IF EXISTS audit_employees              ON public.employees;

-- Recria em todas as tabelas
CREATE TRIGGER audit_bills
  AFTER INSERT OR UPDATE OR DELETE ON public.bills
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_bill_payments
  AFTER INSERT OR UPDATE OR DELETE ON public.bill_payments
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_bill_attachments
  AFTER INSERT OR UPDATE OR DELETE ON public.bill_attachments
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_suppliers
  AFTER INSERT OR UPDATE OR DELETE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_expense_categories
  AFTER INSERT OR UPDATE OR DELETE ON public.expense_categories
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_raw_materials
  AFTER INSERT OR UPDATE OR DELETE ON public.raw_materials
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_raw_material_categories
  AFTER INSERT OR UPDATE OR DELETE ON public.raw_material_categories
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_raw_material_movements
  AFTER INSERT OR UPDATE OR DELETE ON public.raw_material_movements
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_products
  AFTER INSERT OR UPDATE OR DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_product_categories
  AFTER INSERT OR UPDATE OR DELETE ON public.product_categories
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_system_users
  AFTER INSERT OR UPDATE OR DELETE ON public.system_users
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_employees
  AFTER INSERT OR UPDATE OR DELETE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();


-- ────────────────────────────────────────────────────────────────
-- Atualiza o mapeamento de tabelas na AuditPage (via SQL não é
-- necessário, mas confirma os triggers criados)
-- ────────────────────────────────────────────────────────────────
SELECT
  trigger_name,
  event_object_table AS tabela,
  string_agg(event_manipulation, ' | ' ORDER BY event_manipulation) AS operacoes
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name LIKE 'audit_%'
GROUP BY trigger_name, event_object_table
ORDER BY event_object_table;
