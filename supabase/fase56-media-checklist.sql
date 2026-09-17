-- ================================================================
-- CoisaPet — Fase 56: Checklist de 9 fotos + 1 vídeo por produto
-- ================================================================
-- Execute no SQL Editor do Supabase (ou supabase db query --linked --file).
--
-- Contexto (ver coisapet.md): substitui o modelo de status manual
-- (vídeo/foto/previsão/status geral) do módulo "Controle de Atualização
-- dos Produtos" por um checklist padrão de 9 fotos (guia visual) + 1
-- vídeo de 10s por produto/variação, com upload real (não só status).
-- Reaproveita `product_images` (galeria já usada em ProductFormModal)
-- pros 9 checks — assim os uploads da Isa já viram a galeria oficial do
-- produto, pronta pro site ler no futuro.
-- ================================================================

-- 1) product_images: marca qual foto corresponde a qual check do guia.
--    NULL = foto solta da galeria (cadastro manual em ProductFormModal),
--    continua funcionando exatamente como antes.
ALTER TABLE public.product_images
  ADD COLUMN IF NOT EXISTS check_slot SMALLINT CHECK (check_slot BETWEEN 1 AND 9);

CREATE UNIQUE INDEX IF NOT EXISTS product_images_product_check_slot_uq
  ON public.product_images (product_id, check_slot)
  WHERE check_slot IS NOT NULL;

COMMENT ON COLUMN public.product_images.check_slot IS 'Qual dos 9 checks do guia de fotos essa imagem preenche (1-9). NULL = foto solta da galeria, fora do checklist.';

-- 2) product_media_status: sai o status manual antigo, entra o vídeo.
ALTER TABLE public.product_media_status
  DROP COLUMN IF EXISTS video_status,
  DROP COLUMN IF EXISTS photo_status,
  DROP COLUMN IF EXISTS video_forecast,
  DROP COLUMN IF EXISTS overall_status,
  ADD COLUMN IF NOT EXISTS video_url TEXT,
  ADD COLUMN IF NOT EXISTS video_uploaded_at TIMESTAMPTZ;

COMMENT ON TABLE public.product_media_status IS 'Vídeo (10s) + feedback de montagem + observações por produto. As 9 fotos do checklist ficam em product_images (check_slot 1-9), não aqui.';
COMMENT ON COLUMN public.product_media_status.video_url IS 'Path no bucket product-videos.';

-- 3) Bucket novo pros vídeos de 10s.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('product-videos', 'product-videos', true, 83886080, ARRAY['video/mp4','video/quicktime','video/webm'])
ON CONFLICT (id) DO NOTHING;

-- RLS do bucket — mesmo padrão de product-photos (app usa `anon` de
-- verdade, login é 100% custom via RPC, nunca sessão real do Supabase Auth).
CREATE POLICY "anon_product_videos_insert"
  ON storage.objects FOR INSERT TO anon
  WITH CHECK (bucket_id = 'product-videos');

CREATE POLICY "anon_product_videos_select"
  ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'product-videos');

CREATE POLICY "anon_product_videos_delete"
  ON storage.objects FOR DELETE TO anon
  USING (bucket_id = 'product-videos');
