-- Fase 76 (26/09) — quem fez a última alteração no pedido de matéria-prima
-- (o "quando" já é updated_at). Mostrado no card como "Última atualização".
alter table material_orders add column if not exists updated_by uuid references system_users(id) on delete set null;
