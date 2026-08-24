-- ================================================================
-- CoisaPet — Fase 14: Tabelas de Pedidos e Histórico de Importação
-- ================================================================
-- Execute no SQL Editor do Supabase
-- ================================================================

-- ── 1. Lotes de importação (controle de cada upload) ─────────────
CREATE TABLE IF NOT EXISTS public.import_batches (
  id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source        TEXT        NOT NULL CHECK (source IN ('ml', 'shopee', 'manual')),
  filename      TEXT,                        -- nome do arquivo importado
  imported_by   UUID        REFERENCES public.system_users(id) ON DELETE SET NULL,
  imported_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_orders  INTEGER     NOT NULL DEFAULT 0,
  total_items   INTEGER     NOT NULL DEFAULT 0,
  notes         TEXT
);

COMMENT ON TABLE public.import_batches IS 'Registro de cada importação de pedidos (ML, Shopee, manual)';
GRANT ALL ON public.import_batches TO anon;

-- ── 2. Pedidos (cada pedido do ML / Shopee / manual) ─────────────
CREATE TABLE IF NOT EXISTS public.orders (
  id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id      UUID        REFERENCES public.import_batches(id) ON DELETE SET NULL,
  source        TEXT        NOT NULL CHECK (source IN ('ml', 'shopee', 'manual')),
  -- Dados do ML
  num_venda     TEXT,                        -- N.º de venda do ML
  data_venda    TIMESTAMPTZ,                 -- Data da venda
  status_ml     TEXT,                        -- Status do ML (A caminho, Entregue...)
  status_desc   TEXT,                        -- Descrição detalhada do status
  -- Comprador
  comprador     TEXT,
  cidade        TEXT,
  estado_uf     TEXT,
  cep           TEXT,
  -- Financeiro
  total_brl     NUMERIC(10,2),
  -- Rastreamento
  rastreio      TEXT,
  -- Pacote
  is_pacote     BOOLEAN     NOT NULL DEFAULT false,
  -- Timestamps internos
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.orders IS 'Pedidos de todas as plataformas (ML, Shopee, manual)';
GRANT ALL ON public.orders TO anon;

CREATE INDEX IF NOT EXISTS idx_orders_batch   ON public.orders(batch_id);
CREATE INDEX IF NOT EXISTS idx_orders_source  ON public.orders(source);
CREATE INDEX IF NOT EXISTS idx_orders_data    ON public.orders(data_venda DESC);
CREATE INDEX IF NOT EXISTS idx_orders_num     ON public.orders(num_venda);
CREATE INDEX IF NOT EXISTS idx_orders_comp    ON public.orders(comprador);

-- ── 3. Itens dos pedidos ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_items (
  id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id      UUID        NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  -- Produto
  product_id    UUID        REFERENCES public.products(id) ON DELETE SET NULL,
  titulo        TEXT        NOT NULL,        -- nome como veio da plataforma
  sku           TEXT,                        -- SKU da plataforma
  variacao      TEXT,                        -- variação do produto
  qty           INTEGER     NOT NULL DEFAULT 1,
  preco_unit    NUMERIC(10,2),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.order_items IS 'Itens individuais de cada pedido';
GRANT ALL ON public.order_items TO anon;

CREATE INDEX IF NOT EXISTS idx_oi_order    ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_oi_product  ON public.order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_oi_sku      ON public.order_items(sku);
CREATE INDEX IF NOT EXISTS idx_oi_titulo   ON public.order_items(titulo);

-- ── 4. Vinculação pedidos → lotes de produção ────────────────────
-- Quando um pedido gera um lote de produção, registramos aqui
ALTER TABLE public.production_orders
  ADD COLUMN IF NOT EXISTS import_batch_id UUID REFERENCES public.import_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';

-- ── 5. Triggers de auditoria ─────────────────────────────────────
DROP TRIGGER IF EXISTS audit_import_batches ON public.import_batches;
DROP TRIGGER IF EXISTS audit_orders         ON public.orders;
DROP TRIGGER IF EXISTS audit_order_items    ON public.order_items;

CREATE TRIGGER audit_import_batches
  AFTER INSERT OR UPDATE OR DELETE ON public.import_batches
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_orders
  AFTER INSERT OR UPDATE OR DELETE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_order_items
  AFTER INSERT OR UPDATE OR DELETE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- ── 6. View útil para relatórios ─────────────────────────────────
CREATE OR REPLACE VIEW public.orders_summary AS
SELECT
  o.id,
  o.source,
  o.num_venda,
  o.data_venda,
  o.status_ml,
  o.comprador,
  o.cidade,
  o.estado_uf,
  o.total_brl,
  o.is_pacote,
  o.created_at,
  COUNT(oi.id)       AS total_itens,
  SUM(oi.qty)        AS total_unidades,
  b.filename         AS arquivo_importado,
  b.imported_at      AS data_importacao
FROM public.orders o
LEFT JOIN public.order_items   oi ON oi.order_id = o.id
LEFT JOIN public.import_batches b  ON b.id = o.batch_id
GROUP BY o.id, b.filename, b.imported_at;

GRANT SELECT ON public.orders_summary TO anon;

-- ── 7. Confirma ──────────────────────────────────────────────────
SELECT table_name, 'OK' as status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('import_batches','orders','order_items')
ORDER BY table_name;
