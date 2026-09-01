-- ================================================================
-- CoisaPet — Fase 34: reconferência automática de prazo de envio ML
-- (pega sozinha a condição de corrida da Fase 31b/4ª parte)
-- ================================================================
-- Execute no SQL Editor do Supabase.
--
-- Contexto (ver coisapet.md, 2026-08-31 4ª parte): pedido ML de envio
-- complexo (volumoso/cross-docking) pode ter o prazo real
-- (shipment.lead_time.buffering.date) calculado pelo ML minutos/horas
-- DEPOIS da criação — nosso webhook processa quase em tempo real, então
-- às vezes `shipping_deadline` fica NULL e o ship_date cai no corte de
-- horário padrão (assume amanhã), mesmo quando o prazo real é bem mais
-- longe. `ship_date` só é calculado 1x (Fase 20), nunca recalculado
-- sozinho. Esse cron rechecha e corrige sozinho, sem depender de
-- alguém notar e reportar de novo.
-- ================================================================

-- ── 1. Marca quando um pedido já foi rechecado — evita ficar tentando
--    pra sempre pedido que genuinamente nunca teve prazo especial.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_deadline_checked_at TIMESTAMPTZ;
COMMENT ON COLUMN public.orders.shipping_deadline_checked_at IS 'Quando o cron ml-shipping-deadline-recheck rechecou esse pedido pela última vez (só roda 1x por pedido, entre 2h e 48h depois de criado). NULL = ainda não rechecado.';

-- ── 2. Agenda o cron — a cada 3h, cobre a janela de 2-48h sem
--    depender de rodar exatamente numa hora fixa.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'ml-shipping-deadline-recheck-periodico';

SELECT cron.schedule(
  'ml-shipping-deadline-recheck-periodico',
  '0 */3 * * *', -- a cada 3h
  $$
  SELECT net.http_post(
    url := 'https://lcybmdiqxmbqeuyeuhdj.supabase.co/functions/v1/ml-shipping-deadline-recheck',
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  $$
);
