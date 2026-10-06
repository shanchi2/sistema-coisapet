-- ================================================================
-- CoisaPet — Fase 94: Shopee vai pro picklist NO DIA DO PRAZO dela
-- ================================================================
-- Decisão do Raphael (06/10): pedido Shopee entra no picklist no dia do
-- "Enviar até" da própria Shopee (opção 2), não mais no 1º dia útil pelo
-- corte das 13h. Ex.: comprado dom 04/10 12h com prazo ter 06/10 → antes
-- ia pra seg 05, agora vai pra ter 06. Mesmo comportamento do ML.
--
-- - Prazo em sábado/domingo (raríssimo: 2 de ~1.500 pedidos em 60 dias)
--   VOLTA pra sexta — ir pra segunda seria enviar atrasado. Nunca antes
--   do dia da compra.
-- - Sem prazo (ex.: planilha antiga): corte de horário como reserva.
-- - ML e manual: sem mudança.
-- Não é retroativo por si só: vale pra pedido novo (trigger no INSERT) e
-- pros recálculos (botão "Atualizar pedidos"/cron), que só mexem em pedido
-- sem nada separado e nunca jogam pra antes de hoje.
-- ================================================================

CREATE OR REPLACE FUNCTION public.compute_ship_date(p_source text, p_data_venda timestamp with time zone, p_shipping_deadline date)
 RETURNS date
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_cutoff INTEGER;
  v_local  TIMESTAMP;
  v_date   DATE;
  v_sale   DATE;
BEGIN
  IF p_source = 'manual' THEN
    RETURN (COALESCE(p_data_venda, NOW()) AT TIME ZONE 'America/Sao_Paulo')::DATE;
  END IF;

  v_local := COALESCE(p_data_venda, NOW()) AT TIME ZONE 'America/Sao_Paulo';
  v_sale  := v_local::DATE;

  -- Shopee com prazo: vale o prazo dela (fase94). Fim de semana volta pra
  -- sexta, mas nunca antes do dia da compra.
  IF p_source = 'shopee' AND p_shipping_deadline IS NOT NULL THEN
    v_date := CASE EXTRACT(DOW FROM p_shipping_deadline)
                WHEN 6 THEN p_shipping_deadline - 1
                WHEN 0 THEN p_shipping_deadline - 2
                ELSE p_shipping_deadline END;
    RETURN GREATEST(v_date, v_sale);
  END IF;

  -- Reserva: dia pelo corte de horário (Brasília), fim de semana → segunda
  SELECT cutoff_hour INTO v_cutoff FROM public.platform_cutoff_settings WHERE source = p_source;
  v_cutoff := COALESCE(v_cutoff, CASE WHEN p_source = 'shopee' THEN 13 ELSE 11 END);
  v_date := CASE WHEN EXTRACT(HOUR FROM v_local) >= v_cutoff THEN (v_sale + 1) ELSE v_sale END;
  v_date := CASE EXTRACT(DOW FROM v_date) WHEN 6 THEN v_date + 2 WHEN 0 THEN v_date + 1 ELSE v_date END;

  IF p_source = 'shopee' THEN
    RETURN v_date;
  END IF;

  -- ML: prazo real do shipment (lead_time.buffering.date) quando existe;
  -- corte de horário só como reserva. Fim de semana → segunda.
  IF p_shipping_deadline IS NOT NULL THEN
    v_date := p_shipping_deadline;
    v_date := CASE EXTRACT(DOW FROM v_date) WHEN 6 THEN v_date + 2 WHEN 0 THEN v_date + 1 ELSE v_date END;
  END IF;
  RETURN v_date;
END;
$function$;
