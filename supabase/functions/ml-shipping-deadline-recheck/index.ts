// Disparada periodicamente por um cron do Postgres (pg_cron + pg_net,
// ver supabase/fase34-ml-shipping-deadline-recheck-cron.sql) — nunca
// chamada pelo frontend, por isso deploy com --no-verify-jwt (mesmo
// padrão de ml-reputation-check).
//
// Objetivo: pedido ML de envio complexo (volumoso, cross-docking) às
// vezes tem o prazo real (shipment.lead_time.buffering.date) calculado
// pelo ML alguns minutos/horas DEPOIS da criação do pedido — se o nosso
// webhook processa o pedido rápido demais (comum, é quase em tempo
// real), `shipping_deadline` fica NULL e o ship_date cai no corte de
// horário padrão (assume amanhã), mesmo quando o prazo real é bem mais
// longe (caso real confirmado em 2026-08-31: pedido volumoso apareceu
// no picklist de hoje, prazo real do ML era só daqui 2 semanas).
// `ship_date` só é calculado 1x na criação (Fase 20) e nunca mais
// recalculado sozinho — esse cron é o único jeito de corrigir esse tipo
// de corrida sem depender de alguém notar e reportar de novo.
//
// Escopo: só pedidos SEM pack (pack_id IS NULL) — pedido em pacote tem
// vários `order.id` (1 por produto) e nenhum é o mesmo do `num_venda`
// (que vira o pack_id), então `/orders/{num_venda}` não é válido pra
// pack. Deixado de fora por ora (caso raro dentro de um caso já raro).
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { adminClient, getValidIntegration, mlFetch } from '../_shared/mercadolivre.ts'

const BATCH_LIMIT = 30

serve(async () => {
  const db = adminClient()
  try {
    const integration = await getValidIntegration(db)

    const now = Date.now()
    const notBefore = new Date(now - 48 * 3600 * 1000).toISOString() // não vale a pena recheckar pedido velho demais
    const notAfter  = new Date(now - 2  * 3600 * 1000).toISOString() // dá tempo do ML terminar de calcular

    const { data: candidates, error } = await db.from('orders')
      .select('id, num_venda, ship_date')
      .eq('source', 'ml').eq('archived', false)
      .is('pack_id', null)
      .is('shipping_deadline', null)
      .is('shipping_deadline_checked_at', null)
      .gte('created_at', notBefore)
      .lte('created_at', notAfter)
      .limit(BATCH_LIMIT)
    if (error) throw error
    if (!candidates?.length) return new Response('Nenhum pedido pra rechecar.', { status: 200 })

    const corrections: { num_venda: string; from: string; to: string }[] = []
    let checkedCount = 0

    for (const o of candidates) {
      try {
        const order = await mlFetch(`/orders/${o.num_venda}`, integration.access_token)
        const shipment = order.shipping?.id
          ? await mlFetch(`/shipments/${order.shipping.id}`, integration.access_token, { 'x-format-new': 'true' })
          : null
        const bufferingDate = shipment?.lead_time?.buffering?.date?.slice(0, 10) ?? null
        checkedCount++

        if (bufferingDate) {
          const changed = bufferingDate !== o.ship_date
          await db.from('orders').update({
            shipping_deadline: bufferingDate,
            ship_date: bufferingDate,
            shipping_deadline_checked_at: new Date().toISOString(),
          }).eq('id', o.id)
          if (changed) corrections.push({ num_venda: o.num_venda, from: o.ship_date, to: bufferingDate })
        } else {
          // Nunca teve prazo especial mesmo (frete padrão) — marca como
          // checado pra não tentar de novo pra sempre.
          await db.from('orders').update({ shipping_deadline_checked_at: new Date().toISOString() }).eq('id', o.id)
        }
      } catch (err) {
        console.error(`[ml-shipping-deadline-recheck] falhou pedido ${o.num_venda}:`, err)
        // Não marca como checado — tenta de novo na próxima rodada.
      }
    }

    if (corrections.length) {
      const { data: admins } = await db.from('system_users')
        .select('id').in('role', ['admin', 'administrativo']).eq('active', true)
      if (admins?.length) {
        const list = corrections.map(c => `#${c.num_venda}: ${c.from} → ${c.to}`).join('; ')
        await db.from('notifications').insert(admins.map((u: any) => ({
          user_id: u.id,
          type:    'ml_shipping_deadline_corrected',
          title:   `📅 Prazo de envio ML corrigido automaticamente (${corrections.length})`,
          body:    `O prazo real chegou depois do pedido criado — ship_date corrigido sozinho: ${list}`,
          link:    '/expedicao',
        })))
      }
    }

    return new Response(
      `Rechecados: ${checkedCount}/${candidates.length}. Corrigidos: ${corrections.length}.`,
      { status: 200 },
    )
  } catch (err) {
    console.error('[ml-shipping-deadline-recheck] erro:', err)
    return new Response(String(err), { status: 500 })
  }
})
