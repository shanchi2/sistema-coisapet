-- ================================================================
-- CoisaPet — Fase 18: Corte de dia correto, pedido protegido contra
-- reimportação, aviso de cancelado-após-separado, histórico de expedição
-- ================================================================
-- Execute no SQL Editor do Supabase.
--
-- Contexto (ver coisapet.md pra detalhes completos): o batch_id de um
-- pedido era regravado sem condição em todo upsert (webhook do ML ou
-- reimportação do xlsx), usando a hora de AGORA em vez da hora real da
-- venda — isso fazia pedido comprado antes das 11h "pular" pro lote do
-- dia seguinte quando um novo status chegava à tarde, e também fazia
-- pedido já separado sumir da Expedição (ela filtra por batch_id exato).
--
-- Esta migração é só ADITIVA — não mexe em dado existente, só prepara
-- o terreno pra correção no código (useOrders.js e ml-process-webhook).
-- ================================================================

-- ── 1. Agrupamento visual de pacotes ML + aviso de estado ambíguo ──
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS pack_id TEXT,
  ADD COLUMN IF NOT EXISTS needs_attention BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.orders.pack_id IS 'ID do pacote ML (order.pack_id) — só pra agrupar visualmente pedidos do mesmo pacote, não funde as linhas';
COMMENT ON COLUMN public.orders.needs_attention IS 'true = pedido foi marcado como cancelado (ou status ambíguo) DEPOIS de já ter item separado — não esconder da Expedição, mostrar com aviso';

CREATE INDEX IF NOT EXISTS idx_orders_pack_id ON public.orders(pack_id) WHERE pack_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_needs_attention ON public.orders(needs_attention) WHERE needs_attention = true;

-- ── 2. upsert_orders_safe — substitui o .upsert() direto do supabase-js
--    nos dois caminhos de gravação (useOrders.js e ml-process-webhook).
--    Recebe um ARRAY de pedidos (o webhook manda um array de 1 item; a
--    importação manual manda o arquivo inteiro de uma vez só — evita N
--    chamadas de rede pra um upload com centenas de pedidos).
--
--    Protege (nunca sobrescreve num pedido que já existe): batch_id,
--    data_venda, created_at — são exatamente os campos que decidem "que
--    dia" e "que lote" o pedido pertence; sobrescrever isso depois é a
--    causa raiz do pedido sumir/pular de dia.
--
--    Atualiza normalmente (é o motivo de existir o re-touch): status,
--    rastreio, dados do comprador, is_pacote/is_full, notes.
--
--    needs_attention é recalculado a cada chamada: fica true só quando
--    o status recebido é "cancelado" E o pedido já tem item separado.
--
--    Requer que a constraint UNIQUE (source, num_venda) já exista em
--    produção (o código já depende disso hoje via onConflict:
--    'source,num_venda' — se não existir, essa função falha alto e
--    claro, o que é preferível a duplicar silenciosamente).
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_orders_safe(p_orders JSONB)
RETURNS TABLE(id UUID, num_venda TEXT, was_inserted BOOLEAN)
LANGUAGE sql
AS $$
  INSERT INTO public.orders (
    batch_id, source, num_venda, data_venda, shipping_deadline,
    status_ml, status_desc, comprador, cidade, estado_uf, cep,
    rastreio, is_pacote, is_full, pack_id, notes, needs_attention
  )
  SELECT
    (o->>'batch_id')::UUID,
    o->>'source',
    o->>'num_venda',
    (o->>'data_venda')::TIMESTAMPTZ,
    NULLIF(o->>'shipping_deadline', '')::DATE,
    o->>'status_ml',
    o->>'status_desc',
    o->>'comprador',
    o->>'cidade',
    o->>'estado_uf',
    o->>'cep',
    o->>'rastreio',
    COALESCE((o->>'is_pacote')::BOOLEAN, false),
    COALESCE((o->>'is_full')::BOOLEAN, false),
    o->>'pack_id',
    o->>'notes',
    false
  FROM jsonb_array_elements(p_orders) AS o
  ON CONFLICT (source, num_venda) DO UPDATE SET
    status_ml    = EXCLUDED.status_ml,
    status_desc  = EXCLUDED.status_desc,
    comprador    = EXCLUDED.comprador,
    cidade       = EXCLUDED.cidade,
    estado_uf    = EXCLUDED.estado_uf,
    cep          = EXCLUDED.cep,
    rastreio     = EXCLUDED.rastreio,
    is_pacote    = EXCLUDED.is_pacote,
    is_full      = EXCLUDED.is_full,
    pack_id      = COALESCE(EXCLUDED.pack_id, public.orders.pack_id),
    notes        = EXCLUDED.notes,
    needs_attention = (
      EXCLUDED.status_ml IS NOT NULL
      AND EXCLUDED.status_ml ILIKE '%cancelad%'
      AND EXISTS (
        SELECT 1 FROM public.order_items oi
        WHERE oi.order_id = public.orders.id AND oi.picked = true
      )
    )
  RETURNING public.orders.id, public.orders.num_venda, (xmax = 0);
$$;

GRANT EXECUTE ON FUNCTION public.upsert_orders_safe(JSONB) TO anon;

-- ── 3. Histórico de expedição — nunca mais "some sem deixar rastro" ──
-- Registro append-only/versionado: fechar o dia de novo (depois de mais
-- pedidos serem separados) cria uma NOVA versão, nunca sobrescreve a
-- anterior — é um registro de negócio, não pode desaparecer.
CREATE TABLE IF NOT EXISTS public.shipping_day_closures (
  id                      UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id                UUID        NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
  target_date             DATE        NOT NULL,
  closed_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_by               UUID        REFERENCES public.system_users(id) ON DELETE SET NULL,
  total_orders            INTEGER     NOT NULL DEFAULT 0,
  closed_orders_count     INTEGER     NOT NULL DEFAULT 0,
  incomplete_orders_count INTEGER     NOT NULL DEFAULT 0,
  version                 INTEGER     NOT NULL DEFAULT 1,
  superseded              BOOLEAN     NOT NULL DEFAULT false,
  notes                   TEXT
);

COMMENT ON TABLE public.shipping_day_closures IS 'Um "fechamento de dia" da Expedição — quantos pedidos fecharam/ficaram incompletos. Append-only: reabrir e fechar de novo cria nova versão (superseded=true na anterior), nunca sobrescreve.';

CREATE INDEX IF NOT EXISTS idx_sdc_batch_date ON public.shipping_day_closures(batch_id, target_date);
GRANT ALL ON public.shipping_day_closures TO anon;

CREATE TABLE IF NOT EXISTS public.shipping_order_closures (
  id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  closure_id    UUID        NOT NULL REFERENCES public.shipping_day_closures(id) ON DELETE CASCADE,
  order_id      UUID        REFERENCES public.orders(id) ON DELETE SET NULL,
  num_venda     TEXT,        -- cópia — sobrevive mesmo se o pedido for apagado depois
  source        TEXT,
  comprador     TEXT,
  status        TEXT        NOT NULL CHECK (status IN ('closed', 'incomplete')),
  missing_items JSONB,       -- [{titulo, sku, variacao, missing_qty}, ...] — só quando incomplete
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.shipping_order_closures IS 'Um registro por pedido dentro de um shipping_day_closures — o que fechou e o que faltou (e exatamente quais itens).';

CREATE INDEX IF NOT EXISTS idx_soc_closure ON public.shipping_order_closures(closure_id);
GRANT ALL ON public.shipping_order_closures TO anon;

-- ── 4. close_shipping_day — grava o fechamento em transação ─────────
-- Recebe do cliente a lista de pedidos já calculada (a Expedição já tem
-- isso em memória — reaproveita a mesma lógica de "pedido completo").
-- p_orders: [{order_id, num_venda, source, comprador, status, missing_items}, ...]
CREATE OR REPLACE FUNCTION public.close_shipping_day(
  p_batch_id UUID,
  p_target_date DATE,
  p_closed_by UUID,
  p_orders JSONB
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_closure_id UUID;
  v_next_version INTEGER;
  v_total INTEGER;
  v_closed INTEGER;
  v_incomplete INTEGER;
BEGIN
  SELECT COALESCE(MAX(version), 0) + 1 INTO v_next_version
  FROM public.shipping_day_closures
  WHERE batch_id = p_batch_id AND target_date = p_target_date;

  UPDATE public.shipping_day_closures
  SET superseded = true
  WHERE batch_id = p_batch_id AND target_date = p_target_date AND superseded = false;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE (o->>'status') = 'closed'),
    COUNT(*) FILTER (WHERE (o->>'status') = 'incomplete')
  INTO v_total, v_closed, v_incomplete
  FROM jsonb_array_elements(p_orders) AS o;

  INSERT INTO public.shipping_day_closures (
    batch_id, target_date, closed_by, total_orders, closed_orders_count, incomplete_orders_count, version
  ) VALUES (
    p_batch_id, p_target_date, p_closed_by, v_total, v_closed, v_incomplete, v_next_version
  )
  RETURNING id INTO v_closure_id;

  INSERT INTO public.shipping_order_closures (closure_id, order_id, num_venda, source, comprador, status, missing_items)
  SELECT
    v_closure_id,
    NULLIF(o->>'order_id', '')::UUID,
    o->>'num_venda',
    o->>'source',
    o->>'comprador',
    o->>'status',
    o->'missing_items'
  FROM jsonb_array_elements(p_orders) AS o;

  RETURN v_closure_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_shipping_day(UUID, DATE, UUID, JSONB) TO anon;

-- ── Confirma ──────────────────────────────────────────────────────
SELECT table_name, 'OK' AS status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('shipping_day_closures', 'shipping_order_closures')
ORDER BY table_name;
