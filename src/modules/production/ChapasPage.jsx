import { useState, useEffect, useMemo } from 'react'
import { Layers, Plus, Search, X, Pencil, Trash2, Package, Hash, ChevronDown, Factory, History, ArrowRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { useChapas } from './hooks/useChapas'
import { useProducts } from '../products/hooks/useProducts'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { useSignedUrl } from '../../lib/signedUrlCache'

function fmtDateTime(iso) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Normaliza acento/caixa pra busca não-exigente — "terrario" tem que
// achar "Terrário" (e vice-versa), sem precisar bater letra por letra.
// Faixa Unicode dos acentos "soltos" (combining diacritical marks) que
// sobram depois do normalize('NFD') — montada via fromCharCode de
// propósito, pra nunca ter um caractere combinante literal dentro do
// arquivo fonte (já causou bug de edição silenciosa nesse projeto antes).
const DIACRITICS_RE = new RegExp('[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']', 'g')
function normalizeSearch(s) {
  return (s || '').normalize('NFD').replace(DIACRITICS_RE, '').toLowerCase()
}

// `products.photo_url` é só o CAMINHO no bucket privado do Storage —
// mesmo padrão do `ProductThumb` em ProductionPage.jsx.
function ProductThumb({ photoUrl }) {
  const url = useSignedUrl('product-photos', photoUrl)
  if (!url) return <Package size={16} className="text-slate-300" />
  return <img src={url} alt="" className="w-full h-full object-cover" />
}

// ─── Modal: Nova/Editar chapa ──────────────────────────────────────
function ChapaFormModal({ open, onClose, onSave, products, editing }) {
  const [name,    setName]    = useState('')
  const [notes,   setNotes]   = useState('')
  const [items,   setItems]   = useState([])
  const [search,  setSearch]  = useState('')
  const [saving,  setSaving]  = useState(false)

  useEffect(() => {
    if (!open) return
    if (editing) {
      setName(editing.name)
      setNotes(editing.notes || '')
      setItems((editing.items || []).map(i => ({
        product_id:   i.product.id,
        product_name: i.product.name,
        sku:          i.product.sku,
        photo_url:    i.product.photo_url,
        quantity:     i.quantity,
      })))
    } else {
      setName(''); setNotes(''); setItems([])
    }
    setSearch('')
  }, [open, editing])

  // Busca "inteligente": ignora acento/caixa e exige que TODAS as
  // palavras digitadas apareçam em algum lugar do nome+SKU, em
  // qualquer ordem — "terrario grande" acha "Terrário ... Grande" e
  // "Grande ... Terrário" igual. Sem limite de resultados: com o
  // catálogo grande, cortar em 8 escondia produto de verdade; agora a
  // lista rola dentro do dropdown (ver `max-h` no JSX).
  const filteredProducts = useMemo(() => {
    const words = normalizeSearch(search).split(/\s+/).filter(Boolean)
    if (!words.length) return []
    return products
      .filter(p => p.active !== false)
      .filter(p => !items.some(i => i.product_id === p.id))
      .filter(p => {
        const haystack = normalizeSearch(`${p.name} ${p.sku || ''}`)
        return words.every(w => haystack.includes(w))
      })
  }, [products, search, items])

  function addProduct(product) {
    setItems(prev => [...prev, {
      product_id:   product.id,
      product_name: product.name,
      sku:          product.sku,
      photo_url:    product.photo_url,
      quantity:     1,
    }])
    setSearch('')
  }

  function removeItem(productId) {
    setItems(prev => prev.filter(i => i.product_id !== productId))
  }

  function updateQty(productId, qty) {
    const q = Math.max(1, parseInt(qty) || 1)
    setItems(prev => prev.map(i => i.product_id === productId ? { ...i, quantity: q } : i))
  }

  async function handleSave() {
    if (!name.trim()) return
    if (items.length === 0) return
    setSaving(true)
    try {
      await onSave({
        name: name.trim(),
        notes: notes.trim(),
        items: items.map(i => ({ product_id: i.product_id, quantity: i.quantity })),
      })
      onClose()
    } catch { /* toast já cobre o erro */ }
    finally { setSaving(false) }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-xl flex flex-col max-h-[90vh] border border-slate-100">

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div>
            <h2 style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 700, fontSize: '18px' }} className="text-slate-800">
              {editing ? 'Editar chapa' : 'Nova chapa'}
            </h2>
            <p className="text-sm text-slate-400 mt-0.5">Uma chapa de corte pode render vários produtos de uma vez só — cadastre o que ela produz.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 transition-all">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">

          {/* Nome */}
          <div>
            <label className="form-label">Nome da chapa</label>
            <input className="input" placeholder="Ex: Chapa Toca Luxo, Chapa Combo Terrário..."
              value={name} onChange={e => setName(e.target.value)} autoFocus />
          </div>

          {/* Busca de produtos */}
          <div>
            <label className="form-label">Produtos que essa chapa rende</label>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="input pl-8" placeholder="Buscar por nome ou SKU..."
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            {filteredProducts.length > 0 && (
              <div className="border border-slate-200 rounded-xl mt-1 shadow-sm">
                <p className="text-[11px] text-slate-400 px-4 pt-2 pb-1">{filteredProducts.length} resultado{filteredProducts.length === 1 ? '' : 's'}</p>
                <div className="max-h-72 overflow-y-auto rounded-b-xl">
                {filteredProducts.map(p => (
                  <button key={p.id} type="button" onClick={() => addProduct(p)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors text-left border-b border-slate-100 last:border-0">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 overflow-hidden flex items-center justify-center shrink-0">
                      <ProductThumb photoUrl={p.photo_url} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-700 truncate">{p.name}</p>
                      {p.sku && <p className="text-xs text-slate-400 font-mono">{p.sku}</p>}
                    </div>
                    <Plus size={16} className="text-slate-400 shrink-0" />
                  </button>
                ))}
                </div>
              </div>
            )}
          </div>

          {/* Lista de itens adicionados */}
          {items.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="form-label mb-0">Itens da chapa ({items.length})</label>
                <span className="text-xs text-slate-400">{items.reduce((a, i) => a + i.quantity, 0)} peças no total</span>
              </div>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                {items.map((item, idx) => (
                  <div key={item.product_id}
                    className={`flex items-center gap-3 px-4 py-3 ${idx < items.length - 1 ? 'border-b border-slate-100' : ''}`}>
                    <div className="w-8 h-8 rounded-lg bg-slate-50 overflow-hidden flex items-center justify-center shrink-0">
                      <ProductThumb photoUrl={item.photo_url} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-700 truncate">{item.product_name}</p>
                      {item.sku && <p className="text-xs text-slate-400 font-mono">{item.sku}</p>}
                    </div>
                    {/* Quantidade */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button type="button" onClick={() => updateQty(item.product_id, item.quantity - 1)}
                        className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 font-bold transition-colors">
                        −
                      </button>
                      <input type="number" min="1"
                        className="w-12 text-center text-sm font-bold border border-slate-200 rounded-lg py-1"
                        value={item.quantity} onChange={e => updateQty(item.product_id, e.target.value)} />
                      <button type="button" onClick={() => updateQty(item.product_id, item.quantity + 1)}
                        className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 font-bold transition-colors">
                        +
                      </button>
                    </div>
                    <button type="button" onClick={() => removeItem(item.product_id)}
                      className="p-1.5 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Observações */}
          <div>
            <label className="form-label">Observações (opcional)</label>
            <textarea className="textarea" rows={2}
              placeholder="Ex: rendimento pode variar conforme a espessura da chapa..."
              value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 flex items-center justify-between gap-3">
          <p className="text-xs text-slate-400">
            {items.length === 0 ? 'Adicione pelo menos 1 produto' : `${items.length} produto(s) · ${items.reduce((a, i) => a + i.quantity, 0)} peças`}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn-secondary">Cancelar</button>
            <button onClick={handleSave} disabled={saving || !name.trim() || items.length === 0}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm bg-rose-500 hover:bg-rose-600 text-white transition-all active:scale-[0.98] disabled:opacity-50"
              style={{ fontFamily: 'Nunito, sans-serif' }}>
              {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : (editing ? 'Salvar alterações' : 'Criar chapa')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Modal: Lançar produção (chapa cortada de verdade) ─────────────
function ProductionLogModal({ open, onClose, chapa, onLog, fetchColorOptions }) {
  const [multiplier, setMultiplier] = useState(1)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  // { [principal_id]: [{id, sku, name, photo_url, cor}] }
  const [colorOptions, setColorOptions] = useState({})
  const [loadingColors, setLoadingColors] = useState(false)
  // { [principal_id]: cor_id_escolhida }
  const [colorSelections, setColorSelections] = useState({})

  const items = chapa?.items || []
  // Itens da chapa que apontam pra um produto principal (fase64) — a
  // chapa foi cadastrada uma vez só pra família inteira; a cor de
  // verdade é escolhida aqui, na hora de lançar a produção.
  const principalItems = items.filter(i => i.product?.is_sellable === false)

  useEffect(() => {
    if (!open) return
    setMultiplier(1); setNotes(''); setColorSelections({})
    if (principalItems.length === 0) { setColorOptions({}); return }
    setLoadingColors(true)
    Promise.all(principalItems.map(i => fetchColorOptions(i.product.id).then(opts => [i.product.id, opts])))
      .then(entries => setColorOptions(Object.fromEntries(entries)))
      .catch(() => {})
      .finally(() => setLoadingColors(false))
  }, [open, chapa?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !chapa) return null

  const missingColor = principalItems.some(i => !colorSelections[i.product.id])

  async function handleConfirm() {
    setSaving(true)
    try {
      const result = await onLog(chapa.id, multiplier, notes.trim(), colorSelections)
      const summary = (result || []).map(r => `${r.product_name}: +${r.delta} (agora ${r.new_stock_qty})`).join(' · ')
      if (summary) toast.success(summary, { duration: 6000 })
      onClose()
    } catch { /* toast de erro já cobre */ }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl p-6 border border-slate-100 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h2 style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 700, fontSize: '18px' }} className="text-slate-800">Lançar produção</h2>
          <button onClick={onClose} className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <p className="text-sm text-slate-400 mb-4">{chapa.name}</p>

        <label className="form-label">Quantas vezes essa chapa foi cortada hoje?</label>
        <div className="flex items-center gap-2 mb-4">
          <button type="button" onClick={() => setMultiplier(m => Math.max(1, m - 1))} className="w-9 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold text-slate-600">−</button>
          <input type="number" min="1" className="input w-20 text-center" value={multiplier} onChange={e => setMultiplier(Math.max(1, parseInt(e.target.value) || 1))} />
          <button type="button" onClick={() => setMultiplier(m => m + 1)} className="w-9 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold text-slate-600">+</button>
        </div>

        {principalItems.length > 0 && (
          <div className="mb-4">
            <label className="form-label">Essa chapa é de qual cor?</label>
            {loadingColors ? (
              <p className="text-xs text-slate-400 py-2">Carregando cores...</p>
            ) : principalItems.map(i => (
              <div key={i.product.id} className="mb-2">
                {principalItems.length > 1 && <p className="text-xs text-slate-500 mb-1">{i.product.name}</p>}
                <div className="flex flex-wrap gap-1.5">
                  {(colorOptions[i.product.id] || []).map(c => (
                    <button key={c.id} type="button"
                      onClick={() => setColorSelections(prev => ({ ...prev, [i.product.id]: c.id }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        colorSelections[i.product.id] === c.id
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}>
                      {c.cor}
                    </button>
                  ))}
                  {!loadingColors && (colorOptions[i.product.id] || []).length === 0 && (
                    <p className="text-xs text-amber-600">Nenhuma cor cadastrada pra essa família ainda.</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <label className="form-label">Isso vai somar ao estoque</label>
        <div className="border border-slate-200 rounded-xl overflow-hidden mb-4">
          {items.map((i, idx) => {
            const isPrincipal = i.product?.is_sellable === false
            const chosen = isPrincipal ? (colorOptions[i.product.id] || []).find(c => c.id === colorSelections[i.product.id]) : null
            return (
              <div key={i.id} className={`flex items-center gap-2.5 px-3 py-2 ${idx < items.length - 1 ? 'border-b border-slate-100' : ''}`}>
                <div className="w-7 h-7 rounded-md bg-slate-50 overflow-hidden flex items-center justify-center shrink-0">
                  <ProductThumb photoUrl={(isPrincipal ? chosen?.photo_url : i.product?.photo_url) || i.product?.photo_url} />
                </div>
                <p className="text-sm text-slate-700 truncate flex-1">
                  {i.product?.name}{isPrincipal && <span className="text-slate-400"> — {chosen?.cor || 'escolha a cor acima'}</span>}
                </p>
                <span className="text-sm font-bold text-emerald-600 shrink-0">+{i.quantity * multiplier}</span>
              </div>
            )
          })}
        </div>

        <label className="form-label">Observação (opcional)</label>
        <textarea className="textarea mb-4" rows={2} placeholder="Ex: turno da tarde..." value={notes} onChange={e => setNotes(e.target.value)} />

        <div className="flex items-center gap-2">
          <button onClick={handleConfirm} disabled={saving || missingColor}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm bg-emerald-500 hover:bg-emerald-600 text-white transition-all active:scale-[0.98] disabled:opacity-50"
            style={{ fontFamily: 'Nunito, sans-serif' }}>
            {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Factory size={15} /> Confirmar produção</>}
          </button>
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
        </div>
      </div>
    </div>
  )
}

// ─── Histórico de produção de uma chapa ─────────────────────────────
function ProductionHistory({ chapaId, fetchProductionHistory, refreshToken }) {
  const [history, setHistory] = useState(null)

  useEffect(() => {
    fetchProductionHistory(chapaId).then(setHistory).catch(() => setHistory([]))
  }, [chapaId, refreshToken]) // eslint-disable-line

  if (history === null) return <p className="text-xs text-slate-400 py-2">Carregando histórico...</p>
  if (history.length === 0) return <p className="text-xs text-slate-400 py-2">Nenhuma produção lançada ainda.</p>

  return (
    <div className="flex flex-col gap-1 mt-2">
      {history.map(h => (
        <div key={h.id} className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 rounded-lg px-2.5 py-1.5">
          <Factory size={11} className="text-slate-400 shrink-0" />
          <span className="font-semibold text-slate-600">x{h.multiplier}</span>
          {h.notes && <span className="italic truncate">— {h.notes}</span>}
          <span className="ml-auto text-slate-400 shrink-0">{fmtDateTime(h.created_at)}{h.created_by_user?.name ? ` · ${h.created_by_user.name}` : ''}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Card de chapa ─────────────────────────────────────────────────
function ChapaCard({ chapa, onEdit, onDelete, onLogProduction, fetchProductionHistory, fetchColorOptions }) {
  const [open, setOpen] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const [historyRefresh, setHistoryRefresh] = useState(0)
  const items = chapa.items || []
  const totalPecas = items.reduce((a, i) => a + i.quantity, 0)

  async function handleLog(chapaId, multiplier, notes, colorSelections) {
    const result = await onLogProduction(chapaId, multiplier, notes, colorSelections)
    setHistoryRefresh(r => r + 1)
    return result
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-slate-300 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <button onClick={() => setOpen(o => !o)} className="flex items-start gap-2 min-w-0 flex-1 text-left group">
          <ChevronDown size={16} className={`text-slate-400 mt-1 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
          <div className="min-w-0">
            {/* Observação vive AO LADO do nome, sempre visível — é o que
                explica "o que é exatamente essa chapa" sem precisar abrir. */}
            <div className="flex items-baseline gap-2 flex-wrap">
              <h3 className="text-base font-bold text-slate-800 group-hover:text-amber-600 transition-colors">{chapa.name}</h3>
              {chapa.notes && <span className="text-xs text-slate-400 italic truncate">{chapa.notes}</span>}
            </div>
            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
              <Hash size={11} /> {items.length} produto{items.length === 1 ? '' : 's'} · {totalPecas} peça{totalPecas === 1 ? '' : 's'} por chapa
            </p>
          </div>
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => onEdit(chapa)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <Pencil size={15} />
          </button>
          <button onClick={() => onDelete(chapa)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors">
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* Produtos só aparecem abertos — escondidos até clicar. */}
      {open && (
        <div className="flex flex-col gap-1.5 mt-3 pt-3 border-t border-slate-100">
          {items.map(i => (
            <div key={i.id} className="flex items-center gap-2.5 bg-slate-50 rounded-lg px-2.5 py-1.5">
              <div className="w-7 h-7 rounded-md bg-white border border-slate-100 overflow-hidden flex items-center justify-center shrink-0">
                <ProductThumb photoUrl={i.product?.photo_url} />
              </div>
              <p className="text-sm text-slate-700 truncate flex-1">{i.product?.name || '—'}</p>
              <span className="text-xs font-bold text-slate-500 bg-white border border-slate-200 rounded-full px-2 py-0.5 shrink-0">
                {i.quantity}x
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-100">
        <button onClick={() => setLogOpen(true)}
          className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:text-emerald-700">
          <Factory size={13} /> Lançar produção <ArrowRight size={11} />
        </button>
        <button onClick={() => setShowHistory(h => !h)}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-600">
          <History size={13} /> Histórico
        </button>
      </div>
      {showHistory && (
        <ProductionHistory chapaId={chapa.id} fetchProductionHistory={fetchProductionHistory} refreshToken={historyRefresh} />
      )}

      <ProductionLogModal open={logOpen} onClose={() => setLogOpen(false)} chapa={chapa} onLog={handleLog} fetchColorOptions={fetchColorOptions} />
    </div>
  )
}

// ─── Página principal ───────────────────────────────────────────────
export function ChapasPage() {
  const { chapas, loading, create, update, remove, logProduction, fetchProductionHistory, fetchColorOptions } = useChapas()
  const { products } = useProducts()
  const [search,    setSearch]    = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing,   setEditing]   = useState(null)
  const [deleting,  setDeleting]  = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const filtered = useMemo(() => {
    if (!search.trim()) return chapas
    const q = search.toLowerCase()
    return chapas.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.items || []).some(i => i.product?.name?.toLowerCase().includes(q))
    )
  }, [chapas, search])

  function openNew() { setEditing(null); setModalOpen(true) }
  function openEdit(chapa) { setEditing(chapa); setModalOpen(true) }

  async function handleSave(payload) {
    if (editing) await update(editing.id, payload)
    else await create(payload)
  }

  async function confirmDelete() {
    if (!deleting) return
    setDeleteBusy(true)
    try { await remove(deleting.id, deleting.name); setDeleting(null) }
    catch {} finally { setDeleteBusy(false) }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl flex items-center justify-center shrink-0 shadow-sm shadow-amber-200">
            <Layers size={22} strokeWidth={1.5} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Chapas</h1>
            <p className="text-sm text-slate-500">Cadastro do que cada chapa de corte rende — 1 produto só ou uma combinação de vários</p>
          </div>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-xl transition-colors shadow-sm">
          <Plus size={15} /> Nova chapa
        </button>
      </div>

      {/* Busca */}
      {chapas.length > 0 && (
        <div className="relative mb-5 max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-8" placeholder="Buscar chapa ou produto..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : chapas.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="Nenhuma chapa cadastrada ainda"
          description="Cadastre a primeira chapa — dê um nome e diga quais produtos (e quantas peças de cada) ela rende quando é cortada."
          action={
            <button onClick={openNew}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-xl transition-colors shadow-sm">
              <Plus size={15} /> Nova chapa
            </button>
          }
        />
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
          <p className="text-slate-400">Nenhuma chapa bate com a busca.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(chapa => (
            <ChapaCard key={chapa.id} chapa={chapa} onEdit={openEdit} onDelete={setDeleting}
              onLogProduction={logProduction} fetchProductionHistory={fetchProductionHistory} fetchColorOptions={fetchColorOptions} />
          ))}
        </div>
      )}

      <ChapaFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        products={products}
        editing={editing}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title="Remover chapa"
        description={deleting ? `Tem certeza que quer remover "${deleting.name}"? Isso não apaga os produtos, só a receita da chapa.` : ''}
        confirmLabel="Remover"
        loading={deleteBusy}
      />
    </div>
  )
}
