-- Fase 82 (30/09) — valor e status "oficiais" do marketplace no pedido,
-- pro comparativo ML × Shopee da Diretoria.
-- Pedidos da Shopee anteriores a 19/09 vieram da planilha da picklist SEM
-- preço nos itens; a edge function shopee-insights (orders_value_backfill)
-- busca no get_order_detail e preenche: preço unitário dos itens (casando
-- por SKU/nome), total pago pelo comprador e status na Shopee.
alter table orders add column if not exists gross_value numeric(12,2);        -- total pago pelo comprador (API)
alter table orders add column if not exists marketplace_status text;          -- status cru da plataforma (ex: COMPLETED, CANCELLED)
alter table orders add column if not exists marketplace_synced_at timestamptz;
create index if not exists idx_orders_source_data on orders(source, data_venda);
