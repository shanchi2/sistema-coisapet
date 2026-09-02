-- ================================================================
-- CoisaPet — Fase 40: reconcilia a "Feira" (achou no estoque) com a
-- Esteira de Produção + arquiva o backlog antigo nunca operado
-- ================================================================
-- Execute no SQL Editor do Supabase.
--
-- Contexto (ver coisapet.md e o plano da sessão): a Feira Combinada
-- (`FeiraCombinadaModal.jsx`) e a feira single-platform embutida na
-- Expedição (`usePicklistGathering.js`) só gravavam o que FALTOU numa
-- tabela separada (`picklist_shortage_reports`, lida pela aba "Itens
-- Faltando"). Nunca tocavam `production_order_items` — a tabela que a
-- aba "Esteira" lê — então achar 3 de 5 unidades na feira não reduzia
-- em nada as 5 unidades pendentes de produção mostradas na Esteira.
-- Confirmado também ao vivo: 3.173 itens "pendente" acumulados desde
-- maio/2026 (a esteira nunca foi de fato operada até agora), um
-- despejo histórico sem filtro de data.
-- ================================================================

-- ── 1. Novos status: 'coberto_estoque' (achado na feira, não precisa
--    produzir — mas continua visível, esmaecido, na tela) e
--    'arquivado' (backlog antigo, nunca operado, tirado da fila ativa) ──
ALTER TABLE public.production_order_items
  DROP CONSTRAINT IF EXISTS production_order_items_status_check;

ALTER TABLE public.production_order_items
  ADD CONSTRAINT production_order_items_status_check
  CHECK (status IN (
    'pendente', 'em_producao', 'embalagem', 'pronto', 'enviado',
    'coberto_estoque', 'arquivado'
  ));

-- ── 2. RPC de reconciliação — chamada pelo frontend a cada vez que o
--    "achei X unidades" muda na Feira (combinada ou single-platform).
--    Idempotente: recebe a quantidade TOTAL encontrada (não um delta),
--    então repetir a mesma chamada não faz nada extra, e destickar um
--    item na feira desfaz a reconciliação (volta pra 'pendente').
--    Casa só por SKU (a tabela não tem coluna de variação) — item sem
--    SKU cadastrado fica de fora, de propósito (mais seguro não casar
--    do que casar errado). Janela de data estreita (ontem/hoje) —
--    protege o backlog arquivado de ser mexido por engano.
CREATE OR REPLACE FUNCTION public.reconcile_stock_found(p_sku TEXT, p_found_qty INT)
RETURNS INT
LANGUAGE plpgsql
AS $function$
DECLARE
  v_target INT := GREATEST(0, p_found_qty);
  v_reconciled INT;
BEGIN
  IF p_sku IS NULL OR trim(p_sku) = '' THEN
    RETURN 0;
  END IF;

  WITH candidatos AS (
    SELECT poi.id, poi.status,
      ROW_NUMBER() OVER (ORDER BY poi.created_at ASC) AS rn
    FROM public.production_order_items poi
    JOIN public.production_orders po ON po.id = poi.order_id
    WHERE poi.sku = p_sku
      AND poi.status IN ('pendente', 'coberto_estoque')
      AND po.date BETWEEN (CURRENT_DATE - 1) AND CURRENT_DATE
  ),
  ajustes AS (
    SELECT id,
      CASE WHEN rn <= v_target THEN 'coberto_estoque' ELSE 'pendente' END AS novo_status
    FROM candidatos
  )
  UPDATE public.production_order_items poi
  SET status = ajustes.novo_status
  FROM ajustes
  WHERE poi.id = ajustes.id AND poi.status IS DISTINCT FROM ajustes.novo_status;

  SELECT count(*) INTO v_reconciled
  FROM public.production_order_items poi
  JOIN public.production_orders po ON po.id = poi.order_id
  WHERE poi.sku = p_sku AND poi.status = 'coberto_estoque'
    AND po.date BETWEEN (CURRENT_DATE - 1) AND CURRENT_DATE;

  RETURN v_reconciled;
END;
$function$;

COMMENT ON FUNCTION public.reconcile_stock_found IS 'Fase 40: casa quantidade achada na Feira contra production_order_items pendentes do mesmo SKU (janela ontem/hoje) — marca coberto_estoque em vez de exigir produção.';

GRANT EXECUTE ON FUNCTION public.reconcile_stock_found(TEXT, INT) TO anon;

-- ── 3. Arquiva o backlog antigo — só o que está 'pendente' E é de
--    ANTES de hoje. Os itens já pendentes de hoje ficam intactos como
--    início real da fila (não é DELETE — dado continua no banco,
--    só sai da visão padrão da Esteira). ──
UPDATE public.production_order_items
SET status = 'arquivado'
WHERE status = 'pendente'
  AND order_id IN (SELECT id FROM public.production_orders WHERE date < CURRENT_DATE);

-- ── 4. Confirma ──────────────────────────────────────────────────
SELECT status, count(*) FROM public.production_order_items GROUP BY status ORDER BY status;
