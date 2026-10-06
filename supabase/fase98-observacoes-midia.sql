-- ================================================================
-- Fase 98 (06/10/2026) — Atualização de Mídia: observações com fotos/vídeos
-- ================================================================
-- Pedido do Raphael: no campo de observação do produto (Atualização de
-- Mídia) poder anexar fotos e vídeos — ex.: "Isa relatou um vão entre a
-- plataforma e as escadas, projeto precisa ser revisado" — e o Vini
-- (usa o login producao@coisapet.com.br) precisa ver.
--
-- A observação vira um HISTÓRICO: cada relato é um registro com texto,
-- mídias, autor/data e status aberto/resolvido. O texto antigo
-- (product_media_status.observations) vira o 1º registro de cada produto.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.product_media_notes (
  id               UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id       UUID        NOT NULL,          -- products.id (sem FK: FK pelo MCP dá timeout)
  body             TEXT        NOT NULL DEFAULT '',
  media            JSONB       NOT NULL DEFAULT '[]'::jsonb,  -- [{ path, type: 'image'|'video', name }]
  status           TEXT        NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'resolvido')),
  resolved_at      TIMESTAMPTZ,
  resolved_by_name TEXT,
  created_by       UUID,
  created_by_name  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_product_media_notes_product ON public.product_media_notes(product_id, created_at DESC);

ALTER TABLE public.product_media_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "app_all_product_media_notes" ON public.product_media_notes;
CREATE POLICY "app_all_product_media_notes" ON public.product_media_notes
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Fotos/vídeos dos relatos (público pra exibir direto; nome aleatório). 100 MB/arquivo.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('media-notes', 'media-notes', true, 104857600,
        ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif','video/mp4','video/quicktime','video/webm'])
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS media_notes_select ON storage.objects;
CREATE POLICY media_notes_select ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'media-notes');
DROP POLICY IF EXISTS media_notes_insert ON storage.objects;
CREATE POLICY media_notes_insert ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'media-notes');
DROP POLICY IF EXISTS media_notes_delete ON storage.objects;
CREATE POLICY media_notes_delete ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = 'media-notes');

-- Texto antigo vira o 1º registro do histórico
INSERT INTO public.product_media_notes (product_id, body, created_by_name, created_at)
SELECT product_id, observations, 'Observação anterior', COALESCE(updated_at, NOW())
FROM public.product_media_status
WHERE COALESCE(TRIM(observations), '') <> ''
  AND NOT EXISTS (SELECT 1 FROM public.product_media_notes n WHERE n.product_id = product_media_status.product_id);

-- Produção (login do Vini) passa a ver o módulo Atualização de Mídia
INSERT INTO public.role_permissions (role, module, enabled)
VALUES ('producao', 'controle-midia', true)
ON CONFLICT DO NOTHING;
