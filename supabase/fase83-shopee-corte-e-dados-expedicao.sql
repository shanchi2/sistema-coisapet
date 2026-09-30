-- Fase 83 (30/09/2026) — Expedição com mais dados + corte de horário da Shopee
--
-- 1) Dados extras do pedido pra Expedição (Carol):
--    - comprador_nome_img: nome REAL do destinatário na Shopee. A API só
--      entrega o nome como imagem PNG (anti-raspagem, mesmo dado usado pra
--      imprimir etiqueta própria — logistics/get_shipping_document_data_info).
--      Guardamos só o nome (data URL, ~3 KB). CPF/telefone/endereço NÃO são
--      guardados de propósito (LGPD — a expedição não precisa).
--    - buyer_message: mensagem do comprador pro vendedor (Shopee
--      message_to_seller) — é onde vem o nome da plaquinha, por exemplo.
--      Coluna separada porque upsert_orders_safe sobrescreve `notes`.
--    - shipping_carrier, ship_by_at (prazo exato com hora), days_to_ship,
--      marketplace_refreshed_at (última vez que o botão/cron atualizou).
-- 2) Corte de horário da Shopee (default 13h), igual ao do ML (11h):
--    pedido até o corte → sai hoje; depois → próximo dia útil. Se a
--    Shopee mandar um prazo bem mais longo que o normal (envio
--    programado / encomenda, days_to_ship alto), o prazo dela manda.
--    Nunca passa do prazo da Shopee. Sábado/domingo rolam pra segunda
--    (a Meta de Sábado continua funcionando em cima da segunda).
--    Não retroativo: só pedido novo, ou quando o botão "Atualizar
--    pedidos" / cron recalcula (e nunca joga pra antes de hoje).

alter table orders add column if not exists comprador_nome_img text;
alter table orders add column if not exists buyer_message text;
alter table orders add column if not exists shipping_carrier text;
alter table orders add column if not exists ship_by_at timestamptz;
alter table orders add column if not exists days_to_ship int;
alter table orders add column if not exists marketplace_refreshed_at timestamptz;

insert into platform_cutoff_settings (source, cutoff_hour, updated_at)
values ('shopee', 13, now())
on conflict (source) do nothing;

CREATE OR REPLACE FUNCTION public.compute_ship_date(p_source text, p_data_venda timestamp with time zone, p_shipping_deadline date)
 RETURNS date
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_cutoff INTEGER;
  v_local  TIMESTAMP;
  v_date   DATE;
BEGIN
  IF p_source = 'manual' THEN
    RETURN (COALESCE(p_data_venda, NOW()) AT TIME ZONE 'America/Sao_Paulo')::DATE;
  END IF;

  -- Dia pelo corte de horário (Brasília), já rolando fim de semana pra segunda
  SELECT cutoff_hour INTO v_cutoff FROM public.platform_cutoff_settings WHERE source = p_source;
  v_cutoff := COALESCE(v_cutoff, CASE WHEN p_source = 'shopee' THEN 13 ELSE 11 END);
  v_local  := COALESCE(p_data_venda, NOW()) AT TIME ZONE 'America/Sao_Paulo';
  v_date := CASE WHEN EXTRACT(HOUR FROM v_local) >= v_cutoff THEN (v_local::DATE + 1) ELSE v_local::DATE END;
  v_date := CASE EXTRACT(DOW FROM v_date) WHEN 6 THEN v_date + 2 WHEN 0 THEN v_date + 1 ELSE v_date END;

  IF p_source = 'shopee' THEN
    IF p_shipping_deadline IS NULL THEN RETURN v_date; END IF;
    -- Nunca depois do prazo da Shopee
    IF p_shipping_deadline <= v_date THEN RETURN p_shipping_deadline; END IF;
    -- Prazo bem mais longo que o normal (envio programado/encomenda): vale o prazo
    IF p_shipping_deadline - v_date > 2 THEN RETURN p_shipping_deadline; END IF;
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
