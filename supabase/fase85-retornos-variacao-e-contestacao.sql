-- Fase 85 (30/09/2026) — Retornos Shopee: variação do produto + nossa contestação
--
-- variations: { "<model_id>": { "name": "Amadeirado", "sku": "...", "image": "url" } }
--   — a devolução só traz o SKU da variação; nome e foto vêm de
--   product/get_model_list (preenchido pela edge function).
-- our_dispute: o que NÓS mandamos na contestação { reason, reason_label,
--   text, images[], email, at, by, source: 'sistema'|'seller_center' }.
--   A API da Shopee devolve o texto da disputa mas NÃO as fotos — por isso
--   guardamos na hora de disputar pelo sistema, ou anexamos depois (disputa
--   feita pelo Seller Center).
alter table shopee_returns add column if not exists variations jsonb;
alter table shopee_returns add column if not exists our_dispute jsonb;
