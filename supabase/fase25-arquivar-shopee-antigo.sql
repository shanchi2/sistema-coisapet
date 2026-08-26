-- ================================================================
-- CoisaPet — Fase 25: arquiva histórico morto da Shopee (mesmo
-- esquema de arquivamento da Fase 23, sem apagar nada)
-- ================================================================
-- Execute no SQL Editor do Supabase.
--
-- Contexto (ver coisapet.md): com o ML resolvido (Fase 23/24), Raphael
-- pediu pra alinhar a Shopee também. Diagnóstico: 1071 pedidos Shopee no
-- total, 673 aparecendo como "atrasados" — mas a distribuição por
-- ship_date mostra que não é tudo igual:
--   - 465 de julho/2025 (mais de 1 ano) — histórico morto óbvio.
--   - 29 de 30-31/07/2026 — quase um mês, também morto.
--   - 172 concentrados entre 06/08 e 14/08/2026 — cluster recente, mas
--     ainda assim resolvido pelo Raphael como corte de arquivamento.
--   - Só 8 pedidos entre 17/08 e 24/08 — esses ficam de fora do corte,
--     visíveis nos Atrasados pra equipe revisar de verdade.
-- Decisão do Raphael: arquivar tudo com ship_date < 15/08/2026.
--
-- Diferença importante em relação à Fase 23 (ML): aqui NÃO tem
-- reimportação via API depois — a Shopee é 100% manual (.xlsx), sem
-- fonte automática pra "recarregar do zero". Arquivar aqui é só uma
-- limpeza de tela mesmo, não um "recomeço" — pedido arquivado continua
-- valendo pra relatório/histórico, só some do operacional (Expedição/
-- Atrasados). Se algum desses pedidos precisar reaparecer (ex: foi
-- reaberto/devolvido), a query 2 abaixo desarquiva pelo num_venda.
-- ================================================================

-- ── 1. Arquiva tudo Shopee com ship_date antes de 15/08/2026 ────────
UPDATE public.orders
SET archived = true
WHERE source = 'shopee' AND archived = false AND ship_date < '2026-08-15';

-- ── Confirma ──────────────────────────────────────────────────────
SELECT archived, COUNT(*) FROM public.orders WHERE source = 'shopee' GROUP BY archived;

-- ── 2. (reserva, não roda automático) pra desarquivar 1 pedido específico
--    caso precise reaparecer no operacional depois:
-- UPDATE public.orders SET archived = false WHERE source = 'shopee' AND num_venda = 'COLOQUE_AQUI';
