// Item de pedido de matéria-prima (fase78, 26/09): ou é uma matéria-prima
// comum (raw_material_id), ou uma CHAPA de MDF (formato + espessura + cor)
// que, na conferência, vira as sub-chapas dela no estoque.

// Campos de item usados em todas as telas (pedido, conferência, relatório)
export const ITEM_SELECT = `
  id, raw_material_id, qty_ordered, unit_price, qty_received, qty_damaged, item_status, cut_damage,
  sheet_format_id, sheet_thickness_id, sheet_color_id,
  raw_material:raw_materials(id, name, unit),
  sheet_format:sheet_formats(id, name, width_mm, length_mm, cuts:sheet_cuts(id, name, width_mm, length_mm, qty_per_sheet, sort_order, active)),
  sheet_thickness:sheet_thicknesses(id, name),
  sheet_color:sheet_colors(id, name)
`

export function isSheetItem(it) {
  return !!it?.sheet_format_id
}

export function itemName(it) {
  if (!it) return 'Item'
  if (isSheetItem(it)) {
    return [it.sheet_format?.name || 'Chapa', it.sheet_thickness?.name, it.sheet_color?.name].filter(Boolean).join(' · ')
  }
  return it.raw_material?.name || 'Item'
}

export function itemUnit(it) {
  return isSheetItem(it) ? 'chapa' : (it?.raw_material?.unit || '')
}

// Sub-chapas ativas da chapa do item, na ordem
export function itemCuts(it) {
  return (it?.sheet_format?.cuts ?? []).filter(c => c.active !== false).sort((a, b) => a.sort_order - b.sort_order)
}

export function itemPiecesPerSheet(it) {
  return itemCuts(it).reduce((s, c) => s + Number(c.qty_per_sheet || 0), 0)
}

// Nome da sub-chapa de uma ocorrência de avaria (quando é de chapa)
export function cutName(it, cutId) {
  return (it?.sheet_format?.cuts ?? []).find(c => c.id === cutId)?.name || null
}

// Prejuízo de uma avaria. Em chapa, qty_damaged conta SUB-CHAPAS; o preço
// é por chapa inteira → rateia pela área de cada sub-chapa avariada (se
// tiver as medidas) ou, sem medidas, pela quantidade de peças.
export function damageLoss(it) {
  const price = Number(it?.unit_price) || 0
  if (!price) return 0
  if (!isSheetItem(it)) return (Number(it?.qty_damaged) || 0) * price
  const cuts = itemCuts(it)
  const dmg = it.cut_damage || {}
  const areaOf = c => (Number(c.width_mm) || 0) * (Number(c.length_mm) || 0)
  const totalArea = cuts.reduce((s, c) => s + areaOf(c) * Number(c.qty_per_sheet || 0), 0)
  if (totalArea > 0) {
    return cuts.reduce((s, c) => s + price * (areaOf(c) / totalArea) * (Number(dmg[c.id]) || 0), 0)
  }
  const pieces = itemPiecesPerSheet(it) || 1
  return price * (Number(it.qty_damaged) || 0) / pieces
}
