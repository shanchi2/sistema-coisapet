-- Fase 73 (26/09) — nome do pedido de matéria-prima, escolhido na hora
-- de montar o pedido. Vira a descrição da conta quando o César clica em
-- "Registrar no Financeiro" (ver MaterialOrdersPage.billPrefill).
alter table material_orders add column if not exists title text;
