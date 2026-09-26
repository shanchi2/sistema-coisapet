-- Fase 75 (26/09) — previsão de entrega do pedido de matéria-prima.
-- Data pura (sem hora/fuso) — comparar sempre com todayISO() (dateBR.js).
alter table material_orders add column if not exists expected_delivery date;
