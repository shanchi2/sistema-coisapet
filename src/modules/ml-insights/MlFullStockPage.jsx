import { useEffect, useState } from 'react'
import { Warehouse, RefreshCw, Loader2, AlertTriangle, ExternalLink, ImageOff, ChevronDown, Info, PackageCheck, PackageX } from 'lucide-react'
import { useMlInsights } from './hooks/useMlInsights'

// A API do ML às vezes devolve o thumbnail em http:// puro — o site roda
// em https, então isso vira mixed content bloqueado pelo navegador.
function secureThumb(url) {
  return url ? url.replace(/^http:\/\//, 'https://') : null
}

// Limites pra colorir o estoque — mesma lógica de "baixo estoque" já
// usada informalmente no resto do sistema, só que aplicada ao estoque
// que já está FISICAMENTE no centro de distribuição do ML (reposição
// daqui é sempre manual, ver aviso na tela — então esse número zerando
// é mais urgente que estoque baixo normal, o produto some do Full até
// alguém mandar mais fisicamente pro ML).
const CRITICAL_MAX = 5
const WARNING_MAX = 15
function stockLevel(qty) {
  if (qty <= 0) return 'zero'
  if (qty <= CRITICAL_MAX) return 'critical'
  if (qty <= WARNING_MAX) return 'warning'
  return 'ok'
}
const LEVEL_STYLE = {
  zero:     { text: 'text-rose-700',    bg: 'bg-rose-50',    border: 'border-rose-300',   badge: 'bg-rose-100 text-rose-700' },
  critical: { text: 'text-rose-600',    bg: 'bg-rose-50',    border: 'border-rose-200',   badge: 'bg-rose-50 text-rose-700 border border-rose-200' },
  warning:  { text: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-200',  badge: 'bg-amber-50 text-amber-700 border border-amber-200' },
  ok:       { text: 'text-emerald-600', bg: 'bg-white',      border: 'border-slate-200',  badge: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
}

function VariationRow({ v }) {
  const level = v.available == null ? 'ok' : stockLevel(v.available)
  const style = LEVEL_STYLE[level]
  return (
    <div className="flex items-center justify-between gap-3 bg-slate-50 rounded-lg px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm text-slate-700 truncate">{v.label}</p>
        {v.not_available > 0 && (
          <p className="text-xs text-amber-600 mt-0.5">{v.not_available} {v.not_available > 1 ? 'indisponíveis' : 'indisponível'}{v.not_available_detail?.length > 0 && ` — ${v.not_available_detail.map(d => d.status || d.reason).filter(Boolean).join(', ')}`}</p>
        )}
      </div>
      <span className={`text-sm font-bold px-2.5 py-1 rounded-full shrink-0 ${style.badge}`}>
        {v.available ?? '—'} un.
      </span>
    </div>
  )
}

function FullProductCard({ item }) {
  const [expanded, setExpanded] = useState(false)
  const thumb = secureThumb(item.thumbnail)
  const level = stockLevel(item.available_quantity)
  const style = LEVEL_STYLE[level]
  const hasVariations = item.variations?.length > 0

  return (
    <div className={`bg-white border-2 rounded-2xl p-4 transition-colors ${style.border}`}>
      <div className="flex items-center gap-3.5">
        <div className="w-14 h-14 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
          {thumb ? <img src={thumb} alt="" className="w-full h-full object-cover" loading="lazy" /> : <ImageOff size={18} className="text-slate-300" />}
        </div>
        <div className="flex-1 min-w-0">
          <a href={item.permalink || `https://produto.mercadolivre.com.br/${item.item_id}`} target="_blank" rel="noreferrer"
            className="text-sm font-medium text-slate-800 hover:text-emerald-600 inline-flex items-start gap-1.5">
            <span className="line-clamp-2">{item.title}</span>
            <ExternalLink size={11} className="text-slate-300 mt-0.5 shrink-0" />
          </a>
          <p className="text-xs font-mono text-slate-400 mt-1">{item.item_id}</p>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-2xl font-bold leading-none ${style.text}`}>{item.available_quantity}</p>
          <p className="text-[10px] text-slate-400 uppercase mt-1">{item.available_quantity === 1 ? 'unidade' : 'unidades'}</p>
        </div>
      </div>

      {level !== 'ok' && (
        <div className={`flex items-center gap-1.5 text-xs font-semibold mt-3 ${style.text}`}>
          <AlertTriangle size={12} />
          {level === 'zero' ? 'Sem estoque no Full — anúncio pode sair de circulação' : 'Estoque baixo no Full — considere enviar mais'}
        </div>
      )}

      {hasVariations && (
        <>
          <button onClick={() => setExpanded(e => !e)} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 mt-3">
            <ChevronDown size={12} className={expanded ? 'rotate-180' : ''} /> {item.variations.length} {item.variations.length > 1 ? 'variações' : 'variação'}
          </button>
          {expanded && (
            <div className="flex flex-col gap-1.5 mt-2">
              {item.variations.map(v => <VariationRow key={v.variation_id} v={v} />)}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export function MlFullStockPage() {
  const { loading, error, fetchFulfillmentStock } = useMlInsights()
  const [items, setItems] = useState(null) // null = nunca escaneado

  const load = () => fetchFulfillmentStock().then(setItems).catch(() => {})
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const stats = items ? {
    total: items.length,
    zero: items.filter(i => stockLevel(i.available_quantity) === 'zero').length,
    critical: items.filter(i => stockLevel(i.available_quantity) === 'critical').length,
    warning: items.filter(i => stockLevel(i.available_quantity) === 'warning').length,
    units: items.reduce((s, i) => s + i.available_quantity, 0),
  } : null

  const sorted = items ? [...items].sort((a, b) => a.available_quantity - b.available_quantity) : []

  return (
    <div className="min-h-screen bg-slate-50 p-6 lg:p-8">
      <div className="max-w-[1600px] mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl flex items-center justify-center shrink-0 shadow-sm shadow-emerald-200">
              <Warehouse size={22} strokeWidth={1.5} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Estoque Full</h1>
              <p className="text-sm text-slate-500">Quanto você tem fisicamente no centro de distribuição do Mercado Livre, por produto</p>
            </div>
          </div>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-xl disabled:opacity-60 transition-colors shadow-sm">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            {loading ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>

        {/* Aviso: reposição é manual */}
        <div className="flex items-start gap-3 bg-sky-50 border border-sky-200 rounded-2xl px-4 py-3.5">
          <Info size={16} className="text-sky-500 mt-0.5 shrink-0" />
          <p className="text-sm text-sky-800 leading-relaxed">
            Isso aqui é só <strong>consulta</strong> — o Mercado Livre não deixa agendar ou enviar reposição pro Full por API, só pelo painel do vendedor mesmo. Esta tela serve pra avisar cedo quando algum produto está acabando lá, pra vocês organizarem o envio manual a tempo.
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
            <AlertTriangle size={15} /> {error}
          </div>
        )}

        {loading && !items && (
          <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-slate-400" /></div>
        )}

        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-1"><Warehouse size={14} className="text-slate-400" /><p className="text-xs font-semibold text-slate-500 uppercase">No Full</p></div>
              <p className="text-2xl font-bold text-slate-800">{stats.total}</p>
              <p className="text-xs text-slate-400 mt-1">{stats.units} unidades ao todo</p>
            </div>
            <div className="bg-white border border-rose-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-1"><PackageX size={14} className="text-rose-500" /><p className="text-xs font-semibold text-slate-500 uppercase">Sem estoque</p></div>
              <p className="text-2xl font-bold text-rose-600">{stats.zero}</p>
            </div>
            <div className="bg-white border border-amber-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-1"><AlertTriangle size={14} className="text-amber-500" /><p className="text-xs font-semibold text-slate-500 uppercase">Estoque crítico (≤{CRITICAL_MAX})</p></div>
              <p className="text-2xl font-bold text-amber-600">{stats.critical}</p>
            </div>
            <div className="bg-white border border-emerald-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-1"><PackageCheck size={14} className="text-emerald-500" /><p className="text-xs font-semibold text-slate-500 uppercase">Saudável</p></div>
              <p className="text-2xl font-bold text-emerald-600">{stats.total - stats.zero - stats.critical - stats.warning}</p>
            </div>
          </div>
        )}

        {items !== null && items.length === 0 && (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
            <Warehouse size={32} strokeWidth={1} className="mx-auto mb-3 text-slate-200" />
            <p className="text-slate-500">Nenhum anúncio no Full encontrado.</p>
          </div>
        )}

        {sorted.length > 0 && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {sorted.map(item => <FullProductCard key={item.item_id} item={item} />)}
          </div>
        )}
      </div>
    </div>
  )
}
