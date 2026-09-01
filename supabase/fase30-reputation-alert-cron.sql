-- Fase 30 — Alerta preventivo de reputação ML, 1x/dia via cron do
-- Postgres. A function `ml-reputation-check` já lida com toda a lógica
-- (checar taxa de cancelamento, decidir se alerta, evitar repetir em
-- menos de 24h) — esse SQL só agenda a chamada dela.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove agendamento antigo do mesmo nome, se existir (permite rodar
-- este arquivo de novo sem duplicar o job).
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'ml-reputation-check-diario';

SELECT cron.schedule(
  'ml-reputation-check-diario',
  '0 11 * * *', -- todo dia às 11h UTC (~8h de Brasília)
  $$
  SELECT net.http_post(
    url := 'https://lcybmdiqxmbqeuyeuhdj.supabase.co/functions/v1/ml-reputation-check',
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  $$
);
