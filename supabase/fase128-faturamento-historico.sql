-- fase128 — Faturamento histórico por CNPJ (23/10, pedido do Raphael)
--
-- Declarações/relatórios de faturamento do contador, mês a mês, de cada
-- CNPJ: CLARA ALVES ALVARENGA (45.945.141/0001-15) = Shopee e GABRIEL
-- SANCHES SPAGNUOLO LTDA (48.110.567/0001-47) = Mercado Livre. Base pro
-- estudo de crescimento (ano a ano, meses que mais vendem, sazonalidade).
-- R$ → SÓ DIRETORIA: tabela sem policy + revoke; leitura/gravação só pelas
-- funções abaixo, que conferem no banco se o token da sessão é de admin
-- (meeting_admin_name, fase119).
CREATE TABLE IF NOT EXISTS public.revenue_monthly (
  cnpj        text NOT NULL,
  company     text NOT NULL,
  platform    text NOT NULL CHECK (platform IN ('shopee', 'ml', 'outro')),
  month       date NOT NULL,                 -- 1º dia do mês
  amount      numeric(14,2) NOT NULL,
  source      text NOT NULL DEFAULT 'contador',
  doc         text,                          -- de qual declaração veio
  note        text,
  updated_by  text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cnpj, month)
);
ALTER TABLE public.revenue_monthly ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.revenue_monthly FROM anon, authenticated;

-- Lista tudo + vendas brutas por mês vindas da API (marketplace_finance),
-- pra comparar nos meses que ainda não têm declaração do contador.
CREATE OR REPLACE FUNCTION public.revenue_overview(p_token text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF public.meeting_admin_name(p_token) IS NULL THEN RAISE EXCEPTION 'Só a Diretoria vê o faturamento.'; END IF;
  RETURN jsonb_build_object(
    'rows', coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.month, r.platform) FROM revenue_monthly r), '[]'::jsonb),
    'api', coalesce((SELECT jsonb_agg(x ORDER BY x->>'month') FROM (
      SELECT jsonb_build_object('platform', platform,
               'month', to_char(date_trunc('month', sale_at AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM-01'),
               'gross', round(sum(gross), 2), 'orders', count(*)) x
      FROM marketplace_finance
      WHERE sale_at IS NOT NULL AND coalesce(status, '') NOT ILIKE '%cancel%'
      GROUP BY platform, date_trunc('month', sale_at AT TIME ZONE 'America/Sao_Paulo')) s), '[]'::jsonb)
  );
END $$;

-- Lança/corrige um mês (amount null = apaga o mês)
CREATE OR REPLACE FUNCTION public.revenue_upsert(p_token text, p_cnpj text, p_month date, p_amount numeric, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_name text; v_company text; v_platform text;
BEGIN
  v_name := public.meeting_admin_name(p_token);
  IF v_name IS NULL THEN RAISE EXCEPTION 'Só a Diretoria lança faturamento.'; END IF;
  IF p_cnpj = '45.945.141/0001-15' THEN v_company := 'CLARA ALVES ALVARENGA'; v_platform := 'shopee';
  ELSIF p_cnpj = '48.110.567/0001-47' THEN v_company := 'GABRIEL SANCHES SPAGNUOLO LTDA'; v_platform := 'ml';
  ELSE RAISE EXCEPTION 'CNPJ não cadastrado'; END IF;
  IF p_amount IS NULL THEN
    DELETE FROM revenue_monthly WHERE cnpj = p_cnpj AND month = date_trunc('month', p_month)::date;
  ELSE
    INSERT INTO revenue_monthly (cnpj, company, platform, month, amount, source, note, updated_by)
    VALUES (p_cnpj, v_company, v_platform, date_trunc('month', p_month)::date, p_amount, 'manual', nullif(trim(p_note), ''), v_name)
    ON CONFLICT (cnpj, month) DO UPDATE SET amount = excluded.amount, note = coalesce(excluded.note, revenue_monthly.note),
      source = 'manual', updated_by = v_name, updated_at = now();
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.revenue_overview(text) FROM public;
REVOKE ALL ON FUNCTION public.revenue_upsert(text, text, date, numeric, text) FROM public;
GRANT EXECUTE ON FUNCTION public.revenue_overview(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revenue_upsert(text, text, date, numeric, text) TO anon, authenticated;

-- Módulo (só admin; aparece no Controle de Acesso como "Admin")
INSERT INTO public.role_permissions (role, module, enabled)
SELECT r, 'faturamento-historico', false
FROM unnest(ARRAY['administrativo','atendimento','marketplace','producao']) AS r
WHERE NOT EXISTS (SELECT 1 FROM public.role_permissions WHERE role = r AND module = 'faturamento-historico');
