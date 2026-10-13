-- Links dos produtos nos anúncios (13/10). products.url_ml estava vazio em
-- 480 de 589 produtos porque ~70% das variações dos anúncios do ML não têm
-- SKU preenchido no próprio ML (na Shopee 100% têm). Aplicado direto no
-- banco em 13/10:
--   • 91 links do ML gravados por SKU igual (57), histórico de vendas (23:
--     título do anúncio = título do item do pedido ML já ligado ao produto) e
--     variação irmã com o mesmo link (11)
--   • 3 links da Shopee por SKU
-- O resto virou sugestão (anúncio mais parecido pelo nome) pra alguém
-- conferir na tela /marketplaces/links — o método por nome errou tamanho e
-- espécie no teste (ex.: Plataforma G sugerida no anúncio da M), por isso
-- nada pelo nome é gravado sem confirmação.
CREATE TABLE IF NOT EXISTS public.product_ml_link_suggestions (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  item_id    text,
  url        text NOT NULL,
  ml_title   text,
  score      numeric,
  gap        numeric,
  via        text,          -- sku | vendas | irmao | nome-auto | nome-revisar | manual
  status     text NOT NULL DEFAULT 'pendente',   -- pendente | aplicado | nao_tem
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.product_ml_link_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY pmls_all ON public.product_ml_link_suggestions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON public.product_ml_link_suggestions TO anon, authenticated;
