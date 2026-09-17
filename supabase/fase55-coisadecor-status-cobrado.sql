-- Fase 55: CoisaDecor — novo status de pagamento "cobrado"
-- Fica entre "em_aberto" e "parcial": cliente já foi cobrado, mas ainda
-- não começou a pagar (não confundir com "parcial", que já tem valor
-- pago > 0).

alter table coisadecor_orders drop constraint coisadecor_orders_payment_status_check;

alter table coisadecor_orders add constraint coisadecor_orders_payment_status_check
  check (payment_status = any (array['em_aberto'::text, 'cobrado'::text, 'parcial'::text, 'pago'::text]));
