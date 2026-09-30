// Duas formas de ser chamada (deploy com --no-verify-jwt):
//
// 1) Cron do Postgres (pg_cron + pg_net, a cada 3h — ver
//    supabase/fase34-ml-shipping-deadline-recheck-cron.sql), sem body.
//    Pedido ML de envio complexo (volumoso, cross-docking) às vezes tem o
//    prazo real (shipment.lead_time.buffering.date) calculado pelo ML
//    DEPOIS da criação do pedido — se o webhook processa rápido demais,
//    `shipping_deadline` fica NULL e o ship_date cai no corte de horário
//    (caso real 31/08: volumoso no picklist de hoje, prazo real era daqui
//    2 semanas). Este cron corrige isso sozinho.
//
// 2) Botão "Atualizar pedidos" da Expedição (30/09, Fase 83) — body
//    { mode: 'manual' }. Antecipa o cron na hora pra TODOS os pedidos ML
//    em aberto (não só os sem prazo), inclusive pacote (via /packs).
//
// Em ambos, o dia final sai de compute_ship_date() (mesma regra do
// INSERT: prazo real do ML > corte de horário, fim de semana → segunda)
// — antes o cron gravava o buffering.date cru e pulava a regra do fim de
// semana. Só mexe em pedido sem nada separado e nunca joga pra antes de hoje.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { adminClient, getValidIntegration, mlFetch } from '../_shared/mercadolivre.ts'
import { toISODateBR } from '../_shared/dateBR.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const fmtBR = (d: string) => { const [, m, dd] = d.split('-'); return `${dd}/${m}` }
const addDays = (s: string, n: number) => { const d = new Date(`${s}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

async function pool<T>(items: T[], size: number, fn: (x: T) => Promise<void>) {
  let i = 0
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) { const x = items[i++]; await fn(x) }
  }))
}

// Acha o shipment do pedido — pacote não tem /orders/{pack_id}, vai por /packs
async function findShipment(o: any, token: string) {
  let shipmentId: number | null = null
  if (o.pack_id && o.pack_id === o.num_venda) {
    const pack = await mlFetch(`/packs/${o.pack_id}`, token)
    shipmentId = pack?.shipment?.id ?? null
    if (!shipmentId && pack?.orders?.[0]?.id) {
      const first = await mlFetch(`/orders/${pack.orders[0].id}`, token)
      shipmentId = first?.shipping?.id ?? null
    }
  } else {
    const order = await mlFetch(`/orders/${o.num_venda}`, token)
    shipmentId = order?.shipping?.id ?? null
  }
  return shipmentId ? await mlFetch(`/shipments/${shipmentId}`, token, { 'x-format-new': 'true' }) : null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  let body: any = {}
  try { body = await req.json() } catch { /* cron manda sem body */ }
  const manual = body?.mode === 'manual'

  const db = adminClient()
  try {
    const integration = await getValidIntegration(db)
    const today = toISODateBR(new Date())
    const select = 'id, num_venda, pack_id, data_venda, ship_date, shipping_deadline, status_ml, is_full, items:order_items(picked)'

    let candidates: any[] = []
    if (manual) {
      const { data, error } = await db.from('orders').select(select)
        .eq('source', 'ml').eq('archived', false).eq('is_full', false)
        .gte('ship_date', today)
        .limit(200)
      if (error) throw error
      candidates = (data || []).filter((o: any) => !/cancelad/i.test(o.status_ml || '') && !(o.items || []).some((it: any) => it.picked))
    } else {
      const now = Date.now()
      const { data, error } = await db.from('orders').select(select)
        .eq('source', 'ml').eq('archived', false)
        .is('shipping_deadline', null)
        .is('shipping_deadline_checked_at', null)
        .gte('created_at', new Date(now - 48 * 3600 * 1000).toISOString())
        .lte('created_at', new Date(now - 2 * 3600 * 1000).toISOString())
        .limit(30)
      if (error) throw error
      candidates = data || []
    }

    const moved: { num_venda: string; from: string; to: string }[] = []
    let checked = 0, failed = 0

    await pool(candidates, manual ? 6 : 2, async (o: any) => {
      try {
        const shipment = await findShipment(o, integration.access_token)
        const bufferingDate: string | null = shipment?.lead_time?.buffering?.date?.slice(0, 10) ?? null
        checked++

        const patch: Record<string, unknown> = { shipping_deadline_checked_at: new Date().toISOString() }
        if (bufferingDate) patch.shipping_deadline = bufferingDate
        const LOGISTIC: Record<string, string> = { self_service: 'Flex', cross_docking: 'Coleta', xd_drop_off: 'Agência', drop_off: 'Agência / Correios', fulfillment: 'Full' }
        if (shipment?.logistic?.type) patch.shipping_carrier = LOGISTIC[shipment.logistic.type] ?? shipment.logistic.type
        if (manual) patch.marketplace_refreshed_at = new Date().toISOString()

        const picked = (o.items || []).some((it: any) => it.picked)
        if (!picked && o.ship_date >= today) {
          const { data: computed } = await db.rpc('compute_ship_date', {
            p_source: 'ml', p_data_venda: o.data_venda, p_shipping_deadline: bufferingDate ?? o.shipping_deadline,
          })
          let next = computed as string | null
          if (next && next < today) next = today
          if (next && next !== o.ship_date) {
            patch.ship_date = next
            patch.day_auto_corrected = true
            patch.day_auto_corrected_note = `Dia corrigido automaticamente: era ${fmtBR(o.ship_date)}, agora ${fmtBR(next)}${bufferingDate ? ` (prazo real do ML: ${fmtBR(bufferingDate)})` : ''}.`
            moved.push({ num_venda: o.num_venda, from: o.ship_date, to: next })
          }
        }
        await db.from('orders').update(patch).eq('id', o.id)
      } catch (err) {
        failed++
        console.error(`[ml-shipping-deadline-recheck] falhou pedido ${o.num_venda}:`, err)
        // Não marca como checado — tenta de novo na próxima rodada.
      }
    })

    if (moved.length && !manual) {
      const { data: admins } = await db.from('system_users')
        .select('id').in('role', ['admin', 'administrativo']).eq('active', true)
      if (admins?.length) {
        const list = moved.map(c => `#${c.num_venda}: ${c.from} → ${c.to}`).join('; ')
        await db.from('notifications').insert(admins.map((u: any) => ({
          user_id: u.id,
          type:    'ml_shipping_deadline_corrected',
          title:   `📅 Prazo de envio ML corrigido automaticamente (${moved.length})`,
          body:    `O prazo real chegou depois do pedido criado — ship_date corrigido sozinho: ${list}`,
          link:    '/expedicao',
        })))
      }
    }

    return json({ ok: true, source: 'ml', checked, updated: checked, failed, moved, candidates: candidates.length })
  } catch (err) {
    console.error('[ml-shipping-deadline-recheck] erro:', err)
    return json({ ok: false, error: String(err) }, 500)
  }
})
