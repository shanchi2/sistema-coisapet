-- ================================================================
-- CoisaPet — Fase 12: Log de Auditoria
-- ================================================================
-- Execute no SQL Editor do Supabase
-- ================================================================


-- ────────────────────────────────────────────────────────────────
-- 1. TABELA DE AUDITORIA
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_log (
  id           UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Quem fez
  user_id      UUID        REFERENCES public.system_users(id) ON DELETE SET NULL,
  user_name    TEXT,       -- denormalizado para não perder histórico se usuário for deletado
  -- O que aconteceu
  action       TEXT        NOT NULL, -- INSERT | UPDATE | DELETE
  table_name   TEXT        NOT NULL, -- bills | bill_payments | products | system_users | etc
  record_id    UUID,                 -- ID do registro afetado
  -- Descrição legível
  description  TEXT        NOT NULL, -- "Cadastrou conta EMBALAGEM - R$ 833,33"
  -- Dados completos (para investigação)
  old_data     JSONB,                -- dados ANTES da mudança (UPDATE/DELETE)
  new_data     JSONB,                -- dados DEPOIS da mudança (INSERT/UPDATE)
  -- Metadados
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.audit_log IS 'Histórico completo de todas as ações no sistema';

-- Índices para consulta eficiente
CREATE INDEX IF NOT EXISTS idx_audit_user      ON public.audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_table     ON public.audit_log(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_action    ON public.audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_created   ON public.audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_record    ON public.audit_log(record_id);

-- Permissão para anon key
GRANT ALL ON public.audit_log TO anon;


-- ────────────────────────────────────────────────────────────────
-- 2. FUNÇÃO: definir usuário da sessão atual
-- Chamada pelo frontend antes de qualquer operação crítica
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_audit_user(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Armazena o ID do usuário como variável de configuração da sessão
  PERFORM set_config('app.current_user_id', p_user_id::text, true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_audit_user TO anon;


-- ────────────────────────────────────────────────────────────────
-- 3. FUNÇÃO: inserir log diretamente (chamada pelo frontend)
-- Mais confiável que triggers para nossa arquitetura customizada
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.insert_audit_log(
  p_action      TEXT,
  p_table_name  TEXT,
  p_record_id   UUID,
  p_description TEXT,
  p_old_data    JSONB DEFAULT NULL,
  p_new_data    JSONB DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   UUID;
  v_user_name TEXT;
BEGIN
  -- Tenta ler o usuário da variável de sessão
  BEGIN
    v_user_id := current_setting('app.current_user_id', true)::UUID;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- Busca o nome do usuário
  IF v_user_id IS NOT NULL THEN
    SELECT name INTO v_user_name
    FROM public.system_users
    WHERE id = v_user_id;
  END IF;

  INSERT INTO public.audit_log (
    user_id, user_name,
    action, table_name, record_id,
    description, old_data, new_data
  ) VALUES (
    v_user_id, v_user_name,
    p_action, p_table_name, p_record_id,
    p_description, p_old_data, p_new_data
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.insert_audit_log TO anon;


-- ────────────────────────────────────────────────────────────────
-- 4. TRIGGERS AUTOMÁTICOS — captura deleções diretas no banco
-- (Para operações via frontend, o log é feito pela RPC acima)
-- ────────────────────────────────────────────────────────────────

-- Função base do trigger
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
  -- Tenta ler o usuário da sessão
  BEGIN
    v_user_id := current_setting('app.current_user_id', true)::UUID;
    SELECT name INTO v_user_name FROM public.system_users WHERE id = v_user_id;
  EXCEPTION WHEN OTHERS THEN
    v_user_id   := NULL;
    v_user_name := 'Sistema';
  END;

  v_action := TG_OP; -- INSERT, UPDATE ou DELETE

  IF TG_OP = 'DELETE' THEN
    v_record_id := OLD.id;
    v_old       := row_to_json(OLD)::JSONB;
    v_new       := NULL;
    -- Descrição legível por tabela
    CASE TG_TABLE_NAME
      WHEN 'bills' THEN
        v_desc := format('Excluiu conta "%s" (R$ %s)',
          OLD.description,
          to_char(OLD.amount::numeric, 'FM999G999G990D00'));
      WHEN 'bill_payments' THEN
        v_desc := format('Excluiu pagamento de R$ %s',
          to_char(OLD.amount::numeric, 'FM999G999G990D00'));
      WHEN 'products' THEN
        v_desc := format('Excluiu produto "%s" (SKU: %s)', OLD.name, COALESCE(OLD.sku, '—'));
      WHEN 'system_users' THEN
        v_desc := format('Desativou usuário "%s" (%s)', OLD.name, OLD.email);
      ELSE
        v_desc := format('Excluiu registro da tabela %s', TG_TABLE_NAME);
    END CASE;

  ELSIF TG_OP = 'INSERT' THEN
    v_record_id := NEW.id;
    v_old       := NULL;
    v_new       := row_to_json(NEW)::JSONB;
    CASE TG_TABLE_NAME
      WHEN 'bills' THEN
        v_desc := format('Cadastrou conta "%s" — R$ %s',
          NEW.description,
          to_char(NEW.amount::numeric, 'FM999G999G990D00'));
      WHEN 'bill_payments' THEN
        v_desc := format('Registrou pagamento de R$ %s',
          to_char(NEW.amount::numeric, 'FM999G999G990D00'));
      WHEN 'products' THEN
        v_desc := format('Cadastrou produto "%s" (SKU: %s)', NEW.name, COALESCE(NEW.sku, '—'));
      WHEN 'system_users' THEN
        v_desc := format('Cadastrou usuário "%s" (%s) — %s', NEW.name, NEW.email, NEW.role);
      ELSE
        v_desc := format('Inseriu registro na tabela %s', TG_TABLE_NAME);
    END CASE;

  ELSE -- UPDATE
    v_record_id := NEW.id;
    v_old       := row_to_json(OLD)::JSONB;
    v_new       := row_to_json(NEW)::JSONB;
    CASE TG_TABLE_NAME
      WHEN 'bills' THEN
        IF OLD.amount <> NEW.amount THEN
          v_desc := format('Alterou valor de "%s": R$ %s → R$ %s',
            NEW.description,
            to_char(OLD.amount::numeric, 'FM999G999G990D00'),
            to_char(NEW.amount::numeric, 'FM999G999G990D00'));
        ELSIF OLD.status <> NEW.status THEN
          v_desc := format('Alterou status de "%s": %s → %s',
            NEW.description, OLD.status, NEW.status);
        ELSE
          v_desc := format('Editou conta "%s"', NEW.description);
        END IF;
      WHEN 'products' THEN
        v_desc := format('Editou produto "%s"', NEW.name);
      WHEN 'system_users' THEN
        IF OLD.role <> NEW.role THEN
          v_desc := format('Alterou hierarquia de "%s": %s → %s', NEW.name, OLD.role, NEW.role);
        ELSE
          v_desc := format('Editou usuário "%s"', NEW.name);
        END IF;
      ELSE
        v_desc := format('Atualizou registro na tabela %s', TG_TABLE_NAME);
    END CASE;
  END IF;

  -- Remove senha hash dos logs de system_users por segurança
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

  RETURN NULL; -- AFTER trigger, retorno não importa
END;
$$;

-- Aplica o trigger nas tabelas principais
DROP TRIGGER IF EXISTS audit_bills         ON public.bills;
DROP TRIGGER IF EXISTS audit_bill_payments ON public.bill_payments;
DROP TRIGGER IF EXISTS audit_products      ON public.products;
DROP TRIGGER IF EXISTS audit_system_users  ON public.system_users;

CREATE TRIGGER audit_bills
  AFTER INSERT OR UPDATE OR DELETE ON public.bills
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_bill_payments
  AFTER INSERT OR UPDATE OR DELETE ON public.bill_payments
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_products
  AFTER INSERT OR UPDATE OR DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_system_users
  AFTER INSERT OR UPDATE OR DELETE ON public.system_users
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();


-- ────────────────────────────────────────────────────────────────
-- 5. CONFIRMA
-- ────────────────────────────────────────────────────────────────
SELECT
  trigger_name,
  event_object_table,
  event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name LIKE 'audit_%'
ORDER BY event_object_table;
