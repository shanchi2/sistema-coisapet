-- ================================================================
-- CoisaPet — Fase 24: limpa item duplicado gerado pela reimportação
-- da Fase 23 (mesmo produto, 2 linhas no mesmo pedido)
-- ================================================================
-- Execute no SQL Editor do Supabase (ação destrutiva, precisa ser manual).
--
-- Contexto (ver coisapet.md): a Fase 23 reimportou ~89 pedidos ML via
-- API. Pra pedido que já existia antes (importado por .xlsx, ou criado
-- pelo webhook de antes da Fase 22), o campo `order_items.source_order_id`
-- tinha sido preenchido retroativamente (Fase 22) com o `num_venda` do
-- pedido — só que pra pedido desse tipo, `num_venda` é o número da VENDA
-- (pack_id), não o `order.id` individual de cada produto que a API
-- devolve. Resultado: o gate "esse produto já entrou?" não reconhecia o
-- item já existente e inseria de novo — duplicando 1 linha por produto
-- já tocado na reimportação. JÁ CORRIGIDO no código
-- (`ml-process-webhook/index.ts`, deploy feito em 2026-08-26): a partir
-- de agora a checagem é por produto (sku+variação), não mais por esse id.
--
-- Esta migração só limpa o estrago retroativo: 32 pares confirmados
-- (mesmo order_id + sku + variação, sempre exatamente 1 duplicata cada,
-- todos criados por volta de 2026-08-26 14:53 — o horário da reimportação
-- da Fase 23). Mantém a linha MAIS ANTIGA de cada par (a original,
-- anterior à reimportação) e apaga a mais nova (a duplicata).
--
-- IMPORTANTE: compara variação ignorando espaços e caixa (`lower(
-- regexp_replace(..., '\s+', '', 'g'))`) — o `.xlsx` antigo grava
-- "Cor : Amadeirado" (espaço antes do ":") e a API grava "Cor: Amadeirado"
-- (sem espaço) pro MESMO produto. Comparação exata de string deixaria
-- passar 11 dos 32 pares reais (confirmado: par do Caio Raváglia, sku
-- TER-60-C-AMD).
-- ================================================================

-- ── Confirma o escopo antes de apagar ────────────────────────────────
SELECT oi.order_id, o.num_venda, o.comprador, oi.sku, MAX(oi.variacao) AS variacao, COUNT(*) AS cnt
FROM public.order_items oi
JOIN public.orders o ON o.id = oi.order_id
WHERE o.source = 'ml' AND o.archived = false
GROUP BY oi.order_id, o.num_venda, o.comprador, oi.sku, lower(regexp_replace(COALESCE(oi.variacao,''), '\s+', '', 'g'))
HAVING COUNT(*) > 1
ORDER BY o.num_venda;

-- ── Apaga a duplicata mais nova de cada par ──────────────────────────
DELETE FROM public.order_items oi
WHERE oi.id IN (
  SELECT id FROM (
    SELECT oi2.id,
      ROW_NUMBER() OVER (
        PARTITION BY oi2.order_id, oi2.sku, lower(regexp_replace(COALESCE(oi2.variacao,''), '\s+', '', 'g'))
        ORDER BY oi2.created_at ASC
      ) AS rn
    FROM public.order_items oi2
    JOIN public.orders o2 ON o2.id = oi2.order_id
    WHERE o2.source = 'ml' AND o2.archived = false
  ) ranked
  WHERE ranked.rn > 1
);

-- ── Recalcula total_items dos lotes afetados (mesmo raciocínio de
--    saveImportedOrders/saveOrder — total precisa bater com a soma real
--    de qty depois da limpeza) ──────────────────────────────────────
UPDATE public.import_batches ib SET
  total_items = (
    SELECT COALESCE(SUM(oi.qty), 0)
    FROM public.orders o JOIN public.order_items oi ON oi.order_id = o.id
    WHERE o.batch_id = ib.id
  )
WHERE ib.source = 'ml';

-- ── Confirma que não sobrou nenhum grupo duplicado ───────────────────
SELECT COUNT(*) AS grupos_duplicados_restantes
FROM (
  SELECT oi.order_id, oi.sku, lower(regexp_replace(COALESCE(oi.variacao,''), '\s+', '', 'g')) as var_norm
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE o.source = 'ml' AND o.archived = false
  GROUP BY oi.order_id, oi.sku, var_norm
  HAVING COUNT(*) > 1
) t;
