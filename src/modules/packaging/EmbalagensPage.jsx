import { useState, useMemo, useEffect } from 'react'
import { Plus, Search, Pencil, Trash2, Package, ArrowUpCircle, ArrowDownCircle, X, Clock, AlertTriangle } from 'lucide-react'
import { usePackaging } from './hooks/usePackaging'
import { EmptyState } from '../../components/ui/EmptyState'

function fmtDT(d) {
  if (!d) return ''
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function stockStatus(qty, min) {
  const q = parseFloat(qty) || 0
  const m = parseFloat(min) || 0
  if (m <= 0) return 'ok'
  if (q <= m) return 'danger'
  if (q <= m * 1.3) return 'warn'
  return 'ok'
}
const STATUS_STYLE = {
  ok:     { label: 'OK',      cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  warn:   { label: 'Baixo',   cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  danger: { label: 'Crítico', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
}

// ─── Modal: cadastrar / editar modelo ──────────────────────────────
function BoxFormModal({ open, onClose, onSave, initial, saving }) {
  const [form, setForm] = useState({ code: '', box_number: '', dimension: '', product_name: '', stock_qty: '', stock_min: '', notes: '' })

  useEffect(() => {
    if (initial) setForm({
      code: initial.code || '', box_number: initial.box_number || '', dimension: initial.dimension || '',
      product_name: initial.product_name || '', stock_qty: initial.stock_qty ?? '', stock_min: initial.stock_min ?? '', notes: initial.notes || '',
    })
    else setForm({ code: '', box_number: '', dimension: '', product_name: '', stock_qty: '', stock_min: '', notes: '' })
  }, [open, initial])

  if (!open) return null
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="font-bold text-slate-800" style={{ fontFamily: 'Nunito,sans-serif' }}>{initial ? 'Editar modelo' : 'Novo modelo de caixa'}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={16} /></button>
        </div>
        <div className="p-5 flex flex-col gap-3 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1 block">Código</label>
              <input className="input text-sm" value={form.code} onChange={e => set('code', e.target.value)} placeholder="EMB-001" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1 block">Número da caixa</label>
              <input className="input text-sm" value={form.box_number} onChange={e => set('box_number', e.target.value)} placeholder="Nº 5" />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1 block">Dimensão</label>
            <input className="input text-sm" value={form.dimension} onChange={e => set('dimension', e.target.value)} placeholder="30x20x15cm" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1 block">Produto que vai nela</label>
            <input className="input text-sm" value={form.product_name} onChange={e => set('product_name', e.target.value)} placeholder="Ex: Casinha M" />
          </div>
          {!initial && (
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1 block">Estoque inicial</label>
              <input type="number" className="input text-sm" value={form.stock_qty} onChange={e => set('stock_qty', e.target.value)} placeholder="0" />
            </div>
          )}
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1 block">Estoque mínimo (alerta)</label>
            <input type="number" className="input text-sm" value={form.stock_min} onChange={e => set('stock_min', e.target.value)} placeholder="Opcional" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1 block">Observações</label>
            <textarea className="textarea w-full text-sm" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2 p-5 border-t border-slate-100">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
          <button onClick={() => onSave(form)} disabled={saving} className="btn-primary flex-1 justify-center disabled:opacity-50">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal: lançar entrada/saída ───────────────────────────────────
function MoveStockModal({ open, onClose, box, type, onConfirm, saving }) {
  const [qty, setQty] = useState('')
  const [notes, setNotes] = useState('')

  if (!open) return null
  const isEntrada = type === 'entrada'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl border border-slate-100 p-6 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${isEntrada ? 'bg-emerald-50' : 'bg-rose-50'}`}>
            {isEntrada ? <ArrowUpCircle size={22} className="text-emerald-500" /> : <ArrowDownCircle size={22} className="text-rose-500" />}
          </div>
          <div>
            <h3 className="font-bold text-slate-800" style={{ fontFamily: 'Nunito,sans-serif' }}>{isEntrada ? 'Entrada de estoque' : 'Baixa de estoque'}</h3>
            <p className="text-xs text-slate-400">{box?.code || box?.box_number} — estoque atual: {box?.stock_qty}</p>
          </div>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1 block">Quantidade</label>
          <input type="number" min="1" className="input" autoFocus value={qty} onChange={e => setQty(e.target.value)} placeholder="0" />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1 block">Observação (opcional)</label>
          <input className="input text-sm" value={notes} onChange={e => setNotes(e.target.value)} placeholder={isEntrada ? 'Ex: compra recebida' : 'Ex: usado no pedido X'} />
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
          <button onClick={() => onConfirm(parseFloat(qty), notes)} disabled={!qty || parseFloat(qty) <= 0 || saving}
            className={`flex-1 justify-center py-2.5 rounded-xl font-semibold text-sm text-white transition-colors disabled:opacity-50 ${isEntrada ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-rose-500 hover:bg-rose-600'}`}>
            {saving ? 'Salvando...' : isEntrada ? 'Confirmar entrada' : 'Confirmar baixa'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal: histórico de movimentação ──────────────────────────────
function HistoryModal({ open, onClose, box, movements }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-800" style={{ fontFamily: 'Nunito,sans-serif' }}>Histórico de movimentação</h3>
            <p className="text-xs text-slate-400">{box?.code || box?.box_number}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={16} /></button>
        </div>
        <div className="overflow-y-auto divide-y divide-slate-50">
          {movements.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">Nenhuma movimentação ainda.</p>
          ) : movements.map(m => (
            <div key={m.id} className="px-5 py-3 flex items-center gap-3">
              {m.type === 'entrada'
                ? <ArrowUpCircle size={16} className="text-emerald-500 shrink-0" />
                : <ArrowDownCircle size={16} className="text-rose-500 shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-700">
                  {m.type === 'entrada' ? '+' : '-'}{m.qty} unidade{m.qty !== 1 ? 's' : ''}
                </p>
                {m.notes && <p className="text-xs text-slate-400">{m.notes}</p>}
                <p className="text-[10px] text-slate-300 mt-0.5">{m.author?.name || 'Sistema'} · {fmtDT(m.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────
export function EmbalagensPage() {
  const { boxes, loading, create, update, remove, moveStock, fetchMovements } = usePackaging()

  const [search,   setSearch]   = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing,  setEditing]  = useState(null)
  const [moveOpen, setMoveOpen] = useState(false)
  const [moveBox,  setMoveBox]  = useState(null)
  const [moveType, setMoveType] = useState('entrada')
  const [histOpen, setHistOpen] = useState(false)
  const [histBox,  setHistBox]  = useState(null)
  const [movements,setMovements]= useState([])
  const [saving,   setSaving]   = useState(false)

  const filtered = useMemo(() => {
    if (!search.trim()) return boxes
    const q = search.toLowerCase()
    return boxes.filter(b =>
      b.code?.toLowerCase().includes(q) || b.box_number?.toLowerCase().includes(q) || b.product_name?.toLowerCase().includes(q)
    )
  }, [boxes, search])

  const criticalCount = boxes.filter(b => stockStatus(b.stock_qty, b.stock_min) === 'danger').length
  const lowCount      = boxes.filter(b => stockStatus(b.stock_qty, b.stock_min) === 'warn').length

  async function handleSaveForm(payload) {
    setSaving(true)
    try {
      if (editing) await update(editing.id, payload)
      else await create(payload)
      setFormOpen(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleConfirmMove(qty, notes) {
    setSaving(true)
    try {
      await moveStock(moveBox.id, moveType, qty, notes)
      setMoveOpen(false)
    } finally {
      setSaving(false)
    }
  }

  async function openHistory(box) {
    setHistBox(box)
    const data = await fetchMovements(box.id)
    setMovements(data)
    setHistOpen(true)
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2" style={{ fontFamily: 'Nunito,sans-serif' }}>
            <Package size={22} className="text-rose-400" /> Embalagem
          </h1>
          <p className="text-sm text-slate-400">Cadastro de modelos de caixa e controle de estoque</p>
        </div>
        <button onClick={() => { setEditing(null); setFormOpen(true) }} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Novo modelo
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="card flex items-center gap-3 py-4">
          <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center"><Package size={18} className="text-sky-500" /></div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Modelos cadastrados</p>
            <p className="text-xl font-black text-slate-800" style={{ fontFamily: 'Nunito,sans-serif' }}>{boxes.length}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3 py-4">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center"><AlertTriangle size={18} className="text-amber-500" /></div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Estoque baixo</p>
            <p className="text-xl font-black text-slate-800" style={{ fontFamily: 'Nunito,sans-serif' }}>{lowCount}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3 py-4">
          <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center"><AlertTriangle size={18} className="text-rose-500" /></div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Estoque crítico</p>
            <p className="text-xl font-black text-slate-800" style={{ fontFamily: 'Nunito,sans-serif' }}>{criticalCount}</p>
          </div>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className="input pl-9" placeholder="Buscar por código, número ou produto..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><div className="w-7 h-7 border-4 border-rose-100 border-t-rose-400 rounded-full animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Package} title="Nenhum modelo cadastrado" description="Clique em 'Novo modelo' pra cadastrar a primeira caixa." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide border-b border-slate-100">
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Nº da caixa</th>
                <th className="px-4 py-3">Dimensão</th>
                <th className="px-4 py-3">Produto</th>
                <th className="px-4 py-3">Estoque</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(b => {
                const st = STATUS_STYLE[stockStatus(b.stock_qty, b.stock_min)]
                return (
                  <tr key={b.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-mono text-xs font-bold text-slate-600">{b.code || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{b.box_number || '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{b.dimension || '—'}</td>
                    <td className="px-4 py-3 text-slate-700 font-medium">{b.product_name || '—'}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => openHistory(b)} className="font-bold text-slate-700 hover:text-rose-500 hover:underline flex items-center gap-1">
                        {b.stock_qty} <Clock size={11} className="text-slate-300" />
                      </button>
                      {b.stock_min != null && <p className="text-[10px] text-slate-400">mín. {b.stock_min}</p>}
                    </td>
                    <td className="px-4 py-3"><span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${st.cls}`}>{st.label}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end items-center gap-1">
                        <button onClick={() => { setMoveBox(b); setMoveType('entrada'); setMoveOpen(true) }}
                          className="p-1.5 rounded-lg text-emerald-500 hover:bg-emerald-50" title="Entrada">
                          <ArrowUpCircle size={16} />
                        </button>
                        <button onClick={() => { setMoveBox(b); setMoveType('saida'); setMoveOpen(true) }}
                          className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50" title="Baixa">
                          <ArrowDownCircle size={16} />
                        </button>
                        <button onClick={() => { setEditing(b); setFormOpen(true) }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-sky-500 hover:bg-sky-50" title="Editar">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => { if (confirm(`Remover "${b.code || b.box_number}"?`)) remove(b.id) }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50" title="Remover">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <BoxFormModal open={formOpen} onClose={() => setFormOpen(false)} onSave={handleSaveForm} initial={editing} saving={saving} />
      <MoveStockModal open={moveOpen} onClose={() => setMoveOpen(false)} box={moveBox} type={moveType} onConfirm={handleConfirmMove} saving={saving} />
      <HistoryModal open={histOpen} onClose={() => setHistOpen(false)} box={histBox} movements={movements} />
    </div>
  )
}
