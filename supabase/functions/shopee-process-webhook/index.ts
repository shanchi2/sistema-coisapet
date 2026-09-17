// Disparada por um Database Webhook no INSERT de shopee_webhook_events
// (mesmo padrão do ml-process-webhook). Busca o pedido completo na API
// da Shopee, mapeia pro mesmo formato comum que a importação manual do
// .xlsx usa (parseShopeeXlsx, useOrders.js) e reaproveita as mesmas RPCs
// seguras de upsert (upsert_orders_safe/insert_order_items_safe) já
// usadas pelo ML.
//
// ⚠️ Mapeamento de status/campos a CONFIRMAR contra um pedido real —
// construído com base no formato documentado publicamente da API v2,
// não testado ainda contra um evento de verdade (a doc oficial bloqueou
// acesso automático, mesma limitação já registrada no estudo
// comparativo). Processa de forma permissiva de propósito: se não
// reconhecer o formato do evento, marca como concluído sem erro (não
// fica reprocessando) mas não perde o `raw_payload` pra investigar.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { adminClient, getValidIntegration, shopeeFetch } from '../_shared/shopee.ts'

const ORDER_STATUS_PT: Record<string, string> = {
  UNPAID:              'Aguardando pagamento',
  READY_TO_SHIP:       'Pronto para envio',
  PROCESSED:           'Processando',
  SHIPPED:             'A caminho',
  TO_CONFIRM_RECEIVE:  'Aguardando confirmação de recebimento',
  COMPLETED:           'Entregue',
  IN_CANCEL:           'Cancelamento solicitado',
  CANCELLED:           'Cancelado',
  INVOICE_PENDING:     'Aguardando nota fiscal',
}

function isCancelledStatus(estado: string | null) {
  return !!estado && estado.toLowerCase().includes('cancelad')
}

// Extrai o order_sn do payload cru, tentando os formatos mais prováveis
// (a doc não pôde ser confirmada em detalhe — ver nota no topo).
function extractOrderSn(rawPayload: any): string | null {
  const d = rawPayload?.data ?? {}
  return d.ordersn || d.order_sn || rawPayload?.ordersn || rawPayload?.order_sn || null
}

function mapShopeeOrderToCommon(order: any) {
  const rawStatus = order.order_status || null
  const estado = rawStatus ? (ORDER_STATUS_PT[rawStatus] ?? rawStatus) : null

  const addr = order.recipient_address || {}
  const items = (order.item_list || []).map((it: any) => ({
    titulo:     it.item_name || it.model_name || '—',
    sku:        it.model_sku || it.item_sku || null,
    variacao:   (it.model_name && it.model_name !== it.item_name) ? it.model_name : null,
    qty:        it.model_quantity_purchased ?? it.quantity_purchased ?? 1,
    preco_unit: it.model_discounted_price ?? it.model_original_price ?? null,
    obs_item:   null,
  }))

  return {
    num:        String(order.order_sn),
    data:       order.create_time ? new Date(order.create_time * 1000).toISOString() : null,
    // Shopee manda o prazo próprio de envio (ship_by_date) — igual já
    // fazemos na importação manual (parseShopeeXlsx), sem corte de
    // horário artificial tipo o do ML.
    shipping_deadline: order.ship_by_date ? new Date(order.ship_by_date * 1000).toISOString().slice(0, 10) : null,
    estado,
    desc:       null,
    comprador:  order.buyer_username || addr.name || null,
    cidade:     addr.city || null,
    estado_uf:  addr.state || null,
    cep:        addr.zipcode || null,
    rastreio:   order.tracking_number || null,
    is_pacote:  false,
    pack_id:    null,
    // Shopee tem conceito próprio de fulfillment (SBS/FBS) — ainda não
    // mapeado, ver [[coisapet_shopee_api_research]]. Fica false até
    // confirmarmos o campo real que indica isso na resposta do pedido.
    is_full:    false,
    notes:      order.note || null,
    items,
  }
}

// Meia-noite de Brasília (BRT é UTC-3 fixo, sem horário de verão desde
// 2019) — mesmo critério do `plainDayStart` usado na importação manual
// da Shopee (useOrders.js): sem corte de horário artificial, porque a
// Shopee já manda o prazo de envio (ship_by_date) pronto.
function shopeeBatchDayStart(now = new Date()): Date {
  const CUTOFF_UTC_HOUR = 3
  const d = new Date(now)
  if (d.getUTCHours() < CUTOFF_UTC_HOUR) d.setUTCDate(d.getUTCDate() - 1)
  d.setUTCHours(CUTOFF_UTC_HOUR, 0, 0, 0)
  return d
}

async function notifyNewOrder(db: ReturnType<typeof adminClient>, parsed: ReturnType<typeof mapShopeeOrderToCommon>, itemsToInsert: any[], cancelado: boolean) {
  const { data: admins } = await db.from('system_users')
    .select('id').in('role', ['admin', 'administrativo']).eq('active', true)
  if (!admins?.length) return

  const semSku = itemsToInsert.filter(it => !it.sku_encontrado).length
  const statusLine = cancelado
    ? '🚫 Cancelado — não entra no picklist'
    : semSku > 0
      ? `⚠️ ${semSku} item(ns) sem SKU cadastrado`
      : '✅ Vai pro picklist'
  const totalQty = parsed.items.reduce((s, it) => s + (it.qty || 1), 0)
  const local = [parsed.cidade, parsed.estado_uf].filter(Boolean).join('/')
  const body = `${parsed.comprador || 'Comprador não identificado'}${local ? ` · ${local}` : ''}\n`
    + `${totalQty} ite${totalQty === 1 ? 'm' : 'ns'} · ${statusLine}`

  await db.from('notifications').insert(admins.map((u: any) => ({
    user_id: u.id,
    type:    'shopee_order_synced',
    title:   '🛒 Nova venda — Shopee',
    body,
    link:    '/pedidos',
  })))
}

async function saveOrder(db: ReturnType<typeof adminClient>, parsed: ReturnType<typeof mapShopeeOrderToCommon>) {
  const batchDayStart = shopeeBatchDayStart(parsed.data ? new Date(parsed.data) : new Date())
  const batchDayEnd = new Date(batchDayStart.getTime() + 24 * 60 * 60 * 1000)
  const { data: existingBatch } = await db.from('import_batches')
    .select('id').eq('source', 'shopee')
    .gte('imported_at', batchDayStart.toISOString())
    .lt('imported_at', batchDayEnd.toISOString())
    .order('imported_at', { ascending: false }).limit(1).maybeSingle()

  let batchId: string
  if (existingBatch) {
    batchId = existingBatch.id
  } else {
    const { data: newBatch, error } = await db.from('import_batches')
      .insert({ source: 'shopee', filename: 'API Shopee', total_orders: 0, total_items: 0 })
      .select('id').single()
    if (error) throw error
    batchId = newBatch.id
  }

  const { data: savedRows, error: ordErr } = await db.rpc('upsert_orders_safe', {
    p_orders: [{
      batch_id:    batchId,
      source:      'shopee',
      num_venda:   parsed.num,
      data_venda:  parsed.data,
      shipping_deadline: parsed.shipping_deadline,
      status_ml:   parsed.estado,
      status_desc: parsed.desc,
      comprador:   parsed.comprador,
      cidade:      parsed.cidade,
      estado_uf:   parsed.estado_uf,
      cep:         parsed.cep,
      rastreio:    parsed.rastreio,
      is_pacote:   parsed.is_pacote,
      pack_id:     parsed.pack_id,
      is_full:     parsed.is_full,
      notes:       parsed.notes,
    }],
  })
  if (ordErr) throw ordErr
  const savedOrder = savedRows[0]

  const skus = [...new Set(parsed.items.map(it => it.sku).filter(Boolean))]
  const skuMap = new Map<string, string>()
  if (skus.length > 0) {
    const { data: products } = await db.from('products').select('id, sku').in('sku', skus)
    ;(products || []).forEach(p => skuMap.set(p.sku, p.id))
  }

  const cancelado = isCancelledStatus(parsed.estado)
  const candidateItems = parsed.items.map(it => ({
    order_id:        savedOrder.id,
    product_id:      it.sku ? (skuMap.get(it.sku) || null) : null,
    titulo:          it.titulo,
    sku:             it.sku,
    variacao:        it.variacao,
    qty:             it.qty,
    preco_unit:      it.preco_unit,
    obs_item:        it.obs_item,
    sku_encontrado:  it.sku ? skuMap.has(it.sku) : true,
    source_order_id: parsed.num,
  }))
  const { data: itemsToInsert, error: itemsErr } = await db.rpc('insert_order_items_safe', { p_items: candidateItems })
  if (itemsErr) throw itemsErr
  const hasNewItems = (itemsToInsert || []).length > 0

  if (hasNewItems) {
    if (!cancelado) {
      const { data: prodOrder, error: prodErr } = await db.from('production_orders')
        .insert({ source: 'shopee', date: new Date().toISOString().split('T')[0], import_batch_id: batchId, notes: `Sincronizado via API — pedido ${parsed.num}` })
        .select('id').single()
      if (!prodErr && prodOrder) {
        await db.from('production_order_items').insert(itemsToInsert.map(it => ({
          order_id:     prodOrder.id,
          product_id:   it.product_id,
          product_name: it.titulo + (it.variacao ? ` — ${it.variacao}` : ''),
          sku:          it.sku,
          qty_ordered:  it.qty,
          has_stock:    false,
          status:       'pendente',
        })))
      }
    }
    await notifyNewOrder(db, parsed, itemsToInsert, cancelado)
  }

  const { data: batchOrders } = await db.from('orders').select('id').eq('batch_id', batchId)
  const allIds = (batchOrders || []).map(o => o.id)
  let totalItems = 0
  if (allIds.length) {
    const { data: qtys } = await db.from('order_items').select('qty').in('order_id', allIds)
    totalItems = (qtys || []).reduce((s, it) => s + (it.qty || 0), 0)
  }
  await db.from('import_batches').update({ total_orders: allIds.length, total_items: totalItems }).eq('id', batchId)

  return { hasNewItems }
}

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const payload = await req.json()
  const record  = payload.record // { id, code, shop_id, status, attempts, raw_payload, ... }
  if (!record?.id) return new Response('No event record', { status: 400 })

  const db = adminClient()

  if (record.status !== 'pending') return new Response('Já processado', { status: 200 })

  const orderSn = extractOrderSn(record.raw_payload)
  if (!orderSn) {
    // Evento que não reconhecemos (ou não é sobre pedido) — não é erro,
    // só não tem o que sincronizar. Fica marcado como 'done' com o
    // payload cru salvo, pra dar pra revisar o formato depois.
    await db.from('shopee_webhook_events').update({
      status: 'done', processed_at: new Date().toISOString(),
      error_msg: 'Evento sem order_sn reconhecível — ver raw_payload.',
    }).eq('id', record.id)
    return new Response('OK (sem order_sn)', { status: 200 })
  }

  try {
    const integration = await getValidIntegration(db)
    const detail = await shopeeFetch('/api/v2/order/get_order_detail', integration, {
      order_sn_list: orderSn,
      response_optional_fields: 'buyer_username,recipient_address,item_list,order_status,create_time,update_time,ship_by_date,note,tracking_number',
    })
    const order = detail?.response?.order_list?.[0]
    if (!order) throw new Error(`Pedido ${orderSn} não veio na resposta de get_order_detail`)

    const parsed = mapShopeeOrderToCommon(order)
    await saveOrder(db, parsed)

    await db.from('shopee_webhook_events').update({
      status: 'done', processed_at: new Date().toISOString(),
    }).eq('id', record.id)

    await db.from('shopee_integration').update({ last_sync_at: new Date().toISOString() }).eq('id', integration.id)

    return new Response('OK', { status: 200 })
  } catch (err) {
    console.error('[shopee-process-webhook] erro:', err)
    await db.from('shopee_webhook_events').update({
      status: 'error',
      error_msg: String(err).slice(0, 2000),
      attempts: (record.attempts || 0) + 1,
    }).eq('id', record.id)
    return new Response('Erro ao processar', { status: 500 })
  }
})
