// Disparada periodicamente por um cron do Postgres (pg_cron + pg_net,
// ver supabase/fase67-shopee-shipping-deadline-recheck-cron.sql) —
// nunca chamada pelo frontend, mesmo padrão de
// ml-shipping-deadline-recheck (deploy com --no-verify-jwt).
//
// Objetivo: espelha o problema já resolvido pro ML (Fase 34) — a
// Shopee às vezes ainda não calculou o prazo de envio (`ship_by_date`)
// no exato momento em que o nosso webhook processa o pedido (quase em
// tempo real), então `shipping_deadline` fica NULL e o ship_date cai
// no fallback (data da venda, sem corte de horário). Diferente do ML,
// a Shopee NÃO tinha nenhum jeito de corrigir isso depois — um pedido
// que nascesse sem `ship_by_date` ficava PRA SEMPRE no dia errado,
// porque `upsert_orders_safe` não atualiza `shipping_deadline`/
// `ship_date` em pushes seguintes (fase23-arquivar-pedidos-ml.sql) e o
// trigger que calcula ship_date só roda em BEFORE INSERT (fase20). Este
// cron fecha esse buraco, igual o ml-shipping-deadline-recheck já faz.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { adminClient, getValidIntegration, shopeeFetch } from '../_shared/shopee.ts'

const BATCH_LIMIT = 30

// DD/MM, só pra montar a nota legível do badge (Fase 66) — data já vem
// como 'YYYY-MM-DD' (coluna DATE), sem timezone pra considerar aqui.
function fmtBR(dateStr: string) {
  const [, m, d] = dateStr.split('-')
  return `${d}/${m}`
}

serve(async () => {
  const db = adminClient()
  try {
    const integration = await getValidIntegration(db)

    const now = Date.now()
    const notBefore = new Date(now - 48 * 3600 * 1000).toISOString() // não vale a pena recheckar pedido velho demais
    const notAfter  = new Date(now - 2  * 3600 * 1000).toISOString() // dá tempo da Shopee terminar de calcular

    const { data: candidates, error } = await db.from('orders')
      .select('id, num_venda, ship_date')
      .eq('source', 'shopee').eq('archived', false)
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
        const detail = await shopeeFetch('/api/v2/order/get_order_detail', integration, {
          order_sn_list: o.num_venda,
          response_optional_fields: 'ship_by_date',
        })
        const order = detail?.response?.order_list?.[0]
        const shipByDate: number | null = order?.ship_by_date ?? null
        const shipByDateStr = shipByDate ? new Date(shipByDate * 1000).toISOString().slice(0, 10) : null
        checkedCount++

        if (shipByDateStr) {
          const changed = shipByDateStr !== o.ship_date
          await db.from('orders').update({
            shipping_deadline: shipByDateStr,
            ship_date: shipByDateStr,
            shipping_deadline_checked_at: new Date().toISOString(),
            ...(changed ? {
              day_auto_corrected: true,
              day_auto_corrected_note: `Dia corrigido automaticamente: era ${fmtBR(o.ship_date)}, o prazo real da Shopee é ${fmtBR(shipByDateStr)}.`,
            } : {}),
          }).eq('id', o.id)
          if (changed) corrections.push({ num_venda: o.num_venda, from: o.ship_date, to: shipByDateStr })
        } else {
          // Nunca teve prazo especial mesmo — marca como checado pra não
          // tentar de novo pra sempre.
          await db.from('orders').update({ shipping_deadline_checked_at: new Date().toISOString() }).eq('id', o.id)
        }
      } catch (err) {
        console.error(`[shopee-shipping-deadline-recheck] falhou pedido ${o.num_venda}:`, err)
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
          type:    'shopee_shipping_deadline_corrected',
          title:   `📅 Prazo de envio Shopee corrigido automaticamente (${corrections.length})`,
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
    console.error('[shopee-shipping-deadline-recheck] erro:', err)
    return new Response(String(err), { status: 500 })
  }
})
