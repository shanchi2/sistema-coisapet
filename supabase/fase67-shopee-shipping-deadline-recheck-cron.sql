-- ================================================================
-- CoisaPet — Fase 67: reconferência automática de prazo de envio Shopee
-- (mesmo padrão do ml-shipping-deadline-recheck, Fase 34)
-- ================================================================
-- Execute no SQL Editor do Supabase.
--
-- Contexto (ver coisapet.md): Shopee agora tem app Live (18/09) e não
-- tinha nenhuma rede de segurança pra quando `ship_by_date` vem vazio
-- no push inicial — ficava com ship_date errado pra sempre. Este cron
-- fecha esse buraco, espelhando o do ML (fase34). Agendado 90 min
-- deslocado do horário do ML (`0 */3 * * *`) só pra não bater as duas
-- chamadas de API junto na mesma janela.
-- ================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'shopee-shipping-deadline-recheck-periodico';

SELECT cron.schedule(
  'shopee-shipping-deadline-recheck-periodico',
  '30 1,4,7,10,13,16,19,22 * * *', -- a cada 3h, deslocado 90min do cron do ML
  $$
  SELECT net.http_post(
    url := 'https://lcybmdiqxmbqeuyeuhdj.supabase.co/functions/v1/shopee-shipping-deadline-recheck',
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  $$
);
