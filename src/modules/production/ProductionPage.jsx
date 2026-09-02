import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Factory, Plus, Upload, Search,
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Package, PackageCheck, CheckCircle2,
  Clock, Play, Box, Send, AlertTriangle, Calendar,
  RefreshCw, ClipboardList, X, Check,
} from 'lucide-react'
import { useProduction }    from './hooks/useProduction'
import { fetchShortageReports, markShortageResolved } from './hooks/useShortageReports'
import { useProducts }      from '../products/hooks/useProducts'
import { ConfirmDialog }    from '../../components/ui/ConfirmDialog'
import { EmptyState }       from '../../components/ui/EmptyState'
import { useAuth }          from '../../contexts/AuthContext'
import { useSignedUrl }     from '../../lib/signedUrlCache'

// ─── Helpers ─────────────────────────────────────────────────────
function todayISO() { return new Date().toISOString().split('T')[0] }
function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}
function fmtDate(d) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function fmtDayLong(d) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
}
function fmtDateTime(d) {
  if (!d) return null
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// ─── Config de status ─────────────────────────────────────────────
const NEXT_STATUS = { pendente: 'em_producao', em_producao: 'embalagem', embalagem: 'pronto', pronto: 'enviado' }
const STATUS_CONFIG = {
  pendente:        { label: 'Pendente',            color: 'bg-slate-100 text-slate-600',    dot: 'bg-slate-400',    icon: Clock,        next: 'Iniciar produção' },
  em_producao:     { label: 'Em Produção',         color: 'bg-amber-50 text-amber-700',     dot: 'bg-amber-400',    icon: Factory,      next: 'Mover p/ Embalagem' },
  embalagem:       { label: 'Embalagem',           color: 'bg-sky-50 text-sky-700',         dot: 'bg-sky-400',      icon: Box,          next: 'Pronto p/ Expedição' },
  pronto:          { label: 'Pronto p/ Envio',     color: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-400',  icon: CheckCircle2, next: 'Marcar como Enviado' },
  enviado:         { label: 'Enviado',             color: 'bg-purple-50 text-purple-700',   dot: 'bg-purple-400',   icon: Send,         next: null },
  coberto_estoque: { label: 'Já tem em estoque',   color: 'bg-teal-50 text-teal-700',       dot: 'bg-teal-400',     icon: PackageCheck, next: null },
}

const SOURCE_CONFIG = {
  ml:      { label: 'Mercado Livre', color: 'bg-yellow-400 text-blue-800', emoji: '🛒' },
  shopee:  { label: 'Shopee',        color: 'bg-orange-500 text-white',    emoji: '🛍️' },
  manual:  { label: 'Avulso',        color: 'bg-slate-200 text-slate-700', emoji: '✍️' },
}
const SOURCE_ORDER = ['ml', 'shopee', 'manual']

// `products.photo_url` é só o CAMINHO no bucket privado do Storage, não
// uma URL de verdade — precisa de URL assinada pra funcionar num <img>
// (mesmo padrão do `ThumbPhoto` em FeiraCombinadaModal.jsx).
function ProductThumb({ photoUrl }) {
  const url = useSignedUrl('product-photos', photoUrl)
  if (!url) return <Package size={18} className="text-slate-300" />
  return <img src={url} alt="" className="w-full h-full object-cover" />
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

// ─── Modal: Novo lote avulso ──────────────────────────────────────
function NewOrderModal({ open, onClose, onSave, products }) {
  const [source,   setSource]   = useState('manual')
  const [date,     setDate]     = useState(todayISO())
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
    if (open) { setItems([]); setSearch(''); setNotes(''); setCsvFile(null); setMlParsed(null); setMlError(''); setSource('manual'); setDate(todayISO()) }
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
                className="text-slate-800">Lançar produção avulsa</h2>
            <p className="text-sm text-slate-400 mt-0.5">Pra pedir algo que não veio de ML/Shopee automaticamente — ex: repor estoque de um produto parado. Entra na fila DEPOIS da prioridade de ML e Shopee.</p>
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
                {['manual','shopee','ml'].map(s => (
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
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
                ⚠ Pedidos do ML já entram sozinhos na Esteira quando sincronizam — só use isso pra reprocessar algo que não entrou automaticamente, pra não duplicar.
              </p>
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
              placeholder="Ex: baixo estoque, pedido especial, cliente aguardando..."
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
                : <><ClipboardList size={16} /> Lançar</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Card de item individual (visão expandida de um grupo) ────────
function ItemRow({ item, onAdvance, onConfirmStock, canEdit }) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [stockOpen,   setStockOpen]   = useState(false)
  const cfg  = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.pendente
  const Icon = cfg.icon

  return (
    <div className={`flex items-center gap-4 px-5 py-3.5 rounded-xl border transition-all ${
      item.status === 'enviado'
        ? 'bg-purple-50/50 border-purple-100'
        : item.status === 'coberto_estoque'
        ? 'bg-teal-50/40 border-teal-100'
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
        : item.status === 'coberto_estoque' ? 'bg-teal-100'
        : item.status === 'pronto'   ? 'bg-emerald-100'
        : item.status === 'embalagem'? 'bg-sky-100'
        : item.status === 'em_producao'? 'bg-amber-100'
        : 'bg-slate-100'
      }`}>
        <Icon size={16} className={
          item.status === 'enviado'      ? 'text-purple-500'
          : item.status === 'coberto_estoque' ? 'text-teal-500'
          : item.status === 'pronto'    ? 'text-emerald-500'
          : item.status === 'embalagem' ? 'text-sky-500'
          : item.status === 'em_producao' ? 'text-amber-500'
          : 'text-slate-400'
        } />
      </div>

      {/* Info do produto */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          <span className={`text-xs font-bold ${item.status === 'coberto_estoque' ? 'text-slate-400 line-through' : 'text-slate-600'}`}>{item.qty_ordered} un.</span>
          <StatusBadge status={item.status} />
          {item.has_stock && !item.stock_confirmed && item.status !== 'coberto_estoque' && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex items-center gap-1">
              <Package size={9} /> Tem estoque
            </span>
          )}
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
      {canEdit && item.status !== 'enviado' && item.status !== 'coberto_estoque' && (
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
        title={`Mover para "${STATUS_CONFIG[NEXT_STATUS[item.status]]?.label}"`}
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

// ─── Card de produto agrupado — a unidade principal da Esteira agora ─
// Junta todas as linhas do MESMO produto, na MESMA plataforma, no dia
// visto (podem vir de pedidos/lotes diferentes) — o chão de fábrica
// pensa "preciso fazer 8 rodinhas pretas hoje", não "lote tal tem 3,
// lote tal tem 5". Cada linha continua existindo separada no banco;
// "avançar etapa" empurra todas de uma vez, cada uma pro PRÓPRIO
// próximo status (uma linha já em produção não pula pra embalagem
// junto com uma que ainda nem começou).
function ProductGroupCard({ group, onAdvanceBulk, onConfirmStock, canEdit }) {
  const [expanded, setExpanded] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const active  = group.items.filter(i => i.status !== 'coberto_estoque')
  const covered = group.items.filter(i => i.status === 'coberto_estoque')
  const neededQty  = active.reduce((s, i) => s + i.qty_ordered, 0)
  const coveredQty = covered.reduce((s, i) => s + i.qty_ordered, 0)

  const counts = {}
  active.forEach(i => { counts[i.status] = (counts[i.status] || 0) + 1 })

  const advanceable = group.items.filter(i => NEXT_STATUS[i.status])
  const transitions = [...new Set(advanceable.map(i => `${STATUS_CONFIG[i.status].label} → ${STATUS_CONFIG[NEXT_STATUS[i.status]].label}`))]

  const doneRatio = neededQty === 0 ? 1 : (counts.pronto ?? 0) + (counts.enviado ?? 0)

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-3.5">
        <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 overflow-hidden">
          <ProductThumb photoUrl={group.photo_url} />
        </div>

        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpanded(e => !e)}>
          <p className="text-sm font-bold text-slate-800 truncate">{group.product_name}</p>
          <div className="flex items-center gap-2 flex-wrap mt-1">
            {group.sku && <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{group.sku}</span>}
            {Object.entries(counts).map(([st, n]) => (
              <span key={st} className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_CONFIG[st].color}`}>{n}× {STATUS_CONFIG[st].label}</span>
            ))}
            {coveredQty > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-50 text-teal-600 flex items-center gap-1">
                <PackageCheck size={10} /> {coveredQty}× já tem em estoque (feira)
              </span>
            )}
          </div>
        </div>

        <div className="text-right shrink-0">
          <p className="text-2xl font-black text-slate-800 leading-none" style={{ fontFamily: 'Nunito, sans-serif' }}>{neededQty}</p>
          <p className="text-[10px] text-slate-400 font-semibold uppercase">{neededQty === 1 ? 'unidade' : 'unidades'}</p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {canEdit && advanceable.length > 0 && (
            <button onClick={() => setConfirmOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-slate-800 text-white hover:bg-slate-700 transition-colors">
              <Play size={12} /> Avançar etapa
            </button>
          )}
          <button onClick={() => setExpanded(e => !e)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100">
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 flex flex-col gap-2">
          {group.items.map(item => (
            <ItemRow key={item.id} item={item} onAdvance={i => onAdvanceBulk([i])} onConfirmStock={onConfirmStock} canEdit={canEdit} />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => { onAdvanceBulk(advanceable); setConfirmOpen(false) }}
        title={`Avançar "${group.product_name}"`}
        description={`Vai mover: ${transitions.join(' · ')}.`}
        confirmLabel="Confirmar"
      />
    </div>
  )
}

// ─── Faixa de uma plataforma (ML / Shopee / Avulso) ────────────────
function PlatformLane({ sourceKey, groups, ...actions }) {
  const cfg = SOURCE_CONFIG[sourceKey]
  const totalUnits = groups.reduce((s, g) => s + g.items.reduce((a, i) => a + i.qty_ordered, 0), 0)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className={`text-xs font-bold px-3 py-1.5 rounded-xl ${cfg.color}`}>{cfg.emoji} {cfg.label}</span>
        <span className="text-xs text-slate-400">{groups.length} produto(s) · {totalUnits} un.</span>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {groups.map(g => <ProductGroupCard key={g.key} group={g} {...actions} />)}
      </div>
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
                      r.target_date === todayISO() ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-500'
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
    advanceStatusBulk, confirmStock,
  } = useProduction()
  const { products } = useProducts()

  const [modalOpen, setModalOpen] = useState(false)
  const [viewDate,  setViewDate]  = useState(todayISO())
  const [tab,       setTab]       = useState('esteira') // 'esteira' | 'faltando'

  useEffect(() => { fetchOrders(viewDate) }, [viewDate]) // eslint-disable-line react-hooks/exhaustive-deps

  // Apenas produção, admin e administrativo podem editar
  const canEdit = ['admin','administrativo','producao'].includes(user?.role)
  const isToday = viewDate === todayISO()

  // Agrupa por plataforma → produto (Fase 40: era por "lote de
  // importação", que só reflete quando o sistema recebeu o pedido, sem
  // significado nenhum pro chão de fábrica).
  const lanes = useMemo(() => {
    const flat = orders.flatMap(o => (o.items ?? []).map(it => ({ ...it, source: o.source, photo_url: it.product?.photo_url })))
    const bySource = { ml: [], shopee: [], manual: [] }
    flat.forEach(it => { (bySource[it.source] ?? bySource.manual).push(it) })

    const groupByProduct = items => {
      const map = {}
      items.forEach(it => {
        const key = it.sku || it.product_name
        if (!map[key]) map[key] = { key, product_name: it.product_name, sku: it.sku, photo_url: it.photo_url, items: [] }
        map[key].items.push(it)
      })
      return Object.values(map).sort((a, b) => a.product_name.localeCompare(b.product_name))
    }

    return {
      ml:     groupByProduct(bySource.ml),
      shopee: groupByProduct(bySource.shopee),
      manual: groupByProduct(bySource.manual),
    }
  }, [orders])

  const allActiveItems = useMemo(() => orders.flatMap(o => o.items ?? []).filter(i => i.status !== 'coberto_estoque'), [orders])
  const kpis = {
    precisaProduzir: allActiveItems.filter(i => i.status === 'pendente').reduce((s, i) => s + i.qty_ordered, 0),
    emProducao:      allActiveItems.filter(i => i.status === 'em_producao' || i.status === 'embalagem').reduce((s, i) => s + i.qty_ordered, 0),
    prontoDespachar: allActiveItems.filter(i => i.status === 'pronto').reduce((s, i) => s + i.qty_ordered, 0),
  }

  const mlHasPending = lanes.ml.some(g => g.items.some(i => i.status === 'pendente'))
  const beforeCutoff = new Date().getHours() < 11
  const totalGroups = lanes.ml.length + lanes.shopee.length + lanes.manual.length

  return (
    <div className="flex flex-col gap-6 animate-fade-in">

      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Produção</h2>
          <p className="page-subtitle">O que precisa ser feito hoje, por plataforma — ML, Shopee e avulso</p>
        </div>
        {canEdit && (
          <button onClick={() => setModalOpen(true)} className="btn-primary">
            <Plus size={16} /> Lançar avulso
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
          {/* Navegação de dia */}
          <div className="card py-3 flex items-center gap-2">
            <Calendar size={15} className={isToday ? 'text-slate-400' : 'text-amber-500'} />
            <p className={`text-sm font-bold capitalize flex-1 ${isToday ? 'text-slate-700' : 'text-amber-700'}`}>{fmtDayLong(viewDate)}</p>
            <button onClick={() => setViewDate(addDays(viewDate, -1))} className="p-2 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200"><ChevronLeft size={15} /></button>
            <button onClick={() => setViewDate(todayISO())} disabled={isToday}
              className={`px-3 py-2 rounded-xl text-xs font-bold ${isToday ? 'bg-slate-100 text-slate-300' : 'bg-amber-100 text-amber-700'}`}>Hoje</button>
            <input type="date" value={viewDate} onChange={e => setViewDate(e.target.value)}
              className="text-xs px-2.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-600" />
            <button onClick={() => setViewDate(addDays(viewDate, 1))} className="p-2 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200"><ChevronRight size={15} /></button>
            <button onClick={() => fetchOrders(viewDate)} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 font-semibold transition-colors ml-1">
              <RefreshCw size={13} />
            </button>
          </div>

          {/* Urgência ML — fecha o dia às 11h */}
          {isToday && mlHasPending && beforeCutoff && (
            <div className="flex items-center gap-2.5 bg-yellow-50 border border-yellow-300 rounded-2xl px-4 py-3">
              <span className="text-lg">⏰</span>
              <p className="text-sm font-bold text-yellow-800">Mercado Livre fecha o dia às 11h — prioridade máxima até lá.</p>
            </div>
          )}

          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="card py-5 flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center shrink-0"><Factory size={20} className="text-amber-500" /></div>
              <div>
                <p className="text-xs text-slate-400 font-semibold">Precisa produzir hoje</p>
                <p className="text-2xl font-black text-slate-800" style={{ fontFamily: 'Nunito, sans-serif' }}>{kpis.precisaProduzir}</p>
              </div>
            </div>
            <div className="card py-5 flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-sky-50 flex items-center justify-center shrink-0"><Box size={20} className="text-sky-500" /></div>
              <div>
                <p className="text-xs text-slate-400 font-semibold">Em produção / embalagem</p>
                <p className="text-2xl font-black text-slate-800" style={{ fontFamily: 'Nunito, sans-serif' }}>{kpis.emProducao}</p>
              </div>
            </div>
            <div className="card py-5 flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0"><CheckCircle2 size={20} className="text-emerald-500" /></div>
              <div>
                <p className="text-xs text-slate-400 font-semibold">Pronto pra despachar</p>
                <p className="text-2xl font-black text-slate-800" style={{ fontFamily: 'Nunito, sans-serif' }}>{kpis.prontoDespachar}</p>
              </div>
            </div>
          </div>

          {/* Faixas por plataforma */}
          {loading ? (
            <div className="card flex justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 rounded-full border-4 border-rose-100 border-t-rose-400 animate-spin" />
                <p className="text-sm text-slate-400">Carregando esteira...</p>
              </div>
            </div>
          ) : totalGroups === 0 ? (
            <div className="card">
              <EmptyState
                icon={Factory}
                title={isToday ? 'Nada pendente hoje' : 'Nenhum item nesse dia'}
                description={isToday
                  ? 'Os pedidos de ML e Shopee entram aqui sozinhos quando sincronizam. Pode lançar algo avulso se precisar.'
                  : 'Escolha outro dia ou volte pra hoje.'}
                action={canEdit && (
                  <button onClick={() => setModalOpen(true)} className="btn-primary">
                    <Plus size={16} /> Lançar avulso
                  </button>
                )}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {SOURCE_ORDER.filter(s => lanes[s].length > 0).map(s => (
                <PlatformLane key={s} sourceKey={s} groups={lanes[s]}
                  onAdvanceBulk={advanceStatusBulk} onConfirmStock={confirmStock} canEdit={canEdit} />
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
