-- ================================================================
-- CoisaPet — Fase 64: Produto principal (agrupador de variações de cor)
-- ================================================================
-- Execute no SQL Editor do Supabase (ou supabase db query --linked --file).
--
-- Contexto (ver coisapet.md e plano em .claude/plans): hoje o "mestre"
-- de uma família de variação (ex: Terrário 100x50x50) é, por acaso, uma
-- das próprias cores — não existe uma identidade do PRODUTO em si,
-- independente de cor. Isso travava a ideia da chapa por família
-- (cadastrar o corte uma vez, cor escolhida na hora de lançar a
-- produção). `is_sellable=false` marca um produto "principal" — um
-- agrupador que nunca é vendido diretamente, sem anúncio próprio —
-- mesmo padrão já usado pra `is_kit` (fase63). Todo produto existente
-- continua `true` por padrão, nenhum comportamento muda pra quem não
-- for migrado.
-- ================================================================

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_sellable BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.products.is_sellable IS 'false = produto principal (agrupador de variações de cor, nunca vendido diretamente, sem anúncio próprio, sem sincronizar com ML/Shopee). true = produto normal/variação vendável, igual sempre foi.';
