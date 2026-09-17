-- ================================================================
-- CoisaPet — Fase 64c: chapa aponta pra família, cor escolhida no lançamento
-- ================================================================
-- Execute no SQL Editor do Supabase (ou supabase db query --linked --file).
--
-- `log_chapa_production` (fase63) ganha um parâmetro opcional
-- `p_color_selections` (JSONB, ex: {"<principal_id>": "<cor_id_escolhida>"})
-- — quando um item da chapa aponta pra um produto principal (is_sellable
-- =false, fase64), resolve pra qual SKU de cor de verdade credita o
-- estoque. Chapa apontando direto pra um produto comum (sem família)
-- continua funcionando exatamente igual — p_color_selections fica NULL
-- e o COALESCE cai no `ci.product_id` original, sem mudança nenhuma de
-- comportamento.
-- ================================================================

-- Precisa dropar a versão antiga (4 parâmetros) primeiro — adicionar um
-- parâmetro novo com CREATE OR REPLACE cria uma SEGUNDA função
-- (overload) em vez de substituir, o que deixaria a chamada ambígua
-- (duas funções batendo com os mesmos 4 nomes supridos).
DROP FUNCTION IF EXISTS public.log_chapa_production(UUID, INT, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.log_chapa_production(
  p_chapa_id   UUID,
  p_multiplier INT,
  p_notes      TEXT,
  p_user_id    UUID,
  p_color_selections JSONB DEFAULT NULL
)
RETURNS TABLE(product_id UUID, product_name TEXT, delta INT, new_stock_qty INT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_entry_id UUID;
BEGIN
  INSERT INTO public.chapa_production_entries (chapa_id, multiplier, notes, created_by)
    VALUES (p_chapa_id, p_multiplier, p_notes, p_user_id)
    RETURNING id INTO v_entry_id;

  RETURN QUERY
  WITH deltas AS (
    SELECT
      COALESCE((p_color_selections ->> ci.product_id::text)::uuid, ci.product_id) AS pid,
      ci.quantity * p_multiplier AS d
    FROM public.chapa_items ci
    WHERE ci.chapa_id = p_chapa_id
  ),
  updated AS (
    UPDATE public.products p
    SET stock_qty = p.stock_qty + deltas.d
    FROM deltas
    WHERE p.id = deltas.pid
    RETURNING p.id, p.name, p.stock_qty
  ),
  logged AS (
    INSERT INTO public.product_stock_movements (product_id, quantity_delta, movement_type, reference_id, created_by)
    SELECT deltas.pid, deltas.d, 'chapa_production', v_entry_id, p_user_id
    FROM deltas
    RETURNING 1
  )
  SELECT deltas.pid, updated.name, deltas.d, updated.stock_qty
  FROM deltas
  JOIN updated ON updated.id = deltas.pid;
END;
$$;

COMMENT ON FUNCTION public.log_chapa_production IS 'Lança 1 evento de produção de chapa. Se um item da chapa aponta pra um produto principal (is_sellable=false), p_color_selections resolve qual cor de verdade recebe o estoque — {"<principal_id>": "<cor_escolhida_id>"}. Item apontando direto pra produto comum ignora o mapa, credita nele mesmo, igual sempre foi.';

GRANT EXECUTE ON FUNCTION public.log_chapa_production TO anon;
