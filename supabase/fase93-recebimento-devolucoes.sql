-- ================================================================
-- CoisaPet — Fase 93: Recebimento interno das devoluções Shopee
-- ================================================================
-- Pedido do Raphael (05/10): a produção registra o que CHEGOU de volta —
-- status interno ("devolvido perfeito = volta pro estoque", "com avaria
-- no transporte", "avaria causada pelo comprador"...), observação e
-- fotos/vídeos (obrigatórios quando tem avaria). É controle NOSSO: nada
-- disso vai pra Shopee. 1 linha por devolução (return_sn), com histórico
-- de quem mudou o quê.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.shopee_return_receipts (
  return_sn       TEXT        PRIMARY KEY,
  status          TEXT        NOT NULL DEFAULT 'aguardando'
                  CHECK (status IN ('aguardando','perfeito','avaria_transporte','avaria_comprador',
                                    'incompleto','produto_errado','nao_retornou')),
  notes           TEXT,
  media           JSONB       NOT NULL DEFAULT '[]'::jsonb,  -- [{path,url,type:'image'|'video',name,size,by,at}]
  restocked       BOOLEAN     NOT NULL DEFAULT false,        -- já voltou fisicamente pro estoque
  restocked_at    TIMESTAMPTZ,
  history         JSONB       NOT NULL DEFAULT '[]'::jsonb,  -- [{at,by,status,notes,restocked}]
  updated_by_name TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- App não usa sessão do Supabase Auth — policy TO anon (padrão fase88)
ALTER TABLE public.shopee_return_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shopee_return_receipts_all ON public.shopee_return_receipts;
CREATE POLICY shopee_return_receipts_all ON public.shopee_return_receipts
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Fotos e vídeos do recebimento (público pra exibir direto na tela; nome
-- do arquivo aleatório). 100 MB por arquivo pra caber vídeo de celular.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('return-receipts', 'return-receipts', true, 104857600,
        ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif','video/mp4','video/quicktime','video/webm'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS return_receipts_select ON storage.objects;
CREATE POLICY return_receipts_select ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'return-receipts');
DROP POLICY IF EXISTS return_receipts_insert ON storage.objects;
CREATE POLICY return_receipts_insert ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'return-receipts');
DROP POLICY IF EXISTS return_receipts_delete ON storage.objects;
CREATE POLICY return_receipts_delete ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = 'return-receipts');
