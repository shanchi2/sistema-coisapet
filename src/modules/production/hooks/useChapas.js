import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import toast from 'react-hot-toast'

function getSession() {
  try { return JSON.parse(localStorage.getItem('coisapet_session') || '{}') }
  catch { return {} }
}

async function auditLog(action, tableName, recordId, description) {
  try {
    const s = getSession()
    if (!s?.id) return
    await supabase.rpc('audit_log_with_user', {
      p_user_id:     s.id,
      p_action:      action,
      p_table_name:  tableName,
      p_record_id:   recordId,
      p_description: description,
    })
  } catch {}
}

// Chapas — receita de corte: 1 chapa rende N produtos (1 tipo só, tipo
// "14x Toca Luxo", ou uma combinação de tipos diferentes, tipo "1x
// Terrário Grande + 1x Toca Luxo + 1x Banheira"). Fase 46 — só o
// cadastro/gerador por enquanto, ainda não mexe na fila de produção.
export function useChapas() {
  const [chapas,  setChapas]  = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('chapas')
      .select(`
        *,
        items:chapa_items(id, quantity, product:products(id, name, sku, photo_url, is_sellable))
      `)
      .eq('active', true)
      .order('name')

    if (error) {
      toast.error('Erro ao carregar chapas.')
      console.error(error)
    } else {
      setChapas(data ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  // payload: { name, notes, items: [{ product_id, quantity }] }
  async function create(payload) {
    const { name, notes, items } = payload
    if (!items?.length) throw new Error('Adicione pelo menos 1 produto.')

    const { data: chapa, error } = await supabase
      .from('chapas')
      .insert({ name, notes: notes || null })
      .select()
      .single()
    if (error) { toast.error('Erro ao criar chapa.'); throw error }

    const { error: itemsError } = await supabase
      .from('chapa_items')
      .insert(items.map(i => ({ chapa_id: chapa.id, product_id: i.product_id, quantity: i.quantity })))
    if (itemsError) {
      // limpa a chapa órfã se os itens falharem — não deixa lixo pela metade
      await supabase.from('chapas').delete().eq('id', chapa.id)
      toast.error('Erro ao salvar os itens da chapa.')
      throw itemsError
    }

    await auditLog('create', 'chapas', chapa.id, `Chapa "${name}" criada com ${items.length} produto(s)`)
    toast.success('Chapa criada!')
    await fetch()
  }

  // payload: { name, notes, items: [{ product_id, quantity }] }
  async function update(id, payload) {
    const { name, notes, items } = payload
    if (!items?.length) throw new Error('Adicione pelo menos 1 produto.')

    const { error } = await supabase.from('chapas').update({ name, notes: notes || null }).eq('id', id)
    if (error) { toast.error('Erro ao atualizar chapa.'); throw error }

    // Reconstrói os itens do zero — mais simples e seguro que diff
    // (a lista raramente passa de umas poucas linhas).
    const { error: delError } = await supabase.from('chapa_items').delete().eq('chapa_id', id)
    if (delError) { toast.error('Erro ao atualizar os itens da chapa.'); throw delError }

    const { error: insError } = await supabase
      .from('chapa_items')
      .insert(items.map(i => ({ chapa_id: id, product_id: i.product_id, quantity: i.quantity })))
    if (insError) { toast.error('Erro ao salvar os itens da chapa.'); throw insError }

    await auditLog('update', 'chapas', id, `Chapa "${name}" atualizada`)
    toast.success('Chapa atualizada!')
    await fetch()
  }

  async function remove(id, name) {
    // Soft delete — mesmo padrão de products/raw_materials, mantém histórico.
    const { error } = await supabase.from('chapas').update({ active: false }).eq('id', id)
    if (error) { toast.error('Erro ao remover chapa.'); throw error }
    await auditLog('delete', 'chapas', id, `Chapa "${name}" removida`)
    toast.success('Chapa removida.')
    await fetch()
  }

  // Lança 1 evento real de corte de chapa — soma stock_qty de cada
  // produto da receita (quantity × multiplier) via RPC atômica
  // (fase63), nunca em passos separados no cliente. `colorSelections`
  // (fase64c, opcional): { [produto_principal_id]: cor_escolhida_id }
  // — quando um item da chapa aponta pra um produto principal (família
  // de cor), resolve pra qual SKU de verdade credita o estoque.
  async function logProduction(chapaId, multiplier, notes, colorSelections) {
    const session = getSession()
    const { data, error } = await supabase.rpc('log_chapa_production', {
      p_chapa_id: chapaId, p_multiplier: multiplier, p_notes: notes || null, p_user_id: session.id || null,
      p_color_selections: colorSelections && Object.keys(colorSelections).length ? colorSelections : null,
    })
    if (error) { toast.error('Erro ao lançar produção: ' + error.message); throw error }
    await auditLog('create', 'chapa_production_entries', chapaId, `Produção lançada (x${multiplier})`)
    toast.success('Produção lançada — estoque atualizado!')
    return data // [{ product_id, product_name, delta, new_stock_qty }]
  }

  // Cores disponíveis de um produto principal — usado no passo de
  // "qual cor saiu dessa chapa" ao lançar produção (fase64c).
  async function fetchColorOptions(principalId) {
    const { data, error } = await supabase
      .from('products')
      .select(`
        id, name, sku, photo_url,
        product_variations(product_variation_option_links(product_variation_options(value, product_variation_types(name))))
      `)
      .eq('parent_product_id', principalId)
      .eq('active', true)
      .eq('is_sellable', true)
      .order('sku')
    if (error) { toast.error('Erro ao carregar cores.'); throw error }
    return (data ?? []).map(p => {
      const links = p.product_variations?.[0]?.product_variation_option_links ?? []
      const cor = links.find(l => l.product_variation_options?.product_variation_types?.name === 'Cor')
      return { id: p.id, sku: p.sku, name: p.name, photo_url: p.photo_url, cor: cor?.product_variation_options?.value || p.sku }
    })
  }

  async function fetchProductionHistory(chapaId) {
    const { data, error } = await supabase
      .from('chapa_production_entries')
      .select('id, multiplier, notes, created_at, created_by_user:system_users(name)')
      .eq('chapa_id', chapaId)
      .order('created_at', { ascending: false })
      .limit(20)
    if (error) { toast.error('Erro ao carregar histórico.'); throw error }
    return data ?? []
  }

  return { chapas, loading, refetch: fetch, create, update, remove, logProduction, fetchProductionHistory, fetchColorOptions }
}
