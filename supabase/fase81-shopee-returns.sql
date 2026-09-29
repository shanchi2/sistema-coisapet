-- Fase 81 (29/09) — espelho das devoluções/reembolsos da Shopee no banco.
--
-- Por quê: a API get_return_list devolve do MAIS ANTIGO pro mais novo e os
-- filtros create_time_from/to voltam vazios (testado ao vivo em 29/09) — a
-- tela antiga lia só a página 1 e mostrava reclamações de 2023/2024 como
-- se fossem as mais recentes. Agora a edge function shopee-insights
-- (action returns_sync) pagina tudo e grava aqui; o detalhe completo
-- (compensação, disputa, logística, prazos) vem do get_return_detail só
-- pras recentes / em aberto. A tela lê daqui, do mais novo pro mais antigo.

create table if not exists shopee_returns (
  return_sn                   text primary key,
  order_sn                    text,
  status                      text,
  reason                      text,
  text_reason                 text,
  refund_amount               numeric(12,2),
  amount_before_discount      numeric(12,2),
  currency                    text,
  create_time                 timestamptz,
  update_time                 timestamptz,
  due_date                    timestamptz,     -- prazo pra responder a solicitação
  return_ship_due_date        timestamptz,     -- prazo do comprador devolver
  return_seller_due_date      timestamptz,     -- prazo do vendedor (após receber a devolução)
  return_solution             integer,         -- 0 = devolução e reembolso, 1 = só reembolso
  return_refund_type          text,
  needs_logistics             boolean,
  buyer_username              text,
  items                       jsonb,
  buyer_images                jsonb,
  buyer_videos                jsonb,
  tracking_number             text,
  logistics_status            text,
  reverse_logistics_status    text,
  is_arrived_at_warehouse     integer,
  dispute_reason              jsonb,
  dispute_text_reason         jsonb,
  compensation_amount         numeric(12,2),
  compensation_status         text,
  compensation_due_date       timestamptz,
  compensation_list           jsonb,
  shipping_fee_responsibility text,
  shipping_fee_responsibility_reason text,
  negotiation                 jsonb,
  seller_proof                jsonb,
  validation_type             text,
  purchase_date               timestamptz,     -- do nosso orders (num_venda = order_sn)
  raw                         jsonb,           -- item cru da lista
  detail                      jsonb,           -- detalhe cru (get_return_detail)
  detail_synced_at            timestamptz,
  synced_at                   timestamptz not null default now()
);
create index if not exists idx_shopee_returns_create on shopee_returns(create_time desc);
create index if not exists idx_shopee_returns_status on shopee_returns(status);
create index if not exists idx_shopee_returns_order on shopee_returns(order_sn);

-- Leitura pelo app (chave anon); escrita só pela edge function (service role).
alter table shopee_returns enable row level security;
drop policy if exists anon_read_shopee_returns on shopee_returns;
create policy anon_read_shopee_returns on shopee_returns for select to anon using (true);
