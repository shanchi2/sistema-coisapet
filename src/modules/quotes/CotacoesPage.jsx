import { useState, useMemo, useEffect } from 'react'
import {
  Plus, Search, ArrowLeft, FileDown, Copy, Check, X, Trash2,
  ClipboardList, Truck, ThumbsUp, ThumbsDown, Ban, ExternalLink,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useQuoteRequests } from './hooks/useQuoteRequests'
import { useSuppliers } from '../financial/hooks/useSuppliers'
import { useMaterials } from '../materials/hooks/useMaterials'
import { EmptyState } from '../../components/ui/EmptyState'
import toast from 'react-hot-toast'

const PUBLIC_BASE = 'https://coisapet.com.br/sistema'

function fmtDT(d) {
  if (!d) return ''
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function fmtPreco(v) {
  const n = parseFloat(v)
  if (!n || isNaN(n)) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const STATUS_CFG = {
  aguardando: { label: 'Aguardando',  cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  respondido: { label: 'Respondido',  cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  aprovado:   { label: 'Aprovado',    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  recusado:   { label: 'Recusado',    cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  cancelado:  { label: 'Cancelado',   cls: 'bg-slate-100 text-slate-500 border-slate-200' },
}

// ─── Geração da cartilha (PDF de pedido de cotação) ────────────────
async function generateCartilhaPDF(quote) {
  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const PAGE_W = 210, PAGE_H = 297, MARGIN = 16

  doc.setFillColor(61, 31, 13)
  doc.rect(0, 0, PAGE_W, 34, 'F')
  doc.setTextColor(196, 149, 106)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.text('CoisaPet', MARGIN, 16)
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text('Pedido de Cotação', MARGIN, 25)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(196, 149, 106)
  doc.text(quote.code, PAGE_W - MARGIN, 16, { align: 'right' })

  let y = 46
  doc.setFillColor(241, 226, 205)
  doc.roundedRect(MARGIN, y, PAGE_W - MARGIN * 2, 18, 3, 3, 'F')
  doc.setTextColor(110, 63, 37)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('PARA', MARGIN + 6, y + 7)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(61, 31, 13)
  doc.text(quote.supplier?.name || 'Fornecedor', MARGIN + 6, y + 14)
  y += 26

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(90, 90, 90)
  const introLines = doc.splitTextToSize(
    'Olá! Gostaríamos de solicitar uma cotação para os itens abaixo. Por favor, preencha o preço unitário, quantidade mínima de pedido e prazo de entrega para cada item.',
    PAGE_W - MARGIN * 2
  )
  doc.text(introLines, MARGIN, y)
  y += introLines.length * 4.5 + 8

  const colX = [MARGIN, MARGIN + 82, MARGIN + 112, MARGIN + 140]
  const rowH = 16

  doc.setFillColor(61, 31, 13)
  doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 9, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(196, 149, 106)
  doc.text('ITEM / ESPECIFICAÇÃO', colX[0] + 3, y + 6)
  doc.text('QTD. DESEJADA', colX[1] + 3, y + 6)
  doc.text('UNIDADE', colX[2] + 3, y + 6)
  doc.text('PREÇO (a preencher)', colX[3] + 3, y + 6)
  y += 9

  doc.setFont('helvetica', 'normal')
  ;(quote.items || []).forEach((it, idx) => {
    if (y > PAGE_H - 70) { doc.addPage(); y = MARGIN }
    if (idx % 2 === 1) {
      doc.setFillColor(250, 248, 245)
      doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, rowH, 'F')
    }
    doc.setTextColor(60, 60, 60)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text(it.material_name_snap, colX[0] + 3, y + 6)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(120, 120, 120)
    if (it.material_notes_snap) {
      const specLines = doc.splitTextToSize(it.material_notes_snap, colX[1] - colX[0] - 6)
      doc.text(specLines.slice(0, 2), colX[0] + 3, y + 11)
    }
    doc.setFontSize(9)
    doc.setTextColor(60, 60, 60)
    doc.setFont('helvetica', 'bold')
    doc.text(it.requested_qty != null ? String(it.requested_qty) : '—', colX[1] + 3, y + 6)
    doc.setFont('helvetica', 'normal')
    doc.text(it.unit_snap || '—', colX[2] + 3, y + 6)
    // linha em branco pro fornecedor preencher, se for impresso
    doc.setDrawColor(200, 200, 200)
    doc.line(colX[3] + 3, y + 10, PAGE_W - MARGIN - 3, y + 10)
    y += rowH
  })

  y += 10
  const link = `${PUBLIC_BASE}/cotacao/${quote.public_token}`
  doc.setFillColor(241, 226, 205)
  doc.roundedRect(MARGIN, y, PAGE_W - MARGIN * 2, 22, 3, 3, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(110, 63, 37)
  doc.text('Prefere responder online?', MARGIN + 6, y + 8)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(61, 31, 13)
  doc.textWithLink(link, MARGIN + 6, y + 15, { url: link })

  const footY = PAGE_H - 20
  doc.setDrawColor(230, 220, 210)
  doc.line(MARGIN, footY, PAGE_W - MARGIN, footY)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(180, 170, 160)
  doc.text('CoisaPet® · coisapet.com.br', MARGIN, footY + 7)
  doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, PAGE_W - MARGIN, footY + 7, { align: 'right' })

  doc.save(`cotacao_${(quote.supplier?.name || 'fornecedor').replace(/\s+/g, '_').toLowerCase()}_${quote.code}.pdf`)
}

// ─── Modal: nova cotação ───────────────────────────────────────────
function NewQuoteModal({ open, onClose, onCreated }) {
  const { suppliers } = useSuppliers()
  const { materials } = useMaterials()
  const { create } = useQuoteRequests()

  const [supplierId, setSupplierId] = useState('')
  const [search,      setSearch]    = useState('')
  const [selected,    setSelected]  = useState([])
  const [notes,       setNotes]     = useState('')
  const [saving,      setSaving]    = useState(false)

  useEffect(() => {
    if (open) { setSupplierId(''); setSearch(''); setSelected([]); setNotes('') }
  }, [open])

  const filteredMaterials = useMemo(() => {
    const active = materials.filter(m => m.active)
    if (!search.trim()) return active
    const q = search.toLowerCase()
    return active.filter(m => m.name.toLowerCase().includes(q))
  }, [materials, search])

  function toggle(m) {
    setSelected(prev => prev.some(x => x.id === m.id) ? prev.filter(x => x.id !== m.id) : [...prev, { ...m, qty: '' }])
  }
  function setQty(id, qty) {
    setSelected(prev => prev.map(x => x.id === id ? { ...x, qty } : x))
  }

  async function handleCreate() {
    if (!supplierId || selected.length === 0) return
    setSaving(true)
    try {
      const quote = await create({ supplier_id: supplierId, notes, materials: selected })
      onCreated(quote.id)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-100 flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="font-bold text-slate-800" style={{ fontFamily: 'Nunito,sans-serif' }}>Nova cotação</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={16} /></button>
        </div>

        <div className="p-5 flex flex-col gap-4 overflow-y-auto">
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5 block">Fornecedor</label>
            <select className="select" value={supplierId} onChange={e => setSupplierId(e.target.value)}>
              <option value="">Selecione...</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5 block">
              Matérias-primas a cotar ({selected.length} selecionada{selected.length !== 1 ? 's' : ''})
            </label>
            <div className="relative mb-2">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="input pl-8 text-sm" placeholder="Buscar matéria-prima..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="border border-slate-200 rounded-xl max-h-48 overflow-y-auto divide-y divide-slate-50">
              {filteredMaterials.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">Nenhuma matéria-prima encontrada.</p>
              ) : filteredMaterials.map(m => {
                const sel = selected.find(x => x.id === m.id)
                const isSel = !!sel
                return (
                  <div key={m.id} className={`flex items-center gap-2.5 px-3 py-2 ${isSel ? 'bg-rose-50/50' : ''}`}>
                    <button type="button" onClick={() => toggle(m)} className="flex items-center gap-2.5 flex-1 min-w-0 text-left">
                      <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${isSel ? 'bg-rose-400 border-rose-400' : 'border-slate-300'}`}>
                        {isSel && <Check size={11} className="text-white" />}
                      </div>
                      <span className="text-sm text-slate-700 truncate">{m.name}</span>
                    </button>
                    {isSel && (
                      <div className="flex items-center gap-1 shrink-0">
                        <input type="number" min="0" className="w-20 text-xs text-right border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-rose-300"
                          placeholder="Qtd." value={sel.qty} onChange={e => setQty(m.id, e.target.value)} />
                        <span className="text-[10px] text-slate-400 w-8">{m.unit || ''}</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5 block">Observações (opcional)</label>
            <textarea className="textarea w-full" rows={2} value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Alguma condição específica pra esse fornecedor..." />
          </div>
        </div>

        <div className="flex gap-2 p-5 border-t border-slate-100">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
          <button onClick={handleCreate} disabled={!supplierId || selected.length === 0 || saving}
            className="btn-primary flex-1 justify-center disabled:opacity-50">
            {saving ? 'Criando...' : 'Criar cotação'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────
export function CotacoesPage() {
  const { user } = useAuth()
  const { quotes, loading, fetchOne, updateItem, markResponded, setStatus, removeQuote } = useQuoteRequests()

  const [view, setView] = useState('list') // 'list' | 'detail'
  const [detail, setDetail] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [itemDrafts, setItemDrafts] = useState({}) // { [itemId]: {unit_price, min_qty, lead_time_days, notes} }
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  if (user?.role !== 'admin' && user?.role !== 'administrativo') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-16 h-16 rounded-full bg-rose-50 flex items-center justify-center">
          <Ban size={28} className="text-rose-400" />
        </div>
        <h2 className="text-xl font-bold text-slate-700">Acesso restrito</h2>
        <p className="text-sm text-slate-400">Somente Diretoria e Administrativo acessam Cotações.</p>
      </div>
    )
  }

  const filtered = useMemo(() => {
    return quotes.filter(q => {
      if (statusFilter && q.status !== statusFilter) return false
      if (search && !q.supplier?.name?.toLowerCase().includes(search.toLowerCase()) && !q.code?.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [quotes, search, statusFilter])

  async function openDetail(id) {
    const data = await fetchOne(id)
    setDetail(data)
    const drafts = {}
    ;(data.items || []).forEach(it => {
      drafts[it.id] = { unit_price: it.unit_price ?? '', min_qty: it.min_qty ?? '', lead_time_days: it.lead_time_days ?? '', notes: it.notes ?? '' }
    })
    setItemDrafts(drafts)
    setView('detail')
  }

  async function reloadDetail(id) {
    const data = await fetchOne(id)
    setDetail(data)
    const drafts = {}
    ;(data.items || []).forEach(it => {
      drafts[it.id] = { unit_price: it.unit_price ?? '', min_qty: it.min_qty ?? '', lead_time_days: it.lead_time_days ?? '', notes: it.notes ?? '' }
    })
    setItemDrafts(drafts)
  }

  async function handleSaveItems() {
    setSaving(true)
    try {
      await Promise.all(Object.entries(itemDrafts).map(([itemId, draft]) => updateItem(itemId, {
        unit_price: draft.unit_price === '' ? null : parseFloat(draft.unit_price),
        min_qty: draft.min_qty === '' ? null : parseFloat(draft.min_qty),
        lead_time_days: draft.lead_time_days === '' ? null : parseInt(draft.lead_time_days),
        notes: draft.notes || null,
      })))
      const anyPriced = Object.values(itemDrafts).some(d => d.unit_price !== '')
      if (anyPriced && detail.status === 'aguardando') await markResponded(detail.id)
      toast.success('Preços salvos!')
      await reloadDetail(detail.id)
    } finally {
      setSaving(false)
    }
  }

  async function handleGeneratePDF() {
    setGenerating(true)
    try { await generateCartilhaPDF(detail) } finally { setGenerating(false) }
  }

  function copyLink() {
    const link = `${PUBLIC_BASE}/cotacao/${detail.public_token}`
    navigator.clipboard.writeText(link)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
  }

  // ══════════════════════ LISTA ══════════════════════
  if (view === 'list') {
    return (
      <div className="flex flex-col gap-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2" style={{ fontFamily: 'Nunito,sans-serif' }}>
              <ClipboardList size={22} className="text-rose-400" /> Cotações de Fornecedores
            </h1>
            <p className="text-sm text-slate-400">Peça, compare e escolha os melhores preços de matéria-prima</p>
          </div>
          <button onClick={() => setShowNew(true)} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Nova cotação
          </button>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Buscar por fornecedor ou código..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl flex-wrap">
            {[{ key: '', label: 'Todas' }, ...Object.entries(STATUS_CFG).map(([k, v]) => ({ key: k, label: v.label }))].map(opt => (
              <button key={opt.key || 'all'} onClick={() => setStatusFilter(opt.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${statusFilter === opt.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="card overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16"><div className="w-7 h-7 border-4 border-rose-100 border-t-rose-400 rounded-full animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={ClipboardList} title="Nenhuma cotação ainda" description="Clique em 'Nova cotação' pra pedir preço a um fornecedor." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide border-b border-slate-100">
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Fornecedor</th>
                  <th className="px-4 py-3">Itens</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Criada em</th>
                  <th className="px-4 py-3 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(q => {
                  const st = STATUS_CFG[q.status] || STATUS_CFG.aguardando
                  const priced = (q.items || []).filter(i => i.unit_price != null).length
                  return (
                    <tr key={q.id} className="hover:bg-slate-50 cursor-pointer group" onClick={() => openDetail(q.id)}>
                      <td className="px-4 py-3 font-mono text-xs font-bold text-slate-500">{q.code}</td>
                      <td className="px-4 py-3 font-semibold text-slate-700">{q.supplier?.name || '—'}</td>
                      <td className="px-4 py-3 text-slate-500">{priced}/{q.items?.length ?? 0} com preço</td>
                      <td className="px-4 py-3"><span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${st.cls}`}>{st.label}</span></td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{fmtDT(q.created_at)}</td>
                      <td className="px-4 py-3">
                        <button onClick={e => { e.stopPropagation(); if (confirm(`Excluir cotação ${q.code}?`)) removeQuote(q.id) }}
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-opacity">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <NewQuoteModal open={showNew} onClose={() => setShowNew(false)} onCreated={openDetail} />
      </div>
    )
  }

  // ══════════════════════ DETALHE ══════════════════════
  if (!detail) return null
  const st = STATUS_CFG[detail.status] || STATUS_CFG.aguardando
  const link = `${PUBLIC_BASE}/cotacao/${detail.public_token}`

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <button onClick={() => setView('list')} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2" style={{ fontFamily: 'Nunito,sans-serif' }}>
            {detail.supplier?.name}
            <span className="text-xs font-mono font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-lg">{detail.code}</span>
            <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${st.cls}`}>{st.label}</span>
          </h1>
          <p className="text-sm text-slate-400">Criada em {fmtDT(detail.created_at)} por {detail.creator?.name || '—'}</p>
        </div>
        <button onClick={handleGeneratePDF} disabled={generating} className="btn-primary flex items-center gap-2 disabled:opacity-50">
          {generating ? 'Gerando...' : <><FileDown size={15} /> Gerar cartilha PDF</>}
        </button>
      </div>

      {/* Link público */}
      <div className="card p-4 flex items-center gap-3 bg-sky-50/50 border-sky-100">
        <ExternalLink size={16} className="text-sky-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-sky-700 uppercase tracking-wide">Link público pro fornecedor preencher sozinho</p>
          <p className="text-sm text-slate-600 truncate font-mono">{link}</p>
        </div>
        <button onClick={copyLink} className="btn-secondary text-xs px-3 py-2 flex items-center gap-1.5 shrink-0">
          {linkCopied ? <><Check size={13} /> Copiado!</> : <><Copy size={13} /> Copiar link</>}
        </button>
      </div>

      {/* Itens — preenchimento manual */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Itens cotados — preencha se o fornecedor respondeu por fora</p>
        </div>
        <div className="divide-y divide-slate-50">
          {(detail.items || []).map(it => (
            <div key={it.id} className="p-4 flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[180px]">
                <p className="text-sm font-semibold text-slate-700">{it.material_name_snap}</p>
                {it.material_notes_snap && <p className="text-xs text-slate-400">{it.material_notes_snap}</p>}
                {it.requested_qty != null && (
                  <p className="text-[11px] text-violet-600 font-semibold mt-0.5">Quantidade desejada: {it.requested_qty} {it.unit_snap || ''}</p>
                )}
              </div>
              <div className="w-28">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Preço unit. (R$)</label>
                <input type="number" step="0.01" className="input text-sm" value={itemDrafts[it.id]?.unit_price ?? ''}
                  onChange={e => setItemDrafts(d => ({ ...d, [it.id]: { ...d[it.id], unit_price: e.target.value } }))} placeholder="0,00" />
              </div>
              <div className="w-24">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Qtd. mínima</label>
                <input type="number" className="input text-sm" value={itemDrafts[it.id]?.min_qty ?? ''}
                  onChange={e => setItemDrafts(d => ({ ...d, [it.id]: { ...d[it.id], min_qty: e.target.value } }))} placeholder="—" />
              </div>
              <div className="w-24">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Prazo (dias)</label>
                <input type="number" className="input text-sm" value={itemDrafts[it.id]?.lead_time_days ?? ''}
                  onChange={e => setItemDrafts(d => ({ ...d, [it.id]: { ...d[it.id], lead_time_days: e.target.value } }))} placeholder="—" />
              </div>
              <div className="flex-1 min-w-[140px]">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Obs.</label>
                <input className="input text-sm" value={itemDrafts[it.id]?.notes ?? ''}
                  onChange={e => setItemDrafts(d => ({ ...d, [it.id]: { ...d[it.id], notes: e.target.value } }))} placeholder="Opcional" />
              </div>
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-slate-100">
          <button onClick={handleSaveItems} disabled={saving} className="btn-primary text-sm disabled:opacity-50">
            {saving ? 'Salvando...' : 'Salvar preços'}
          </button>
        </div>
      </div>

      {/* Ações de status */}
      {detail.status !== 'aprovado' && detail.status !== 'cancelado' && (
        <div className="card p-4 flex flex-wrap gap-2">
          <button onClick={async () => { await setStatus(detail.id, 'aprovado'); reloadDetail(detail.id) }}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
            <ThumbsUp size={13} /> Aprovar cotação
          </button>
          <button onClick={async () => { await setStatus(detail.id, 'recusado'); reloadDetail(detail.id) }}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100">
            <ThumbsDown size={13} /> Recusar
          </button>
          <button onClick={async () => { await setStatus(detail.id, 'cancelado'); reloadDetail(detail.id) }}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200">
            <Ban size={13} /> Cancelar
          </button>
        </div>
      )}
    </div>
  )
}
