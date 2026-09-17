-- ================================================================
-- CoisaPet — Fase 60: Manuais/instruções/vídeo por produto (/doc/:slug)
-- ================================================================
-- Execute no SQL Editor do Supabase (ou supabase db query --linked --file).
--
-- Contexto (ver coisapet.md): Raphael quer subir manual de montagem,
-- instruções de uso e link de vídeo de montagem por produto, acessível
-- em coisapet.com.br/doc/<slug-do-produto> — cadastrado na mão no painel
-- interno, mesmo padrão que já existe pra bio_links. Usa o slug que já
-- existe em `products` (não precisa de coluna nova pra isso).
-- ================================================================

CREATE TABLE IF NOT EXISTS public.product_doc_resources (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id  UUID        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  label       TEXT        NOT NULL,
  kind        TEXT        NOT NULL CHECK (kind IN ('link','file')),
  url         TEXT,
  file_path   TEXT,
  sort_order  INT         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS product_doc_resources_product_id_idx
  ON public.product_doc_resources (product_id);

COMMENT ON TABLE public.product_doc_resources IS 'Manual/instruções/vídeo por produto — página pública em coisapet.com.br/doc/<products.slug>. kind=link usa `url` (ex: YouTube), kind=file usa `file_path` (bucket product-docs, .html ou .pdf).';

ALTER TABLE public.product_doc_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_acessa_product_doc_resources"
  ON public.product_doc_resources FOR ALL
  TO anon USING (true) WITH CHECK (true);

-- Bucket pros arquivos de manual (.html ou .pdf) — público, igual
-- product-photos/product-videos.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('product-docs', 'product-docs', true, 10485760, ARRAY['text/html','application/pdf'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "anon_product_docs_insert"
  ON storage.objects FOR INSERT TO anon
  WITH CHECK (bucket_id = 'product-docs');

CREATE POLICY "anon_product_docs_select"
  ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'product-docs');

CREATE POLICY "anon_product_docs_delete"
  ON storage.objects FOR DELETE TO anon
  USING (bucket_id = 'product-docs');
