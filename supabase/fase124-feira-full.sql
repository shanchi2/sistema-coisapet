-- fase124 — Feira do Full (22/10, pedido do Raphael)
--
-- Separação dos envios pro Full: não tem picklist (não tem cliente, são
-- vários produtos iguais), só a "feira" do envio inteiro. Cada envio do ML
-- (lido pela extensão) ou pré-lista (ML/Shopee) vira uma feira com a
-- contagem de cada produto, etiqueta, "na estante" e a conferência final
-- (recontagem por outra pessoa + nº de volumes) antes do caminhão.
-- Erro de quantidade no Full vira multa — por isso a recontagem.
-- Só quantidades, sem R$ (produção usa).

CREATE TABLE IF NOT EXISTS public.full_feiras (
  id           bigserial PRIMARY KEY,
  platform     text NOT NULL CHECK (platform IN ('ml', 'shopee')),
  origin       text NOT NULL CHECK (origin IN ('ml_envio', 'prelista')),
  ref_id       text NOT NULL,              -- id do envio no ML ou da pré-lista
  name         text NOT NULL,
  coleta_at    timestamptz,
  status       text NOT NULL DEFAULT 'separando' CHECK (status IN ('separando', 'pronta', 'enviada')),
  boxes        int,                        -- volumes/caixas na conferência final
  ready_by     text,
  ready_at     timestamptz,
  ready_note   text,                       -- motivo se foi marcada pronta com diferença
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (origin, ref_id)
);

CREATE TABLE IF NOT EXISTS public.full_feira_items (
  id           bigserial PRIMARY KEY,
  feira_id     bigint NOT NULL REFERENCES public.full_feiras(id) ON DELETE CASCADE,
  item_key     text NOT NULL,              -- código do anúncio + variação (pra atualizar do envio)
  title        text NOT NULL,
  variation    text,
  sku          text,
  photo        text,
  qty_target   int NOT NULL DEFAULT 0 CHECK (qty_target >= 0),
  qty_counted  int NOT NULL DEFAULT 0 CHECK (qty_counted >= 0),
  labeled      boolean NOT NULL DEFAULT false,
  on_shelf     boolean NOT NULL DEFAULT false,
  recount      int CHECK (recount >= 0),   -- conferência final (2ª pessoa)
  recount_by   text,
  short_sent   int NOT NULL DEFAULT 0,     -- quanto já foi pedido pra Produção
  position     int NOT NULL DEFAULT 0,
  updated_by   text,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (feira_id, item_key)
);
CREATE INDEX IF NOT EXISTS full_feira_items_feira_idx ON public.full_feira_items (feira_id, position);

-- Mesmo padrão das pré-listas (fase108): login próprio do sistema
ALTER TABLE public.full_feiras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.full_feira_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY full_feiras_all ON public.full_feiras FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY full_feira_items_all ON public.full_feira_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.full_feiras, public.full_feira_items TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.full_feiras_id_seq, public.full_feira_items_id_seq TO anon, authenticated;

-- Módulo próprio no grupo Marketplaces (produção + marketplace)
INSERT INTO public.role_permissions (role, module, enabled)
SELECT r, 'feira-full', r IN ('marketplace', 'producao')
FROM unnest(ARRAY['administrativo','atendimento','marketplace','producao']) AS r
WHERE NOT EXISTS (SELECT 1 FROM public.role_permissions WHERE role = r AND module = 'feira-full');
