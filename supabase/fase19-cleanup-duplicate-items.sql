-- ================================================================
-- CoisaPet — Fase 19: Limpeza de itens duplicados dentro do mesmo pedido
-- ================================================================
-- Execute no SQL Editor do Supabase — SÓ DEPOIS de conferir o resultado
-- da query de auditoria (passo 1) manualmente.
--
-- Contexto: resíduo do bug de corte de dia corrigido na Fase 18 — um
-- pedido podia ter seus itens inseridos mais de uma vez quando o
-- batch_id dele mudava sem querer entre uma importação e outra. A Fase
-- 18 impede isso de acontecer DAQUI PRA FRENTE; esta migração limpa o
-- que já ficou duplicado ANTES da correção.
-- ================================================================

-- ── 1. AUDITORIA — rode isso primeiro e olhe o resultado ────────────
-- Mostra cada pedido com item duplicado (mesmo order_id + sku + título +
-- variação + quantidade aparecendo mais de uma vez) e quantas cópias tem.
SELECT
  oi.order_id,
  o.num_venda,
  o.source,
  oi.sku,
  oi.titulo,
  oi.variacao,
  oi.qty,
  COUNT(*) AS copias
FROM public.order_items oi
JOIN public.orders o ON o.id = oi.order_id
GROUP BY oi.order_id, o.num_venda, o.source, oi.sku, oi.titulo, oi.variacao, oi.qty
HAVING COUNT(*) > 1
ORDER BY copias DESC;

-- ── 2. LIMPEZA — só rode depois de conferir o passo 1 ───────────────
-- Mantém 1 cópia por grupo duplicado: prioriza a que já foi separada
-- (picked=true); se nenhuma foi separada, mantém a mais antiga
-- (created_at). Apaga as cópias extras.
--
-- Descomente as linhas abaixo (remova o "--" do início) pra rodar de
-- verdade — deixei comentado de propósito, pra isso nunca rodar sem
-- alguém decidir conscientemente.
--
-- WITH duped AS (
--   SELECT id,
--     ROW_NUMBER() OVER (
--       PARTITION BY order_id, sku, titulo, variacao, qty
--       ORDER BY picked DESC NULLS LAST, created_at ASC
--     ) AS rn
--   FROM public.order_items
-- )
-- DELETE FROM public.order_items
-- WHERE id IN (SELECT id FROM duped WHERE rn > 1);
