// Duas formas de ser chamada (deploy com --no-verify-jwt):
//
// 1) Cron do Postgres (pg_cron + pg_net, a cada 3h — ver
//    supabase/fase67-shopee-shipping-deadline-recheck-cron.sql), sem body.
//    Espelha o ml-shipping-deadline-recheck: a Shopee às vezes ainda não
//    calculou o `ship_by_date` quando o webhook processa o pedido, e
//    `ship_date` só é calculado no INSERT — este cron fecha esse buraco.
//    Desde a Fase 83 (30/09) também completa os dados da Expedição (nome
//    real do comprador, transportadora, mensagem) dos pedidos em aberto
//    que ainda não têm; desde 02/10 rechecha todos os em aberto (nota do
//    vendedor escrita depois do pedido chegar).
//
// 2) Botão "Atualizar pedidos" da Expedição — body { mode: 'manual' }.
//    Antecipa o cron na hora: atualiza TODOS os pedidos Shopee em aberto
//    (status, prazo, nome, transportadora) e recalcula o dia de quem
//    ainda não tem nada separado (corte 13h configurável + prazo da
//    Shopee — regra em compute_ship_date, nunca pra antes de hoje).
//    Devolve um resumo pra mostrar na tela.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { adminClient, getValidIntegration } from '../_shared/shopee.ts'
import { toISODateBR } from '../_shared/dateBR.ts'
import { refreshShopeeOrders, REFRESH_SELECT } from '../_shared/shopeeOrders.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const addDays = (s: string, n: number) => { const d = new Date(`${s}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

async function notifyMoved(db: ReturnType<typeof adminClient>, moved: { num_venda: string; from: string; to: string }[]) {
  if (!moved.length) return
  const { data: admins } = await db.from('system_users')
    .select('id').in('role', ['admin', 'administrativo']).eq('active', true)
  if (!admins?.length) return
  const list = moved.map(c => `#${c.num_venda}: ${c.from} → ${c.to}`).join('; ')
  await db.from('notifications').insert(admins.map((u: any) => ({
    user_id: u.id,
    type:    'shopee_shipping_deadline_corrected',
    title:   `📅 Prazo de envio Shopee corrigido automaticamente (${moved.length})`,
    body:    `ship_date corrigido: ${list}`,
    link:    '/expedicao',
  })))
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  let body: any = {}
  try { body = await req.json() } catch { /* cron manda sem body */ }

  const db = adminClient()
  try {
    const integration = await getValidIntegration(db)
    const today = toISODateBR(new Date())

    if (body?.mode === 'manual') {
      // Tudo que ainda está em aberto: de 3 dias atrás (atrasados) em diante
      const { data: orders, error } = await db.from('orders')
        .select(REFRESH_SELECT)
        .eq('source', 'shopee').eq('archived', false)
        .gte('ship_date', addDays(today, -3))
        .limit(400)
      if (error) throw error
      const result = await refreshShopeeOrders(db, integration, orders || [], { recomputeDay: true })
      await db.from('shopee_integration').update({ last_sync_at: new Date().toISOString() }).eq('id', integration.id)
      return json({ ok: true, source: 'shopee', ...result })
    }

    // ── Cron ──
    // (a) pedido que nasceu sem prazo, criado entre 2h e 48h atrás
    const now = Date.now()
    const { data: noDeadline } = await db.from('orders')
      .select(REFRESH_SELECT)
      .eq('source', 'shopee').eq('archived', false)
      .is('shipping_deadline', null).is('shipping_deadline_checked_at', null)
      .gte('created_at', new Date(now - 48 * 3600 * 1000).toISOString())
      .lte('created_at', new Date(now - 2 * 3600 * 1000).toISOString())
      .limit(30)
    const r1 = await refreshShopeeOrders(db, integration, noDeadline || [], { recomputeDay: true })

    // (b) todo pedido em aberto (de hoje em diante): completa os dados da
    // Expedição (nome etc.) e traz nota do vendedor / mensagem do
    // comprador escritas depois que o pedido chegou — a Shopee não manda
    // push quando só a nota muda. Antes (até 02/10) pegava só quem ainda
    // não tinha o nome, e a nota nova ficava sem atualizar.
    const { data: missing } = await db.from('orders')
      .select(REFRESH_SELECT)
      .eq('source', 'shopee').eq('archived', false)
      .gte('ship_date', today)
      .limit(400)
    const r2 = await refreshShopeeOrders(db, integration, missing || [], { recomputeDay: false })

    await notifyMoved(db, r1.moved)
    return json({ ok: true, deadline_recheck: r1, enrich: r2 })
  } catch (err) {
    console.error('[shopee-shipping-deadline-recheck] erro:', err)
    return json({ ok: false, error: String(err) }, 500)
  }
})
