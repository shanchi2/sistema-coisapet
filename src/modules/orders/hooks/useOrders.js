import { useState, useCallback, useEffect, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import toast from 'react-hot-toast'

function getSession() {
  try { return JSON.parse(localStorage.getItem('coisapet_session') || '{}') } catch { return {} }
}

// ═══════════════════════════════════════════════════════════════════
// PARSERS — leem o XLSX exportado de cada plataforma e devolvem uma
// lista de pedidos normalizada no MESMO formato para ambas:
//
// {
//   num, data (ISO string ou null), estado, desc, comprador,
//   cidade, estado_uf, cep, rastreio, is_pacote, notes,
//   items: [{ titulo, sku, variacao, qty, preco_unit, obs_item }]
// }
// ═══════════════════════════════════════════════════════════════════

// ─── Parser do XLSX do ML ─────────────────────────────────────────
export async function parseMLXlsx(file) {
  const buffer = await file.arrayBuffer()
  const XLSX   = await import('https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs')
  const wb     = XLSX.read(buffer, { type: 'array' })
  const ws     = wb.Sheets[wb.SheetNames[0]]
  const raw    = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

  // Acha linha de cabeçalho
  let hi = -1
  for (let i = 0; i < raw.length; i++) {
    if (raw[i].some(c => String(c).includes('N.º de venda'))) { hi = i; break }
  }
  if (hi === -1) throw new Error('WRONG_PLATFORM:mercadolivre')

  const headers = raw[hi].map(h => String(h).trim())
  const col     = name => headers.findIndex(h => h.includes(name))

  const iNum     = col('N.º de venda')
  const iData    = col('Data da venda')
  const iEstado  = col('Estado')
  const iDesc    = col('Descrição do status')
  const iTitulo  = col('Título do anúncio')
  const iSKU     = col('SKU')
  const iQty     = col('Unidades')
  const iVar     = col('Variação')
  const iPreco   = col('Preço unitário')
  const iTotal   = col('Total (BRL)')
  const iComp    = col('Comprador')
  const iCidade  = col('Cidade')
  const iEstUF   = col('Estado.1')
  const iCEP     = col('CEP')
  const iRastr   = col('Número de rastreamento')

  const rows = raw.slice(hi + 1)
    .filter(r => r.some(c => c !== ''))
    .map(r => ({
      num:       String(r[iNum]    || '').trim(),
      data:      String(r[iData]   || '').trim(),
      estado:    String(r[iEstado] || '').trim(),
      desc:      String(r[iDesc]   || '').trim(),
      titulo:    String(r[iTitulo] || '').trim(),
      sku:       String(r[iSKU]    || '').trim(),
      qty:       parseFloat(r[iQty])   || 0,
      variacao:  String(r[iVar]    || '').trim(),
      preco:     parseFloat(r[iPreco]) || 0,
      total:     parseFloat(r[iTotal]) || 0,
      comprador: String(r[iComp]   || '').trim(),
      cidade:    String(r[iCidade] || '').trim(),
      estado_uf: String(r[iEstUF]  || '').trim(),
      cep:       String(r[iCEP]    || '').trim(),
      rastreio:  String(r[iRastr]  || '').trim(),
    }))

  // Reconstrói pedidos agrupando pacotes com seus itens filhos
  const orders = []
  let i = 0
  while (i < rows.length) {
    const r = rows[i]

    // Linha de resumo de pacote (sem título, "Pacote de N produtos")
    if (!r.titulo && r.estado.toLowerCase().startsWith('pacote de')) {
      const match  = r.estado.match(/(\d+)/)
      const nItems = match ? parseInt(match[1]) : 0
      const items  = []
      for (let j = 1; j <= nItems && i + j < rows.length; j++) {
        const child = rows[i + j]
        if (child.titulo) items.push(child)
      }
      if (items.length > 0) {
        orders.push({ ...r, items, is_pacote: true })
      }
      i += 1 + items.length
      continue
    }

    // Linha individual com produto
    if (r.titulo && r.qty > 0) {
      orders.push({ ...r, items: [r], is_pacote: false })
    }
    i++
  }

  // Normaliza para o formato comum
  return orders.map(o => ({
    num:        o.num,
    data:       parseDataML(o.data),
    shipping_deadline: null, // ML não tem essa coluna no relatório
    estado:     o.estado || null,
    desc:       o.desc   || null,
    comprador:  o.comprador || null,
    cidade:     o.cidade    || null,
    estado_uf:  o.estado_uf || null,
    cep:        o.cep       || null,
    rastreio:   o.rastreio  || null,
    is_pacote:  o.is_pacote || false,
    notes:      null,
    items: o.items
      .filter(it => it.titulo)
      .map(it => ({
        titulo:     it.titulo,
        sku:        it.sku      || null,
        variacao:   it.variacao || null,
        qty:        it.qty      || 1,
        preco_unit: it.preco > 0 ? it.preco : null,
        obs_item:   null,
      })),
  }))
}

// Junta "Observação do comprador" (texto do cliente) com "Nota" (anotação
// da própria Shopee/vendedor, ex: usada pra Plaquinhas personalizadas) —
// se as duas tiverem conteúdo, combina as duas; se só uma tiver, usa só ela
function combineNotes(obsComprador, nota) {
  const obs = obsComprador?.toString().trim() || null
  const not = nota?.toString().trim() || null
  if (obs && not) return `${obs} | Nota: ${not}`
  if (obs) return obs
  if (not) return `Nota: ${not}`
  return null
}

// ─── Parser do XLSX da Shopee ──────────────────────────────────────
// Mesma lógica já validada em PickListShopee.jsx (parseShopee), só
// normalizada para o formato comum acima.
export async function parseShopeeXlsx(file) {
  const buffer = await file.arrayBuffer()
  const XLSX   = await import('https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs')
  const wb     = XLSX.read(buffer, { type: 'array', cellDates: true })
  const ws     = wb.Sheets[wb.SheetNames[0]]
  const rows   = XLSX.utils.sheet_to_json(ws, { defval: null })

  // Valida se é arquivo Shopee — deve ter coluna "ID do pedido"
  if (rows.length === 0 || !('ID do pedido' in (rows[0] || {}))) {
    throw new Error('WRONG_PLATFORM:shopee')
  }

  const ordersMap = new Map()
  for (const row of rows) {
    const id = row['ID do pedido']
    if (!id) continue
    if (!ordersMap.has(id)) {
      ordersMap.set(id, {
        num:        String(id),
        data:       toISODate(row['Data de criação do pedido']),
        shipping_deadline: toDateOnly(row['Data prevista de envio']),
        estado:     null,
        desc:       null,
        comprador:  [row['Nome de usuário (comprador)'], row['Nome do destinatário']].filter(Boolean).join(' / ') || null,
        cidade:     row['Cidade_1'] || null, // XLSX renomeia a 2ª ocorrência de "Cidade" para "Cidade_1"
        estado_uf:  row['UF'] || null,
        cep:        null,
        rastreio:   null,
        is_pacote:  false,
        notes:      combineNotes(row['Observação do comprador'], row['Nota']),
        items:      [],
      })
    }
    ordersMap.get(id).items.push({
      titulo:     row['Nome do Produto'] || '—',
      sku:        row['Número de referência SKU'] || row['Nº de referência do SKU principal'] || null,
      variacao:   row['Nome da variação'] || null,
      qty:        Number(row['Quantidade']) || 1,
      preco_unit: null,
      obs_item:   null,
    })
  }

  return Array.from(ordersMap.values())
}

// ─── Helpers de data ────────────────────────────────────────────────
function parseDataML(str) {
  if (!str) return null
  const meses = {
    janeiro:0, fevereiro:1, março:2, abril:3, maio:4, junho:5,
    julho:6, agosto:7, setembro:8, outubro:9, novembro:10, dezembro:11,
  }
  const m = String(str).match(/(\d+) de (\w+) de (\d+)(?:\s+(\d+):(\d+))?/)
  if (!m) return null
  const [, dia, mes, ano, h='12', min='00'] = m
  const d = new Date(parseInt(ano), meses[mes.toLowerCase()] ?? 0, parseInt(dia), parseInt(h), parseInt(min))
  return isNaN(d) ? null : d.toISOString()
}

// Shopee vem com cellDates:true, então já chega como Date (ou string em alguns exports)
function toISODate(val) {
  if (!val) return null
  if (val instanceof Date) return isNaN(val) ? null : val.toISOString()
  const d = new Date(val)
  return isNaN(d) ? null : d.toISOString()
}

// Só a data (sem hora) — pra comparar "é hoje?" sem depender de fuso/hora
function toDateOnly(val) {
  if (!val) return null
  const d = val instanceof Date ? val : new Date(val)
  if (isNaN(d)) return null
  // Usa componentes LOCAIS (não toISOString/UTC) — senão a data "volta um dia"
  // pra quem está em fuso negativo (Brasil, UTC-3)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ─── Detecta se o status do ML indica pedido cancelado ──────────────
// Usado para nunca gerar produção nem picklist para pedidos cancelados.
export function isCancelledStatus(estado) {
  return !!estado && estado.toLowerCase().includes('cancelad')
}

// ─── Início do "dia de picklist" do ML ───────────────────────────────
// O corte real do ML não é meia-noite — é 11h da manhã (horário de
// Brasília). Pedido que chega às 23h de hoje já conta pro picklist de
// amanhã. Só se aplica ao ML (Shopee já tem shipping_deadline próprio
// vindo do relatório; manual é ad-hoc) — mesma regra usada no
// ml-process-webhook (Edge Function), pra ficar consistente entre o
// caminho automático e o manual enquanto os dois rodam em paralelo.
// Roda no navegador do usuário (já em horário de Brasília), então não
// precisa da conversão UTC que a Edge Function precisa.
function mlBatchDayStart(now = new Date()) {
  const CUTOFF_HOUR = 11
  const d = new Date(now)
  if (d.getHours() < CUTOFF_HOUR) d.setDate(d.getDate() - 1)
  d.setHours(CUTOFF_HOUR, 0, 0, 0)
  return d
}

// ─── Hash do conteúdo do arquivo (SHA-256) ─────────────────────────
// Usado para detectar reimportação do mesmo arquivo, mesmo que o
// nome tenha mudado (ou vice-versa).
async function computeFileHash(file) {
  const buffer    = await file.arrayBuffer()
  const hashBuf   = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function useOrders() {
  const [orders,   setOrders]   = useState([])
  const [batches,  setBatches]  = useState([])
  const [loading,  setLoading]  = useState(false)
  const [importing, setImporting] = useState(false)
  const [newOrderIds, setNewOrderIds] = useState(() => new Set())
  const [live, setLive] = useState(false)

  // ── Busca pedidos do banco ────────────────────────────────────────
  const lastFetchArgs = useRef({})
  const fetchOrders = useCallback(async ({ batchId, source, search, dateStart, dateEnd } = {}) => {
    lastFetchArgs.current = { batchId, source, search, dateStart, dateEnd }
    setLoading(true)
    let q = supabase
      .from('orders')
      .select(`*, items:order_items(*)`)
      .order('data_venda', { ascending: false })
      .limit(200)

    if (batchId)   q = q.eq('batch_id', batchId)
    if (source)    q = q.eq('source', source)
    if (dateStart) q = q.gte('data_venda', dateStart)
    if (dateEnd)   q = q.lte('data_venda', dateEnd)
    if (search)    q = q.or(`comprador.ilike.%${search}%,num_venda.ilike.%${search}%`)

    const { data, error } = await q
    if (error) { toast.error('Erro ao carregar pedidos.'); console.error(error) }
    else setOrders(data ?? [])
    setLoading(false)
  }, [])

  // ── Tempo real — pedido novo (qualquer origem: ML sincronizado
  //    sozinho, Shopee/manual importados por outra pessoa) atualiza a
  //    lista sozinho, sem precisar recarregar a página. Só marca o(s)
  //    id(s) como "novo" por alguns segundos, pra dar destaque visual
  //    no card (ver OrdersPage), depois volta ao normal.
  useEffect(() => {
    const channel = supabase
      .channel('orders-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, payload => {
        const id = payload.new.id
        setNewOrderIds(prev => new Set(prev).add(id))
        fetchOrders(lastFetchArgs.current)
        setTimeout(() => {
          setNewOrderIds(prev => { const next = new Set(prev); next.delete(id); return next })
        }, 12000)
      })
      .subscribe(status => setLive(status === 'SUBSCRIBED'))

    return () => { supabase.removeChannel(channel) }
  }, [fetchOrders])

  // ── Busca histórico de importações ───────────────────────────────
  const fetchBatches = useCallback(async () => {
    const { data } = await supabase
      .from('import_batches')
      .select('*')
      .order('imported_at', { ascending: false })
      .limit(50)
    setBatches(data ?? [])
  }, [])

  // ── Match de SKU com o sistema ────────────────────────────────────
  // Recebe uma lista de SKUs (pode ter null/duplicado) e devolve um
  // Map sku -> product_id para os que existem em `products`.
  async function matchSkusToProducts(skus) {
    const uniqueSkus = [...new Set(skus.filter(Boolean))]
    if (uniqueSkus.length === 0) return new Map()

    const { data, error } = await supabase
      .from('products')
      .select('id, sku')
      .in('sku', uniqueSkus)

    if (error || !data) {
      console.warn('Aviso: não foi possível checar SKUs no sistema:', error)
      return new Map()
    }
    return new Map(data.map(p => [p.sku, p.id]))
  }

  // ── Núcleo comum de importação: salva pedidos + itens + lote de
  //    produção. Usado tanto pelo import de ML quanto de Shopee.
  //    `parsed` já vem no formato comum descrito no topo do arquivo.
  async function saveImportedOrders({ parsed, source, filename, fileHash = null, skipProduction = false }) {
    const session = getSession()

    if (parsed.length === 0) {
      toast.error('Nenhum pedido encontrado no arquivo.')
      return null
    }

    // 0. Protege contra o MESMO pedido aparecendo mais de uma vez dentro
    //    do próprio arquivo importado (linha duplicada na exportação da
    //    plataforma, ou reprocessamento) — sem isso, cada ocorrência seria
    //    tratada como "nova" e os itens entrariam duplicados no picklist.
    const mergedByNum = new Map()
    parsed.forEach(o => {
      const key = o.num || `__sem_num_${mergedByNum.size}`
      if (!mergedByNum.has(key)) {
        mergedByNum.set(key, { ...o, items: [...o.items] })
      } else {
        mergedByNum.get(key).items.push(...o.items)
      }
    })
    parsed = [...mergedByNum.values()]
    // Remove itens EXATAMENTE duplicados dentro do mesmo pedido (mesmo
    // sku/título/variação/quantidade) — mantém só uma cópia de cada
    parsed.forEach(o => {
      const seen = new Set()
      o.items = o.items.filter(it => {
        const k = `${it.sku || ''}|${it.titulo}|${it.variacao || ''}|${it.qty}`
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
    })

    // 1. Reaproveita o lote de HOJE dessa plataforma, se já existir —
    //    assim reimportar no mesmo dia continua na MESMA sessão de
    //    picking (mesmo link de Expedição), em vez de fragmentar em
    //    lotes separados a cada importação.
    const todayStart = source === 'ml' ? mlBatchDayStart() : (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d })()
    const { data: existingBatch } = await supabase
      .from('import_batches')
      .select('id, total_orders, total_items')
      .eq('source', source)
      .gte('imported_at', todayStart.toISOString())
      .order('imported_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    let batch
    if (existingBatch) {
      const { data: updatedBatch, error: updErr } = await supabase
        .from('import_batches')
        .update({ filename, file_hash: fileHash })
        .eq('id', existingBatch.id)
        .select('id')
        .single()
      if (updErr) throw updErr
      batch = updatedBatch
    } else {
      const { data: newBatch, error: batchErr } = await supabase
        .from('import_batches')
        .insert({
          source, filename, file_hash: fileHash, imported_by: session.id || null,
          total_orders: parsed.length,
          total_items:  parsed.reduce((a, o) => a + o.items.reduce((s, it) => s + (it.qty || 0), 0), 0),
        })
        .select('id')
        .single()
      if (batchErr) throw batchErr
      batch = newBatch
    }

    // 2. Descobre quais num_venda JÁ existiam antes dessa importação —
    //    são os que NÃO podem ter os itens mexidos (preserva 'picked').
    const incomingNums = parsed.map(o => o.num).filter(Boolean)
    const { data: alreadyExisting } = incomingNums.length
      ? await supabase.from('orders').select('num_venda').eq('source', source).in('num_venda', incomingNums)
      : { data: [] }
    const existingNumSet = new Set((alreadyExisting || []).map(o => o.num_venda))

    // 3. Upsert dos pedidos — chave (source, num_venda) evita duplicar.
    //    Atualiza dados cadastrais (status, endereço, etc.) mesmo em
    //    pedidos que já existiam — só os ITENS deles ficam intocados.
    const ordersToUpsert = parsed.map(o => ({
      batch_id:    batch.id,
      source,
      num_venda:   o.num    || null,
      data_venda:  o.data,
      shipping_deadline: o.shipping_deadline || null,
      status_ml:   o.estado || null,
      status_desc: o.desc   || null,
      comprador:   o.comprador || null,
      cidade:      o.cidade    || null,
      estado_uf:   o.estado_uf || null,
      cep:         o.cep       || null,
      rastreio:    o.rastreio  || null,
      is_pacote:   o.is_pacote || false,
      notes:       o.notes     || null,
    }))

    const { data: savedOrders, error: ordersErr } = await supabase
      .from('orders')
      .upsert(ordersToUpsert, { onConflict: 'source,num_venda' })
      .select('id, num_venda')

    if (ordersErr) throw ordersErr

    const orderIdByNum = new Map(savedOrders.map(o => [o.num_venda, o.id]))

    // 4. Junta todos os SKUs do arquivo e verifica quais existem no sistema
    const allSkus = parsed.flatMap(o => o.items.map(it => it.sku))
    const skuMap  = await matchSkusToProducts(allSkus)

    // 5. Monta os itens SÓ dos pedidos genuinamente NOVOS — pedido que já
    //    existia antes dessa importação mantém os itens como estavam
    //    (preserva 'picked' e qualquer embalagem já registrada).
    const itemsToInsert = []
    parsed.forEach(o => {
      if (existingNumSet.has(o.num)) return // já existia — não mexe nos itens
      const orderId = orderIdByNum.get(o.num || null)
      if (!orderId) return
      const cancelado = isCancelledStatus(o.estado)
      o.items.forEach(it => {
        if (!it.titulo) return
        const productId = it.sku ? (skuMap.get(it.sku) || null) : null
        itemsToInsert.push({
          order_id:       orderId,
          product_id:     productId,
          titulo:         it.titulo,
          sku:            it.sku      || null,
          variacao:       it.variacao || null,
          qty:            it.qty      || 1,
          preco_unit:     it.preco_unit ?? null,
          obs_item:       it.obs_item   || null,
          sku_encontrado: it.sku ? !!productId : true,
          _cancelado:     cancelado,
        })
      })
    })

    if (itemsToInsert.length > 0) {
      const { error: itemsErr } = await supabase
        .from('order_items')
        .insert(itemsToInsert.map(({ _cancelado, ...rest }) => rest))
      if (itemsErr) throw itemsErr
    }

    // Recalcula os totais REAIS do lote (soma tudo que já foi importado nele,
    // não só o que veio nesse arquivo) — mantém o cabeçalho sempre correto
    // mesmo depois de várias reimportações no mesmo dia.
    // IMPORTANTE: total_items soma a QUANTIDADE de cada item (qty), não a
    // quantidade de LINHAS — bate com o que Expedição/Feira Combinada usam
    // de verdade pra separar, evitando o resumo parecer "menor" que a
    // realidade quando algum item tem 2+ unidades no mesmo pedido.
    const { data: batchOrderIds, error: boiErr } = await supabase.from('orders').select('id').eq('batch_id', batch.id)
    if (boiErr) console.error('[import] Erro ao recontar pedidos do lote:', boiErr)
    const allIds = (batchOrderIds || []).map(o => o.id)
    let realItemCount = 0
    if (allIds.length) {
      const { data: itemQtys, error: ricErr } = await supabase.from('order_items').select('qty').in('order_id', allIds)
      if (ricErr) console.error('[import] Erro ao recontar itens do lote:', ricErr)
      realItemCount = (itemQtys || []).reduce((sum, it) => sum + (it.qty || 0), 0)
    }
    const { error: totalsErr } = await supabase.from('import_batches').update({
      total_orders: allIds.length,
      total_items:  realItemCount,
    }).eq('id', batch.id)
    if (totalsErr) console.error('[import] Erro ao atualizar totais do lote:', totalsErr)

    const newCount = parsed.length - existingNumSet.size
    const semSkuCount = itemsToInsert.filter(it => !it.sku_encontrado).length

    // Registra ESTE upload no histórico — mesmo reaproveitando o lote do dia,
    // cada importação individual fica rastreada (data/hora, quantos pedidos,
    // quantos eram novos, quantos itens)
    const { error: eventErr } = await supabase.from('import_events').insert({
      batch_id:          batch.id,
      source,
      filename,
      imported_by:       session.id || null,
      total_orders_file: parsed.length,
      new_orders_count:  newCount,
      total_items_file:  parsed.reduce((a, o) => a + o.items.reduce((s, it) => s + (it.qty || 0), 0), 0),
    })
    if (eventErr) console.error('[import] Erro ao registrar evento de importação:', eventErr)

    // ── A partir daqui é só produção — isolado, pra um erro aqui NUNCA
    //    mais impedir os passos essenciais acima (totais + histórico) ──
    try {
      let prodItems = []
      if (!skipProduction) {
        const prodGroup = {}
        itemsToInsert.filter(it => !it._cancelado).forEach(it => {
          if (!it.qty) return
          const key = it.sku || it.titulo
          if (prodGroup[key]) {
            prodGroup[key].qty_ordered += it.qty
          } else {
            prodGroup[key] = {
              product_id:   it.product_id,
              product_name: it.titulo + (it.variacao ? ` — ${it.variacao.replace(/^[^:]+:\s*/, '')}` : ''),
              sku:          it.sku,
              qty_ordered:  it.qty,
              has_stock:    false,
              status:       'pendente',
            }
          }
        })
        prodItems = Object.values(prodGroup)
      }

      if (prodItems.length > 0) {
        const today = new Date().toISOString().split('T')[0]
        const { data: prodOrder, error: prodErr } = await supabase
          .from('production_orders')
          .insert({
            source,
            date:            today,
            import_batch_id: batch.id,
            created_by:      session.id || null,
            notes:           `Importado de: ${filename}`,
          })
          .select('id')
          .single()

        if (prodErr) {
          console.warn('Aviso: lote de produção não criado:', prodErr)
        } else {
          const { error: prodItemsErr } = await supabase
            .from('production_order_items')
            .insert(prodItems.map(it => ({ ...it, order_id: prodOrder.id })))
          if (prodItemsErr) console.warn('Aviso: itens de produção não criados:', prodItemsErr)
        }
      }
    } catch (prodCatchErr) {
      console.error('[import] Erro ao criar lote de produção (não afeta o pedido/picklist, já salvos):', prodCatchErr)
    }

    toast.success(
      `✅ ${newCount} pedido(s) novo(s) importado(s)!` +
      (existingNumSet.size > 0 ? ` (${existingNumSet.size} já existia(m) e não foram alterados)` : '') +
      (semSkuCount > 0 ? ` ⚠ ${semSkuCount} item(ns) sem SKU no sistema.` : '')
    )

    await fetchOrders({ batchId: batch.id })
    await fetchBatches()

    return { batchId: batch.id, orders: parsed }
  }

  // ── Checa se este arquivo já foi importado antes (mesmo conteúdo) ─
  async function findDuplicateBatch(fileHash) {
    const { data } = await supabase
      .from('import_batches')
      .select('id, filename, imported_at, total_orders, total_items')
      .eq('file_hash', fileHash)
      .order('imported_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return data || null
  }

  // ── Importação ML ───────────────────────────────────────────────
  async function importML(file, { force = false } = {}) {
    setImporting(true)
    try {
      const fileHash = await computeFileHash(file)
      if (!force) {
        const dup = await findDuplicateBatch(fileHash)
        if (dup) { setImporting(false); return { duplicate: true, existingBatch: dup, file, source: 'ml' } }
      }
      const parsed = await parseMLXlsx(file)
      return await saveImportedOrders({ parsed, source: 'ml', filename: file.name, fileHash, skipProduction: force })
    } catch (err) {
      console.error('Erro na importação ML:', err)
      toast.error(
        err.message === 'WRONG_PLATFORM:mercadolivre'
          ? 'Arquivo inválido para Mercado Livre. Exporte em: ML → Vendas → Relatórios → Exportar Vendas.'
          : 'Erro ao importar. Verifique o arquivo e tente novamente.'
      )
      return null
    } finally {
      setImporting(false)
    }
  }

  // ── Importação Shopee ───────────────────────────────────────────
  async function importShopee(file, { force = false } = {}) {
    setImporting(true)
    try {
      const fileHash = await computeFileHash(file)
      if (!force) {
        const dup = await findDuplicateBatch(fileHash)
        if (dup) { setImporting(false); return { duplicate: true, existingBatch: dup, file, source: 'shopee' } }
      }
      const parsed = await parseShopeeXlsx(file)
      return await saveImportedOrders({ parsed, source: 'shopee', filename: file.name, fileHash, skipProduction: force })
    } catch (err) {
      console.error('Erro na importação Shopee:', err)
      toast.error(
        err.message === 'WRONG_PLATFORM:shopee'
          ? 'Arquivo inválido para Shopee. Exporte em: Shopee → Meus Pedidos → Exportar → A Enviar.'
          : 'Erro ao importar. Verifique o arquivo e tente novamente.'
      )
      return null
    } finally {
      setImporting(false)
    }
  }

  // ── Importação com detecção automática de plataforma + duplicata ──
  // Ponto de entrada recomendado para a UI. Se o arquivo já foi
  // importado antes (mesmo hash), devolve { duplicate: true, ... }
  // em vez de importar — cabe à tela decidir o que fazer (mostrar
  // confirmação e, se o usuário topar, chamar de novo com force:true).
  async function importAuto(file, { force = false } = {}) {
    setImporting(true)
    try {
      const fileHash = await computeFileHash(file)
      if (!force) {
        const dup = await findDuplicateBatch(fileHash)
        if (dup) { setImporting(false); return { duplicate: true, existingBatch: dup, file } }
      }

      let parsed, source
      try {
        parsed = await parseShopeeXlsx(file)
        source = 'shopee'
      } catch (errShopee) {
        if (errShopee.message !== 'WRONG_PLATFORM:shopee') throw errShopee
        parsed = await parseMLXlsx(file)
        source = 'ml'
      }
      return await saveImportedOrders({ parsed, source, filename: file.name, fileHash, skipProduction: force })
    } catch (err) {
      console.error('Erro na importação:', err)
      toast.error('Arquivo não reconhecido. Exporte um relatório válido do ML ou da Shopee.')
      return null
    } finally {
      setImporting(false)
    }
  }

  // ── Pedido manual ─────────────────────────────────────────────────
  async function createManualOrder({ comprador, items, notes, total_value }) {
    const session = getSession()

    // Batch manual
    const { data: batch } = await supabase
      .from('import_batches')
      .insert({ source: 'manual', imported_by: session.id, total_orders: 1, total_items: items.reduce((s, it) => s + (it.qty || 1), 0) })
      .select('id').single()

    const { data: order } = await supabase
      .from('orders')
      .insert({ batch_id: batch.id, source: 'manual', comprador, data_venda: new Date().toISOString(), total_value: total_value ?? null, notes: notes || null })
      .select('id').single()

    if (items.length > 0) {
      await supabase.from('order_items').insert(
        items.map(it => ({ order_id: order.id, titulo: it.titulo, sku: it.sku, qty: it.qty, product_id: it.product_id || null, sku_encontrado: true }))
      )

      // Cria lote de produção
      const { data: prodOrder } = await supabase
        .from('production_orders')
        .insert({ source: 'manual', import_batch_id: batch.id, created_by: session.id, notes })
        .select('id').single()

      if (prodOrder) {
        await supabase.from('production_order_items').insert(
          items.map(it => ({
            order_id:     prodOrder.id,
            product_id:   it.product_id || null,
            product_name: it.titulo,
            sku:          it.sku || null,
            qty_ordered:  it.qty,
            has_stock:    false,
            status:       'pendente',
          }))
        )
      }
    }

    toast.success('Pedido manual criado!')
    await fetchOrders()
    await fetchBatches()
  }

  return {
    orders, batches, loading, importing,
    newOrderIds, live,
    fetchOrders, fetchBatches,
    importML, importShopee, importAuto, createManualOrder,
  }
}

// Busca o histórico de uploads (cada evento individual, mesmo os que caíram
// no mesmo lote do dia) — usado pra montar a tela agrupada por dia
export async function fetchImportEvents({ limit = 200 } = {}) {
  const { data, error } = await supabase
    .from('import_events')
    .select('*, importer:system_users!imported_by(name), batch:import_batches(id)')
    .order('imported_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

// Busca TODOS os ids de pedido de um lote, sem cair no limite padrão de
// 1000 linhas do Supabase — pagina automaticamente até esgotar
async function fetchAllOrderIds(batchId) {
  const ids = []
  const pageSize = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabase.from('orders').select('id').eq('batch_id', batchId).range(from, from + pageSize - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    ids.push(...data.map(o => o.id))
    if (data.length < pageSize) break
    from += pageSize
  }
  return ids
}

function chunkArray(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// Verifica quanto do lote já foi separado (picked=true) antes de deixar
// apagar — evita perder trabalho da Carol sem avisar. Usa contagem exata
// (não busca as linhas), então funciona certo mesmo com 5, 10, 50 mil pedidos.
export async function checkBatchBeforeDelete(batchId) {
  const { count: orderCount, error: ordErr } = await supabase
    .from('orders').select('id', { count: 'exact', head: true }).eq('batch_id', batchId)
  if (ordErr) throw ordErr

  const { count: itemCount, error: itmErr } = await supabase
    .from('order_items').select('id, orders!inner(batch_id)', { count: 'exact', head: true })
    .eq('orders.batch_id', batchId)
  if (itmErr) throw itmErr

  const { count: pickedCount, error: pkErr } = await supabase
    .from('order_items').select('id, orders!inner(batch_id)', { count: 'exact', head: true })
    .eq('orders.batch_id', batchId).eq('picked', true)
  if (pkErr) throw pkErr

  return { orderCount: orderCount || 0, itemCount: itemCount || 0, pickedCount: pickedCount || 0 }
}

// Apaga TODOS os pedidos de um lote (uma plataforma, um dia) — usado quando
// o arquivo importado veio errado (ex: exportou 1 ano inteiro sem querer).
// Funciona pra qualquer tamanho de lote (pagina a busca, apaga em lotes
// pequenos). Sempre notifica os diretores (sino + e-mail) de quem apagou.
export async function deleteBatchOrders(batchId) {
  const session = getSession()

  const { data: batch } = await supabase.from('import_batches').select('source, filename').eq('id', batchId).single()
  const allIds = await fetchAllOrderIds(batchId)

  // Apaga em lotes de 500 ids por vez — evita URL gigante e trava mesmo
  // com dezenas de milhares de pedidos
  for (const idsChunk of chunkArray(allIds, 500)) {
    const { error: pkgErr } = await supabase.from('order_packaging_usage').delete().in('order_id', idsChunk)
    if (pkgErr) throw pkgErr
    const { error: itemsErr } = await supabase.from('order_items').delete().in('order_id', idsChunk)
    if (itemsErr) throw itemsErr
    const { error: ordersErr } = await supabase.from('orders').delete().in('id', idsChunk)
    if (ordersErr) throw ordersErr
  }

  // Apaga o lote em si — cascata cuida de import_events, picklist_gathering
  // e picklist_shortage_reports que apontam pra esse batch_id
  const { error: batchErr } = await supabase.from('import_batches').delete().eq('id', batchId)
  if (batchErr) throw batchErr

  // Notifica diretores/administrativo — sino + e-mail (via webhook já existente)
  const { data: me } = await supabase.from('system_users').select('name').eq('id', session.id).maybeSingle()
  const { data: notifyUsers } = await supabase.from('system_users')
    .select('id').in('role', ['admin', 'administrativo']).eq('active', true)

  if (notifyUsers?.length) {
    const sourceLabel = batch?.source === 'ml' ? 'Mercado Livre' : batch?.source === 'shopee' ? 'Shopee' : (batch?.source || '—')
    await supabase.from('notifications').insert(notifyUsers.map(u => ({
      user_id: u.id,
      type: 'batch_deleted',
      title: '🗑️ Pedidos apagados',
      body: `${sourceLabel}: ${allIds.length} pedido(s) apagado(s) por ${me?.name || 'alguém'}. Arquivo: ${batch?.filename || '—'}`,
      link: '/pedidos',
    })))
  }

  return { deletedCount: allIds.length, source: batch?.source }
}
