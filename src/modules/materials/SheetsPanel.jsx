import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Loader2, Check, X, Layers, Ruler, Palette, EyeOff, Eye } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { useSheets, fmtSize, piecesPerSheet } from './hooks/useSheets'
import toast from 'react-hot-toast'

// Aba "Chapas" da Matéria-Prima (fase78, 26/09). Cadastro das chapas de
// MDF (só tamanho) + sub-chapas que cada uma rende, espessuras, cores e o
// estoque atual por sub-chapa × cor. Espessura e cor são escolhidas na
// hora da compra (Pedidos de Matéria-Prima).

// Mini desenho proporcional: cada sub-chapa desenhada na escala da chapa
function CutShape({ cut, format, max = 44 }) {
  const W = Number(format.width_mm) || 1, L = Number(format.length_mm) || 1
  const scale = max / Math.max(W, L)
  const w = Math.max(4, (Number(cut.width_mm) || 0) * scale)
  const h = Math.max(4, (Number(cut.length_mm) || 0) * scale)
  return <span className="inline-block bg-amber-200 border border-amber-400 rounded-[2px]" style={{ width: w, height: h }} />
}

function FormatModal({ open, onClose, format, onSave }) {
  const [name, setName]   = useState('')
  const [w, setW]         = useState('')
  const [l, setL]         = useState('')
  const [notes, setNotes] = useState('')
  const [cuts, setCuts]   = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(format?.name || ''); setW(format?.width_mm ? String(Number(format.width_mm)) : '')
    setL(format?.length_mm ? String(Number(format.length_mm)) : ''); setNotes(format?.notes || '')
    setCuts(format?.cuts?.length
      ? format.cuts.map(c => ({ id: c.id, name: c.name, width_mm: String(Number(c.width_mm || 0) || ''), length_mm: String(Number(c.length_mm || 0) || ''), qty_per_sheet: String(c.qty_per_sheet) }))
      : [{ name: 'Corte 1', width_mm: '', length_mm: '', qty_per_sheet: '1' }])
  }, [open, format])

  function setCut(i, patch) { setCuts(prev => prev.map((c, j) => j === i ? { ...c, ...patch } : c)) }

  const usedArea = cuts.reduce((s, c) => s + (Number(c.width_mm) || 0) * (Number(c.length_mm) || 0) * (Number(c.qty_per_sheet) || 0), 0)
  const sheetArea = (Number(w) || 0) * (Number(l) || 0)
  const pct = sheetArea ? Math.round((usedArea / sheetArea) * 100) : null
  const valid = name.trim() && cuts.length && cuts.every(c => c.name.trim() && Number(c.qty_per_sheet) >= 1)

  async function handleSave() {
    setSaving(true)
    try {
      await onSave(format?.id || null, { name, width_mm: Number(w) || null, length_mm: Number(l) || null, notes, cuts })
      onClose()
    } catch { /* toast no hook */ }
    finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} size="xl" title={format ? `Editar chapa — ${format.name}` : 'Nova chapa'}
      subtitle="Só o tamanho — espessura e cor são escolhidas na hora da compra. Retalho não entra (não cadastre)."
      footer={<>
        <button onClick={onClose} className="btn-secondary" disabled={saving}>Cancelar</button>
        <button onClick={handleSave} className="btn-primary" disabled={saving || !valid}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} {format ? 'Salvar' : 'Criar chapa'}
        </button>
      </>}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px_120px] gap-3">
          <div>
            <label className="form-label">Nome da chapa</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: CE1, CE Acácia, Chapa inteira 1850×2750" autoFocus />
          </div>
          <div>
            <label className="form-label">Largura (mm)</label>
            <input className="input" type="number" value={w} onChange={e => setW(e.target.value)} placeholder="1840" />
          </div>
          <div>
            <label className="form-label">Comprimento (mm)</label>
            <input className="input" type="number" value={l} onChange={e => setL(e.target.value)} placeholder="2740" />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="form-label mb-0">Sub-chapas que ela rende</label>
            {pct != null && <span className={`text-[11px] font-semibold ${pct > 100 ? 'text-rose-600' : 'text-slate-400'}`}>{pct}% da chapa aproveitada{pct > 100 ? ' — passa do tamanho da chapa!' : ''}</span>}
          </div>
          <div className="flex flex-col gap-2">
            {cuts.map((c, i) => (
              <div key={c.id || i} className="grid grid-cols-[1fr_100px_100px_80px_32px] gap-2 items-center">
                <input className="input py-1.5" value={c.name} onChange={e => setCut(i, { name: e.target.value })} placeholder="Corte 1" />
                <input className="input py-1.5" type="number" value={c.width_mm} onChange={e => setCut(i, { width_mm: e.target.value })} placeholder="larg. mm" />
                <input className="input py-1.5" type="number" value={c.length_mm} onChange={e => setCut(i, { length_mm: e.target.value })} placeholder="comp. mm" />
                <div className="relative">
                  <input className="input py-1.5 pr-6" type="number" min="1" value={c.qty_per_sheet} onChange={e => setCut(i, { qty_per_sheet: e.target.value })} />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">×</span>
                </div>
                <button type="button" onClick={() => setCuts(prev => prev.filter((_, j) => j !== i))} disabled={cuts.length === 1}
                  className="p-1.5 text-slate-300 hover:text-rose-500 disabled:opacity-30"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-[1fr_100px_100px_80px_32px] gap-2 text-[10px] text-slate-400 mt-1 px-1">
            <span>nome</span><span>largura</span><span>comprimento</span><span>qtd por chapa</span><span />
          </div>
          <button type="button" onClick={() => setCuts(prev => [...prev, { name: `Corte ${prev.length + 1}`, width_mm: '', length_mm: '', qty_per_sheet: '1' }])}
            className="mt-2 text-xs font-semibold text-amber-600 hover:text-amber-700 flex items-center gap-1"><Plus size={13} /> Adicionar sub-chapa</button>
          {format && <p className="text-[11px] text-slate-400 mt-2">Remover uma sub-chapa só a desativa — o estoque e os pedidos antigos dela continuam guardados.</p>}
        </div>

        <div>
          <label className="form-label">Observações</label>
          <textarea className="input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opcional..." />
        </div>
      </div>
    </Modal>
  )
}

// Lista simples editável (espessuras / cores)
function OptionList({ title, icon: Icon, table, items, onAdd, onRename, onToggle, placeholder }) {
  const [adding, setAdding] = useState('')
  const [editId, setEditId] = useState(null)
  const [editName, setEditName] = useState('')
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5 mb-3"><Icon size={14} className="text-amber-500" /> {title}</p>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {items.map(it => editId === it.id ? (
          <span key={it.id} className="inline-flex items-center gap-1">
            <input className="input py-1 text-xs w-32" value={editName} onChange={e => setEditName(e.target.value)} autoFocus
              onKeyDown={e => { if (e.key === 'Enter') onRename(table, it.id, editName).then(() => setEditId(null)).catch(() => {}) }} />
            <button onClick={() => onRename(table, it.id, editName).then(() => setEditId(null)).catch(() => {})} className="text-emerald-600"><Check size={13} /></button>
            <button onClick={() => setEditId(null)} className="text-slate-400"><X size={13} /></button>
          </span>
        ) : (
          <span key={it.id} className={`group inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${it.active ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-white border-dashed border-slate-200 text-slate-300 line-through'}`}>
            {it.name}
            <button onClick={() => { setEditId(it.id); setEditName(it.name) }} className="hidden group-hover:inline text-slate-400 hover:text-sky-600" title="Renomear"><Pencil size={10} /></button>
            <button onClick={() => onToggle(table, it.id, !it.active).catch(() => {})} className="hidden group-hover:inline text-slate-400 hover:text-rose-500" title={it.active ? 'Desativar' : 'Reativar'}>
              {it.active ? <EyeOff size={10} /> : <Eye size={10} />}
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-1.5">
        <input className="input py-1.5 text-sm" value={adding} onChange={e => setAdding(e.target.value)} placeholder={placeholder}
          onKeyDown={e => { if (e.key === 'Enter' && adding.trim()) onAdd(table, adding).then(() => setAdding('')).catch(() => {}) }} />
        <button onClick={() => adding.trim() && onAdd(table, adding).then(() => setAdding('')).catch(() => {})} className="btn-primary py-1.5 px-3 text-xs"><Plus size={13} /></button>
      </div>
    </div>
  )
}

// Estoque de uma chapa: linhas = sub-chapas, colunas = cores (por espessura)
function StockMatrix({ format, thicknesses, colors, stock }) {
  const fmtStock = stock.filter(s => format.cuts.some(c => c.id === s.sheet_cut_id))
  const thIds = [...new Set(fmtStock.map(s => s.sheet_thickness_id))]
  const ths = thicknesses.filter(t => thIds.includes(t.id))
  const [thId, setThId] = useState(ths[0]?.id || null)
  const current = ths.find(t => t.id === thId) || ths[0]
  if (!current) return <p className="text-xs text-slate-400 py-2">Sem estoque ainda — entra quando uma compra dessa chapa for conferida.</p>

  const rows = fmtStock.filter(s => s.sheet_thickness_id === current.id)
  const colorIds = [...new Set(rows.map(s => s.sheet_color_id))]
  const cols = colors.filter(c => colorIds.includes(c.id))
  const cell = (cutId, colorId) => rows.find(s => s.sheet_cut_id === cutId && s.sheet_color_id === colorId)

  return (
    <div>
      {ths.length > 1 && (
        <div className="flex gap-1 mb-2">
          {ths.map(t => (
            <button key={t.id} onClick={() => setThId(t.id)} className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${t.id === current.id ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'}`}>{t.name}</button>
          ))}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="text-xs w-full">
          <thead>
            <tr className="text-[10px] uppercase text-slate-400">
              <th className="text-left font-semibold py-1 pr-2">{current.name}</th>
              {cols.map(c => <th key={c.id} className="font-semibold py-1 px-1.5 text-right whitespace-nowrap">{c.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {format.cuts.map(cut => (
              <tr key={cut.id} className="border-t border-slate-100">
                <td className="py-1 pr-2 text-slate-600 whitespace-nowrap">{cut.name}</td>
                {cols.map(c => {
                  const s = cell(cut.id, c.id)
                  const v = s ? Number(s.stock_qty) : null
                  return (
                    <td key={c.id} className={`py-1 px-1.5 text-right tabular-nums font-semibold ${v == null ? 'text-slate-200' : v <= 0 ? 'text-rose-500' : 'text-slate-700'}`}>
                      {v == null ? '—' : v.toLocaleString('pt-BR')}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function SheetsPanel() {
  const { formats, thicknesses, colors, stock, loading, saveFormat, removeFormat, addOption, renameOption, toggleOption } = useSheets()
  const [editing, setEditing] = useState(null) // format | 'new' | null
  const [deleting, setDeleting] = useState(null)
  const [busy, setBusy] = useState(false)
  const active = useMemo(() => formats.filter(f => f.active !== false), [formats])

  if (loading) return <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-slate-300" /></div>

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm text-slate-500 max-w-2xl">
          Cada chapa comprada rende as sub-chapas cadastradas aqui — é isso que entra no estoque quando o João confere.
          Na compra o César escolhe a <b>chapa</b>, a <b>espessura</b> e a <b>cor</b>.
        </p>
        <button onClick={() => setEditing('new')} className="btn-primary"><Plus size={15} /> Nova chapa</button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {active.map(f => (
          <div key={f.id} className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-base font-bold text-slate-800 flex items-center gap-2"><Layers size={15} className="text-amber-500" /> {f.name}</p>
                <p className="text-xs text-slate-500">{fmtSize(f.width_mm, f.length_mm)} mm · rende {piecesPerSheet(f)} sub-chapa{piecesPerSheet(f) !== 1 ? 's' : ''}</p>
                {f.notes && <p className={`text-[11px] mt-0.5 ${/confirmar/i.test(f.notes) ? 'text-amber-600 font-semibold' : 'text-slate-400'}`}>{f.notes}</p>}
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => setEditing(f)} className="p-1.5 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50"><Pencil size={14} /></button>
                <button onClick={() => setDeleting(f)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"><Trash2 size={14} /></button>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              {f.cuts.map(c => (
                <div key={c.id} className="flex items-center gap-3 text-xs bg-slate-50 rounded-lg px-2.5 py-1.5">
                  <span className="w-12 flex items-center justify-center shrink-0"><CutShape cut={c} format={f} max={40} /></span>
                  <span className="font-semibold text-slate-700 w-20 shrink-0">{c.name}</span>
                  <span className="text-slate-500 tabular-nums">{fmtSize(c.width_mm, c.length_mm)} mm</span>
                  <span className="ml-auto font-bold text-slate-700">×{c.qty_per_sheet}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-100 pt-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Estoque atual (sub-chapas)</p>
              <StockMatrix format={f} thicknesses={thicknesses} colors={colors} stock={stock} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <OptionList title="Espessuras" icon={Ruler} table="sheet_thicknesses" items={thicknesses} placeholder="Ex: 9mm"
          onAdd={addOption} onRename={renameOption} onToggle={toggleOption} />
        <OptionList title="Cores" icon={Palette} table="sheet_colors" items={colors} placeholder="Ex: Cerrado Amadeirado"
          onAdd={addOption} onRename={renameOption} onToggle={toggleOption} />
      </div>

      <FormatModal open={!!editing} format={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSave={saveFormat} />
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} loading={busy} confirmLabel="Remover"
        title="Remover chapa?"
        description={deleting ? `"${deleting.name}" some das opções de compra. O estoque das sub-chapas dela e os pedidos antigos continuam guardados.` : ''}
        onConfirm={async () => { setBusy(true); try { await removeFormat(deleting.id); setDeleting(null) } catch { toast.error('Não foi possível remover.') } finally { setBusy(false) } }} />
    </div>
  )
}
