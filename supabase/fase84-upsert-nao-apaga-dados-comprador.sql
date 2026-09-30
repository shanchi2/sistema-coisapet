-- Fase 84 (30/09/2026) — upsert_orders_safe não apaga mais dado bom com vazio
--
-- Bug achado investigando "nome/estado não aparecem" na Expedição: a cada
-- push de status da Shopee (ex.: PROCESSED → SHIPPED) o webhook refaz o
-- upsert com cidade/UF/CEP = null (a API manda mascarado "****") e isso
-- sobrescrevia o que já tinha sido preenchido — pela planilha da Shopee
-- (texto: "Nome do destinatário", "UF", "Cidade") ou pelo código do hub de
-- entrega (Fase 83). Agora:
-- - cidade/estado_uf/cep/rastreio: só troca quando vem valor novo;
-- - status_ml/status_desc/notes: idem — a planilha da Shopee não traz o
--   status (vinha null e apagava o status real da API numa reimportação);
-- - comprador: se o atual já é "usuario / Nome Real" (vindo da planilha) e
--   o novo é só "usuario" (API), mantém o mais completo.
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
    status_ml    = COALESCE(NULLIF(EXCLUDED.status_ml, ''), public.orders.status_ml),
    status_desc  = COALESCE(NULLIF(EXCLUDED.status_desc, ''), public.orders.status_desc),
    comprador    = CASE
                     WHEN EXCLUDED.comprador IS NULL THEN public.orders.comprador
                     WHEN public.orders.comprador LIKE EXCLUDED.comprador || ' / %' THEN public.orders.comprador
                     ELSE EXCLUDED.comprador
                   END,
    cidade       = COALESCE(NULLIF(EXCLUDED.cidade, ''), public.orders.cidade),
    estado_uf    = COALESCE(NULLIF(EXCLUDED.estado_uf, ''), public.orders.estado_uf),
    cep          = COALESCE(NULLIF(EXCLUDED.cep, ''), public.orders.cep),
    rastreio     = COALESCE(NULLIF(EXCLUDED.rastreio, ''), public.orders.rastreio),
    is_pacote    = EXCLUDED.is_pacote,
    is_full      = EXCLUDED.is_full,
    pack_id      = COALESCE(EXCLUDED.pack_id, public.orders.pack_id),
    notes        = COALESCE(NULLIF(EXCLUDED.notes, ''), public.orders.notes),
    archived     = false,
    needs_attention = (
      COALESCE(NULLIF(EXCLUDED.status_ml, ''), public.orders.status_ml) IS NOT NULL
      AND COALESCE(NULLIF(EXCLUDED.status_ml, ''), public.orders.status_ml) ILIKE '%cancelad%'
      AND EXISTS (
        SELECT 1 FROM public.order_items oi
        WHERE oi.order_id = public.orders.id AND oi.picked = true
      )
    )
  RETURNING public.orders.id, public.orders.num_venda, (xmax = 0);
$function$;
