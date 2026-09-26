-- Fase 78 (26/09) — Chapas de MDF e sub-chapas.
--
-- Como funciona de verdade (Raphael): o César compra uma CHAPA inteira na
-- Duratex (ex: "CE01 - Branco 6mm", 1840×2740, R$ 240), e ela já vem com
-- os cortes especiais — ex: CE01 rende 4 SUB-CHAPAS de tamanhos diferentes.
-- O estoque tem que contar as sub-chapas (é o que a produção usa), não a
-- chapa inteira. Retalho não conta (simplesmente não é cadastrado).
--
-- Modelo:
--   sheet_formats     = a chapa (só tamanho — sem cor nem espessura)
--   sheet_cuts        = sub-chapas dela (tamanho + quantas por chapa)
--   sheet_thicknesses = 3mm, 6mm...
--   sheet_colors      = Branco, Preto, Berlim...
--   raw_materials     = continua sendo a unidade de estoque: 1 linha por
--                       sub-chapa × espessura × cor (colunas novas ligam).
--                       Assim movimentações, Baixa Diária etc. seguem iguais.
--
-- Os 56 sub-cortes que já existiam ("6mm CE1 - Corte 1 - Azul"...) são
-- ligados aqui, com o mesmo estoque. Os "3mm CE1 - Corte 1 - <cor>" ficam
-- num formato "a confirmar" (Raphael vai ver com o Vini) e o retalho da
-- Acácia ("3mm CE2 - Corte 3") fica fora (não é sub-chapa).

-- ── Cadastros ─────────────────────────────────────────────────────────
create table if not exists sheet_formats (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  width_mm    numeric(10,2),
  length_mm   numeric(10,2),
  notes       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists sheet_cuts (
  id               uuid primary key default gen_random_uuid(),
  sheet_format_id  uuid not null references sheet_formats(id) on delete cascade,
  name             text not null,
  width_mm         numeric(10,2),
  length_mm        numeric(10,2),
  qty_per_sheet    integer not null default 1 check (qty_per_sheet > 0),
  sort_order       integer not null default 0,
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);
create index if not exists idx_sheet_cuts_format on sheet_cuts(sheet_format_id);

create table if not exists sheet_thicknesses (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  mm          numeric(6,2),
  active      boolean not null default true,
  sort_order  integer not null default 0
);

create table if not exists sheet_colors (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  hex         text,
  active      boolean not null default true
);

-- App usa só chave anon (auth próprio) — mesma regra de toda tabela nova.
alter table sheet_formats     enable row level security;
alter table sheet_cuts        enable row level security;
alter table sheet_thicknesses enable row level security;
alter table sheet_colors      enable row level security;
drop policy if exists anon_all_sheet_formats on sheet_formats;
drop policy if exists anon_all_sheet_cuts on sheet_cuts;
drop policy if exists anon_all_sheet_thicknesses on sheet_thicknesses;
drop policy if exists anon_all_sheet_colors on sheet_colors;
create policy anon_all_sheet_formats     on sheet_formats     for all to anon using (true) with check (true);
create policy anon_all_sheet_cuts        on sheet_cuts        for all to anon using (true) with check (true);
create policy anon_all_sheet_thicknesses on sheet_thicknesses for all to anon using (true) with check (true);
create policy anon_all_sheet_colors      on sheet_colors      for all to anon using (true) with check (true);

-- ── Estoque = raw_materials ligada a sub-chapa × espessura × cor ─────
alter table raw_materials add column if not exists sheet_cut_id       uuid references sheet_cuts(id) on delete set null;
alter table raw_materials add column if not exists sheet_thickness_id uuid references sheet_thicknesses(id) on delete set null;
alter table raw_materials add column if not exists sheet_color_id     uuid references sheet_colors(id) on delete set null;
create unique index if not exists uq_raw_materials_sheet_combo
  on raw_materials(sheet_cut_id, sheet_thickness_id, sheet_color_id)
  where sheet_cut_id is not null;

-- Acha (ou cria) a matéria-prima de estoque daquela sub-chapa+espessura+cor.
create or replace function get_sheet_stock_id(p_cut uuid, p_thickness uuid, p_color uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_cut record;
  v_fmt record;
  v_th  text;
  v_co  text;
  v_single boolean;
begin
  select id into v_id from raw_materials
   where sheet_cut_id = p_cut and sheet_thickness_id = p_thickness and sheet_color_id = p_color;
  if v_id is not null then return v_id; end if;

  select * into v_cut from sheet_cuts where id = p_cut;
  if v_cut is null then raise exception 'Sub-chapa não encontrada'; end if;
  select * into v_fmt from sheet_formats where id = v_cut.sheet_format_id;
  select name into v_th from sheet_thicknesses where id = p_thickness;
  select name into v_co from sheet_colors where id = p_color;
  if v_th is null or v_co is null then raise exception 'Espessura/cor não encontrada'; end if;

  -- Chapa com 1 sub-chapa só (chapa inteira) não repete o nome do corte
  select count(*) = 1 into v_single from sheet_cuts where sheet_format_id = v_fmt.id and active;

  insert into raw_materials (name, unit, category_id, width_cm, length_cm, stock_qty, unit_cost, active,
                             sheet_cut_id, sheet_thickness_id, sheet_color_id)
  values (
    case when v_single then v_th || ' ' || v_fmt.name || ' - ' || v_co
         else v_th || ' ' || v_fmt.name || ' - ' || v_cut.name || ' - ' || v_co end,
    'chapa',
    (select id from raw_material_categories where name ilike 'MDF' limit 1),
    v_cut.width_mm, v_cut.length_mm, 0, 0, true,
    p_cut, p_thickness, p_color
  )
  on conflict do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from raw_materials
     where sheet_cut_id = p_cut and sheet_thickness_id = p_thickness and sheet_color_id = p_color;
  end if;
  return v_id;
end;
$$;
grant execute on function get_sheet_stock_id(uuid, uuid, uuid) to anon, authenticated;

-- ── Pedido: item pode ser uma chapa (formato+espessura+cor) ──────────
alter table material_order_items alter column raw_material_id drop not null;
alter table material_order_items add column if not exists sheet_format_id    uuid references sheet_formats(id) on delete restrict;
alter table material_order_items add column if not exists sheet_thickness_id uuid references sheet_thicknesses(id) on delete restrict;
alter table material_order_items add column if not exists sheet_color_id     uuid references sheet_colors(id) on delete restrict;
-- Avaria por sub-chapa na conferência: { "<sheet_cut_id>": qtd_pecas }
alter table material_order_items add column if not exists cut_damage jsonb;
alter table material_order_items drop constraint if exists material_order_items_kind_check;
alter table material_order_items add constraint material_order_items_kind_check check (
  raw_material_id is not null
  or (sheet_format_id is not null and sheet_thickness_id is not null and sheet_color_id is not null)
);
alter table material_order_occurrences add column if not exists sheet_cut_id uuid references sheet_cuts(id) on delete set null;

-- ── Produção (Planos de corte do Vini) consome sub-chapa ─────────────
alter table chapas add column if not exists sheet_cut_id       uuid references sheet_cuts(id) on delete set null;
alter table chapas add column if not exists sheet_thickness_id uuid references sheet_thicknesses(id) on delete set null;
alter table chapas add column if not exists cuts_per_run       numeric(10,3) not null default 1;
alter table chapa_production_entries add column if not exists sheet_color_id  uuid references sheet_colors(id) on delete set null;
alter table chapa_production_entries add column if not exists raw_material_id uuid references raw_materials(id) on delete set null;

-- ── Seed: espessuras, cores, formatos e sub-chapas ───────────────────
insert into sheet_thicknesses (name, mm, sort_order) values ('3mm', 3, 1), ('6mm', 6, 2) on conflict (name) do nothing;

insert into sheet_colors (name)
select distinct trim(substring(name from '^\d+mm CE\d - Corte \d - (.+)$'))
from raw_materials
where active and unit = 'chapa' and name ~ '^\d+mm CE\d - Corte \d - .+$'
on conflict (name) do nothing;
insert into sheet_colors (name) values ('Cerrado Amadeirado') on conflict (name) do nothing;

do $$
declare
  f_ce1 uuid; f_ce2 uuid; f_ce3 uuid; f_acacia uuid; f_ce1_3 uuid;
begin
  if exists (select 1 from sheet_formats) then return; end if; -- idempotente

  insert into sheet_formats (name, width_mm, length_mm, notes) values ('CE1', 1840, 2740, 'Corte especial 01 (6mm)') returning id into f_ce1;
  insert into sheet_cuts (sheet_format_id, name, width_mm, length_mm, qty_per_sheet, sort_order) values
    (f_ce1, 'Corte 1', 1580, 1020, 1, 1), (f_ce1, 'Corte 2', 1160, 1020, 1, 2),
    (f_ce1, 'Corte 3', 1580,  820, 1, 3), (f_ce1, 'Corte 4', 1160,  820, 1, 4);

  insert into sheet_formats (name, width_mm, length_mm, notes) values ('CE2', 1840, 2740, 'Corte especial 02 (6mm) — medidas a conferir') returning id into f_ce2;
  insert into sheet_cuts (sheet_format_id, name, width_mm, length_mm, qty_per_sheet, sort_order) values
    (f_ce2, 'Corte 1', 1220, 640, 1, 1), (f_ce2, 'Corte 2', 1220, 600, 1, 2),
    (f_ce2, 'Corte 3', 1240, 300, 1, 3), (f_ce2, 'Corte 4',  600, 300, 1, 4);

  insert into sheet_formats (name, width_mm, length_mm, notes) values ('CE3', 1840, 2740, 'Corte especial 03 (6mm, só Branco)') returning id into f_ce3;
  insert into sheet_cuts (sheet_format_id, name, width_mm, length_mm, qty_per_sheet, sort_order) values
    (f_ce3, 'Corte 1', 1510, 1020, 1, 1), (f_ce3, 'Corte 2', 1230, 1020, 1, 2),
    (f_ce3, 'Corte 3', 1510,  820, 1, 3), (f_ce3, 'Corte 4', 1510,  820, 1, 4);

  -- Acácia 3mm: 3× 1360×920 + 1× 1080×480; a faixa de 160×1360 é retalho (não conta)
  insert into sheet_formats (name, width_mm, length_mm, notes) values ('CE Acácia', 1850, 2440, 'Corte especial da Acácia 3mm — faixa 160×1360 é retalho') returning id into f_acacia;
  insert into sheet_cuts (sheet_format_id, name, width_mm, length_mm, qty_per_sheet, sort_order) values
    (f_acacia, 'Corte 1', 1360, 920, 3, 1), (f_acacia, 'Corte 2', 1080, 480, 1, 2);

  -- "3mm CE1 - Corte 1 - <cor>" — a confirmar com o Vini (Raphael, 26/09)
  insert into sheet_formats (name, width_mm, length_mm, notes) values ('CE1 3mm', 1850, 2750, 'A CONFIRMAR com o Vini — existia no estoque como "3mm CE1 - Corte 1"; quantidade por chapa estimada (4× 1360×920)') returning id into f_ce1_3;
  insert into sheet_cuts (sheet_format_id, name, width_mm, length_mm, qty_per_sheet, sort_order) values
    (f_ce1_3, 'Corte 1', 1360, 920, 4, 1);

  -- Chapas inteiras (1 chapa = 1 no estoque)
  insert into sheet_formats (name, width_mm, length_mm, notes) values ('Chapa inteira 1850×2750', 1850, 2750, 'Chapa normal, sem corte especial');
  insert into sheet_cuts (sheet_format_id, name, width_mm, length_mm, qty_per_sheet, sort_order)
    select id, 'Inteira', 1850, 2750, 1, 1 from sheet_formats where name = 'Chapa inteira 1850×2750';
  insert into sheet_formats (name, width_mm, length_mm, notes) values ('Chapa inteira 1850×2440', 1850, 2440, 'Chapa normal, sem corte especial');
  insert into sheet_cuts (sheet_format_id, name, width_mm, length_mm, qty_per_sheet, sort_order)
    select id, 'Inteira', 1850, 2440, 1, 1 from sheet_formats where name = 'Chapa inteira 1850×2440';
  insert into sheet_formats (name, width_mm, length_mm, notes) values ('Chapa inteira 1840×2740', 1840, 2740, 'Chapa normal, sem corte especial');
  insert into sheet_cuts (sheet_format_id, name, width_mm, length_mm, qty_per_sheet, sort_order)
    select id, 'Inteira', 1840, 2740, 1, 1 from sheet_formats where name = 'Chapa inteira 1840×2740';
end $$;

-- ── Liga os sub-cortes existentes (mesmo estoque, mesmo id) ──────────
with parsed as (
  select rm.id,
         substring(rm.name from '^(\d+mm) ')                     as th,
         'CE' || substring(rm.name from '^\d+mm CE(\d) ')         as ce,
         'Corte ' || substring(rm.name from ' - Corte (\d) - ')   as corte,
         trim(substring(rm.name from '^\d+mm CE\d - Corte \d - (.+)$')) as cor
  from raw_materials rm
  where rm.active and rm.unit = 'chapa' and rm.sheet_cut_id is null
    and rm.name ~ '^\d+mm CE\d - Corte \d - .+$'
),
mapped as (
  select p.id, p.th, p.corte, p.cor,
         case
           when p.th = '6mm' then p.ce                     -- CE1 / CE2 / CE3
           when p.th = '3mm' and p.ce = 'CE2' then 'CE Acácia'
           when p.th = '3mm' and p.ce = 'CE1' then 'CE1 3mm'
         end as fmt
  from parsed p
)
update raw_materials rm
set sheet_cut_id = c.id, sheet_thickness_id = t.id, sheet_color_id = co.id
from mapped m
join sheet_formats f on f.name = m.fmt
join sheet_cuts c on c.sheet_format_id = f.id and c.name = m.corte
join sheet_thicknesses t on t.name = m.th
join sheet_colors co on co.name = m.cor
where rm.id = m.id;
-- (o "3mm CE2 - Corte 3 - Acácia" não acha sub-chapa e fica de fora = retalho)

-- ── RPC da produção: além de somar os produtos, baixa a sub-chapa ────
drop function if exists log_chapa_production(uuid, integer, text, uuid, jsonb);
create or replace function log_chapa_production(
  p_chapa_id uuid, p_multiplier integer, p_notes text, p_user_id uuid,
  p_color_selections jsonb default null, p_sheet_color_id uuid default null
)
returns table(product_id uuid, product_name text, delta integer, new_stock_qty integer)
language plpgsql
as $function$
declare
  v_entry_id uuid;
  v_chapa record;
  v_raw uuid;
begin
  select * into v_chapa from public.chapas where id = p_chapa_id;

  -- Plano ligado a sub-chapa + espessura: cor do MDF é obrigatória
  if v_chapa.sheet_cut_id is not null and v_chapa.sheet_thickness_id is not null then
    if p_sheet_color_id is null then
      raise exception 'Escolha a cor do MDF usada neste corte.';
    end if;
    v_raw := public.get_sheet_stock_id(v_chapa.sheet_cut_id, v_chapa.sheet_thickness_id, p_sheet_color_id);
  end if;

  insert into public.chapa_production_entries (chapa_id, multiplier, notes, created_by, sheet_color_id, raw_material_id)
    values (p_chapa_id, p_multiplier, p_notes, p_user_id, p_sheet_color_id, v_raw)
    returning id into v_entry_id;

  if v_raw is not null then
    insert into public.raw_material_movements (raw_material_id, type, qty, reason, reference_id)
    values (v_raw, 'saida', v_chapa.cuts_per_run * p_multiplier, 'Produção — plano de corte ' || v_chapa.name, v_entry_id);
  end if;

  return query
  with deltas as (
    select
      coalesce((p_color_selections ->> ci.product_id::text)::uuid, ci.product_id) as pid,
      ci.quantity * p_multiplier as d
    from public.chapa_items ci
    where ci.chapa_id = p_chapa_id
  ),
  updated as (
    update public.products p
    set stock_qty = p.stock_qty + deltas.d
    from deltas
    where p.id = deltas.pid
    returning p.id, p.name, p.stock_qty
  ),
  logged as (
    insert into public.product_stock_movements (product_id, quantity_delta, movement_type, reference_id, created_by)
    select deltas.pid, deltas.d, 'chapa_production', v_entry_id, p_user_id
    from deltas
    returning 1
  )
  select deltas.pid, updated.name, deltas.d, updated.stock_qty
  from deltas
  join updated on updated.id = deltas.pid;
end;
$function$;
grant execute on function log_chapa_production(uuid, integer, text, uuid, jsonb, uuid) to anon, authenticated;
