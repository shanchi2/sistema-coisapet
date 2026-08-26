-- ================================================================
-- CoisaPet — Fase 20: ship_date único — fim dos 5 lugares que
-- decidiam "que dia esse pedido pertence"
-- ================================================================
-- Execute no SQL Editor do Supabase.
--
-- Contexto (ver coisapet.md): mesmo depois da correção do batch_id
-- (fase18), um pedido Shopee foi pro dia errado na Expedição porque o
-- dia era decidido em lugares DIFERENTES na hora de gravar (batch_id,
-- calculado pela data de compra) e na hora de mostrar (shipping_deadline,
-- filtrado à parte). Esta migração cria UM campo (orders.ship_date),
-- calculado uma única vez, nunca recalculado depois, com a regra escrita
-- uma vez só no banco (não em JS/TS) — cobre qualquer jeito de inserir
-- pedido (xlsx, webhook, manual) automaticamente via trigger.
--
-- Regra (confirmada com o Raphael):
--   ML:      corte configurável (default 11h Brasília) sobre data_venda
--   Shopee:  literalmente shipping_deadline (a "Data prevista de envio"
--            que a própria Shopee manda) — SEM corte de horário
--   manual:  dia da própria criação
-- ================================================================

-- ── 1. Corte de horário configurável (só ML usa por enquanto) ──────
CREATE TABLE IF NOT EXISTS public.platform_cutoff_settings (
  source      TEXT PRIMARY KEY CHECK (source IN ('ml', 'shopee', 'manual')),
  cutoff_hour INTEGER NOT NULL DEFAULT 11 CHECK (cutoff_hour BETWEEN 0 AND 23),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  UUID REFERENCES public.system_users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.platform_cutoff_settings IS 'Horário de corte por plataforma (só ML usa hoje — Shopee usa a própria data prevista de envio, sem corte). Editável na tela de Pedidos sem precisar de deploy. Mudança NÃO é retroativa — só afeta pedido novo daí pra frente.';

INSERT INTO public.platform_cutoff_settings (source, cutoff_hour)
VALUES ('ml', 11)
ON CONFLICT (source) DO NOTHING;

GRANT ALL ON public.platform_cutoff_settings TO anon;

-- ── 2. O campo único ────────────────────────────────────────────────
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS ship_date DATE;

COMMENT ON COLUMN public.orders.ship_date IS 'Dia de picklist/expedição — calculado UMA VEZ na criação do pedido (trigger set_ship_date_trigger), nunca recalculado depois. Fonte única de verdade pra "que dia esse pedido pertence" — todas as telas devem filtrar por este campo, não por batch_id nem por cálculo próprio.';

-- ── 3. A regra, escrita uma vez só ──────────────────────────────────
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
    -- Shopee manda a própria data prevista de envio — usa literal, sem
    -- corte de horário. Cai pra hoje só se vier vazio (arquivo sem essa coluna).
    RETURN COALESCE(p_shipping_deadline, (COALESCE(p_data_venda, NOW()) AT TIME ZONE 'America/Sao_Paulo')::DATE);
  END IF;

  IF p_source = 'manual' THEN
    RETURN (COALESCE(p_data_venda, NOW()) AT TIME ZONE 'America/Sao_Paulo')::DATE;
  END IF;

  -- ML (e qualquer source futura com corte por horário)
  SELECT cutoff_hour INTO v_cutoff FROM public.platform_cutoff_settings WHERE source = p_source;
  v_cutoff := COALESCE(v_cutoff, 11);
  v_local  := COALESCE(p_data_venda, NOW()) AT TIME ZONE 'America/Sao_Paulo';

  RETURN CASE
    WHEN EXTRACT(HOUR FROM v_local) >= v_cutoff THEN (v_local::DATE + 1)
    ELSE v_local::DATE
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_ship_date(TEXT, TIMESTAMPTZ, DATE) TO anon;

-- ── 4. Trigger — preenche sozinho em todo INSERT, sem precisar que o
--    código lembre de calcular nada (cobre upsert_orders_safe E
--    createManualOrder, de graça) ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_ship_date_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.ship_date IS NULL THEN
    NEW.ship_date := public.compute_ship_date(NEW.source, NEW.data_venda, NEW.shipping_deadline);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_ship_date ON public.orders;
CREATE TRIGGER trg_set_ship_date
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_ship_date_trigger();

-- ── 5. Backfill — todo pedido existente ganha ship_date calculado pela
--    PRÓPRIA data real (nunca "agora") ──────────────────────────────
UPDATE public.orders o
SET ship_date = public.compute_ship_date(o.source, COALESCE(o.data_venda, o.created_at), o.shipping_deadline)
WHERE o.ship_date IS NULL;

-- ── 6. Trava NOT NULL só depois do backfill acima ───────────────────
ALTER TABLE public.orders ALTER COLUMN ship_date SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_ship_date        ON public.orders(ship_date);
CREATE INDEX IF NOT EXISTS idx_orders_source_ship_date ON public.orders(source, ship_date);

-- ── Confirma ──────────────────────────────────────────────────────
SELECT source, COUNT(*) AS pedidos, MIN(ship_date) AS menor, MAX(ship_date) AS maior
FROM public.orders
GROUP BY source
ORDER BY source;
