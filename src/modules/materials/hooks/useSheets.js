import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import toast from 'react-hot-toast'

// Chapas de MDF (fase78, 26/09) — ver supabase/fase78-chapas-subchapas.sql.
// Chapa (sheet_format) = só o tamanho; sub-chapas (sheet_cuts) = o que ela
// rende; espessura e cor são escolhidas na compra. O estoque de verdade é
// raw_materials, 1 linha por sub-chapa × espessura × cor.
//
// Cache em módulo: formatos/espessuras/cores quase nunca mudam e são
// usados em várias telas (pedido, conferência, planos de corte).
let cache = null

async function load() {
  const [f, t, c, s] = await Promise.all([
    supabase.from('sheet_formats')
      .select('*, cuts:sheet_cuts(id, name, width_mm, length_mm, qty_per_sheet, sort_order, active)')
      .order('name'),
    supabase.from('sheet_thicknesses').select('*').order('sort_order'),
    supabase.from('sheet_colors').select('*').order('name'),
    supabase.from('raw_materials')
      .select('id, name, stock_qty, stock_min, sheet_cut_id, sheet_thickness_id, sheet_color_id')
      .not('sheet_cut_id', 'is', null),
  ])
  const err = f.error || t.error || c.error || s.error
  if (err) throw err
  const formats = (f.data ?? []).map(fm => ({
    ...fm,
    cuts: (fm.cuts ?? []).filter(ct => ct.active !== false).sort((a, b) => a.sort_order - b.sort_order),
  }))
  return { formats, thicknesses: t.data ?? [], colors: c.data ?? [], stock: s.data ?? [] }
}

export function useSheets() {
  const [data, setData]       = useState(cache || { formats: [], thicknesses: [], colors: [], stock: [] })
  const [loading, setLoading] = useState(!cache)

  const refetch = useCallback(async () => {
    try { cache = await load(); setData(cache) }
    catch (e) { console.error(e); toast.error('Erro ao carregar chapas.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { refetch() }, [refetch])

  // ── Chapa + sub-chapas ──
  // payload: { name, width_mm, length_mm, notes, cuts: [{ id?, name, width_mm, length_mm, qty_per_sheet }] }
  async function saveFormat(id, payload) {
    const header = {
      name: payload.name.trim(), width_mm: payload.width_mm || null, length_mm: payload.length_mm || null,
      notes: payload.notes?.trim() || null, updated_at: new Date().toISOString(),
    }
    let formatId = id
    if (id) {
      const { error } = await supabase.from('sheet_formats').update(header).eq('id', id)
      if (error) { toast.error('Erro ao salvar chapa.'); throw error }
    } else {
      const { data: row, error } = await supabase.from('sheet_formats').insert(header).select('id').single()
      if (error) { toast.error('Erro ao criar chapa.'); throw error }
      formatId = row.id
    }

    // Sub-chapas: atualiza as existentes, cria as novas e DESATIVA as
    // removidas (não apaga — podem ter estoque/histórico ligado).
    const current = id ? (data.formats.find(f => f.id === id)?.cuts ?? []) : []
    const keep = new Set(payload.cuts.filter(c => c.id).map(c => c.id))
    const removed = current.filter(c => !keep.has(c.id)).map(c => c.id)
    if (removed.length) {
      const { error } = await supabase.from('sheet_cuts').update({ active: false }).in('id', removed)
      if (error) { toast.error('Erro ao remover sub-chapa.'); throw error }
    }
    for (const [i, c] of payload.cuts.entries()) {
      const row = {
        name: c.name.trim(), width_mm: c.width_mm || null, length_mm: c.length_mm || null,
        qty_per_sheet: Math.max(1, parseInt(c.qty_per_sheet) || 1), sort_order: i + 1,
      }
      const q = c.id
        ? supabase.from('sheet_cuts').update(row).eq('id', c.id)
        : supabase.from('sheet_cuts').insert({ ...row, sheet_format_id: formatId })
      const { error } = await q
      if (error) { toast.error('Erro ao salvar sub-chapa.'); throw error }
    }
    toast.success(id ? 'Chapa atualizada!' : 'Chapa criada!')
    await refetch()
  }

  // Soft delete — pedidos antigos e estoque continuam apontando pra ela
  async function removeFormat(id) {
    const { error } = await supabase.from('sheet_formats').update({ active: false, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) { toast.error('Erro ao remover chapa.'); throw error }
    toast.success('Chapa removida.')
    await refetch()
  }

  // ── Espessuras / cores (listas simples) ──
  async function addOption(table, name) {
    const clean = name.trim()
    if (!clean) return
    const extra = table === 'sheet_thicknesses' ? { mm: parseFloat(clean) || null, sort_order: data.thicknesses.length + 1 } : {}
    const { error } = await supabase.from(table).insert({ name: clean, ...extra })
    if (error) { toast.error(error.code === '23505' ? 'Já existe.' : 'Erro ao adicionar.'); throw error }
    await refetch()
  }
  async function renameOption(table, id, name) {
    const { error } = await supabase.from(table).update({ name: name.trim() }).eq('id', id)
    if (error) { toast.error(error.code === '23505' ? 'Já existe com esse nome.' : 'Erro ao renomear.'); throw error }
    await refetch()
  }
  async function toggleOption(table, id, active) {
    const { error } = await supabase.from(table).update({ active }).eq('id', id)
    if (error) { toast.error('Erro ao atualizar.'); throw error }
    await refetch()
  }

  return { ...data, loading, refetch, saveFormat, removeFormat, addOption, renameOption, toggleOption }
}

// Formato "1840×2740" (mm)
export function fmtSize(w, l) {
  if (!w && !l) return ''
  const n = v => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
  return `${n(w)}×${n(l)}`
}

export function piecesPerSheet(format) {
  return (format?.cuts ?? []).reduce((s, c) => s + Number(c.qty_per_sheet || 0), 0)
}
