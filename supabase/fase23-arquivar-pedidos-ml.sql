-- ================================================================
-- CoisaPet — Fase 23: arquiva TODOS os pedidos ML e recomeça do zero
-- ================================================================
-- Execute no SQL Editor do Supabase.
--
-- Contexto (ver coisapet.md): o painel do próprio ML mostrava 7 envios
-- pra hoje; nosso Expedição mostrava 17 + "603 atrasados". Diagnóstico:
-- pedidos-pacote fragmentados de antes da Fase 22 (ex: Camilla
-- Fernandes duplicada em 5 cartões-fantasma) + acúmulo histórico de
-- "atrasados" (majoritariamente Shopee antigo) sendo corretamente
-- exposto por uma feature nova, mas sem nenhuma limpeza prévia.
--
-- Decisão do Raphael: não vale a pena tentar consertar pedido por
-- pedido do passado — melhor arquivar (não apagar!) tudo que é ML e
-- reimportar do zero via API os pedidos reais e atuais, agora que a
-- Fase 22 já corrige pacote e prazo real. Shopee fica intocado por
-- enquanto ("vamos primeiro arrumar o ML").
-- ================================================================

-- ── 1. Coluna archived — arquivar é só uma flag, nunca DELETE ───────
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN public.orders.archived IS 'Pedido arquivado não aparece nas telas operacionais (Expedição/Atrasados), mas continua contando pra relatórios/histórico. Usado na Fase 23 pra zerar o operacional do ML sem apagar dado nenhum.';

CREATE INDEX IF NOT EXISTS idx_orders_archived ON public.orders (archived) WHERE archived = false;

-- ── 2. Arquiva tudo que é ML hoje ───────────────────────────────────
UPDATE public.orders SET archived = true WHERE source = 'ml' AND archived = false;

-- ── 3. upsert_orders_safe: qualquer pedido tocado de novo (reimport
--    via API, ou webhook normal daqui pra frente) sai do arquivo
--    automaticamente — sem isso, a reimportação ficaria invisível ────
CREATE OR REPLACE FUNCTION public.upsert_orders_safe(p_orders jsonb)
 RETURNS TABLE(id uuid, num_venda text, was_inserted boolean)
 LANGUAGE sql
AS $function$
  INSERT INTO public.orders (
    batch_id, source, num_venda, data_venda, shipping_deadline,
    status_ml, status_desc, comprador, cidade, estado_uf, cep,
    rastreio, is_pacote, is_full, pack_id, notes, needs_attention, archived
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
    false,
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
    archived     = false,
    needs_attention = (
      EXCLUDED.status_ml IS NOT NULL
      AND EXCLUDED.status_ml ILIKE '%cancelad%'
      AND EXISTS (
        SELECT 1 FROM public.order_items oi
        WHERE oi.order_id = public.orders.id AND oi.picked = true
      )
    )
  RETURNING public.orders.id, public.orders.num_venda, (xmax = 0);
$function$;

-- ── Confirma ──────────────────────────────────────────────────────
SELECT source, archived, COUNT(*) FROM public.orders GROUP BY source, archived ORDER BY source, archived;
