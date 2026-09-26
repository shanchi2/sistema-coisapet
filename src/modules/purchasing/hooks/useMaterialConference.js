import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import toast from 'react-hot-toast'
import { ITEM_SELECT, isSheetItem, itemCuts, itemName } from '../orderItem'

function getSession() {
  try { return JSON.parse(localStorage.getItem('coisapet_session') || '{}') }
  catch { return {} }
}

const OCCURRENCE_BUCKET = 'purchase-attachments' // reaproveita o mesmo bucket do Compras/Compra da Lousa

// Conferência de Matéria-Prima (Fase 70, parte 2) — tela do João no
// tablet, mesmo estilo "feira" do Picklist/Expedição. Só aqui o
// estoque sobe de verdade (raw_material_movements), nunca na criação
// do pedido pelo César.
export function useMaterialConference() {
  const [orders,  setOrders]  = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('material_orders')
      .select(`
        *,
        supplier:suppliers(id, name),
        items:material_order_items(${ITEM_SELECT})
      `)
      .eq('status', 'pedido')
      .order('expected_delivery', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })

    if (error) {
      toast.error('Erro ao carregar pedidos pendentes.')
      console.error(error)
    } else {
      setOrders(data ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  // Sobe as fotos 1x e liga em todas as ocorrências do item (numa chapa,
  // cada sub-chapa avariada vira uma ocorrência — mesmas fotos em todas).
  async function uploadOccurrencePhotos(occurrenceIds, files) {
    const ids = Array.isArray(occurrenceIds) ? occurrenceIds : [occurrenceIds]
    for (const file of files) {
      const ext  = file.name.split('.').pop()
      const path = `occurrences/${ids[0]}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: upErr } = await supabase.storage.from(OCCURRENCE_BUCKET).upload(path, file)
      if (upErr) { console.error(upErr); continue }
      await supabase.from('material_order_occurrence_photos').insert(ids.map(id => ({ occurrence_id: id, storage_path: path })))
    }
  }

  // results: [{ item_id, raw_material_id, qty_received, qty_damaged, occurrence_description, occurrence_photos }]
  // qty_received = total que chegou fisicamente; qty_damaged = quantos
  // desses vieram avariados (pode ser menor que qty_received — o resto
  // tá bom). Só a diferença vira estoque de verdade.
  async function finishConference(order, results) {
    const session = getSession()

    for (const r of results) {
      const qtyGood = Math.max(0, Number(r.qty_received) - Number(r.qty_damaged || 0))
      const itemStatus = Number(r.qty_damaged) > 0 ? 'avariado' : 'ok'

      const { error: upErr } = await supabase.from('material_order_items').update({
        qty_received: r.qty_received,
        qty_damaged: r.qty_damaged || 0,
        cut_damage: r.cut_damage && Object.keys(r.cut_damage).length ? r.cut_damage : null,
        item_status: itemStatus,
      }).eq('id', r.item_id)
      if (upErr) throw upErr

      // ── Chapa de MDF (fase78): 1 chapa recebida vira as sub-chapas dela
      // no estoque (sub-chapa × espessura × cor), menos as avariadas. ──
      const orderItem = order.items?.find(i => i.id === r.item_id)
      if (isSheetItem(orderItem)) {
        const damagedOccIds = []
        for (const cut of itemCuts(orderItem)) {
          const dmg = Number(r.cut_damage?.[cut.id] || 0)
          const good = Number(r.qty_received) * cut.qty_per_sheet - dmg
          if (good > 0) {
            const { data: rawId, error: rpcErr } = await supabase.rpc('get_sheet_stock_id', {
              p_cut: cut.id, p_thickness: orderItem.sheet_thickness_id, p_color: orderItem.sheet_color_id,
            })
            if (rpcErr) throw rpcErr
            const { error: movErr } = await supabase.from('raw_material_movements').insert({
              raw_material_id: rawId, type: 'entrada', qty: good,
              reason: `Conferência — ${itemName(orderItem)} (${cut.name})`, reference_id: order.id,
            })
            if (movErr) throw movErr
          }
          if (dmg > 0) {
            const { data: occ, error: occErr } = await supabase.from('material_order_occurrences').insert({
              order_id: order.id, order_item_id: r.item_id, sheet_cut_id: cut.id,
              kind: 'avaria', qty_damaged: dmg, qty_affected: dmg,
              description: r.occurrence_description || null,
            }).select('id').single()
            if (occErr) throw occErr
            damagedOccIds.push(occ.id)
          }
        }
        if (damagedOccIds.length && r.occurrence_photos?.length) await uploadOccurrencePhotos(damagedOccIds, r.occurrence_photos)

        const diffSheets = Number(r.qty_received) - Number(orderItem.qty_ordered)
        if (diffSheets !== 0) {
          const { error: divErr } = await supabase.from('material_order_occurrences').insert({
            order_id: order.id, order_item_id: r.item_id,
            kind: diffSheets < 0 ? 'falta' : 'excesso', qty_affected: Math.abs(diffSheets),
            description: diffSheets < 0 ? 'Chegaram menos chapas do que foi pedido.' : 'Chegaram mais chapas do que foi pedido.',
          })
          if (divErr) throw divErr
        }
        continue
      }

      // Estoque só sobe aqui, na conferência de verdade — nunca no
      // pedido — e só a parte boa (recebido menos avariado) vira
      // estoque de verdade. created_by fica null de propósito: a FK
      // dessa tabela aponta pra `profiles`, não pra `system_users`
      // (achado real, 25/09) — forçar o id do usuário logado ia
      // violar a FK.
      if (qtyGood > 0) {
        const { error: movErr } = await supabase.from('raw_material_movements').insert({
          raw_material_id: r.raw_material_id,
          type: 'entrada',
          qty: qtyGood,
          reason: `Conferência — pedido de matéria-prima`,
          reference_id: order.id,
        })
        if (movErr) throw movErr
      }

      if (Number(r.qty_damaged) > 0) {
        const { data: occ, error: occErr } = await supabase.from('material_order_occurrences')
          .insert({
            order_id: order.id, order_item_id: r.item_id,
            kind: 'avaria',
            qty_damaged: r.qty_damaged,
            qty_affected: r.qty_damaged,
            description: r.occurrence_description || null,
          })
          .select('id').single()
        if (occErr) throw occErr
        if (r.occurrence_photos?.length) await uploadOccurrencePhotos(occ.id, r.occurrence_photos)
      }

      // Divergência de quantidade também vira ocorrência (fase74, 25/09) —
      // pra ter onde acompanhar a solução (reposição, crédito, desconto...).
      const item = order.items?.find(i => i.id === r.item_id)
      const diff = Number(r.qty_received) - Number(item?.qty_ordered ?? r.qty_received)
      if (diff !== 0) {
        const { error: divErr } = await supabase.from('material_order_occurrences').insert({
          order_id: order.id, order_item_id: r.item_id,
          kind: diff < 0 ? 'falta' : 'excesso',
          qty_affected: Math.abs(diff),
          description: diff < 0 ? 'Chegou menos do que foi pedido.' : 'Chegou mais do que foi pedido.',
        })
        if (divErr) throw divErr
      }
    }

    const { error: orderErr } = await supabase.from('material_orders').update({
      status: 'conferido',
      conferred_at: new Date().toISOString(),
      conferred_by: session.id || null,
      updated_at: new Date().toISOString(),
    }).eq('id', order.id)
    if (orderErr) throw orderErr

    // Avisa o Administrativo/Compras (César) se sobrou alguma avaria —
    // mesmo padrão de notificação já usado na Compra da Lousa.
    const avariados = results.filter(r => Number(r.qty_damaged) > 0)
    const divergentes = results.filter(r => {
      const it = order.items?.find(i => i.id === r.item_id)
      return it && Number(r.qty_received) !== Number(it.qty_ordered)
    })
    if (avariados.length || divergentes.length) {
      const { data: notifyUsers } = await supabase.from('system_users')
        .select('id').in('role', ['admin', 'administrativo']).eq('active', true)
      if (notifyUsers?.length) {
        const totalAvariado = avariados.reduce((s, r) => s + Number(r.qty_damaged), 0)
        const partes = []
        if (avariados.length)   partes.push(`${totalAvariado} unidade(s) avariada(s) em ${avariados.length} item(ns)`)
        if (divergentes.length) partes.push(`${divergentes.length} item(ns) com quantidade diferente do pedido`)
        await supabase.from('notifications').insert(notifyUsers.map(u => ({
          user_id: u.id, type: 'material_occurrence',
          title: avariados.length ? 'Material avariado na conferência' : 'Divergência na conferência',
          body: `${partes.join(' e ')} num pedido de matéria-prima — acompanhe a ocorrência até a solução.`,
          link: '/pedidos-materia-prima?aba=conferencias',
        })))
      }
    }

    toast.success('Conferência finalizada!')
    await fetch()
  }

  return { orders, loading, refetch: fetch, finishConference }
}
