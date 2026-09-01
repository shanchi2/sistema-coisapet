-- ================================================================
-- CoisaPet — Fase 31: ML não atende sábado/domingo — concentra
-- picklist do fim de semana inteiro na segunda-feira
-- ================================================================
-- Execute no SQL Editor do Supabase.
--
-- Contexto (ver coisapet.md): Raphael reportou 31/08 (segunda) que o
-- painel do ML mostrava 20 produtos pendentes de envio, mas o picklist
-- de hoje só tinha 13. Causa: compute_ship_date() (Fase 22) usa o
-- prazo real que a API do ML manda (shipment.lead_time.buffering.date)
-- sem nunca checar se esse prazo caía num sábado/domingo — e o mesmo
-- vale pro fallback por corte de horário. A CoisaPet não tem expediente
-- nem coleta do ML aos sábados/domingos (só a Shopee, com a regra dos
-- 20%+1) — qualquer prazo do ML que caia no fim de semana precisa virar
-- segunda-feira.
--
-- Confirmado direto no banco antes de aplicar: 4 pedidos com
-- ship_date=29/08 (sábado) e 10 com ship_date=30/08 (domingo), ativos
-- (archived=false), presos fora do picklist de hoje.
-- ================================================================

-- ── 1. compute_ship_date: ML nunca cai em sábado/domingo ────────────
-- Mesma função da Fase 22 (usa o prazo real da API quando disponível,
-- cai pro corte de horário quando não vem) — só acrescenta o passo
-- final: se o resultado cair em sáb/dom, rola pra segunda seguinte.
-- Shopee e manual continuam exatamente como estavam (Shopee já tem sua
-- própria regra de fim de semana, 20%+1, fora desta função).
CREATE OR REPLACE FUNCTION public.compute_ship_date(
  p_source TEXT,
  p_data_venda TIMESTAMPTZ,
  p_shipping_deadline DATE
) RETURNS DATE
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_cutoff INTEGER;
  v_local  TIMESTAMP;
  v_date   DATE;
BEGIN
  IF p_source = 'shopee' THEN
    RETURN COALESCE(p_shipping_deadline, (COALESCE(p_data_venda, NOW()) AT TIME ZONE 'America/Sao_Paulo')::DATE);
  END IF;

  IF p_source = 'manual' THEN
    RETURN (COALESCE(p_data_venda, NOW()) AT TIME ZONE 'America/Sao_Paulo')::DATE;
  END IF;

  -- ML: usa o prazo real do shipment (lead_time.buffering.date) quando
  -- disponível — só cai pro corte de horário quando não vier (ex: pedido
  -- importado por .xlsx, que não tem esse dado).
  IF p_shipping_deadline IS NOT NULL THEN
    v_date := p_shipping_deadline;
  ELSE
    SELECT cutoff_hour INTO v_cutoff FROM public.platform_cutoff_settings WHERE source = p_source;
    v_cutoff := COALESCE(v_cutoff, 11);
    v_local  := COALESCE(p_data_venda, NOW()) AT TIME ZONE 'America/Sao_Paulo';

    v_date := CASE
      WHEN EXTRACT(HOUR FROM v_local) >= v_cutoff THEN (v_local::DATE + 1)
      ELSE v_local::DATE
    END;
  END IF;

  -- ML não tem expediente/coleta aos sábados/domingos — qualquer prazo
  -- que caia num desses dias rola pra segunda-feira seguinte.
  RETURN CASE EXTRACT(DOW FROM v_date)
    WHEN 6 THEN v_date + 2  -- sábado -> segunda
    WHEN 0 THEN v_date + 1  -- domingo -> segunda
    ELSE v_date
  END;
END;
$$;

-- ── 2. Retroativo: move os pedidos ML já presos em sáb/dom pra segunda
-- Só ML, só ativos (archived=false) — Shopee e manual intocados.
UPDATE public.orders
SET ship_date = ship_date + (CASE EXTRACT(DOW FROM ship_date) WHEN 6 THEN 2 WHEN 0 THEN 1 END)
WHERE source = 'ml'
  AND archived = false
  AND EXTRACT(DOW FROM ship_date) IN (0, 6);

-- ── Confirma ──────────────────────────────────────────────────────
SELECT source, ship_date, is_full, COUNT(*) AS n_pedidos
FROM public.orders
WHERE source = 'ml' AND archived = false AND ship_date BETWEEN '2026-08-28' AND '2026-08-31'
GROUP BY 1, 2, 3
ORDER BY 2;
