-- ================================================================
-- CoisaPet — Fase 54: Dados de produto pra Atendimento/IA
-- ================================================================
-- Execute no SQL Editor do Supabase.
--
-- Contexto (ver coisapet.md): primeiro passo do assistente de IA pras
-- Perguntas do Mercado Livre (pedido do Raphael, 11/09). As perguntas
-- mais comuns — "serve pra hamster sírio?", "serve pra gerbil?",
-- "vem montado?", "acompanha rodinha? de que tamanho?", "quais
-- acessórios acompanham?" — não tinham campo estruturado pra
-- responder com segurança, só descrição em texto livre. Sem isso, a
-- IA teria que adivinhar a partir de texto solto — exatamente o tipo
-- de erro que não pode acontecer numa resposta pública pro cliente.
--
-- Dimensão (largura/altura/profundidade/peso) já existe desde antes —
-- essa migration só cobre o que faltava.
-- ================================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS compatible_species   TEXT[],   -- ex: ['hamster_sirio','hamster_anao','gerbil']
  ADD COLUMN IF NOT EXISTS comes_assembled       BOOLEAN,  -- null = não preenchido ainda (diferente de "não vem montado")
  ADD COLUMN IF NOT EXISTS includes_wheel        BOOLEAN,
  ADD COLUMN IF NOT EXISTS wheel_diameter_cm     NUMERIC,
  ADD COLUMN IF NOT EXISTS accessories_included  TEXT;     -- texto livre curto, ex: "1 rodinha 12cm, 1 casinha, 1 comedouro"

COMMENT ON COLUMN public.products.compatible_species  IS 'Espécies de pet pequeno compatíveis com o produto — usado pra responder perguntas de compatibilidade no Mercado Livre com segurança (não é a IA adivinhando por texto livre).';
COMMENT ON COLUMN public.products.comes_assembled     IS 'Se o produto vem montado ou precisa montar. NULL = ainda não preenchido (não assumir "não" por padrão).';
COMMENT ON COLUMN public.products.includes_wheel      IS 'Se o kit/produto inclui rodinha de exercício.';
COMMENT ON COLUMN public.products.wheel_diameter_cm   IS 'Diâmetro da rodinha incluída, em cm — só relevante quando includes_wheel = true.';
COMMENT ON COLUMN public.products.accessories_included IS 'Lista curta (texto livre) dos acessórios que acompanham o produto.';
