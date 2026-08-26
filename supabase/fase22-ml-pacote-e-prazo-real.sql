-- ================================================================
-- CoisaPet — Fase 22: pacote do ML vira 1 pedido só (não N) + usa o
-- prazo de envio REAL do ML (shipment.lead_time.buffering.date)
-- ================================================================
-- Execute no SQL Editor do Supabase.
--
-- Contexto (ver coisapet.md): uma venda com 3 produtos (pacote) estava
-- virando 3 linhas em `orders`, uma por produto, cada uma "Pendente" e
-- escalada pra hoje — quando na real é 1 venda só, com prazo de envio
-- de 3 dias (confirmado direto na API do ML: order.pack_id e
-- shipment.lead_time.buffering.date são os campos reais).
-- ================================================================

-- ── 1. Rastreia qual produto individual do ML trouxe cada item ──────
-- Necessário pra distinguir "pedido já existe, não mexe" (proteção
-- normal contra duplicar) de "esse produto do PACOTE ainda não tinha
-- entrado" (que precisa inserir, mesmo o pedido já existindo).
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS source_order_id TEXT;
COMMENT ON COLUMN public.order_items.source_order_id IS 'ID individual do produto na API do ML (order.id) que trouxe esse item — para pedidos normais é igual ao num_venda; para pacote, cada produto do pacote tem o seu próprio, mesmo todos caindo no mesmo pedido (num_venda = pack_id).';

-- IMPORTANTE: preenche retroativamente pra todo item já existente — sem
-- isso, o próximo webhook em QUALQUER pedido normal (não só pacote)
-- acharia que "esse produto ainda não entrou" (source_order_id NULL não
-- bate com nada) e reinseriria os itens, reproduzindo a duplicação
-- corrigida ontem por outro caminho. Pra pedido normal, num_venda JÁ É
-- o order.id individual — é exatamente o valor certo aqui.
UPDATE public.order_items oi
SET source_order_id = o.num_venda
FROM public.orders o
WHERE oi.order_id = o.id AND oi.source_order_id IS NULL;

-- ── 2. compute_ship_date agora prioriza o prazo real do ML também ───
-- (antes só priorizava pra Shopee — ML sempre calculava pelo corte de
-- horário, mesmo quando a API já manda um prazo real e diferente)
CREATE OR REPLACE FUNCTION public.compute_ship_date(
  p_source TEXT,
  p_data_venda TIMESTAMPTZ,
  p_shipping_deadline DATE
) RETURNS DATE
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_cutoff INTEGER;
  v_local  TIMESTAMP;
BEGIN
  IF p_source = 'shopee' THEN
    RETURN COALESCE(p_shipping_deadline, (COALESCE(p_data_venda, NOW()) AT TIME ZONE 'America/Sao_Paulo')::DATE);
  END IF;

  IF p_source = 'manual' THEN
    RETURN (COALESCE(p_data_venda, NOW()) AT TIME ZONE 'America/Sao_Paulo')::DATE;
  END IF;

  -- ML: usa o prazo real do shipment (lead_time.buffering.date) quando
  -- disponível — só cai pro corte de horário quando não vier (ex: pedido
  -- importado por .xlsx, que não tem esse dado).
  IF p_shipping_deadline IS NOT NULL THEN
    RETURN p_shipping_deadline;
  END IF;

  SELECT cutoff_hour INTO v_cutoff FROM public.platform_cutoff_settings WHERE source = p_source;
  v_cutoff := COALESCE(v_cutoff, 11);
  v_local  := COALESCE(p_data_venda, NOW()) AT TIME ZONE 'America/Sao_Paulo';

  RETURN CASE
    WHEN EXTRACT(HOUR FROM v_local) >= v_cutoff THEN (v_local::DATE + 1)
    ELSE v_local::DATE
  END;
END;
$$;

-- ── 3. Conserta o caso real já quebrado (venda #2000014711473185,
--    Marirhem Marirhem) — junta as 3 linhas numa só ──────────────────
DO $$
DECLARE
  v_canonical_id UUID;
  v_batch_id UUID;
  v_new_ship_date DATE;
BEGIN
  SELECT id, batch_id INTO v_canonical_id, v_batch_id
  FROM public.orders WHERE source = 'ml' AND num_venda = '2000018121544154';

  IF v_canonical_id IS NULL THEN
    RAISE NOTICE 'Pedido 2000018121544154 não encontrado — pulando conserto pontual (já foi feito antes?).';
    RETURN;
  END IF;

  -- Marca cada item com o produto individual do ML que o trouxe, ANTES
  -- de mexer em num_venda de qualquer uma das 3 linhas
  UPDATE public.order_items oi
  SET source_order_id = o.num_venda
  FROM public.orders o
  WHERE oi.order_id = o.id
    AND o.source = 'ml'
    AND o.num_venda IN ('2000018121544154', '2000018121539696', '2000018121544156');

  -- Move os itens das outras 2 linhas pra linha canônica
  UPDATE public.order_items
  SET order_id = v_canonical_id
  WHERE order_id IN (
    SELECT id FROM public.orders
    WHERE source = 'ml' AND num_venda IN ('2000018121539696', '2000018121544156')
  );

  v_new_ship_date := public.compute_ship_date('ml',
    (SELECT data_venda FROM public.orders WHERE id = v_canonical_id),
    '2026-08-28'::DATE);

  UPDATE public.orders
  SET num_venda = '2000014711473185',
      pack_id = '2000014711473185',
      shipping_deadline = '2026-08-28',
      ship_date = v_new_ship_date
  WHERE id = v_canonical_id;

  DELETE FROM public.orders
  WHERE source = 'ml' AND num_venda IN ('2000018121539696', '2000018121544156');

  -- Recalcula os totais do lote (perdeu 2 pedidos, mesma contagem de itens)
  IF v_batch_id IS NOT NULL THEN
    UPDATE public.import_batches ib SET
      total_orders = (SELECT COUNT(*) FROM public.orders WHERE batch_id = v_batch_id),
      total_items  = (SELECT COALESCE(SUM(oi.qty),0) FROM public.orders o JOIN public.order_items oi ON oi.order_id = o.id WHERE o.batch_id = v_batch_id)
    WHERE ib.id = v_batch_id;
  END IF;

  RAISE NOTICE 'Pedido pacote 2000014711473185 consolidado com sucesso — ship_date = %', v_new_ship_date;
END $$;

-- ── Confirma ──────────────────────────────────────────────────────
SELECT o.id, o.num_venda, o.pack_id, o.shipping_deadline, o.ship_date,
       (SELECT COUNT(*) FROM public.order_items oi WHERE oi.order_id = o.id) AS n_itens
FROM public.orders o
WHERE o.num_venda = '2000014711473185';
