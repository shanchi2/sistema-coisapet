-- ================================================================
-- CoisaPet — Fase 10: Ficha Técnica de Produtos (Bill of Materials)
-- ================================================================
-- Execute no SQL Editor do Supabase
-- ================================================================

CREATE TABLE IF NOT EXISTS public.bill_of_materials (
  id              UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id      UUID          NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  raw_material_id UUID          NOT NULL REFERENCES public.raw_materials(id) ON DELETE CASCADE,
  qty_required    NUMERIC(10,4) NOT NULL,
  -- quantidade do insumo necessária para fabricar 1 unidade do produto
  -- Ex: 2.5 = 2,5 chapas MDF por terrário
  notes           TEXT,
  -- observação livre por item (ex: "medida específica", "pode variar")
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- Não permite duplicar o mesmo insumo na ficha técnica do mesmo produto
  CONSTRAINT bom_unique_product_material UNIQUE (product_id, raw_material_id)
);

COMMENT ON TABLE  public.bill_of_materials              IS 'Ficha técnica dos produtos — insumos necessários para fabricar 1 unidade';
COMMENT ON COLUMN public.bill_of_materials.qty_required IS 'Quantidade do insumo por unidade produzida. Decimais aceitos: 0.5, 2.5, etc.';

-- Índices
CREATE INDEX IF NOT EXISTS idx_bom_product      ON public.bill_of_materials(product_id);
CREATE INDEX IF NOT EXISTS idx_bom_raw_material ON public.bill_of_materials(raw_material_id);

CREATE TRIGGER set_bom_updated_at
  BEFORE UPDATE ON public.bill_of_materials
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Permissões
GRANT ALL ON public.bill_of_materials TO anon;


-- ────────────────────────────────────────────────────────────────
-- VIEW: capacidade produtiva por produto
-- "Com o estoque atual, quantas unidades consigo fabricar?"
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.production_capacity AS
SELECT
  p.id            AS product_id,
  p.name          AS product_name,
  p.sku,
  -- Capacidade = mínimo entre todos os insumos da ficha técnica
  -- (o gargalo é o insumo que acaba primeiro)
  MIN(
    CASE
      WHEN b.qty_required > 0 THEN FLOOR(rm.stock_qty / b.qty_required)
      ELSE NULL
    END
  )               AS can_produce,
  -- Quantidade de insumos na ficha técnica
  COUNT(b.id)     AS bom_items
FROM public.products p
LEFT JOIN public.bill_of_materials b  ON b.product_id      = p.id
LEFT JOIN public.raw_materials     rm ON rm.id             = b.raw_material_id
WHERE p.active = true
GROUP BY p.id, p.name, p.sku;

COMMENT ON VIEW public.production_capacity IS
  'Capacidade de produção por produto com base no estoque atual de insumos';

GRANT SELECT ON public.production_capacity TO anon;
