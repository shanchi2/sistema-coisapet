// Recebe o snapshot da Gestão de Envios Full extraído direto do painel
// do Mercado Livre (não da API pública dele — ele não expõe isso por
// API, só pelo navegador logado, ver fase44-full-inbound-shipments.sql).
// Pedido do Raphael (13/09): parar de precisar pedir pro Claude
// sincronizar toda vez. Solução: um bookmarklet (arquivo separado, ver
// coisapet.md) que roda NO NAVEGADOR do Raphael enquanto ele está
// logado no ML — usa a sessão dele pra ler os mesmos dados que a tela
// do ML mostra (via `/api/shipping/inbounds/search` pra lista e o JSON
// já embutido no HTML da página de detalhe pra cada envio) e manda tudo
// pra cá. Por isso este endpoint é público (deploy --no-verify-jwt,
// mesmo motivo do ml-webhook/ml-oauth-callback) e protegido só por um
// segredo simples (FULL_SYNC_SECRET) em vez de JWT de usuário logado no
// nosso sistema — quem chama aqui é o navegador no domínio do ML, não o
// nosso frontend.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

// "Cor: Azul" a partir de [{name:"52028", valueName:"Azul"}] — o `name`
// aqui é só um ID de atributo interno do ML, sem rótulo legível, então
// usamos só o valueName (é o que a tela de detalhe do ML também mostra).
function variationText(attrs: any): string | null {
  if (!Array.isArray(attrs) || !attrs.length) return null
  const text = attrs.map((a: any) => a?.valueName).filter(Boolean).join(', ')
  return text || null
}

function resultText(processResults: any): string | null {
  if (!Array.isArray(processResults) || !processResults.length) return null
  const texts = processResults.map((r: any) => r?.description || r?.text || r?.message).filter(Boolean)
  return texts.length ? texts.join('; ') : JSON.stringify(processResults)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: any = {}
  try { body = await req.json() } catch { return json({ error: 'JSON inválido' }, 400) }

  const expectedSecret = Deno.env.get('FULL_SYNC_SECRET')
  if (!expectedSecret || body.secret !== expectedSecret) {
    return json({ error: 'Não autorizado' }, 401)
  }

  const shipments = Array.isArray(body.shipments) ? body.shipments : []
  const items = Array.isArray(body.items) ? body.items : []
  const now = new Date().toISOString()
  const db = adminClient()

  try {
    const shipmentRows = shipments.map((s: any) => ({
      id: s.id,
      shipment_type:                s.shipment_type ?? null,
      name:                         s.name ?? null,
      status:                       s.status ?? null,
      sub_status:                   s.sub_status ?? null,
      units_count:                  s.units_count ?? null,
      products_count:               s.products_count ?? null,
      appointment_date:             s.appointment?.date ?? null,
      appointment_cancel_limit:     s.appointment?.cancellation_limit_date ?? null,
      appointment_expired:          s.appointment?.appointment_expired ?? null,
      reception_date:               s.reception_date ?? null,
      on_sale_units:                s.on_sale_units ?? null,
      logistic_center_id:           s.logistic_center_id ?? null,
      logistics_summary:            s.logistics_summary ?? null,
      total_charged:                s.inbound_charges?.total_charged ?? null,
      with_penalties:               s.inbound_charges?.with_penalties ?? null,
      has_identification_problems:  s.inbound_problems?.has_identification_problems ?? null,
      has_unsolvable_problems:      s.inbound_problems?.has_unsolvable_problems ?? null,
      has_fiscal_problems:          s.inbound_problems?.has_fiscal_problems ?? null,
      last_updated_ml:              s.last_updated ?? null,
      raw:                          s,
      synced_at:                    now,
    }))

    if (shipmentRows.length) {
      const { error } = await db.from('ml_full_inbound_shipments').upsert(shipmentRows, { onConflict: 'id' })
      if (error) throw error
    }

    // Snapshot completo por envio — apaga e reinsere em vez de tentar
    // casar linha a linha (não existe uma chave natural estável: o
    // mesmo item ML pode aparecer mais de uma vez no envio, uma por SKU/
    // variação, ver notas de ml_full_inbound_items.raw).
    const shipmentIdsWithItems = [...new Set(items.map((i: any) => i.shipment_id))]
    for (const sid of shipmentIdsWithItems) {
      const { error } = await db.from('ml_full_inbound_items').delete().eq('shipment_id', sid)
      if (error) throw error
    }

    const itemRows = items.map((i: any) => {
      const u = i.unit || {}
      return {
        shipment_id:   i.shipment_id,
        ml_code:       u.itemId ?? null,
        title:         u.itemTitle ?? null,
        variation:     variationText(u.variationAttributes),
        declared_qty:  u.declaredQuantity ?? null,
        processed_qty: u.processedQuantity ?? null,
        diff_qty:      u.differencesQuantity ?? null,
        apt_qty:       u.readyToFullQuantity ?? null,
        result_text:   resultText(u.processResults),
        raw:           u,
        synced_at:     now,
      }
    })

    if (itemRows.length) {
      const { error } = await db.from('ml_full_inbound_items').insert(itemRows)
      if (error) throw error
    }

    return json({ ok: true, shipments_synced: shipmentRows.length, items_synced: itemRows.length })
  } catch (err) {
    console.error('[ml-full-shipments-ingest] erro:', err)
    return json({ error: String(err) }, 500)
  }
})
