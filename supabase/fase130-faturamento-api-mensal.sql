-- fase130: total mensal calculado direto nas plataformas (meses de 2026 antes
-- do sistema registrar tudo). Preenchido pela edge marketplace-finance
-- (action 'monthly'). revenue_overview usa esta tabela quando existe o mês;
-- senão cai no cálculo ao vivo da fase129.
CREATE TABLE IF NOT EXISTS public.revenue_api_monthly (
  platform    text NOT NULL CHECK (platform IN ('shopee', 'ml')),
  month       date NOT NULL,
  gross       numeric(14,2) NOT NULL,
  orders      int,
  detail      jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (platform, month)
);
ALTER TABLE public.revenue_api_monthly ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.revenue_api_monthly FROM anon, authenticated;

-- revenue_overview: mês calculado direto na plataforma (revenue_api_monthly)
-- tem prioridade; senão, o cálculo ao vivo da fase129.
CREATE OR REPLACE FUNCTION public.revenue_overview(p_token text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF public.meeting_admin_name(p_token) IS NULL THEN RAISE EXCEPTION 'Só a Diretoria vê o faturamento.'; END IF;
  RETURN jsonb_build_object(
    'rows', coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.month, r.platform) FROM revenue_monthly r), '[]'::jsonb),
    'api', coalesce((SELECT jsonb_agg(jsonb_build_object('platform', platform, 'month', to_char(m, 'YYYY-MM-01'),
              'gross', round(gross, 2), 'orders', orders, 'from_day', from_day,
              'partial', from_day > 2) ORDER BY m, platform)
      FROM (
        SELECT platform, month::timestamp AS m, gross, orders, 1 AS from_day FROM revenue_api_monthly
        UNION ALL
        SELECT * FROM (
          SELECT 'shopee' AS platform, date_trunc('month', o.data_venda AT TIME ZONE 'America/Sao_Paulo') AS m,
                 sum(i.qty * i.preco_unit) AS gross, count(DISTINCT o.id)::int AS orders,
                 min(extract(day FROM o.data_venda AT TIME ZONE 'America/Sao_Paulo'))::int AS from_day
          FROM orders o JOIN order_items i ON i.order_id = o.id
          WHERE o.source = 'shopee' AND o.data_venda >= '2026-07-01'
            AND coalesce(o.marketplace_status, '') <> 'CANCELLED' AND coalesce(o.status_ml, '') <> 'Cancelado'
          GROUP BY 2
          UNION ALL
          SELECT 'ml', date_trunc('month', sale_at AT TIME ZONE 'America/Sao_Paulo'),
                 sum(gross), count(*)::int, min(extract(day FROM sale_at AT TIME ZONE 'America/Sao_Paulo'))::int
          FROM marketplace_finance
          WHERE platform = 'ml' AND status = 'approved' AND sale_at >= '2026-07-01'
          GROUP BY 2
        ) live
        WHERE NOT EXISTS (SELECT 1 FROM revenue_api_monthly x WHERE x.platform = live.platform AND x.month = live.m::date)
      ) s), '[]'::jsonb)
  );
END $$;

-- Todo dia 2 (06:17 UTC), calcula o mês anterior inteiro nas duas plataformas.
SELECT cron.schedule('revenue-api-monthly', '17 6 2 * *', $cron$
  SELECT net.http_post(url := 'https://lcybmdiqxmbqeuyeuhdj.supabase.co/functions/v1/marketplace-finance',
    body := jsonb_build_object('action', 'monthly', 'platform', p,
      'month', to_char((now() AT TIME ZONE 'America/Sao_Paulo') - interval '1 month', 'YYYY-MM')),
    headers := '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds := 150000)
  FROM unnest(array['shopee', 'ml']) p
$cron$);
