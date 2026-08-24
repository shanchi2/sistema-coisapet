-- ================================================================
-- CoisaPet — Fase 12c: Correção do usuário no log de auditoria
-- ================================================================
-- O set_config não persiste entre conexões no Supabase pooler.
-- Solução: função que recebe o user_id explicitamente e faz o
-- INSERT no audit_log em uma única transação atômica.
-- ================================================================


-- ────────────────────────────────────────────────────────────────
-- Nova função: executa operação E registra no audit em um único
-- round-trip. O frontend chama esta RPC passando o user_id.
-- ────────────────────────────────────────────────────────────────

-- Versão simplificada: apenas registra o log com user_id explícito
CREATE OR REPLACE FUNCTION public.audit_log_with_user(
  p_user_id     UUID,
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
  v_user_name TEXT;
BEGIN
  -- Busca nome do usuário
  SELECT name INTO v_user_name
  FROM public.system_users
  WHERE id = p_user_id;

  INSERT INTO public.audit_log (
    user_id, user_name,
    action, table_name, record_id,
    description, old_data, new_data
  ) VALUES (
    p_user_id, v_user_name,
    p_action, p_table_name, p_record_id,
    p_description, p_old_data, p_new_data
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.audit_log_with_user TO anon;


-- ────────────────────────────────────────────────────────────────
-- Atualiza set_audit_user para também fazer set_config LOCAL
-- (funciona em conexões diretas, não pooler)
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_audit_user(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.current_user_id', p_user_id::text, false);
  -- false = persiste na sessão inteira (não só na transação)
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_audit_user TO anon;

-- Confirma
SELECT 'Funções de auditoria atualizadas!' AS status;
