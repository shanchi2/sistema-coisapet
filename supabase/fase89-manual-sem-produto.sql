-- Fase 89 (01/10/2026) — Manual sem produto vinculado
-- Pedido do Raphael: o "Gerador — Terrários e Alojamentos" (aba própria em
-- Links, igual ao de Substratos) pode criar manual SEM vincular a produto.
-- Esse manual aparece no site na coleção dele, com título e capa próprios.
alter table product_doc_resources alter column product_id drop not null;
alter table product_doc_resources add column if not exists collection_id uuid references manual_collections(id) on delete set null;
alter table product_doc_resources add column if not exists title text;            -- nome no site (manual avulso)
alter table product_doc_resources add column if not exists cover_image_url text;  -- capa no site (manual avulso)
-- avulso precisa de título e coleção pra aparecer em algum lugar
alter table product_doc_resources drop constraint if exists product_doc_resources_avulso_check;
alter table product_doc_resources add constraint product_doc_resources_avulso_check
  check (product_id is not null or (title is not null and collection_id is not null));
