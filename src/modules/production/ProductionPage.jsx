import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Factory, Plus, Upload, ShoppingBag, Search,
  ChevronDown, ChevronUp, Package, Truck, CheckCircle2,
  Clock, Play, Box, Send, Trash2, AlertTriangle,
  RefreshCw, ClipboardList, X, Check, FileText,
} from 'lucide-react'
import { useProduction }    from './hooks/useProduction'
import { fetchShortageReports, markShortageResolved } from './hooks/useShortageReports'
import { useProducts }      from '../products/hooks/useProducts'
import { ConfirmDialog }    from '../../components/ui/ConfirmDialog'
import { EmptyState }       from '../../components/ui/EmptyState'
import { useAuth }          from '../../contexts/AuthContext'

// ─── Helpers ─────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function fmtDateTime(d) {
  if (!d) return null
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// ─── Config de status ─────────────────────────────────────────────
const STATUS_CONFIG = {
  pendente:    { label: 'Pendente',          color: 'bg-slate-100 text-slate-600',    dot: 'bg-slate-400',    icon: Clock,        next: 'Iniciar produção' },
  em_producao: { label: 'Em Produção',       color: 'bg-amber-50 text-amber-700',     dot: 'bg-amber-400',    icon: Factory,      next: 'Mover p/ Embalagem' },
  embalagem:   { label: 'Embalagem',         color: 'bg-sky-50 text-sky-700',         dot: 'bg-sky-400',      icon: Box,          next: 'Pronto p/ Expedição' },
  pronto:      { label: 'Pronto p/ Envio',   color: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-400',  icon: CheckCircle2, next: 'Marcar como Enviado' },
  enviado:     { label: 'Enviado',           color: 'bg-purple-50 text-purple-700',   dot: 'bg-purple-400',   icon: Send,         next: null },
}

const SOURCE_CONFIG = {
  ml:      { label: 'Mercado Livre', color: 'bg-yellow-400 text-blue-800',  emoji: '🛒' },
  shopee:  { label: 'Shopee',        color: 'bg-orange-500 text-white',      emoji: '🛍️' },
  manual:  { label: 'Manual',        color: 'bg-slate-200 text-slate-700',   emoji: '✍️' },
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pendente
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

// ─── Modal: Novo Lote ─────────────────────────────────────────────
function NewOrderModal({ open, onClose, onSave, products }) {
  const [source,   setSource]   = useState('shopee')
  const [date,     setDate]     = useState(new Date().toISOString().split('T')[0])
  const [notes,    setNotes]    = useState('')
  const [items,    setItems]    = useState([])
  const [search,   setSearch]   = useState('')
  const [saving,   setSaving]   = useState(false)
  const [csvFile,  setCsvFile]  = useState(null)
  const [mlParsed, setMlParsed] = useState(null)
  const [mlError,  setMlError]  = useState('')
  const mlInputRef = useRef(null)

  // Reset ao abrir
  useEffect(() => {
    if (open) { setItems([]); setSearch(''); setNotes(''); setCsvFile(null); setMlParsed(null); setMlError(''); setSource('shopee') }
  }, [open])

  // Parser do XLSX do ML — lê com SheetJS via FileReader
  async function handleMLFile(file) {
    if (!file) return
    setMlError('')
    try {
      // Usa SheetJS (xlsx) se disponível, senão usa abordagem manual
      const buffer = await file.arrayBuffer()
      // Importa SheetJS dinamicamente
      const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs').catch(() => null)
      if (!XLSX) {
        setMlError('Erro ao carregar leitor de Excel. Tente adicionar os itens manualmente.')
        return
      }
      const wb  = XLSX.read(buffer, { type: 'array' })
      const ws  = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

      // Encontra a linha de cabeçalho (tem "N.º de venda")
      let headerRow = -1
      for (let i = 0; i < raw.length; i++) {
        if (raw[i].some(cell => String(cell).includes('N.º de venda'))) {
          headerRow = i
          break
        }
      }
      if (headerRow === -1) { setMlError('Formato não reconhecido. Use o relatório de Vendas do ML.'); return }

      const headers = raw[headerRow].map(h => String(h).trim())
      const iOf = name => headers.findIndex(h => h.includes(name))

      const iTitle = iOf('Título do anúncio')
      const iSKU   = iOf('SKU')
      const iQty   = iOf('Unidades')
      const iVar   = iOf('Variação')
      const iNum   = iOf('N.º de venda')
      const iPreco = iOf('Preço unitário')
      const iEstado = iOf('Estado')
      const iComp  = iOf('Comprador')

      const parsed = []
      for (let i = headerRow + 1; i < raw.length; i++) {
        const row   = raw[i]
        const title = String(row[iTitle] || '').trim()
        const qty   = parseInt(row[iQty]) || 0
        const sku   = String(row[iSKU]   || '').trim()
        const varProd = String(row[iVar] || '').trim()
        const estado  = String(row[iEstado] || '').trim()
        const numVenda = String(row[iNum] || '').trim()
        const preco   = parseFloat(row[iPreco]) || 0
        const comprador = String(row[iComp] || '').trim()

        // Pula linhas sem título ou quantidade
        if (!title || !qty || qty <= 0) continue
        // Pula pacotes consolidados (sem título)
        if (title.startsWith('Pacote')) continue

        parsed.push({ title, sku, qty, varProd, estado, numVenda, preco, comprador })
      }

      if (parsed.length === 0) { setMlError('Nenhum pedido encontrado no arquivo.'); return }

      setMlParsed(parsed)
      // Converte para o formato de itens da esteira
      // Agrupa produtos iguais
      const grouped = {}
      parsed.forEach(p => {
        const key = p.sku || p.title
        if (grouped[key]) {
          grouped[key].qty_ordered += p.qty
          grouped[key].ml_orders.push(p.numVenda)
        } else {
          grouped[key] = {
            product_id:   null, // será vinculado depois via SKU
            product_name: p.title + (p.varProd ? ` — ${p.varProd.replace(/^[^:]+:\s*/, '')}` : ''),
            sku:          p.sku || null,
            qty_ordered:  p.qty,
            has_stock:    false,
            ml_orders:    [p.numVenda],
          }
        }
      })
      setItems(Object.values(grouped))
    } catch (err) {
      console.error(err)
      setMlError('Erro ao ler o arquivo. Verifique se é um .xlsx válido do ML.')
    }
  }

  const filteredProducts = useMemo(() => {
    if (!search.trim()) return []
    const q = search.toLowerCase()
    return products
      .filter(p => p.name.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q))
      .slice(0, 8)
  }, [products, search])

  function addProduct(product) {
    const exists = items.find(i => i.product_id === product.id)
    if (exists) {
      setItems(prev => prev.map(i => i.product_id === product.id
        ? { ...i, qty_ordered: i.qty_ordered + 1 }
        : i
      ))
    } else {
      setItems(prev => [...prev, {
        product_id:   product.id,
        product_name: product.name,
        sku:          product.sku,
        qty_ordered:  1,
        has_stock:    false,
      }])
    }
    setSearch('')
  }

  function removeItem(productId) {
    setItems(prev => prev.filter(i => i.product_id !== productId))
  }

  function updateQty(productId, qty) {
    const q = Math.max(1, parseInt(qty) || 1)
    setItems(prev => prev.map(i => i.product_id === productId ? { ...i, qty_ordered: q } : i))
  }

  async function handleSave() {
    if (items.length === 0) { return }
    setSaving(true)
    try {
      await onSave({ source, date, notes, items })
      onClose()
    } catch {}
    finally { setSaving(false) }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-xl flex flex-col max-h-[90vh] border border-slate-100">

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div>
            <h2 style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 700, fontSize: '18px' }}
                className="text-slate-800">Novo Lote de Produção</h2>
            <p className="text-sm text-slate-400 mt-0.5">Lance os pedidos a produzir ou embalar</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 transition-all">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">

          {/* Plataforma + Data */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Plataforma</label>
              <div className="flex gap-2">
                {['shopee','ml','manual'].map(s => (
                  <button key={s} type="button"
                    onClick={() => setSource(s)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold border-2 transition-all ${
                      source === s
                        ? 'border-rose-400 bg-rose-50 text-rose-600'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                    }`}>
                    <span>{SOURCE_CONFIG[s].emoji}</span>
                    {SOURCE_CONFIG[s].label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="form-label">Data do lote</label>
              <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>

          {/* Import XLSX ML */}
          {source === 'ml' && (
            <div>
              <label className="form-label">Importar planilha do Mercado Livre (.xlsx)</label>
              {!mlParsed ? (
                <div
                  className="border-2 border-dashed border-yellow-300 rounded-xl p-6 text-center bg-yellow-50 cursor-pointer hover:border-yellow-400 hover:bg-yellow-100 transition-all"
                  onClick={() => mlInputRef.current?.click()}
                  onDrop={e => { e.preventDefault(); handleMLFile(e.dataTransfer.files[0]) }}
                  onDragOver={e => e.preventDefault()}
                >
                  <div className="w-12 h-12 bg-yellow-400 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <Upload size={22} className="text-blue-900" />
                  </div>
                  <p className="text-sm font-bold text-blue-900 mb-1">Clique ou arraste o arquivo .xlsx do ML</p>
                  <p className="text-xs text-slate-500">
                    Exporte em: Painel ML → Relatórios → Vendas → Baixar relatório
                  </p>
                  <input ref={mlInputRef} type="file" accept=".xlsx,.xls" className="hidden"
                    onChange={e => handleMLFile(e.target.files[0])} />
                </div>
              ) : (
                <div className="border border-emerald-200 rounded-xl bg-emerald-50 px-4 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-400 flex items-center justify-center shrink-0">
                    <Check size={15} className="text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-emerald-800">{mlParsed.length} pedido(s) importados do ML</p>
                    <p className="text-xs text-emerald-600">Revise os itens abaixo e ajuste as quantidades se necessário</p>
                  </div>
                  <button type="button" onClick={() => { setMlParsed(null); setItems([]) }}
                    className="text-xs text-slate-400 hover:text-rose-500 font-semibold transition-colors flex items-center gap-1">
                    <X size={12} /> Limpar
                  </button>
                </div>
              )}
              {mlError && <p className="text-xs text-rose-500 mt-1.5">{mlError}</p>}
            </div>
          )}

          {/* Busca de produtos */}
          <div>
            <label className="form-label">
              {source === 'ml' ? 'Adicionar itens manualmente' : 'Buscar produto'}
            </label>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="input pl-8"
                placeholder="Buscar por nome ou SKU..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            {filteredProducts.length > 0 && (
              <div className="border border-slate-200 rounded-xl mt-1 overflow-hidden shadow-sm">
                {filteredProducts.map(p => (
                  <button key={p.id} type="button" onClick={() => addProduct(p)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors text-left border-b border-slate-100 last:border-0">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 text-sm">
                      📦
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-700 truncate">{p.name}</p>
                      {p.sku && <p className="text-xs text-slate-400 font-mono">{p.sku}</p>}
                    </div>
                    <Plus size={16} className="text-slate-400 shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Lista de itens adicionados */}
          {items.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="form-label mb-0">Itens do lote ({items.length})</label>
                <span className="text-xs text-slate-400">{items.reduce((a, i) => a + i.qty_ordered, 0)} unidades total</span>
              </div>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                {items.map((item, idx) => (
                  <div key={item.product_id}
                    className={`flex items-center gap-3 px-4 py-3 ${idx < items.length - 1 ? 'border-b border-slate-100' : ''}`}>
                    <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0 text-sm">
                      📦
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-700 truncate">{item.product_name}</p>
                      {item.sku && <p className="text-xs text-slate-400 font-mono">{item.sku}</p>}
                    </div>
                    {/* Quantidade */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button type="button"
                        onClick={() => updateQty(item.product_id, item.qty_ordered - 1)}
                        className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 font-bold transition-colors">
                        −
                      </button>
                      <input
                        type="number" min="1"
                        className="w-12 text-center text-sm font-bold border border-slate-200 rounded-lg py-1"
                        value={item.qty_ordered}
                        onChange={e => updateQty(item.product_id, e.target.value)}
                      />
                      <button type="button"
                        onClick={() => updateQty(item.product_id, item.qty_ordered + 1)}
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
              placeholder="Ex: Urgente, pedido especial, cliente aguardando..."
              value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 flex items-center justify-between gap-3">
          <p className="text-xs text-slate-400">
            {items.length === 0
              ? 'Adicione pelo menos 1 produto'
              : `${items.length} produto(s) · ${items.reduce((a, i) => a + i.qty_ordered, 0)} unidades`
            }
          </p>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary" disabled={saving}>Cancelar</button>
            <button onClick={handleSave} className="btn-primary"
              disabled={saving || items.length === 0}>
              {saving
                ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <><ClipboardList size={16} /> Criar lote</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Card de item da esteira ──────────────────────────────────────
function ItemRow({ item, onAdvance, onConfirmStock, canEdit }) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [stockOpen,   setStockOpen]   = useState(false)
  const cfg  = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.pendente
  const Icon = cfg.icon

  return (
    <div className={`flex items-center gap-4 px-5 py-4 rounded-xl border transition-all ${
      item.status === 'enviado'
        ? 'bg-purple-50/50 border-purple-100'
        : item.status === 'pronto'
        ? 'bg-emerald-50/50 border-emerald-100'
        : item.status === 'em_producao'
        ? 'bg-amber-50/50 border-amber-100'
        : item.status === 'embalagem'
        ? 'bg-sky-50/50 border-sky-100'
        : 'bg-white border-slate-100'
    }`}>

      {/* Ícone de status */}
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
        item.status === 'enviado'     ? 'bg-purple-100'
        : item.status === 'pronto'   ? 'bg-emerald-100'
        : item.status === 'embalagem'? 'bg-sky-100'
        : item.status === 'em_producao'? 'bg-amber-100'
        : 'bg-slate-100'
      }`}>
        <Icon size={16} className={
          item.status === 'enviado'      ? 'text-purple-500'
          : item.status === 'pronto'    ? 'text-emerald-500'
          : item.status === 'embalagem' ? 'text-sky-500'
          : item.status === 'em_producao' ? 'text-amber-500'
          : 'text-slate-400'
        } />
      </div>

      {/* Info do produto */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-slate-800 truncate">{item.product_name}</p>
          {item.sku && (
            <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
              {item.sku}
            </span>
          )}
          {item.has_stock && !item.stock_confirmed && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex items-center gap-1">
              <Package size={9} /> Tem estoque
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <span className="text-xs font-bold text-slate-600">{item.qty_ordered} un.</span>
          <StatusBadge status={item.status} />
          {item.notes && (
            <span className="text-xs text-slate-400 italic truncate max-w-[180px]">{item.notes}</span>
          )}
        </div>
        {/* Timestamps */}
        <div className="flex gap-3 mt-1.5 flex-wrap">
          {item.started_at  && <span className="text-[10px] text-amber-500 font-semibold">▶ {fmtDateTime(item.started_at)}</span>}
          {item.packed_at   && <span className="text-[10px] text-sky-500 font-semibold">📦 {fmtDateTime(item.packed_at)}</span>}
          {item.ready_at    && <span className="text-[10px] text-emerald-500 font-semibold">✓ {fmtDateTime(item.ready_at)}</span>}
          {item.shipped_at  && <span className="text-[10px] text-purple-500 font-semibold">✈ {fmtDateTime(item.shipped_at)}</span>}
        </div>
      </div>

      {/* Ações */}
      {canEdit && item.status !== 'enviado' && (
        <div className="flex items-center gap-2 shrink-0">
          {/* Tem estoque → confirmar antes de mover */}
          {item.has_stock && !item.stock_confirmed && item.status === 'pendente' && (
            <button
              onClick={() => setStockOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors">
              <Check size={13} /> Confirmar estoque
            </button>
          )}

          {/* Avançar status */}
          {cfg.next && !(item.has_stock && !item.stock_confirmed && item.status === 'pendente') && (
            <button
              onClick={() => setConfirmOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 text-white hover:bg-slate-700 transition-colors">
              <Play size={11} /> {cfg.next}
            </button>
          )}
        </div>
      )}

      {/* Dialogs */}
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => { onAdvance(item); setConfirmOpen(false) }}
        title={`Mover para "${STATUS_CONFIG[{
          pendente: 'em_producao', em_producao: 'embalagem',
          embalagem: 'pronto', pronto: 'enviado'
        }[item.status]]?.label}"`}
        description={`${item.product_name} (${item.qty_ordered} un.) será movido para o próximo estágio.`}
        confirmLabel="Confirmar"
      />

      <ConfirmDialog
        open={stockOpen}
        onClose={() => setStockOpen(false)}
        onConfirm={() => { onConfirmStock(item.id); setStockOpen(false) }}
        title="Confirmar baixa de estoque?"
        description={`${item.product_name} (${item.qty_ordered} un.) será baixado do estoque e irá direto para Embalagem.`}
        confirmLabel="Confirmar e baixar estoque"
      />
    </div>
  )
}

// ─── Card de lote ─────────────────────────────────────────────────
function OrderCard({ order, onAdvance, onConfirmStock, onDelete, canEdit }) {
  const [expanded, setExpanded] = useState(true)
  const [delOpen,  setDelOpen]  = useState(false)
  const src = SOURCE_CONFIG[order.source] ?? SOURCE_CONFIG.manual

  const stats = useMemo(() => {
    const items = order.items ?? []
    return {
      total:   items.length,
      units:   items.reduce((a, i) => a + i.qty_ordered, 0),
      done:    items.filter(i => i.status === 'enviado').length,
      pronto:  items.filter(i => i.status === 'pronto').length,
      embala:  items.filter(i => i.status === 'embalagem').length,
      prod:    items.filter(i => i.status === 'em_producao').length,
      pend:    items.filter(i => i.status === 'pendente').length,
    }
  }, [order.items])

  const allDone = stats.done === stats.total && stats.total > 0
  const progress = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0

  return (
    <div className="card overflow-hidden">
      {/* Header do lote */}
      <div className="flex items-center gap-4 cursor-pointer" onClick={() => setExpanded(e => !e)}>
        {/* Badge plataforma */}
        <span className={`text-xs font-bold px-3 py-1.5 rounded-xl shrink-0 ${src.color}`}>
          {src.emoji} {src.label}
        </span>

        {/* Data */}
        <div className="shrink-0">
          <p className="text-sm font-bold text-slate-700">{fmtDate(order.date)}</p>
          <p className="text-xs text-slate-400">
            por {order.created_by_user?.name ?? 'Sistema'}
          </p>
        </div>

        {/* Resumo */}
        <div className="flex-1 flex items-center gap-3 flex-wrap">
          <span className="text-xs text-slate-500">{stats.total} produto(s) · {stats.units} un.</span>
          {/* Mini barra de progresso */}
          <div className="flex-1 max-w-[160px] h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-400 rounded-full transition-all"
              style={{ width: `${progress}%` }} />
          </div>
          <span className="text-xs font-bold text-slate-500">{progress}%</span>
          {/* Status pills */}
          {stats.pend   > 0 && <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{stats.pend} pendente</span>}
          {stats.prod   > 0 && <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">{stats.prod} em prod.</span>}
          {stats.embala > 0 && <span className="text-[10px] font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full">{stats.embala} embalagem</span>}
          {stats.pronto > 0 && <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">{stats.pronto} pronto</span>}
          {stats.done   > 0 && <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">{stats.done} enviado</span>}
          {allDone && <span className="text-[10px] font-bold text-emerald-700">✓ Concluído</span>}
        </div>

        {/* Ações lote */}
        <div className="flex items-center gap-1 shrink-0">
          {canEdit && (
            <button onClick={e => { e.stopPropagation(); setDelOpen(true) }}
              className="p-1.5 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors">
              <Trash2 size={14} />
            </button>
          )}
          {expanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </div>
      </div>

      {/* Notas do lote */}
      {order.notes && expanded && (
        <div className="mt-3 px-1">
          <p className="text-xs text-slate-400 italic">📝 {order.notes}</p>
        </div>
      )}

      {/* Itens */}
      {expanded && (
        <div className="mt-4 flex flex-col gap-2">
          {(order.items ?? []).map(item => (
            <ItemRow
              key={item.id}
              item={item}
              onAdvance={onAdvance}
              onConfirmStock={onConfirmStock}
              canEdit={canEdit}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={delOpen}
        onClose={() => setDelOpen(false)}
        onConfirm={() => { onDelete(order.id); setDelOpen(false) }}
        title="Excluir lote?"
        description="Todos os itens deste lote serão removidos permanentemente."
        confirmLabel="Excluir lote"
      />
    </div>
  )
}

// ─── Aba: Itens Faltando (reportado pela Expedição) ────────────────
function ShortageReportsPanel() {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [showResolved, setShowResolved] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try { setReports(await fetchShortageReports()) } finally { setLoading(false) }
  }

  async function handleResolve(id) {
    await markShortageResolved(id)
    setReports(prev => prev.map(r => r.id === id ? { ...r, status: 'atendido' } : r))
  }

  const pending  = reports.filter(r => r.status === 'pendente')
  const resolved = reports.filter(r => r.status === 'atendido')
  const list = showResolved ? reports : pending

  if (loading) {
    return (
      <div className="card flex justify-center py-16">
        <div className="w-8 h-8 rounded-full border-4 border-rose-100 border-t-rose-400 animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          <span className="font-bold text-amber-600">{pending.length}</span> pendente(s)
          {resolved.length > 0 && <span className="text-slate-400"> · {resolved.length} já atendido(s)</span>}
        </p>
        {resolved.length > 0 && (
          <button onClick={() => setShowResolved(v => !v)} className="text-xs font-semibold text-slate-500 hover:text-slate-700">
            {showResolved ? 'Mostrar só pendentes' : 'Mostrar também os atendidos'}
          </button>
        )}
      </div>

      {list.length === 0 ? (
        <div className="card">
          <EmptyState icon={CheckCircle2} title="Nada faltando! 🎉" description="Nenhum item foi reportado como faltante pela Expedição." />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {list.map(r => (
            <div key={r.id} className={`card flex items-center gap-4 py-4 ${r.status === 'atendido' ? 'opacity-50' : ''}`}>
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                <AlertTriangle size={18} className="text-amber-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-800">{r.titulo || r.item_key}</p>
                <div className="flex items-center gap-2 flex-wrap mt-0.5">
                  {r.variacao && <span className="text-[11px] font-bold text-violet-700 bg-violet-100 px-2 py-0.5 rounded-lg">{r.variacao}</span>}
                  {r.sku && <span className="text-[11px] font-mono text-slate-400">{r.sku}</span>}
                  <span className="text-[11px] text-slate-400">
                    {r.batch?.source === 'shopee' ? '🛍️ Shopee' : r.batch?.source === 'ml' ? '🛒 Mercado Livre' : r.batch?.source}
                  </span>
                  {r.target_date && (
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg ${
                      r.target_date === new Date().toISOString().slice(0, 10) ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-500'
                    }`}>
                      Precisa até {new Date(r.target_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Reportado por {r.reporter?.name || '—'} · {fmtDateTime(r.reported_at)}
                </p>
              </div>
              <span className="text-lg font-black text-amber-600 shrink-0">×{r.missing_qty}</span>
              {r.status === 'pendente' && (
                <button onClick={() => handleResolve(r.id)}
                  className="text-xs font-bold px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors shrink-0">
                  ✓ Atendido
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────
export function ProductionPage() {
  const { user }    = useAuth()
  const {
    orders, loading,
    fetchOrders, createOrder,
    advanceStatus, confirmStock, deleteOrder,
  } = useProduction()
  const { products } = useProducts()

  const [modalOpen,  setModalOpen]  = useState(false)
  const [filterSrc,  setFilterSrc]  = useState('')
  const [filterDate, setFilterDate] = useState('')
  const [tab,        setTab]        = useState('esteira') // 'esteira' | 'faltando'

  useEffect(() => { fetchOrders() }, [fetchOrders])

  // Apenas produção, admin e administrativo podem editar
  const canEdit = ['admin','administrativo','producao'].includes(user?.role)

  const filtered = useMemo(() => {
    return orders.filter(o => {
      if (filterSrc  && o.source !== filterSrc)  return false
      if (filterDate && o.date   !== filterDate)  return false
      return true
    })
  }, [orders, filterSrc, filterDate])

  // Estatísticas gerais
  const allItems = useMemo(() => orders.flatMap(o => o.items ?? []), [orders])
  const stats = {
    pendente:    allItems.filter(i => i.status === 'pendente').length,
    em_producao: allItems.filter(i => i.status === 'em_producao').length,
    embalagem:   allItems.filter(i => i.status === 'embalagem').length,
    pronto:      allItems.filter(i => i.status === 'pronto').length,
    enviado:     allItems.filter(i => i.status === 'enviado').length,
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in">

      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Esteira de Produção</h2>
          <p className="page-subtitle">Controle de pedidos por plataforma e status de produção</p>
        </div>
        {canEdit && (
          <button onClick={() => setModalOpen(true)} className="btn-primary">
            <Plus size={16} /> Novo lote
          </button>
        )}
      </div>

      {/* Abas */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-2xl w-fit">
        {[['esteira', '🏭 Esteira'], ['faltando', '⚠️ Itens Faltando']].map(([v, label]) => (
          <button key={v} onClick={() => setTab(v)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${tab === v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'faltando' ? (
        <ShortageReportsPanel />
      ) : (
        <>
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
          const Icon = cfg.icon
          return (
            <div key={key} className="card py-4 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                key === 'pendente'    ? 'bg-slate-100' :
                key === 'em_producao'? 'bg-amber-50'  :
                key === 'embalagem'  ? 'bg-sky-50'    :
                key === 'pronto'     ? 'bg-emerald-50':
                'bg-purple-50'
              }`}>
                <Icon size={16} className={
                  key === 'pendente'    ? 'text-slate-400'   :
                  key === 'em_producao'? 'text-amber-500'   :
                  key === 'embalagem'  ? 'text-sky-500'     :
                  key === 'pronto'     ? 'text-emerald-500' :
                  'text-purple-500'
                } />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-semibold">{cfg.label}</p>
                <p className="text-xl font-black text-slate-800" style={{ fontFamily: 'Nunito, sans-serif' }}>
                  {stats[key]}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <select className="select w-auto min-w-[160px]" value={filterSrc}
          onChange={e => setFilterSrc(e.target.value)}>
          <option value="">Todas as plataformas</option>
          <option value="shopee">🛍️ Shopee</option>
          <option value="ml">🛒 Mercado Livre</option>
          <option value="manual">✍️ Manual</option>
        </select>
        <input type="date" className="input w-auto" value={filterDate}
          onChange={e => setFilterDate(e.target.value)}
          placeholder="Filtrar por data" />
        {(filterSrc || filterDate) && (
          <button onClick={() => { setFilterSrc(''); setFilterDate('') }}
            className="text-xs text-rose-500 font-semibold hover:text-rose-600">
            Limpar filtros
          </button>
        )}
        <button onClick={fetchOrders} className="ml-auto flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 font-semibold transition-colors">
          <RefreshCw size={13} /> Atualizar
        </button>
      </div>

      {/* Lista de lotes */}
      {loading ? (
        <div className="card flex justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-4 border-rose-100 border-t-rose-400 animate-spin" />
            <p className="text-sm text-slate-400">Carregando esteira...</p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Factory}
            title={orders.length === 0 ? 'Nenhum lote lançado ainda' : 'Nenhum resultado'}
            description={orders.length === 0
              ? 'Crie o primeiro lote de produção importando os pedidos do dia.'
              : 'Ajuste os filtros para ver outros lotes.'}
            action={canEdit && orders.length === 0 && (
              <button onClick={() => setModalOpen(true)} className="btn-primary">
                <Plus size={16} /> Criar primeiro lote
              </button>
            )}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {filtered.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              onAdvance={advanceStatus}
              onConfirmStock={confirmStock}
              onDelete={deleteOrder}
              canEdit={canEdit}
            />
          ))}
        </div>
      )}
      </>
      )}

      {/* Modal novo lote */}
      <NewOrderModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={createOrder}
        products={products.filter(p => p.active)}
      />
    </div>
  )
}
