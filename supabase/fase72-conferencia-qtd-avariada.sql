-- Fase 72 (25/09) — separa "quantidade recebida" de "quantidade avariada"
-- na conferência (antes era só um toggle ok/avariado no item inteiro).
-- Só a diferença (recebido - avariado) vira estoque de verdade.
alter table material_order_items add column if not exists qty_damaged numeric(10,3) not null default 0;
alter table material_order_occurrences add column if not exists qty_damaged numeric(10,3);
