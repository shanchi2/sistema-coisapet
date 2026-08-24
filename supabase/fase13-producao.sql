-- ================================================================
-- CoisaPet — Módulo de Produção / Esteira
-- ================================================================
-- Execute no SQL Editor do Supabase
-- ================================================================

-- ── 1. Lotes de produção ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.production_orders (
  id           UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date         DATE        NOT NULL DEFAULT CURRENT_DATE,
  source       TEXT        NOT NULL CHECK (source IN ('ml','shopee','manual')),
  notes        TEXT,
  status       TEXT        NOT NULL DEFAULT 'aberto'
                           CHECK (status IN ('aberto','em_andamento','concluido')),
  created_by   UUID        REFERENCES public.system_users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.production_orders IS 'Lotes de pedidos a produzir/embalar por dia e plataforma';

-- ── 2. Itens do lote ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.production_order_items (
  id               UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id         UUID        NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  product_id       UUID        REFERENCES public.products(id) ON DELETE SET NULL,
  product_name     TEXT        NOT NULL,  -- denormalizado
  sku              TEXT,
  qty_ordered      INTEGER     NOT NULL DEFAULT 1,
  -- Status da esteira
  status           TEXT        NOT NULL DEFAULT 'pendente'
                               CHECK (status IN (
                                 'pendente',      -- recém lançado
                                 'em_producao',   -- está sendo fabricado
                                 'embalagem',     -- pronto, aguardando embalagem
                                 'pronto',        -- embalado, pronto para expedição
                                 'enviado'        -- saiu para entrega
                               )),
  -- Tem estoque disponível?
  has_stock        BOOLEAN     NOT NULL DEFAULT false,
  -- Baixa de estoque confirmada pelo funcionário?
  stock_confirmed  BOOLEAN     NOT NULL DEFAULT false,
  -- Timestamps de cada transição
  started_at       TIMESTAMPTZ,  -- pendente → em_producao
  packed_at        TIMESTAMPTZ,  -- em_producao → embalagem
  ready_at         TIMESTAMPTZ,  -- embalagem → pronto
  shipped_at       TIMESTAMPTZ,  -- pronto → enviado
  -- Notas do funcionário
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.production_order_items IS 'Itens individuais de cada lote de produção';

-- Índices
CREATE INDEX IF NOT EXISTS idx_poi_order   ON public.production_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_poi_status  ON public.production_order_items(status);
CREATE INDEX IF NOT EXISTS idx_poi_product ON public.production_order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_po_date     ON public.production_orders(date DESC);

-- Permissões
GRANT ALL ON public.production_orders       TO anon;
GRANT ALL ON public.production_order_items  TO anon;

-- ── 3. Triggers de auditoria ─────────────────────────────────────
DROP TRIGGER IF EXISTS audit_production_orders      ON public.production_orders;
DROP TRIGGER IF EXISTS audit_production_order_items ON public.production_order_items;

CREATE TRIGGER audit_production_orders
  AFTER INSERT OR UPDATE OR DELETE ON public.production_orders
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_production_order_items
  AFTER INSERT OR UPDATE OR DELETE ON public.production_order_items
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- ── 4. Confirma ──────────────────────────────────────────────────
SELECT table_name, 'OK' as status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('production_orders','production_order_items')
ORDER BY table_name;
