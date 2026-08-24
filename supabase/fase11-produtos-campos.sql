-- ================================================================
-- CoisaPet — Fase 11: Campos extras na tabela de produtos
-- ================================================================
-- Execute no SQL Editor do Supabase ANTES de reimportar os produtos
-- ================================================================

-- ── 1. Novos campos na tabela products ──────────────────────────
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS price_shopee  NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS price_ml      NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS description   TEXT,
  ADD COLUMN IF NOT EXISTS photo_url     TEXT;

-- Renomeia sale_price para price_base (preço base / padrão)
-- mas mantém o alias para não quebrar código existente
-- Mantemos sale_price como está e usamos os novos campos adicionalmente

COMMENT ON COLUMN public.products.sale_price   IS 'Preço base / padrão de referência';
COMMENT ON COLUMN public.products.price_shopee IS 'Preço de venda na Shopee';
COMMENT ON COLUMN public.products.price_ml     IS 'Preço de venda no Mercado Livre';
COMMENT ON COLUMN public.products.description  IS 'Descrição completa do produto (pode ser copiada das plataformas)';
COMMENT ON COLUMN public.products.photo_url    IS 'Caminho da foto principal no Storage (bucket: product-photos)';

-- ── 2. Bucket de fotos de produtos no Storage ────────────────────
-- Execute no painel: Storage → New bucket → "product-photos" → public: false
-- Ou rode este insert se quiser via SQL (pode ignorar erro se já existir):
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-photos',
  'product-photos',
  false,
  10485760, -- 10 MB
  ARRAY['image/jpeg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Policy de acesso ao bucket (anon key lê e escreve — igual ao bill-attachments)
DROP POLICY IF EXISTS "anon_product_photos_select" ON storage.objects;
DROP POLICY IF EXISTS "anon_product_photos_insert" ON storage.objects;
DROP POLICY IF EXISTS "anon_product_photos_delete" ON storage.objects;

CREATE POLICY "anon_product_photos_select"
  ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'product-photos');

CREATE POLICY "anon_product_photos_insert"
  ON storage.objects FOR INSERT TO anon
  WITH CHECK (bucket_id = 'product-photos');

CREATE POLICY "anon_product_photos_delete"
  ON storage.objects FOR DELETE TO anon
  USING (bucket_id = 'product-photos');

-- ── 3. Confirma ──────────────────────────────────────────────────
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'products'
  AND table_schema = 'public'
ORDER BY ordinal_position;
