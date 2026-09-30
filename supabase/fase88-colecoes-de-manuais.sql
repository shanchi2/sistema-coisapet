-- Fase 88 (01/10/2026) — Coleções de manuais (Manuais & Dicas)
--
-- Pedido do Raphael + Gabriel: organizar os manuais por coleção —
-- Substratos, Enriquecimento Ambiental, e agora Terrários e Alojamentos
-- (depois Brinquedos e Acessórios). Tabela própria em vez da categoria do
-- cadastro porque a categoria não bate com o jeito que o cliente procura
-- (ex: Pinhas e Pedras Seixo estão como "Acessório" no cadastro, mas são
-- enriquecimento ambiental). Coleção sem produto não aparece no site.
create table if not exists manual_collections (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  emoji       text,
  description text,
  sort_order  int  not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table manual_collections enable row level security;
-- App não usa sessão do Supabase Auth — policy precisa ser TO anon
drop policy if exists manual_collections_all on manual_collections;
create policy manual_collections_all on manual_collections for all to anon, authenticated using (true) with check (true);

alter table products add column if not exists manual_collection_id uuid references manual_collections(id) on delete set null;

insert into manual_collections (name, slug, emoji, description, sort_order) values
  ('Substratos',               'substratos',              '🪵', 'Forração e substratos pro habitat',              1),
  ('Enriquecimento Ambiental', 'enriquecimento-ambiental','🌿', 'Materiais naturais pra estimular o pet',         2),
  ('Alimentação',              'alimentacao',             '🌾', 'Feno, sementes e petiscos',                      3),
  ('Terrários e Alojamentos',  'terrarios-e-alojamentos', '🏠', 'Montagem, uso e cuidados dos terrários',         4),
  ('Brinquedos e Acessórios',  'brinquedos-e-acessorios', '🎡', 'Rodinhas, tocas, comedouros e acessórios',       5)
on conflict (slug) do nothing;

-- Produtos que já têm manual → coleção certa
update products p set manual_collection_id = c.id
from manual_collections c, product_categories pc
where pc.id = p.category_id and p.manual_collection_id is null
  and exists (select 1 from product_doc_resources r where r.product_id = p.id)
  and ((c.slug = 'substratos' and pc.name = 'Substratos')
    or (c.slug = 'enriquecimento-ambiental' and pc.name = 'Enriquecimento Ambiental')
    or (c.slug = 'alimentacao' and pc.name = 'Alimentação'));

update products p set manual_collection_id = (select id from manual_collections where slug = 'enriquecimento-ambiental')
where p.manual_collection_id is null
  and exists (select 1 from product_doc_resources r where r.product_id = p.id)
  and (p.name ilike 'Pedras Seixo%' or p.name ilike 'Pinhas Natural%');
