-- Fase 74 (25/09) — acompanhamento das ocorrências da conferência de
-- matéria-prima + "finalização" do pedido com observação final.
-- Pedido do Raphael: hoje não dá pra saber qual foi a solução de um item
-- avariado ou de um item que veio faltando. Agora:
--   * ocorrência também pra divergência de quantidade (falta/excesso),
--     não só avaria;
--   * status intermediário "em andamento" + tipo de solução + observação;
--   * linha do tempo de anotações (quem, quando, o quê);
--   * pedido "finalizado" com observação final, depois que tudo resolveu.

-- ── Ocorrências ────────────────────────────────────────────────────────
alter table material_order_occurrences add column if not exists kind text not null default 'avaria';
alter table material_order_occurrences drop constraint if exists material_order_occurrences_kind_check;
alter table material_order_occurrences add constraint material_order_occurrences_kind_check
  check (kind in ('avaria', 'falta', 'excesso'));

-- Quantidade afetada genérica (avariada, faltante ou a mais). qty_damaged
-- continua existindo (usado nas telas antigas/estoque) — backfill abaixo.
alter table material_order_occurrences add column if not exists qty_affected numeric(10,3);
update material_order_occurrences set qty_affected = qty_damaged where qty_affected is null and qty_damaged is not null;

alter table material_order_occurrences drop constraint if exists material_order_occurrences_status_check;
alter table material_order_occurrences add constraint material_order_occurrences_status_check
  check (status in ('aberto', 'em_andamento', 'resolvido'));

alter table material_order_occurrences add column if not exists resolution text;
alter table material_order_occurrences drop constraint if exists material_order_occurrences_resolution_check;
alter table material_order_occurrences add constraint material_order_occurrences_resolution_check
  check (resolution is null or resolution in ('reposicao', 'credito', 'desconto', 'devolucao', 'aceito', 'outro'));
alter table material_order_occurrences add column if not exists resolution_notes text;

-- ── Linha do tempo de cada ocorrência ─────────────────────────────────
create table if not exists material_occurrence_updates (
  id             uuid primary key default gen_random_uuid(),
  occurrence_id  uuid not null references material_order_occurrences(id) on delete cascade,
  author_id      uuid references system_users(id) on delete set null,
  note           text,
  status_from    text,
  status_to      text,
  created_at     timestamptz not null default now()
);
create index if not exists idx_material_occurrence_updates_occ on material_occurrence_updates(occurrence_id, created_at);

-- App usa só chave anon (auth próprio) — mesma regra de toda tabela nova.
alter table material_occurrence_updates enable row level security;
drop policy if exists anon_all_material_occurrence_updates on material_occurrence_updates;
create policy anon_all_material_occurrence_updates on material_occurrence_updates for all to anon using (true) with check (true);

-- ── Finalização do pedido ────────────────────────────────────────────
alter table material_orders drop constraint if exists material_orders_status_check;
alter table material_orders add constraint material_orders_status_check
  check (status in ('pedido', 'conferido', 'finalizado', 'cancelado'));
alter table material_orders add column if not exists closed_at timestamptz;
alter table material_orders add column if not exists closed_by uuid references system_users(id) on delete set null;
alter table material_orders add column if not exists closing_notes text;

-- ── Backfill: divergência de quantidade em pedidos já conferidos ─────
insert into material_order_occurrences (order_id, order_item_id, kind, qty_affected, description, reported_at)
select i.order_id, i.id,
       case when i.qty_received < i.qty_ordered then 'falta' else 'excesso' end,
       abs(i.qty_ordered - i.qty_received),
       'Divergência de quantidade na conferência (criada automaticamente).',
       coalesce(o.conferred_at, now())
from material_order_items i
join material_orders o on o.id = i.order_id
where o.status = 'conferido'
  and i.qty_received is not null
  and i.qty_received <> i.qty_ordered
  and not exists (
    select 1 from material_order_occurrences oc
    where oc.order_item_id = i.id and oc.kind in ('falta', 'excesso')
  );
