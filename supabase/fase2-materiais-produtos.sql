-- ================================================================
-- CoisaPet — Fase 2: Matéria-Prima e Produtos
-- ================================================================
-- Execute no SQL Editor do Supabase após o setup.sql da Fase 1
-- ================================================================


-- ────────────────────────────────────────────────────────────────
-- 1. CATEGORIAS DE MATÉRIA-PRIMA
-- ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.raw_material_categories (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT        NOT NULL,
  color      TEXT        NOT NULL DEFAULT '#94A3B8',
  -- cor hex usada para identificar visualmente a categoria
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.raw_material_categories IS 'Categorias de matéria-prima (ex: MDF, Ferragem, Acrílico)';

-- Trigger de updated_at
CREATE TRIGGER set_raw_material_categories_updated_at
  BEFORE UPDATE ON public.raw_material_categories
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- RLS
ALTER TABLE public.raw_material_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "autenticados_leem_categorias_mp"
  ON public.raw_material_categories FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "autenticados_gerenciam_categorias_mp"
  ON public.raw_material_categories FOR ALL
  TO authenticated USING (true) WITH CHECK (true);


-- ────────────────────────────────────────────────────────────────
-- 2. MATÉRIAS-PRIMAS
-- ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.raw_materials (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID        REFERENCES public.raw_material_categories(id) ON DELETE SET NULL,
  name        TEXT        NOT NULL,
  unit        TEXT        NOT NULL DEFAULT 'unidade',
  -- unidade de medida: chapa, peça, kg, metro, litro, unidade, rolo
  unit_cost   NUMERIC(10,2) NOT NULL DEFAULT 0,
  -- custo por unidade (R$)
  stock_qty   NUMERIC(10,3) NOT NULL DEFAULT 0,
  -- quantidade atual em estoque
  stock_min   NUMERIC(10,3) NOT NULL DEFAULT 0,
  -- quantidade mínima (abaixo disso = alerta)
  supplier    TEXT,
  notes       TEXT,
  active      BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.raw_materials            IS 'Cadastro de matérias-primas e insumos';
COMMENT ON COLUMN public.raw_materials.unit       IS 'chapa | peça | kg | metro | litro | unidade | rolo';
COMMENT ON COLUMN public.raw_materials.stock_qty  IS 'Quantidade atual em estoque (atualizada pelas movimentações)';
COMMENT ON COLUMN public.raw_materials.stock_min  IS 'Estoque mínimo — abaixo desse valor o sistema emite alerta';

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_raw_materials_category ON public.raw_materials(category_id);
CREATE INDEX IF NOT EXISTS idx_raw_materials_active   ON public.raw_materials(active);

-- Trigger de updated_at
CREATE TRIGGER set_raw_materials_updated_at
  BEFORE UPDATE ON public.raw_materials
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- RLS
ALTER TABLE public.raw_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "autenticados_leem_materiais"
  ON public.raw_materials FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "autenticados_gerenciam_materiais"
  ON public.raw_materials FOR ALL
  TO authenticated USING (true) WITH CHECK (true);


-- ────────────────────────────────────────────────────────────────
-- 3. MOVIMENTAÇÕES DE MATÉRIA-PRIMA
-- Rastreia toda entrada e saída de insumos do estoque
-- ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.raw_material_movements (
  id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  raw_material_id UUID        NOT NULL REFERENCES public.raw_materials(id) ON DELETE CASCADE,
  type            TEXT        NOT NULL,
  -- 'entrada' = compra/reposição | 'saida' = consumo | 'ajuste' = correção manual
  qty             NUMERIC(10,3) NOT NULL,
  -- quantidade movimentada (positivo para entrada, negativo aceito para ajuste)
  reason          TEXT,
  -- motivo/observação (ex: "Compra NF 123", "Consumo pedido #45")
  reference_id    UUID,
  -- ID do pedido ou ordem de produção que gerou esta movimentação (opcional)
  created_by      UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT movements_type_check
    CHECK (type IN ('entrada', 'saida', 'ajuste'))
);

COMMENT ON TABLE public.raw_material_movements IS 'Rastreamento de entradas e saídas de matérias-primas';

-- Índice
CREATE INDEX IF NOT EXISTS idx_movements_material ON public.raw_material_movements(raw_material_id);
CREATE INDEX IF NOT EXISTS idx_movements_created  ON public.raw_material_movements(created_at DESC);

-- RLS
ALTER TABLE public.raw_material_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "autenticados_leem_movimentacoes"
  ON public.raw_material_movements FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "autenticados_inserem_movimentacoes"
  ON public.raw_material_movements FOR INSERT
  TO authenticated WITH CHECK (true);


-- ────────────────────────────────────────────────────────────────
-- 4. FUNÇÃO: atualiza stock_qty automaticamente após movimentação
-- Toda vez que uma movimentação é inserida, o estoque é recalculado
-- ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_stock_movement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.type = 'entrada' THEN
    UPDATE public.raw_materials
    SET stock_qty = stock_qty + NEW.qty
    WHERE id = NEW.raw_material_id;

  ELSIF NEW.type = 'saida' THEN
    UPDATE public.raw_materials
    SET stock_qty = stock_qty - NEW.qty
    WHERE id = NEW.raw_material_id;

  ELSIF NEW.type = 'ajuste' THEN
    -- Para ajuste, qty é o novo valor absoluto do estoque
    UPDATE public.raw_materials
    SET stock_qty = NEW.qty
    WHERE id = NEW.raw_material_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_stock_movement
  AFTER INSERT ON public.raw_material_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_stock_movement();


-- ────────────────────────────────────────────────────────────────
-- 5. CATEGORIAS DE PRODUTO
-- ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.product_categories (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT        NOT NULL,
  color      TEXT        NOT NULL DEFAULT '#94A3B8',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.product_categories IS 'Categorias de produtos (ex: Terrário, Acessório, Kit)';

-- Trigger de updated_at
CREATE TRIGGER set_product_categories_updated_at
  BEFORE UPDATE ON public.product_categories
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- RLS
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "autenticados_leem_categorias_prod"
  ON public.product_categories FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "autenticados_gerenciam_categorias_prod"
  ON public.product_categories FOR ALL
  TO authenticated USING (true) WITH CHECK (true);


-- ────────────────────────────────────────────────────────────────
-- 6. PRODUTOS
-- ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.products (
  id          UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID          REFERENCES public.product_categories(id) ON DELETE SET NULL,
  name        TEXT          NOT NULL,
  sku         TEXT          UNIQUE,
  -- código interno do produto (ex: TER-HAM-G)
  sale_price  NUMERIC(10,2) NOT NULL DEFAULT 0,
  image_url   TEXT,
  notes       TEXT,
  active      BOOLEAN       NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.products         IS 'Produtos finais fabricados pela CoisaPet';
COMMENT ON COLUMN public.products.sku     IS 'Código interno único do produto (ex: TER-HAM-G)';

-- Índices
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_active   ON public.products(active);

-- Trigger de updated_at
CREATE TRIGGER set_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- RLS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "autenticados_leem_produtos"
  ON public.products FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "autenticados_gerenciam_produtos"
  ON public.products FOR ALL
  TO authenticated USING (true) WITH CHECK (true);


-- ────────────────────────────────────────────────────────────────
-- 7. DADOS INICIAIS — Categorias de matéria-prima
-- Exemplos prontos para a CoisaPet começar a usar
-- ────────────────────────────────────────────────────────────────

INSERT INTO public.raw_material_categories (name, color) VALUES
  ('MDF',        '#F59E0B'),  -- âmbar
  ('Acrílico',   '#0EA5E9'),  -- azul céu
  ('Ferragem',   '#6B7280'),  -- cinza
  ('Acabamento', '#8B5CF6'),  -- roxo
  ('Embalagem',  '#10B981')   -- verde
ON CONFLICT DO NOTHING;


-- ────────────────────────────────────────────────────────────────
-- 8. DADOS INICIAIS — Categorias de produto
-- ────────────────────────────────────────────────────────────────

INSERT INTO public.product_categories (name, color) VALUES
  ('Terrário',   '#F43F5E'),  -- rosa
  ('Acessório',  '#F59E0B'),  -- âmbar
  ('Kit',        '#0EA5E9')   -- azul
ON CONFLICT DO NOTHING;


-- ────────────────────────────────────────────────────────────────
-- PRÓXIMA FASE — Ficha Técnica (Fase 3)
-- A tabela bill_of_materials virá na próxima etapa,
-- ligando products ↔ raw_materials com qty_required
-- ────────────────────────────────────────────────────────────────
