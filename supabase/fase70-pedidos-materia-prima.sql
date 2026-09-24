-- Fase 70 — Pedidos de Matéria-Prima/Chapas + Conferência (25/09)
-- Pedido do irmão do Raphael: César (administrativo/compras) monta um
-- pedido de matéria-prima/chapas (chapas = raw_materials com
-- unit='chapa', já suportado, sem entidade nova) e registra no
-- Financeiro; João confere fisicamente o que chegou num tablet — só aí
-- o estoque sobe de verdade (não na hora do pedido), e se algo chegar
-- avariado, vira uma ocorrência com foto encaminhada pro César.

create table if not exists material_orders (
  id            uuid primary key default gen_random_uuid(),
  created_by    uuid references system_users(id) on delete set null,
  supplier_id   uuid references suppliers(id) on delete set null,
  status        text not null default 'pedido' check (status in ('pedido','conferido','cancelado')),
  notes         text,
  bill_id       uuid references bills(id) on delete set null,
  conferred_by  uuid references system_users(id) on delete set null,
  conferred_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists material_order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references material_orders(id) on delete cascade,
  raw_material_id  uuid not null references raw_materials(id) on delete restrict,
  qty_ordered      numeric(10,3) not null check (qty_ordered > 0),
  unit_price       numeric(10,2),
  qty_received     numeric(10,3),
  item_status      text not null default 'pendente' check (item_status in ('pendente','ok','avariado')),
  created_at       timestamptz not null default now()
);

create table if not exists material_order_occurrences (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references material_orders(id) on delete cascade,
  order_item_id  uuid not null references material_order_items(id) on delete cascade,
  description    text,
  status         text not null default 'aberto' check (status in ('aberto','resolvido')),
  reported_at    timestamptz not null default now(),
  resolved_at    timestamptz,
  resolved_by    uuid references system_users(id) on delete set null
);

create table if not exists material_order_occurrence_photos (
  id             uuid primary key default gen_random_uuid(),
  occurrence_id  uuid not null references material_order_occurrences(id) on delete cascade,
  storage_path   text not null,
  created_at     timestamptz not null default now()
);

create index if not exists idx_material_order_items_order on material_order_items(order_id);
create index if not exists idx_material_order_occurrences_order on material_order_occurrences(order_id);
create index if not exists idx_material_order_occurrence_photos_occ on material_order_occurrence_photos(occurrence_id);

-- RLS — app usa só chave anon (auth próprio via system_users/user_login),
-- nunca authenticated. Mesmo padrão de toda tabela nova do projeto.
alter table material_orders enable row level security;
alter table material_order_items enable row level security;
alter table material_order_occurrences enable row level security;
alter table material_order_occurrence_photos enable row level security;

create policy anon_all_material_orders on material_orders for all to anon using (true) with check (true);
create policy anon_all_material_order_items on material_order_items for all to anon using (true) with check (true);
create policy anon_all_material_order_occurrences on material_order_occurrences for all to anon using (true) with check (true);
create policy anon_all_material_order_occurrence_photos on material_order_occurrence_photos for all to anon using (true) with check (true);

-- Bucket de fotos das ocorrências — reaproveita o bucket já existente
-- purchase-attachments (mesmo usado por Compras/Compra da Lousa), só
-- com prefixo de path próprio (occurrences/{occurrence_id}/...), sem
-- precisar criar bucket nem policy nova.
