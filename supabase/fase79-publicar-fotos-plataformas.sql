-- Fase 79 (26/09) — publicar as fotos da Atualização de Mídia nos
-- anúncios do ML / Shopee.
--
-- media_listing_links: produto ↔ anúncio (achado pelo SKU na 1ª vez e
--   guardado — a busca na Shopee varre a loja inteira e demora ~1 min).
-- media_publish_log: cada troca de fotos feita, com a lista ANTERIOR de
--   fotos do anúncio (pra "Desfazer") e quais slots foram enviados.

create table if not exists media_listing_links (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products(id) on delete cascade,
  platform    text not null check (platform in ('ml', 'shopee')),
  listing_id  text not null,
  title       text,
  created_at  timestamptz not null default now(),
  unique (product_id, platform, listing_id)
);
create index if not exists idx_media_listing_links_product on media_listing_links(product_id);

create table if not exists media_publish_log (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references products(id) on delete cascade,
  platform      text not null check (platform in ('ml', 'shopee')),
  listing_id    text not null,
  slots         integer[],
  previous_ids  jsonb,
  new_ids       jsonb,
  square        boolean,
  published_by  uuid references system_users(id) on delete set null,
  created_at    timestamptz not null default now(),
  restored_at   timestamptz,
  restored_by   uuid references system_users(id) on delete set null
);
create index if not exists idx_media_publish_log_product on media_publish_log(product_id, created_at desc);

-- App usa só chave anon (auth próprio) — mesma regra de toda tabela nova.
alter table media_listing_links enable row level security;
alter table media_publish_log   enable row level security;
drop policy if exists anon_all_media_listing_links on media_listing_links;
drop policy if exists anon_all_media_publish_log on media_publish_log;
create policy anon_all_media_listing_links on media_listing_links for all to anon using (true) with check (true);
create policy anon_all_media_publish_log   on media_publish_log   for all to anon using (true) with check (true);
