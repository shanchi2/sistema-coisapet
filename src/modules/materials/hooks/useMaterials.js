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


export function useMaterials() {
  const [materials, setMaterials] = useState([])
  const [loading,   setLoading]   = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('raw_materials')
      // select('*') já traz width_cm, length_cm e area_m2 (generated column) automaticamente
      .select(`
        *,
        category:raw_material_categories(id, name, color),
        supplier_rel:suppliers(id, name),
        suppliers_rel:material_suppliers(supplier_id, unit_cost, is_preferred, supplier:suppliers(id, name))
      `)
      .order('name')

    if (error) {
      toast.error('Erro ao carregar matérias-primas.')
      console.error(error)
    } else {
      setMaterials(data ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  async function create(payload) {
    const { error } = await supabase.from('raw_materials').insert(payload)
    if (error) { toast.error('Erro ao cadastrar matéria-prima.'); throw error }
    toast.success('Matéria-prima cadastrada!')
    await fetch()
  }

  async function update(id, payload) {
    const { error } = await supabase.from('raw_materials').update(payload).eq('id', id)
    if (error) { toast.error('Erro ao atualizar matéria-prima.'); throw error }
    toast.success('Matéria-prima atualizada!')
    await fetch()
  }

  async function remove(id) {
    const { error } = await supabase.from('raw_materials').update({ active: false }).eq('id', id)
    if (error) { toast.error('Erro ao remover matéria-prima.'); throw error }
    toast.success('Matéria-prima removida.')
    await fetch()
  }

  // Vincula UM material a UM fornecedor (não desfaz vínculos com outros —
  // um material pode ter vários fornecedores ao mesmo tempo)
  async function linkSupplier(materialId, supplierId) {
    const { error } = await supabase.from('material_suppliers')
      .insert({ material_id: materialId, supplier_id: supplierId })
    // 23505 = já existia esse vínculo (conflito de unique) — ignora silenciosamente
    if (error && error.code !== '23505') { toast.error('Erro ao vincular fornecedor.'); throw error }
    await fetch()
  }

  // Remove o vínculo entre UM material e UM fornecedor específico
  async function unlinkSupplier(materialId, supplierId) {
    const { error } = await supabase.from('material_suppliers')
      .delete().eq('material_id', materialId).eq('supplier_id', supplierId)
    if (error) { toast.error('Erro ao desvincular fornecedor.'); throw error }
    await fetch()
  }

  // Vincula um grupo de materiais a um fornecedor de uma vez só
  // (usado na tela de "Vincular materiais" dentro de Fornecedores)
  // Não mexe nos outros fornecedores que esses materiais já tinham.
  async function bulkLinkSupplier(materialIds, supplierId) {
    if (!materialIds.length) return
    const rows = materialIds.map(id => ({ material_id: id, supplier_id: supplierId }))
    const { error } = await supabase.from('material_suppliers')
      .upsert(rows, { onConflict: 'material_id,supplier_id', ignoreDuplicates: true })
    if (error) { toast.error('Erro ao vincular materiais ao fornecedor.'); throw error }
  }

  // Remove o vínculo desse fornecedor específico com os materiais desmarcados
  async function bulkUnlinkSupplier(materialIds, supplierId) {
    if (!materialIds.length) return
    const { error } = await supabase.from('material_suppliers')
      .delete().eq('supplier_id', supplierId).in('material_id', materialIds)
    if (error) { toast.error('Erro ao desvincular materiais.'); throw error }
  }

  return { materials, loading, refetch: fetch, create, update, remove, linkSupplier, unlinkSupplier, bulkLinkSupplier, bulkUnlinkSupplier }
}
