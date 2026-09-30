-- Fase 86 (01/10/2026) — Produção horista vinculada ao cadastro de produtos
--
-- Antes: o horista digitava o nome do produto no /equipe ("Rodinha Preta
-- 25cm", "Rodinha 25 Cinza", "Aspen flake"…) — o mesmo produto virava
-- vários nomes e o relatório não somava direito. Agora ele BUSCA no
-- cadastro e o lançamento guarda product_id. product_name continua sendo
-- gravado (rótulo legível) e o texto livre segue como plano B ("não achei
-- na lista"), só que sem vínculo.
--
-- Variação no cadastro tem o MESMO nome do produto pai — o que diferencia
-- é o SKU; o rótulo legível (Cor: Preto, Peso: 1Kg…) vem de
-- product_variations/options pelo SKU. A view já entrega tudo pronto pro app.

alter table production_entries add column if not exists product_id uuid references products(id) on delete set null;
create index if not exists idx_production_entries_product on production_entries(product_id);

create or replace view production_catalog as
with labels as (
  select v.sku, string_agg(o.value, ' · ' order by t.sort_order, o.sort_order) as variation
  from product_variations v
  join product_variation_option_links l on l.variation_id = v.id
  join product_variation_options o on o.id = l.option_id
  join product_variation_types t on t.id = o.type_id
  group by v.sku
)
select
  p.id,
  p.sku,
  coalesce(pp.name, p.name)                             as name,
  lb.variation,
  coalesce(p.photo_url, pp.photo_url)                   as photo_url,
  lower(coalesce(pp.name, p.name) || ' ' || coalesce(lb.variation, '') || ' ' || coalesce(p.sku, '')) as search
from products p
left join products pp on pp.id = p.parent_product_id
left join labels lb on lb.sku = p.sku
where p.active is not false
  and coalesce(p.is_kit, false) = false
  -- só o que é fabricado/separado de verdade: produto sem variações (folha)
  and not exists (select 1 from products c where c.parent_product_id = p.id);

grant select on production_catalog to anon, authenticated;
