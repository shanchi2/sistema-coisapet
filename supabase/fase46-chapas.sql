-- ================================================================
-- CoisaPet — Fase 46: Chapas (receita de corte com múltiplos produtos)
-- ================================================================
-- Execute no SQL Editor do Supabase.
--
-- Contexto (ver coisapet.md): a Produção hoje controla peça por peça,
-- mas na prática o corte a laser sai por CHAPA — uma chapa pode render
-- vários produtos (ex: 14 Toca Luxo) ou uma combinação de produtos
-- diferentes (ex: 1 Terrário Grande + 1 Toca Luxo + 1 Banheira). Isso é
-- só o "gerador de chapas" (cadastro/receita) pedido pelo Raphael como
-- primeiro passo — ainda NÃO mexe na fila de produção existente, isso
-- vem numa fase seguinte ("vamos lapidando").
-- ================================================================

CREATE TABLE IF NOT EXISTS public.chapas (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT        NOT NULL,
  notes      TEXT,
  active     BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.chapas IS 'Receita de uma chapa de corte — nome + lista de produtos/quantidades que ela rende de uma vez (chapa_items). Ex: "Chapa Toca Luxo" rende 14x Toca Luxo; "Chapa Combo Terrário" rende 1x Terrário Grande + 1x Toca Luxo + 1x Banheira.';

CREATE TABLE IF NOT EXISTS public.chapa_items (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chapa_id   UUID        NOT NULL REFERENCES public.chapas(id) ON DELETE CASCADE,
  product_id UUID        NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity   INTEGER     NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (chapa_id, product_id) -- 1 linha por produto dentro da mesma chapa (soma na quantidade, não duplica)
);

COMMENT ON TABLE public.chapa_items IS 'Itens (produto + quantidade) que uma chapa rende.';

CREATE INDEX IF NOT EXISTS idx_chapa_items_chapa   ON public.chapa_items(chapa_id);
CREATE INDEX IF NOT EXISTS idx_chapa_items_product ON public.chapa_items(product_id);
CREATE INDEX IF NOT EXISTS idx_chapas_active       ON public.chapas(active);

CREATE TRIGGER set_chapas_updated_at
  BEFORE UPDATE ON public.chapas
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- RLS — IMPORTANTE (descoberto na hora, 2026-09-08): o app NÃO usa
-- sessão real do Supabase Auth (`src/lib/supabase.js` cria o client com
-- `persistSession:false`/sem `supabase.auth.signIn*`; login é 100%
-- custom via RPC `user_login`, sessão só no localStorage). Isso significa
-- que toda chamada ao Supabase sai com a ANON key, papel `anon` de
-- verdade — NUNCA `authenticated`. As tabelas antigas (`products`,
-- `raw_materials`) têm esse texto de `TO authenticated` só no arquivo de
-- migração original; na prática, em produção, o RLS delas está
-- DESATIVADO (`relrowsecurity = false`), por isso funcionam mesmo com
-- anon key. Uma policy `TO authenticated` aqui teria bloqueado TUDO pra
-- sempre — foi exatamente o que aconteceu, confirmado com um 401
-- `"new row violates row-level security policy"` ao testar a tela.
-- Corrigido com policy explícita `TO anon` (equivalente, na prática, a
-- desativar o RLS — mas mais explícito sobre a intenção).
ALTER TABLE public.chapas      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapa_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_acessa_chapas"
  ON public.chapas FOR ALL
  TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon_acessa_chapa_items"
  ON public.chapa_items FOR ALL
  TO anon USING (true) WITH CHECK (true);
