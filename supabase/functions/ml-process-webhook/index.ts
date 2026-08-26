// Disparada por um Database Webhook no INSERT de ml_webhook_events
// (mesmo padrão de send-notification-email, disparada no INSERT de
// notifications). Busca o pedido completo na API do ML, mapeia pro
// mesmo formato que parseMLXlsx devolve (useOrders.js) e reaproveita a
// lógica de saveImportedOrders — reimplementada aqui porque aquela
// roda no browser (hook React) e isso aqui roda no servidor.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { adminClient, getValidIntegration, mlFetch } from '../_shared/mercadolivre.ts'

// ⚠️ Mapeamento a CONFIRMAR no spike de descoberta (Fase 0 do plano):
// comparar contra pedidos reais antes de ligar em produção. Errar o
// "cancelled" aqui faz um pedido cancelado gerar produção/picklist —
// por isso status desconhecido cai em null (nunca em "Entregue" etc.
// por engano) e o pedido só fica sem badge de status.
const SHIPMENT_STATUS_PT: Record<string, string> = {
  pending:        'Pendente',
  handling:       'Processando',
  ready_to_ship:  'Pronto para envio',
  shipped:        'A caminho',
  delivered:      'Entregue',
  not_delivered:  'Não entregue',
  cancelled:      'Cancelado',
}

function mapOrderToCommon(order: any, shipment: any | null) {
  const status = shipment ? SHIPMENT_STATUS_PT[shipment.status] ?? null : null
  const estado = order.status === 'cancelled' ? 'Cancelado' : status

  const comprador = [order.buyer?.first_name, order.buyer?.last_name].filter(Boolean).join(' ')
    || order.buyer?.nickname || null

  const addr = shipment?.receiver_address
  const items = (order.order_items || []).map((oi: any) => ({
    titulo:     oi.item?.title || '—',
    sku:        oi.item?.seller_sku || null,
    variacao:   (oi.item?.variation_attributes || []).map((a: any) => `${a.name}: ${a.value_name}`).join(', ') || null,
    qty:        oi.quantity || 1,
    preco_unit: oi.unit_price ?? null,
    obs_item:   null,
  }))

  // Pacote (venda com N produtos): a API do ML entrega cada produto como
  // um `order.id` separado, mas todos compartilham o mesmo `pack_id` —
  // esse É o número real da venda (bate com o painel do ML). Usa ele
  // como num_venda pra todos os produtos do mesmo pacote caírem no
  // MESMO pedido, em vez de virar um pedido por produto (bug real
  // confirmado em 2026-08-26: pacote de 3 produtos virava 3 "pedidos"
  // separados, cada um com 1 item, todos "Pendente").
  const childOrderId = String(order.id)
  const num = order.pack_id ? String(order.pack_id) : childOrderId

  return {
    num,
    // ID individual do produto na API (nunca é o mesmo pro pedido inteiro
    // quando é pacote) — usado só pra saber se ESSE produto específico já
    // teve os itens inseridos antes, sem depender de "o pedido é novo".
    childOrderId,
    data:       order.date_created || null,
    // Prazo de envio REAL do ML — bate com "Para enviar no dia X" do
    // painel deles. NÃO é sempre "amanhã": varia com método de envio e
    // tamanho do pacote (confirmado: pacote de 3 produtos p/ Bahia deu
    // 3 dias, não 1). Só a parte da data — o ML sempre manda com hora
    // zerada em UTC, representando o dia mesmo, sem precisar converter fuso.
    shipping_deadline: shipment?.lead_time?.buffering?.date?.slice(0, 10) ?? null,
    estado,
    desc:       null,
    comprador,
    cidade:     addr?.city?.name || null,
    estado_uf:  addr?.state?.name || null,
    cep:        addr?.zip_code || null,
    rastreio:   shipment?.tracking_number || null,
    is_pacote:  !!order.pack_id,
    pack_id:    order.pack_id ? String(order.pack_id) : null,
    // Pedido Full = o ML guarda o estoque no centro de distribuição dele
    // e despacha sozinho — a CoisaPet nunca separa/embala esse pedido.
    // logistic_type='fulfillment' é o campo oficial da API pra isso.
    // Bug real em 2026-08-24: sem essa checagem, pedido Full entrava no
    // picklist normal como qualquer outro.
    is_full:    shipment?.logistic_type === 'fulfillment',
    notes:      null,
    items,
  }
}

function isCancelledStatus(estado: string | null) {
  return !!estado && estado.toLowerCase().includes('cancelad')
}

// O "dia do picklist" do ML não vira à meia-noite — vira às 11h de
// Brasília. Pedido que chega às 23h de hoje já é picklist de AMANHÃ, não
// de hoje. Essa function roda no servidor em UTC (não em horário de
// Brasília), então o corte é calculado em UTC: 11h BRT = 14h UTC
// (Brasília é UTC-3 fixo, sem horário de verão desde 2019).
function mlBatchDayStart(now = new Date()): Date {
  const CUTOFF_UTC_HOUR = 14
  const d = new Date(now)
  if (d.getUTCHours() < CUTOFF_UTC_HOUR) d.setUTCDate(d.getUTCDate() - 1)
  d.setUTCHours(CUTOFF_UTC_HOUR, 0, 0, 0)
  return d
}

// Equivalente server-side de saveImportedOrders (useOrders.js), com uma
// diferença de propósito: aqui SIM notifica (a importação manual do .xlsx
// não notifica por pedido — só deleteBatchOrders o faz). Faz sentido só
// aqui porque é a chegada automática em tempo real que ninguém mais tá
// observando ativamente; um upload manual já é uma ação que a pessoa
// acabou de fazer, não precisa avisar ela mesma do que ela mesma fez.
async function notifyNewOrder(db: ReturnType<typeof adminClient>, parsed: ReturnType<typeof mapOrderToCommon>, itemsToInsert: any[], cancelado: boolean) {
  const { data: admins } = await db.from('system_users')
    .select('id').in('role', ['admin', 'administrativo']).eq('active', true)
  if (!admins?.length) return

  const semSku = itemsToInsert.filter(it => !it.sku_encontrado).length
  const statusLine = cancelado
    ? '🚫 Cancelado — não entra no picklist'
    : parsed.is_full
      ? '📫 Full — despachado pelo ML, não precisa separar'
      : semSku > 0
        ? `⚠️ ${semSku} item(ns) sem SKU cadastrado`
        : '✅ Vai pro picklist'
  const totalQty = parsed.items.reduce((s, it) => s + (it.qty || 1), 0)
  const local = [parsed.cidade, parsed.estado_uf].filter(Boolean).join('/')
  const body = `${parsed.comprador || 'Comprador não identificado'}${local ? ` · ${local}` : ''}\n`
    + `${totalQty} ite${totalQty === 1 ? 'm' : 'ns'} · ${statusLine}`

  await db.from('notifications').insert(admins.map((u: any) => ({
    user_id: u.id,
    type:    'ml_order_synced',
    title:   '🛒 Nova venda — Mercado Livre',
    body,
    link:    '/pedidos',
  })))
}

async function saveOrder(db: ReturnType<typeof adminClient>, parsed: ReturnType<typeof mapOrderToCommon>) {
  // Corte de dia calculado a partir da DATA REAL DA VENDA (parsed.data),
  // nunca da hora em que este webhook está rodando — passar "agora" aqui
  // era o bug: um pedido comprado às 9h podia ser jogado pro lote de
  // amanhã se um webhook de status (ex: "pronto pra envio") chegasse à
  // tarde, porque só a hora de processamento era olhada.
  const batchDayStart = mlBatchDayStart(parsed.data ? new Date(parsed.data) : new Date())
  // Janela FECHADA (>= início, < fim) — sem limite superior, um lote criado
  // há pouco pra um dia mais recente era encontrado e reaproveitado por
  // engano por um pedido de dias atrás.
  const batchDayEnd = new Date(batchDayStart.getTime() + 24 * 60 * 60 * 1000)
  const { data: existingBatch } = await db.from('import_batches')
    .select('id').eq('source', 'ml')
    .gte('imported_at', batchDayStart.toISOString())
    .lt('imported_at', batchDayEnd.toISOString())
    .order('imported_at', { ascending: false }).limit(1).maybeSingle()

  let batchId: string
  if (existingBatch) {
    batchId = existingBatch.id
  } else {
    const { data: newBatch, error } = await db.from('import_batches')
      .insert({ source: 'ml', filename: 'API Mercado Livre', total_orders: 0, total_items: 0 })
      .select('id').single()
    if (error) throw error
    batchId = newBatch.id
  }

  // upsert_orders_safe PROTEGE batch_id/data_venda de um pedido que já
  // existe (nunca reatribui o dia/lote dele numa nova chamada de
  // webhook) e devolve was_inserted (via xmax=0), eliminando a corrida
  // entre um SELECT de pré-checagem e o upsert em si.
  const { data: savedRows, error: ordErr } = await db.rpc('upsert_orders_safe', {
    p_orders: [{
      batch_id:    batchId,
      source:      'ml',
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

  // Não usa mais "esse childOrderId específico já foi visto" pra decidir
  // se insere item — `source_order_id` só é confiável pra pedido que
  // SEMPRE entrou pela API. Pedido que já existia antes (importado por
  // `.xlsx`, ou criado pelo webhook antigo antes da Fase 22) tem
  // `source_order_id` backfilled = num_venda, que pode ser bem diferente
  // do `order.id` individual que a API devolve agora — o gate antigo
  // achava "produto novo" e duplicava o item de novo (bug real,
  // confirmado em 2026-08-26 logo depois da reimportação da Fase 23).
  // Em vez disso, compara por produto (sku+variação) já gravado nesse
  // pedido — é a única identidade que não muda dependendo de como o
  // pedido entrou no sistema. Normaliza espaços e maiúsculas na variação:
  // o `.xlsx` antigo grava "Cor : Amadeirado" (espaço antes dos ":") e a
  // API grava "Cor: Amadeirado" (sem espaço) pro MESMO produto —
  // comparação exata deixava passar duplicata real (confirmado: par do
  // Caio Raváglia). ML controla os dois formatos (xlsx e API) de jeitos
  // diferentes e sem aviso, então normaliza de forma ampla (espaço +
  // caixa) em vez de tentar prever cada variação de formatação possível.
  const itemKey = (sku: string | null, variacao: string | null) =>
    `${sku || ''}::${(variacao || '').replace(/\s+/g, '').toLowerCase()}`
  const { data: existingItems } = await db.from('order_items')
    .select('sku, variacao').eq('order_id', savedOrder.id)
  const existingKeys = new Set((existingItems || []).map(it => itemKey(it.sku, it.variacao)))
  const newItems = parsed.items.filter(it => !existingKeys.has(itemKey(it.sku, it.variacao)))
  const hasNewItems = newItems.length > 0

  if (hasNewItems) {
    const skus = [...new Set(newItems.map(it => it.sku).filter(Boolean))]
    const skuMap = new Map<string, string>()
    if (skus.length > 0) {
      const { data: products } = await db.from('products').select('id, sku').in('sku', skus)
      ;(products || []).forEach(p => skuMap.set(p.sku, p.id))
    }

    const cancelado = isCancelledStatus(parsed.estado)
    const itemsToInsert = newItems.map(it => ({
      order_id:       savedOrder.id,
      product_id:     it.sku ? (skuMap.get(it.sku) || null) : null,
      titulo:         it.titulo,
      sku:            it.sku,
      variacao:       it.variacao,
      qty:            it.qty,
      preco_unit:     it.preco_unit,
      obs_item:       it.obs_item,
      sku_encontrado: it.sku ? skuMap.has(it.sku) : true,
      source_order_id: parsed.childOrderId,
    }))
    const { error: itemsErr } = await db.from('order_items').insert(itemsToInsert)
    if (itemsErr) throw itemsErr

    // Full nunca gera produção — o ML separa e despacha sozinho do centro
    // de distribuição dele, a CoisaPet não tem esse pedido fisicamente.
    if (!cancelado && !parsed.is_full) {
      const { data: prodOrder, error: prodErr } = await db.from('production_orders')
        .insert({ source: 'ml', date: new Date().toISOString().split('T')[0], import_batch_id: batchId, notes: `Sincronizado via API — pedido ${parsed.num}` })
        .select('id').single()
      if (!prodErr && prodOrder) {
        await db.from('production_order_items').insert(itemsToInsert.map(it => ({
          order_id:     prodOrder.id,
          product_id:   it.product_id,
          product_name: it.titulo + (it.variacao ? ` — ${it.variacao.replace(/^[^:]+:\s*/, '')}` : ''),
          sku:          it.sku,
          qty_ordered:  it.qty,
          has_stock:    false,
          status:       'pendente',
        })))
      }
    }

    await notifyNewOrder(db, parsed, itemsToInsert, cancelado)
  }

  // Recalcula os totais reais do lote — mesmo raciocínio de saveImportedOrders
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
  const record  = payload.record // { id, topic, resource, status, attempts, ... }
  if (!record?.id) return new Response('No event record', { status: 400 })

  const db = adminClient()

  // Idempotência: se por algum motivo essa função rodar 2x pro mesmo
  // evento (retry do Database Webhook), não reprocessa.
  if (record.status !== 'pending') return new Response('Já processado', { status: 200 })

  try {
    const integration = await getValidIntegration(db)
    const order    = await mlFetch(record.resource, integration.access_token)
    const shipment = order.shipping?.id
      ? await mlFetch(`/shipments/${order.shipping.id}`, integration.access_token, { 'x-format-new': 'true' })
      : null

    const parsed = mapOrderToCommon(order, shipment)
    await saveOrder(db, parsed)

    await db.from('ml_webhook_events').update({
      status: 'done', processed_at: new Date().toISOString(),
    }).eq('id', record.id)

    await db.from('ml_integration').update({ last_sync_at: new Date().toISOString() }).eq('id', integration.id)

    return new Response('OK', { status: 200 })
  } catch (err) {
    console.error('[ml-process-webhook] erro:', err)
    await db.from('ml_webhook_events').update({
      status: 'error',
      error_msg: String(err).slice(0, 2000),
      attempts: (record.attempts || 0) + 1,
    }).eq('id', record.id)
    return new Response('Erro ao processar', { status: 500 })
  }
})
