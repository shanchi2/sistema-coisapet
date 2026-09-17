import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Warehouse, RefreshCw, Loader2, AlertTriangle, ImageOff, ChevronDown, Info, PackageCheck, PackageX } from 'lucide-react'
import { useShopeeInsights } from './hooks/useShopeeInsights'

const SHOPEE_ORANGE = '#EE4D2D'

// Mesmos limites/lógica da tela equivalente do ML (`MlFullStockPage.jsx`)
// — reposição no armazém da Shopee também é sempre manual (ver aviso na
// tela), então zerar aqui é mais urgente que estoque baixo normal.
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

function WarehouseRow({ w }) {
  const level = stockLevel(w.sellable_qty)
  const style = LEVEL_STYLE[level]
  return (
    <div className="flex items-center justify-between gap-3 bg-slate-50 rounded-lg px-3 py-2">
      <div className="min-w-0">
        <p className="text-xs font-mono text-slate-500">Armazém {w.whs_id}</p>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-[11px] text-slate-400">
          {w.reserved_qty > 0 && <span>{w.reserved_qty} reservado{w.reserved_qty > 1 ? 's' : ''}</span>}
          {w.unsellable_qty > 0 && <span className="text-amber-600">{w.unsellable_qty} não vendável</span>}
          {w.coverage_days != null && <span>~{w.coverage_days}d de cobertura</span>}
          {w.last_30_sold != null && <span>{w.last_30_sold} vendidos/30d</span>}
        </div>
      </div>
      <span className={`text-sm font-bold px-2.5 py-1 rounded-full shrink-0 ${style.badge}`}>
        {w.sellable_qty} un.
      </span>
    </div>
  )
}

function SkuBlock({ sku }) {
  const level = stockLevel(sku.sellable_total)
  const style = LEVEL_STYLE[level]
  return (
    <div className={`border rounded-xl p-3 ${style.border}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-700">{sku.model_name || 'Sem variação'}</p>
        <span className={`text-sm font-bold px-2 py-0.5 rounded-full shrink-0 ${style.badge}`}>{sku.sellable_total} un.</span>
      </div>
      {sku.whs_list.length > 0 && (
        <div className="flex flex-col gap-1.5 mt-2">
          {sku.whs_list.map((w, i) => <WarehouseRow key={i} w={w} />)}
        </div>
      )}
    </div>
  )
}

function FullProductCard({ item }) {
  const [expanded, setExpanded] = useState(false)
  const level = stockLevel(item.sellable_total)
  const style = LEVEL_STYLE[level]
  const multiSku = item.skus.length > 1

  const Title = () => (
    <span className="line-clamp-2">{item.title || item.warehouse_item_id}</span>
  )

  return (
    <div className={`bg-white border-2 rounded-2xl p-4 transition-colors ${style.border}`}>
      <div className="flex items-center gap-3.5">
        <div className="w-14 h-14 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
          {item.thumbnail ? <img src={item.thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" /> : <ImageOff size={18} className="text-slate-300" />}
        </div>
        <div className="flex-1 min-w-0">
          {item.shop_item_id ? (
            <Link to={`/shopee/item/${item.shop_item_id}`} className="text-sm font-medium text-slate-800 hover:text-orange-600">
              <Title/>
            </Link>
          ) : (
            <p className="text-sm font-medium text-slate-800"><Title/></p>
          )}
          <p className="text-xs font-mono text-slate-400 mt-1">{item.warehouse_item_id}</p>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-2xl font-bold leading-none ${style.text}`}>{item.sellable_total}</p>
          <p className="text-[10px] text-slate-400 uppercase mt-1">{item.sellable_total === 1 ? 'unidade' : 'unidades'}</p>
        </div>
      </div>

      {level !== 'ok' && (
        <div className={`flex items-center gap-1.5 text-xs font-semibold mt-3 ${style.text}`}>
          <AlertTriangle size={12} />
          {level === 'zero' ? 'Sem estoque no armazém da Shopee — anúncio pode sair de circulação' : 'Estoque baixo no armazém — considere enviar mais'}
        </div>
      )}

      {multiSku ? (
        <>
          <button onClick={() => setExpanded(e => !e)} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 mt-3">
            <ChevronDown size={12} className={expanded ? 'rotate-180' : ''} /> {item.skus.length} variações
          </button>
          {expanded && (
            <div className="flex flex-col gap-2 mt-2">
              {item.skus.map((sku, i) => <SkuBlock key={i} sku={sku} />)}
            </div>
          )}
        </>
      ) : item.skus[0]?.whs_list.length > 0 && (
        <div className="flex flex-col gap-1.5 mt-3">
          {item.skus[0].whs_list.map((w, i) => <WarehouseRow key={i} w={w} />)}
        </div>
      )}
    </div>
  )
}

export function ShopeeFullStockPage() {
  const { loading, error, fetchSbsBoundWarehouses, fetchSbsFulfillmentStock } = useShopeeInsights()
  const [bound, setBound] = useState(null) // null = não checou ainda
  const [items, setItems] = useState(null)

  const load = async () => {
    const bw = await fetchSbsBoundWarehouses().catch(() => ({ bound: false, warehouses: [] }))
    setBound(bw)
    if (bw.bound) {
      fetchSbsFulfillmentStock().then(setItems).catch(() => {})
    } else {
      setItems([])
    }
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const stats = items ? {
    total: items.length,
    zero: items.filter(i => stockLevel(i.sellable_total) === 'zero').length,
    critical: items.filter(i => stockLevel(i.sellable_total) === 'critical').length,
    warning: items.filter(i => stockLevel(i.sellable_total) === 'warning').length,
    units: items.reduce((s, i) => s + i.sellable_total, 0),
  } : null

  const sorted = items ? [...items].sort((a, b) => a.sellable_total - b.sellable_total) : []

  return (
    <div className="min-h-screen bg-slate-50 p-6 lg:p-8">
      <div className="max-w-[1600px] mx-auto space-y-6">

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-sm" style={{ background: `linear-gradient(135deg, ${SHOPEE_ORANGE}, #D6431F)`, boxShadow: `0 2px 10px ${SHOPEE_ORANGE}40` }}>
              <Warehouse size={22} strokeWidth={1.5} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Estoque Full</h1>
              <p className="text-sm text-slate-500">Quanto você tem fisicamente no armazém da Shopee (SBS), por produto</p>
            </div>
          </div>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 text-white text-sm font-medium rounded-xl disabled:opacity-60 transition-colors shadow-sm"
            style={{ background: SHOPEE_ORANGE }}>
            {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            {loading ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>

        <div className="flex items-start gap-3 bg-sky-50 border border-sky-200 rounded-2xl px-4 py-3.5">
          <Info size={16} className="text-sky-500 mt-0.5 shrink-0" />
          <p className="text-sm text-sky-800 leading-relaxed">
            Isso aqui é só <strong>consulta</strong> — a Shopee não deixa agendar ou enviar reposição pro armazém por API, só pelo Seller Center mesmo. Esta tela serve pra avisar cedo quando algum produto está acabando lá.
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
            <AlertTriangle size={15} /> {error}
          </div>
        )}

        {loading && bound === null && (
          <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-slate-400" /></div>
        )}

        {bound && !bound.bound && (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
            <Warehouse size={32} strokeWidth={1} className="mx-auto mb-3 text-slate-200" />
            <p className="text-slate-500 mb-1">Nenhum armazém vinculado a essa loja ainda.</p>
            <p className="text-sm text-slate-400 max-w-md mx-auto">Normal por enquanto — hoje a CoisaPet ainda fabrica, embala e despacha tudo direto. Quando entrar pro fulfillment da Shopee, essa tela passa a puxar o estoque físico automaticamente, sem precisar mexer em nada aqui.</p>
          </div>
        )}

        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-1"><Warehouse size={14} className="text-slate-400" /><p className="text-xs font-semibold text-slate-500 uppercase">No armazém</p></div>
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

        {bound?.bound && items !== null && items.length === 0 && (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
            <Warehouse size={32} strokeWidth={1} className="mx-auto mb-3 text-slate-200" />
            <p className="text-slate-500">Nenhum produto com estoque no armazém encontrado.</p>
          </div>
        )}

        {sorted.length > 0 && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {sorted.map(item => <FullProductCard key={item.warehouse_item_id} item={item} />)}
          </div>
        )}
      </div>
    </div>
  )
}
