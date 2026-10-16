-- Pré-listas de envio pro Full (16/10, pedido do Raphael). Nem o ML nem a
-- Shopee deixam criar envio pro Full por API — só pelo painel deles. Então
-- a lista é montada AQUI (a partir da Reposição inteligente ou na mão) e,
-- na hora de criar o envio no painel do ML/Shopee, quem estiver montando vai
-- copiando os códigos e marcando "já adicionei" item por item.
-- Só quantidades — sem R$ (produção também usa).
CREATE TABLE IF NOT EXISTS public.full_prelists (
  id          bigserial PRIMARY KEY,
  platform    text NOT NULL CHECK (platform IN ('ml', 'shopee')),
  name        text NOT NULL,
  status      text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'concluida')),
  notes       text,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.full_prelist_items (
  id            bigserial PRIMARY KEY,
  prelist_id    bigint NOT NULL REFERENCES public.full_prelists(id) ON DELETE CASCADE,
  item_id       text,
  variation_id  text,
  title         text NOT NULL,
  variation     text,
  sku           text,
  thumbnail     text,
  permalink     text,
  qty           int NOT NULL DEFAULT 1 CHECK (qty >= 0),
  suggested     int,
  added         boolean NOT NULL DEFAULT false,
  added_by      text,
  added_at      timestamptz,
  position      int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS full_prelist_items_list_idx ON public.full_prelist_items (prelist_id, position);

-- Mesmo padrão das outras tabelas escritas pelo front (login próprio do sistema)
ALTER TABLE public.full_prelists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.full_prelist_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS full_prelists_all ON public.full_prelists;
CREATE POLICY full_prelists_all ON public.full_prelists FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS full_prelist_items_all ON public.full_prelist_items;
CREATE POLICY full_prelist_items_all ON public.full_prelist_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT ALL ON public.full_prelists, public.full_prelist_items TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.full_prelists_id_seq, public.full_prelist_items_id_seq TO anon, authenticated;

-- Módulo próprio pra tela "Gestão de Envios Full" (antes ficava em
-- ml-insights): assim a produção acessa os envios/pré-listas sem ganhar o
-- resto da Otimização ML.
INSERT INTO public.role_permissions (role, module, enabled)
SELECT r, 'full-envios', r IN ('marketplace', 'producao')
FROM unnest(ARRAY['administrativo','atendimento','marketplace','producao']) AS r
WHERE NOT EXISTS (SELECT 1 FROM public.role_permissions WHERE role = r AND module = 'full-envios');
