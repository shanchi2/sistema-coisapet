-- ================================================================
-- CoisaPet — Fase 52: Controle de Atualização de Mídia dos Produtos
-- ================================================================
-- Execute no SQL Editor do Supabase.
--
-- Contexto (ver coisapet.md): substitui a planilha "CONTROLE DE
-- ATUALIZAÇÃO DOS PRODUTOS" (vídeo/foto/feedback de montagem por
-- produto) — pedido do Raphael (09/09), acesso pro time de
-- Atendimento (edição completa, não só leitura).
--
-- Design: 1 linha OPCIONAL por produto — só existe depois que alguém
-- muda algum status pela primeira vez (a tela faz LEFT JOIN com
-- `products`, produto sem linha aqui aparece com os valores default
-- "Não iniciada" mesmo assim). Isso evita ter que popular ~550 linhas
-- na migração e manter isso sincronizado conforme produtos novos
-- entram/saem — o de sempre é o cadastro em `products`.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.product_media_status (
  id                UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id        UUID        NOT NULL UNIQUE REFERENCES public.products(id) ON DELETE CASCADE,

  video_status      TEXT        NOT NULL DEFAULT 'nao_iniciada' CHECK (video_status IN ('nao_iniciada','em_producao','atualizada','refazer')),
  photo_status      TEXT        NOT NULL DEFAULT 'nao_iniciada' CHECK (photo_status IN ('nao_iniciada','em_producao','atualizada','refazer')),
  video_forecast    DATE,

  feedback_montagem BOOLEAN,    -- NULL = ainda não avaliado, true = Sim, false = Não
  feedback_details  TEXT,
  observations      TEXT,

  overall_status    TEXT        NOT NULL DEFAULT 'pendente' CHECK (overall_status IN ('pendente','em_andamento','concluido','refazer')),

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.product_media_status IS 'Controle de atualização de vídeo/foto/feedback de montagem por produto — substitui a planilha manual. Status geral é preenchido na mão (não é calculado), por decisão do Raphael em 09/09.';

CREATE TRIGGER set_product_media_status_updated_at
  BEFORE UPDATE ON public.product_media_status
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- RLS — mesmo padrão de toda tabela nova nesse app (login 100% custom
-- via RPC, nunca sessão real do Supabase Auth — toda chamada sai como
-- `anon` de verdade).
ALTER TABLE public.product_media_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_acessa_product_media_status"
  ON public.product_media_status FOR ALL
  TO anon USING (true) WITH CHECK (true);

-- Libera o módulo pro Atendimento editar (admin já tem acesso total a
-- tudo por padrão, não precisa de linha aqui).
INSERT INTO public.role_permissions (role, module, enabled)
VALUES ('atendimento', 'controle-midia', true)
ON CONFLICT (role, module) DO UPDATE SET enabled = true;
