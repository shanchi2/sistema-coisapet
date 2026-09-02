-- ================================================================
-- CoisaPet — Fase 39: corrige corrida entre webhooks que duplicava
-- order_items (e ordens de produção) do mesmo pedido ML
-- ================================================================
-- Execute no SQL Editor do Supabase.
--
-- Contexto (ver coisapet.md): Raphael reportou pedido com item
-- duplicado (2026-09-01). Investigado: `ml-process-webhook` fazia
-- SELECT (existe esse produto nesse pedido?) e só depois INSERT — sem
-- trava no banco, então 2 webhooks quase simultâneos pro mesmo pedido
-- (comum, o ML manda mais de 1 notificação por pedido quando o status
-- muda rápido) podiam os dois "ver" que não existia e os dois
-- inserirem. Confirmado no pedido reportado: os 2 `order_items`
-- foram criados com 53ms de diferença. Escaneando o banco inteiro:
-- 15 pedidos com duplicata desde 26/08, 19 linhas extras — e cada uma
-- gerou uma ORDEM DE PRODUÇÃO duplicada também (o `if (hasNewItems)`
-- rodava duas vezes, cada webhook "achava" que era item novo).
--
-- Mesmo padrão já usado pra `orders` (`upsert_orders_safe`, ver
-- fase18/20/23/28): trava real no banco (índice único) + INSERT com
-- `ON CONFLICT ... DO NOTHING`, que é atômico de verdade (ao contrário
-- de "SELECT depois INSERT", 2 chamadas concorrentes não conseguem
-- passar pela mesma trava juntas). `product_id`/`sku_encontrado` etc.
-- continuam sendo resolvidos no código (edge function), só a inserção
-- em si virou este RPC.
-- ================================================================

-- ── 1. Índice único — mesma chave que o código já usava pra comparar
--    (sku + variação normalizada: sem espaço, minúscula) — evita bloquear
--    2 itens DE VERDADE diferentes que só coincidem em sku nulo/variação
--    vazia (usa a variação normalizada inteira, não só um hash solto).
CREATE UNIQUE INDEX IF NOT EXISTS order_items_dedup_uidx
ON public.order_items (
  order_id,
  (COALESCE(sku, '')),
  (regexp_replace(lower(COALESCE(variacao, '')), '\s+', '', 'g'))
);

-- ── 2. Insere em lote, ignorando silenciosamente item que já existe
--    (mesma chave) — `RETURNING` só devolve o que foi REALMENTE
--    inserido agora, então quem chama sabe exatamente o que é novo,
--    sem precisar pré-checar antes.
CREATE OR REPLACE FUNCTION public.insert_order_items_safe(p_items jsonb)
RETURNS SETOF public.order_items
LANGUAGE sql
AS $function$
  INSERT INTO public.order_items (
    order_id, product_id, titulo, sku, variacao, qty, preco_unit, obs_item, sku_encontrado, source_order_id
  )
  SELECT
    (it->>'order_id')::UUID,
    NULLIF(it->>'product_id', '')::UUID,
    it->>'titulo',
    it->>'sku',
    it->>'variacao',
    (it->>'qty')::INT,
    (it->>'preco_unit')::NUMERIC,
    it->>'obs_item',
    COALESCE((it->>'sku_encontrado')::BOOLEAN, false),
    it->>'source_order_id'
  FROM jsonb_array_elements(p_items) AS it
  ON CONFLICT (order_id, (COALESCE(sku, '')), (regexp_replace(lower(COALESCE(variacao, '')), '\s+', '', 'g')))
  DO NOTHING
  RETURNING public.order_items.*;
$function$;

COMMENT ON FUNCTION public.insert_order_items_safe IS 'Insere order_items em lote via ON CONFLICT DO NOTHING (índice order_items_dedup_uidx) — fecha a corrida entre webhooks quase simultâneos pro mesmo pedido (Fase 39, 2026-09-02). Só devolve as linhas realmente inseridas.';
