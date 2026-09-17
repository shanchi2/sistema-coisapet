-- ================================================================
-- CoisaPet — Fase 63: Estoque real de produto (via Chapas) + Kits
-- ================================================================
-- Execute no SQL Editor do Supabase (ou supabase db query --linked --file).
--
-- Contexto (ver coisapet.md e plano em .claude/plans): reunião do
-- Raphael com a produção — lançar a produção de uma chapa deve somar
-- automaticamente ao estoque real dos produtos que ela rende (hoje não
-- existe nenhum número de estoque pra produto, só matéria-prima tem
-- `stock_qty`). E kits (ex: "Terrário com Acessórios") devem sair da
-- aba Produtos e ganhar módulo próprio, com disponibilidade sempre
-- CALCULADA a partir do estoque dos componentes (nunca um número
-- próprio armazenado).
--
-- IMPORTANTE — `products.is_kit` e a tabela `kit_items` JÁ EXISTEM em
-- produção (usadas por ProductFormModal.jsx) mas nunca foram
-- versionadas — os comandos abaixo pra elas são só formalização
-- (`IF NOT EXISTS`), sem alterar nada do que já funciona. Confirmado
-- por query direta: `products` e `kit_items` têm RLS DESLIGADO
-- (`relrowsecurity = false`, sem policy nenhuma) — por isso esta
-- migração NÃO liga RLS nelas (ligaria sem policy = quebra o acesso
-- anon que já funciona). As tabelas NOVAS abaixo seguem o padrão atual
-- do projeto: RLS ligado + policy explícita `TO anon`.
-- ================================================================

-- 1. Formaliza o que já existe em produção (sem mudar RLS/policies)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_kit BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.kit_items (
  id                    UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kit_product_id        UUID        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  component_product_id  UUID        NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  qty                   INTEGER     NOT NULL DEFAULT 1 CHECK (qty > 0),
  sort_order             INTEGER     NOT NULL DEFAULT 0,
  UNIQUE (kit_product_id, component_product_id)
);

COMMENT ON TABLE public.kit_items IS 'Composição de um kit (produto com is_kit=true) — quais produtos componentes e em que quantidade. Formalizado em 17/09 (já existia em produção desde antes, sem migração versionada).';

GRANT ALL ON public.kit_items TO anon;

-- 2. Estoque real de produto (novo — antes só existia pra matéria-prima)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock_qty INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.products.stock_qty IS 'Estoque real do produto (unidades prontas). Só é somado hoje pelo lançamento de produção de chapa (log_chapa_production) e por ajuste manual (adjust_product_stock) — venda (ML/Shopee/pedido interno) ainda NÃO desconta automaticamente (decisão do Raphael em 17/09, fica pra uma fase seguinte). Produtos com is_kit=true nunca usam este campo — disponibilidade de kit é sempre calculada (ver view kit_availability).';

-- 3. Disponibilidade de kit — mesma lógica de production_capacity
--    (fase10-ficha-tecnica.sql), só que aplicada a componentes de
--    PRODUTO (kit_items) em vez de matéria-prima (bill_of_materials).
CREATE OR REPLACE VIEW public.kit_availability AS
SELECT
  k.id          AS kit_product_id,
  k.name        AS kit_name,
  k.sku         AS kit_sku,
  MIN(FLOOR(comp.stock_qty::numeric / ki.qty)) AS available_qty,
  COUNT(ki.id)  AS component_count
FROM public.products k
JOIN public.kit_items ki   ON ki.kit_product_id = k.id
JOIN public.products   comp ON comp.id = ki.component_product_id
WHERE k.active = true AND k.is_kit = true
GROUP BY k.id, k.name, k.sku;

COMMENT ON VIEW public.kit_availability IS 'Quantas unidades de um kit dá pra montar agora, com base no estoque atual dos componentes (o gargalo é o componente que acaba primeiro) — nunca um número armazenado.';

GRANT SELECT ON public.kit_availability TO anon;

-- 4. Ledger de movimentação de estoque de produto — auditoria + base
--    pro "Movimentações"/relatório na tela.
CREATE TABLE public.product_stock_movements (
  id             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id     UUID        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity_delta INTEGER     NOT NULL,
  movement_type  TEXT        NOT NULL CHECK (movement_type IN ('chapa_production','manual_adjustment')),
  reference_id   UUID, -- chapa_production_entries.id quando movement_type='chapa_production'
  reason         TEXT,
  created_by     UUID        REFERENCES public.system_users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.product_stock_movements IS 'Histórico de toda alteração em products.stock_qty — origem (chapa ou ajuste manual), quem fez e quando.';

CREATE INDEX idx_stock_movements_product ON public.product_stock_movements(product_id, created_at DESC);

ALTER TABLE public.product_stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_acessa_stock_movements"
  ON public.product_stock_movements FOR ALL
  TO anon USING (true) WITH CHECK (true);

-- 5. Lançamento de produção de chapa — 1 linha = 1 evento real de corte
CREATE TABLE public.chapa_production_entries (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chapa_id   UUID        NOT NULL REFERENCES public.chapas(id) ON DELETE RESTRICT,
  multiplier INTEGER     NOT NULL DEFAULT 1 CHECK (multiplier > 0),
  notes      TEXT,
  created_by UUID        REFERENCES public.system_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.chapa_production_entries IS 'Cada vez que alguém lança "cortei essa chapa hoje" — multiplier = quantas vezes a receita da chapa foi cortada (ex: 2 = rendeu o dobro do cadastrado em chapa_items).';

ALTER TABLE public.chapa_production_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_acessa_chapa_production_entries"
  ON public.chapa_production_entries FOR ALL
  TO anon USING (true) WITH CHECK (true);

CREATE INDEX idx_chapa_production_entries_chapa ON public.chapa_production_entries(chapa_id, created_at DESC);

-- 6. RPC atômica — lança a produção, soma estoque de cada produto da
--    chapa e grava o movimento, tudo em 1 transação (nunca parcial).
CREATE OR REPLACE FUNCTION public.log_chapa_production(
  p_chapa_id   UUID,
  p_multiplier INT,
  p_notes      TEXT,
  p_user_id    UUID
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
    SELECT ci.product_id AS pid, ci.quantity * p_multiplier AS d
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

COMMENT ON FUNCTION public.log_chapa_production IS 'Lança 1 evento de produção de chapa: cria o registro do lançamento, soma stock_qty de cada produto da receita (quantity * multiplier) e grava o movimento — tudo atômico, nunca parcial.';

GRANT EXECUTE ON FUNCTION public.log_chapa_production TO anon;

-- 7. RPC de ajuste manual de estoque (correção de contagem, quebra etc.)
CREATE OR REPLACE FUNCTION public.adjust_product_stock(
  p_product_id UUID,
  p_delta      INT,
  p_reason     TEXT,
  p_user_id    UUID
)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  v_new INT;
BEGIN
  UPDATE public.products
  SET stock_qty = stock_qty + p_delta
  WHERE id = p_product_id
  RETURNING stock_qty INTO v_new;

  INSERT INTO public.product_stock_movements (product_id, quantity_delta, movement_type, reason, created_by)
    VALUES (p_product_id, p_delta, 'manual_adjustment', p_reason, p_user_id);

  RETURN v_new;
END;
$$;

COMMENT ON FUNCTION public.adjust_product_stock IS 'Ajuste manual de estoque de produto (correção de contagem, quebra, etc.) — soma/subtrai p_delta e grava o movimento pra auditoria.';

GRANT EXECUTE ON FUNCTION public.adjust_product_stock TO anon;
