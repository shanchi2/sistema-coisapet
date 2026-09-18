-- ================================================================
-- CoisaPet — Fase 66: indicador visível de "dia corrigido sozinho"
-- ================================================================
-- Execute no SQL Editor do Supabase (ou supabase db query --linked --file).
--
-- Contexto (ver coisapet.md): o cron de recheck do ML (Fase 34) já
-- corrige ship_date sozinho quando o prazo real chega depois da
-- criação do pedido — mas isso só gera uma notificação solta, sem
-- nenhum indicador na própria tela de Picklist/Expedição. Do ponto de
-- vista de quem confere o picklist ao longo do turno, parece bug
-- fantasma (pedido muda de dia sem aviso visível). Mesmo problema vai
-- existir pro cron novo do Shopee (Fase 67). Estas 2 colunas dão pra
-- Expedição mostrar um badge (mesmo padrão visual já usado pra
-- needs_attention) só quando o dia de um pedido realmente mudou depois
-- de já ter sido mostrado.
-- ================================================================

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS day_auto_corrected BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS day_auto_corrected_note TEXT;

COMMENT ON COLUMN public.orders.day_auto_corrected IS 'true = o ship_date deste pedido foi corrigido automaticamente por um cron de recheck (ml-shipping-deadline-recheck ou shopee-shipping-deadline-recheck) depois de já ter sido calculado na criação — mostra badge na Expedição até alguém marcar como revisado.';
COMMENT ON COLUMN public.orders.day_auto_corrected_note IS 'Texto explicando a correção (dia antigo -> dia novo), mostrado no badge/detalhe. NULL quando day_auto_corrected=false.';
