-- ================================================================
-- CoisaPet — Fase 28: arquiva Shopee de 25/08 a 31/08 pra reimportar
-- com uma planilha retroativa completa
-- ================================================================
-- Execute no SQL Editor do Supabase (ou peça pro Claude rodar — é
-- UPDATE, não DELETE, não é bloqueado).
--
-- Contexto (ver coisapet.md): conferido que o Expedição da Shopee
-- estava 100% correto (17 pedidos = 11 de hoje + 6 de ontem com
-- ship_date de hoje, contas batendo exatamente). Mesmo assim, o
-- Raphael decidiu (por conta própria, ciente de que não era bug)
-- arquivar esse período e subir uma planilha nova e completa
-- (25/08 até o fim do mês) como fonte única de verdade, só pra ficar
-- de olho mais de perto nesses envios.
--
-- Arquivar (não apagar) — os pedidos continuam contando no relatório
-- mensal de vendas, só saem da tela operacional (Expedição/Atrasados).
-- Ao reimportar a planilha nova, upsert_orders_safe desarquiva
-- automaticamente qualquer pedido tocado de novo (mesmo mecanismo já
-- usado pro ML na Fase 23).
-- ================================================================

-- ── Confirma o escopo antes de arquivar ──────────────────────────────
SELECT COUNT(*) AS pedidos_a_arquivar, COALESCE(SUM((SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id)),0) AS itens_a_arquivar
FROM public.orders o
WHERE o.source = 'shopee' AND o.archived = false
  AND o.ship_date BETWEEN '2026-08-25' AND '2026-08-31';

-- ── Arquiva ───────────────────────────────────────────────────────
UPDATE public.orders
SET archived = true
WHERE source = 'shopee' AND archived = false
  AND ship_date BETWEEN '2026-08-25' AND '2026-08-31';

-- ── Confirma ──────────────────────────────────────────────────────
SELECT archived, COUNT(*) FROM public.orders WHERE source = 'shopee' GROUP BY archived;
