-- Fase 71 (25/09) — corrige bug pré-existente na trigger de auditoria
-- compartilhada (audit_trigger_func): o CASE de 'raw_material_movements'
-- referenciava NEW.quantity e NEW.unit, que não existem nessa tabela
-- (a coluna real é `qty`, e `unit` pertence a raw_materials, não a
-- raw_material_movements). Nunca deu erro antes porque nenhuma tela
-- tinha inserido nessa tabela de verdade até o módulo de Conferência
-- de Matéria-Prima (Fase 70) tentar hoje. Resto da função idêntico —
-- só esse CASE foi corrigido.
CREATE OR REPLACE FUNCTION public.audit_trigger_func()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id   UUID;
  v_user_name TEXT;
  v_action    TEXT;
  v_record_id UUID;
  v_desc      TEXT;
  v_old       JSONB;
  v_new       JSONB;
  v_sess_key  TEXT;
BEGIN
  -- Tenta ler o usuário via variável de sessão primeiro
  BEGIN
    v_sess_key := current_setting('app.session_key', true);
    IF v_sess_key IS NOT NULL AND v_sess_key <> '' THEN
      SELECT user_id, user_name INTO v_user_id, v_user_name
      FROM active_sessions WHERE session_key = v_sess_key;
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Fallback: tenta via user_id direto
  IF v_user_id IS NULL THEN
    BEGIN
      v_user_id := current_setting('app.current_user_id', true)::UUID;
      IF v_user_id IS NOT NULL THEN
        SELECT name INTO v_user_name FROM system_users WHERE id = v_user_id;
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  -- Se ainda não achou, fica NULL (aparece como "Sistema")
  v_action := TG_OP;

  IF TG_OP = 'DELETE' THEN
    v_record_id := OLD.id; v_old := row_to_json(OLD)::JSONB; v_new := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_record_id := NEW.id; v_old := NULL; v_new := row_to_json(NEW)::JSONB;
  ELSE
    v_record_id := NEW.id; v_old := row_to_json(OLD)::JSONB; v_new := row_to_json(NEW)::JSONB;
  END IF;

  -- Descrições (mantém todas as existentes)
  CASE TG_TABLE_NAME
    WHEN 'bills' THEN
      IF TG_OP = 'INSERT' THEN v_desc := format('Cadastrou conta "%s" — R$ %s', NEW.description, to_char(NEW.amount::numeric, 'FM999G999G990D00'));
      ELSIF TG_OP = 'DELETE' THEN v_desc := format('Excluiu conta "%s" — era R$ %s', OLD.description, to_char(OLD.amount::numeric, 'FM999G999G990D00'));
      ELSIF OLD.status <> NEW.status THEN v_desc := format('Alterou status de "%s": %s → %s', NEW.description, OLD.status, NEW.status);
      ELSIF OLD.amount <> NEW.amount THEN v_desc := format('Alterou valor de "%s": R$ %s → R$ %s', NEW.description, to_char(OLD.amount::numeric, 'FM999G999G990D00'), to_char(NEW.amount::numeric, 'FM999G999G990D00'));
      ELSE v_desc := format('Editou conta "%s"', NEW.description); END IF;
    WHEN 'bill_payments' THEN
      IF TG_OP = 'INSERT' THEN v_desc := format('Registrou pagamento de R$ %s em %s', to_char(NEW.amount::numeric, 'FM999G999G990D00'), to_char(NEW.paid_at, 'DD/MM/YYYY'));
      ELSIF TG_OP = 'DELETE' THEN v_desc := format('Excluiu pagamento de R$ %s', to_char(OLD.amount::numeric, 'FM999G999G990D00'));
      ELSE v_desc := 'Editou pagamento'; END IF;
    WHEN 'bill_attachments' THEN
      IF TG_OP = 'INSERT' THEN v_desc := format('Anexou arquivo "%s" (tipo: %s)', NEW.file_name, COALESCE(NEW.type, '?'));
      ELSIF TG_OP = 'DELETE' THEN v_desc := format('Removeu arquivo "%s"', OLD.file_name);
      ELSE v_desc := 'Editou anexo'; END IF;
    WHEN 'suppliers' THEN
      IF TG_OP = 'INSERT' THEN v_desc := format('Cadastrou fornecedor "%s"', NEW.name);
      ELSIF TG_OP = 'DELETE' THEN v_desc := format('Excluiu fornecedor "%s"', OLD.name);
      ELSE v_desc := format('Editou fornecedor "%s"', NEW.name); END IF;
    WHEN 'expense_categories' THEN
      IF TG_OP = 'INSERT' THEN v_desc := format('Criou tipo de despesa "%s"', NEW.name);
      ELSIF TG_OP = 'DELETE' THEN v_desc := format('Excluiu tipo de despesa "%s"', OLD.name);
      ELSE v_desc := format('Editou tipo de despesa "%s"', NEW.name); END IF;
    WHEN 'raw_materials' THEN
      IF TG_OP = 'INSERT' THEN v_desc := format('Cadastrou matéria-prima "%s" — estoque inicial: %s %s', NEW.name, NEW.stock_qty, NEW.unit);
      ELSIF TG_OP = 'DELETE' THEN v_desc := format('Excluiu matéria-prima "%s"', OLD.name);
      ELSIF OLD.stock_qty <> NEW.stock_qty THEN v_desc := format('Estoque de "%s": %s → %s %s', NEW.name, OLD.stock_qty, NEW.stock_qty, NEW.unit);
      ELSIF OLD.unit_cost <> NEW.unit_cost THEN v_desc := format('Custo de "%s": R$ %s → R$ %s', NEW.name, to_char(OLD.unit_cost::numeric, 'FM999G999G990D00'), to_char(NEW.unit_cost::numeric, 'FM999G999G990D00'));
      ELSE v_desc := format('Editou matéria-prima "%s"', NEW.name); END IF;
    WHEN 'raw_material_categories' THEN
      IF TG_OP = 'INSERT' THEN v_desc := format('Criou categoria de insumo "%s"', NEW.name);
      ELSIF TG_OP = 'DELETE' THEN v_desc := format('Excluiu categoria de insumo "%s"', OLD.name);
      ELSE v_desc := format('Editou categoria de insumo "%s"', NEW.name); END IF;
    WHEN 'raw_material_movements' THEN
      IF TG_OP = 'INSERT' THEN v_desc := format('Movimentação de estoque: %s %s (%s)', NEW.qty,
        COALESCE((SELECT unit FROM raw_materials WHERE id = NEW.raw_material_id), ''), COALESCE(NEW.type, ''));
      ELSIF TG_OP = 'DELETE' THEN v_desc := 'Excluiu movimentação de estoque';
      ELSE v_desc := 'Editou movimentação de estoque'; END IF;
    WHEN 'products' THEN
      IF TG_OP = 'INSERT' THEN v_desc := format('Cadastrou produto "%s" (SKU: %s)', NEW.name, COALESCE(NEW.sku, '—'));
      ELSIF TG_OP = 'DELETE' THEN v_desc := format('Excluiu produto "%s"', OLD.name);
      ELSIF OLD.sale_price <> NEW.sale_price THEN v_desc := format('Alterou preço de "%s": R$ %s → R$ %s', NEW.name, to_char(OLD.sale_price::numeric, 'FM999G999G990D00'), to_char(NEW.sale_price::numeric, 'FM999G999G990D00'));
      ELSE v_desc := format('Editou produto "%s"', NEW.name); END IF;
    WHEN 'product_categories' THEN
      IF TG_OP = 'INSERT' THEN v_desc := format('Criou categoria de produto "%s"', NEW.name);
      ELSIF TG_OP = 'DELETE' THEN v_desc := format('Excluiu categoria de produto "%s"', OLD.name);
      ELSE v_desc := format('Editou categoria de produto "%s"', NEW.name); END IF;
    WHEN 'system_users' THEN
      IF TG_OP = 'INSERT' THEN v_desc := format('Cadastrou usuário "%s" (%s) — %s', NEW.name, NEW.email, NEW.role);
      ELSIF TG_OP = 'DELETE' THEN v_desc := format('Excluiu usuário "%s"', OLD.name);
      ELSIF OLD.active = true AND NEW.active = false THEN v_desc := format('Desativou usuário "%s"', NEW.name);
      ELSIF OLD.role <> NEW.role THEN v_desc := format('Alterou hierarquia de "%s": %s → %s', NEW.name, OLD.role, NEW.role);
      ELSIF OLD.must_change_password <> NEW.must_change_password THEN v_desc := format('Resetou senha de "%s"', NEW.name);
      ELSE v_desc := format('Editou usuário "%s"', NEW.name); END IF;
    WHEN 'employees' THEN
      IF TG_OP = 'INSERT' THEN v_desc := format('Cadastrou funcionário "%s" — %s', NEW.name, NEW.role);
      ELSIF TG_OP = 'DELETE' THEN v_desc := format('Excluiu funcionário "%s"', OLD.name);
      ELSIF OLD.active = true AND NEW.active = false THEN v_desc := format('Desativou funcionário "%s"', NEW.name);
      ELSE v_desc := format('Editou funcionário "%s"', NEW.name); END IF;
    ELSE
      IF TG_OP = 'INSERT' THEN v_desc := format('Inseriu registro em %s', TG_TABLE_NAME);
      ELSIF TG_OP = 'DELETE' THEN v_desc := format('Excluiu registro de %s', TG_TABLE_NAME);
      ELSE v_desc := format('Editou registro em %s', TG_TABLE_NAME); END IF;
  END CASE;

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
$function$
