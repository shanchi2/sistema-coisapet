-- fase129: corrige o "Faturamento histórico" nos meses vindos da API.
-- Antes a Shopee vinha da marketplace_finance, que só tem os repasses já
-- liberados (faltavam ~200 pedidos de set/26). Agora:
--   Shopee → pedidos (orders + order_items): qtd × preço dos pedidos não cancelados
--   ML     → pagamentos aprovados (marketplace_finance), sem rejeitados/cancelados/devolvidos
-- Só a partir de jul/2026 (antes disso há uma importação antiga de planilha de teste).
-- `partial` = o registro do mês começou depois do dia 2 (sistema começou a puxar no meio do mês).

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
        SELECT 'shopee' AS platform, date_trunc('month', o.data_venda AT TIME ZONE 'America/Sao_Paulo') AS m,
               sum(i.qty * i.preco_unit) AS gross, count(DISTINCT o.id) AS orders,
               min(extract(day FROM o.data_venda AT TIME ZONE 'America/Sao_Paulo'))::int AS from_day
        FROM orders o JOIN order_items i ON i.order_id = o.id
        WHERE o.source = 'shopee' AND o.data_venda >= '2026-07-01'
          AND coalesce(o.marketplace_status, '') <> 'CANCELLED' AND coalesce(o.status_ml, '') <> 'Cancelado'
        GROUP BY 2
        UNION ALL
        SELECT 'ml', date_trunc('month', sale_at AT TIME ZONE 'America/Sao_Paulo'),
               sum(gross), count(*), min(extract(day FROM sale_at AT TIME ZONE 'America/Sao_Paulo'))::int
        FROM marketplace_finance
        WHERE platform = 'ml' AND status = 'approved' AND sale_at >= '2026-07-01'
        GROUP BY 2
      ) s), '[]'::jsonb)
  );
END $$;
