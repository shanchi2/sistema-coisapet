import { useState } from 'react'
import { ChevronDown, Trash2, ShieldCheck, History, RefreshCw, FileText, ShoppingCart, Truck, ListOrdered, Eye, PackageCheck } from 'lucide-react'
import { EmptyState } from '../../components/ui/EmptyState'
import { todayISO } from '../../lib/dateBR'

// Histórico de importações (redesenho 21/10, pedido do Raphael: "layout mais
// premium e organizado"; sem o botão "Gerar Picklist" — o PDF saiu de uso,
// a Expedição é o fluxo de verdade e continua igual). A lógica é a mesma de
// antes (veio do OrdersPage): eventos agrupados pelo ship_date REAL dos
// pedidos de cada lote; dentro do dia, um cartão por plataforma com o
// raio-x do lote (vão pro picklist / Full / cancelados / sem SKU) e a trilha
// de sincronizações (API = automático, .xlsx = arquivo).

const fmtTime = d => d ? new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().split('T')[0] }
const cap = s => s.charAt(0).toUpperCase() + s.slice(1)

const isCancelled = o => (o.status_ml || '').toLowerCase().includes('cancelad')
const isFull      = o => !!o.is_full
const isSemSku    = o => (o.items || []).some(it => it.sku_encontrado === false)

const PLAT = {
  ml:     { name: 'Mercado Livre', short: 'ML',     band: 'bg-[#FFE600]', ink: 'text-[#2D3277]', ring: 'border-[#F5D800]', soft: 'bg-[#FFFBD6]', logo: '🛒' },
  shopee: { name: 'Shopee',        short: 'Shopee', band: 'bg-[#EE4D2D]', ink: 'text-white',     ring: 'border-[#F4A08C]', soft: 'bg-[#FFF1EC]', logo: '🛍️' },
  manual: { name: 'Manual',        short: 'Manual', band: 'bg-slate-700', ink: 'text-white',     ring: 'border-slate-300', soft: 'bg-slate-50',   logo: '✍️' },
}
const platOf = s => PLAT[s] || PLAT.manual

function dayParts(dayKey) {
  if (dayKey === 'sem-data') return { title: 'Sem data', sub: '' }
  const d = new Date(dayKey + 'T12:00:00')
  const rel = dayKey === todayISO() ? 'Hoje' : dayKey === addDays(todayISO(), -1) ? 'Ontem' : null
  const long = cap(d.toLocaleDateString('pt-BR', { weekday: 'long' }))
  return {
    title: rel || long,
    sub: `${rel ? long + ', ' : ''}${d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}`,
    day: d.getDate(), month: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''), isToday: dayKey === todayISO(),
  }
}

// Monta, por fonte, o lote "de verdade" do dia + raio-x — mesma regra de antes
function buildSource(source, events, batchesById, orders) {
  const sorted = [...events].sort((a, b) => new Date(a.imported_at) - new Date(b.imported_at))
  // Um dia pode ter eventos de lotes diferentes — usa o que tem os pedidos hoje (maior total)
  const b = [...new Set(sorted.map(e => e.batch_id))].map(id => batchesById.get(id)).filter(Boolean)
    .sort((x, y) => (y.total_orders || 0) - (x.total_orders || 0))[0]
  const bo = b ? orders.filter(o => o.batch_id === b.id) : []
  const stats = b && bo.length ? {
    total: bo.length, cancelado: bo.filter(isCancelled).length, full: bo.filter(isFull).length, semSku: bo.filter(isSemSku).length,
  } : null
  if (stats) stats.picklist = stats.total - stats.cancelado - stats.full
  return { source, sorted, b, stats }
}

export function ImportHistoryTab({ loading, events, batchShipDates, batchesById, orders, openDays, toggleDay, onFeira, onDelete, onViewOrders, onExpedicao }) {
  const [showInfo, setShowInfo] = useState(false)

  if (loading) return <div className="card flex justify-center py-12"><div className="w-7 h-7 border-4 border-rose-100 border-t-rose-400 rounded-full animate-spin" /></div>
  if (!events.length) return <div className="card"><EmptyState icon={History} title="Nenhuma importação ainda" description="Os pedidos do ML e da Shopee entram sozinhos pela API — ou importe um arquivo .xlsx." /></div>

  // Agrupa pelo dia REAL dos pedidos do lote (mesmo campo da Expedição)
  const dayMap = {}
  events.forEach(ev => {
    const k = batchShipDates[ev.batch_id] || ev.imported_at?.slice(0, 10) || 'sem-data'
    ;(dayMap[k] ||= []).push(ev)
  })
  const days = Object.keys(dayMap).sort((a, b) => b.localeCompare(a)).map(k => {
    const bySrc = {}
    dayMap[k].forEach(ev => { (bySrc[ev.source] ||= []).push(ev) })
    const order = ['ml', 'shopee', 'manual']
    const sources = Object.keys(bySrc).sort((a, b) => order.indexOf(a) - order.indexOf(b)).map(s => buildSource(s, bySrc[s], batchesById, orders))
    return { k, sources, uploads: dayMap[k].length }
  })

  return (
    <div className="flex flex-col gap-4">
      {/* Selo "sem risco de duplicar" — discreto, abre a explicação */}
      <button onClick={() => setShowInfo(v => !v)} className="self-start flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-3 py-1.5 hover:bg-emerald-100">
        <ShieldCheck size={14} /> Sem risco de duplicar pedidos
        <ChevronDown size={13} className={`transition-transform ${showInfo ? 'rotate-180' : ''}`} />
      </button>
      {showInfo && (
        <p className="-mt-2 text-xs text-slate-600 bg-white border border-slate-100 rounded-2xl px-4 py-3 max-w-3xl leading-relaxed">
          O mesmo pedido nunca vira dois registros, venha ele pela API ou por arquivo <code className="bg-slate-100 px-1 rounded">.xlsx</code>: o sistema reconhece pelo número da venda e só atualiza.
          Na trilha de cada plataforma, <b className="text-emerald-700">Automático</b> = veio pela API e <b className="text-slate-700">Arquivo</b> = importado à mão.
        </p>
      )}

      {days.map(({ k, sources, uploads }) => {
        const open = openDays.has(k)
        const p = dayParts(k)
        const tot = sources.reduce((t, s) => t + (s.b?.total_orders || 0), 0)
        const ml = sources.find(s => s.source === 'ml'), sh = sources.find(s => s.source === 'shopee')
        return (
          <section key={k} className={`rounded-3xl border bg-white transition-shadow ${open ? 'border-slate-200 shadow-sm' : 'border-slate-100'}`}>
            {/* Cabeçalho do dia */}
            <div className="flex items-center gap-4 p-4 sm:p-5">
              <button onClick={() => toggleDay(k)} className="flex items-center gap-4 flex-1 min-w-0 text-left">
                <div className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center shrink-0 ${p.isToday ? 'bg-rose-500 text-white shadow-md shadow-rose-200' : 'bg-slate-100 text-slate-600'}`}>
                  <span className="text-xl font-black leading-none" style={{ fontFamily: 'Nunito,sans-serif' }}>{p.day ?? '?'}</span>
                  <span className="text-[10px] font-bold uppercase opacity-80">{p.month}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-lg font-black text-slate-800 leading-tight">{p.title}</p>
                  <p className="text-xs text-slate-400">{p.sub}{p.sub ? ' · ' : ''}{tot} pedido{tot === 1 ? '' : 's'} · {uploads} sincronizaç{uploads === 1 ? 'ão' : 'ões'}</p>
                </div>
              </button>
              {/* Resumo por plataforma (aparece fechado também) */}
              <div className="hidden md:flex items-center gap-1.5">
                {sources.map(s => (
                  <span key={s.source} className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${platOf(s.source).soft} ${s.source === 'ml' ? 'text-[#2D3277]' : s.source === 'shopee' ? 'text-[#C2391C]' : 'text-slate-600'}`}>
                    {platOf(s.source).short} {s.b?.total_orders ?? '—'}
                  </span>
                ))}
              </div>
              {(ml || sh) && (
                <button onClick={() => onFeira({ targetDate: k, batchIds: [ml?.sorted[0]?.batch_id, sh?.sorted[0]?.batch_id].filter(Boolean), dayLabel: p.title })}
                  className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-100">
                  <ShoppingCart size={14} /> <span className="hidden sm:inline">Feira Combinada</span>
                </button>
              )}
              <button onClick={() => toggleDay(k)} className="p-2 rounded-xl hover:bg-slate-50 text-slate-400">
                <ChevronDown size={18} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {open && (
              <div className="grid md:grid-cols-2 gap-4 px-4 pb-4 sm:px-5 sm:pb-5">
                {sources.map(s => <SourceCard key={s.source} s={s} onDelete={onDelete} onViewOrders={onViewOrders} onExpedicao={onExpedicao} />)}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

function SourceCard({ s, onDelete, onViewOrders, onExpedicao }) {
  const [trail, setTrail] = useState(false)
  const P = platOf(s.source)
  const { b, stats, sorted } = s
  const last = sorted[sorted.length - 1]
  const seg = stats ? [
    { n: stats.picklist,  c: 'bg-emerald-500', l: 'vão pro picklist' },
    { n: stats.full,      c: 'bg-indigo-400',  l: 'Full' },
    { n: stats.cancelado, c: 'bg-rose-400',    l: 'cancelados' },
  ].filter(x => x.n > 0) : []

  return (
    <div className={`rounded-2xl border-2 ${P.ring} overflow-hidden flex flex-col`}>
      {/* Faixa da plataforma */}
      <div className={`${P.band} ${P.ink} px-4 py-3 flex items-center gap-3`}>
        <span className="w-9 h-9 rounded-xl bg-white/90 flex items-center justify-center text-lg shrink-0">{P.logo}</span>
        <div className="min-w-0 flex-1">
          <p className="font-black leading-tight">{P.name}</p>
          <p className="text-[11px] font-semibold opacity-80">última sincronização {fmtTime(last?.imported_at)}</p>
        </div>
        {b && (
          <button onClick={() => onDelete(b.id, s.source, last?.filename)} title="Apagar todos os pedidos deste lote"
            className="p-1.5 rounded-lg bg-white/20 hover:bg-white/40"><Trash2 size={14} /></button>
        )}
      </div>

      <div className="p-4 flex flex-col gap-4 flex-1 bg-white">
        {/* Números grandes */}
        <div className="grid grid-cols-3 gap-2">
          <Num label="Pedidos" value={b?.total_orders ?? '—'} />
          <Num label="Itens" value={b?.total_items ?? '—'} />
          <Num label="Pro picklist" value={stats ? stats.picklist : '—'} tone="text-emerald-600" />
        </div>

        {/* Raio-x do lote */}
        {stats && (
          <div>
            <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-100">
              {seg.map(x => <div key={x.l} className={x.c} style={{ width: `${(x.n / stats.total) * 100}%` }} title={`${x.n} ${x.l}`} />)}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-slate-500">
              {seg.map(x => <span key={x.l} className="flex items-center gap-1.5"><i className={`w-2 h-2 rounded-full ${x.c}`} /><b className="text-slate-700">{x.n}</b> {x.l}</span>)}
              {stats.semSku > 0 && <span className="flex items-center gap-1.5 text-amber-700 font-semibold">⚠️ {stats.semSku} sem SKU</span>}
            </div>
          </div>
        )}

        {/* Trilha de sincronizações */}
        <div className="rounded-xl bg-slate-50 border border-slate-100">
          <button onClick={() => setTrail(v => !v)} className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-600">
            <ListOrdered size={13} className="text-slate-400" />
            {sorted.length} sincronizaç{sorted.length === 1 ? 'ão' : 'ões'} neste dia
            <ChevronDown size={13} className={`ml-auto text-slate-400 transition-transform ${trail ? 'rotate-180' : ''}`} />
          </button>
          {trail && (
            <ol className="px-3 pb-3 flex flex-col gap-1.5">
              {sorted.map((ev, i) => {
                const api = ev.filename?.startsWith('API ')
                return (
                  <li key={ev.id} className="flex items-center gap-2 text-xs">
                    <span className="font-mono text-slate-400 w-10 shrink-0">{fmtTime(ev.imported_at)}</span>
                    {api
                      ? <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 shrink-0"><RefreshCw size={9} />Automático</span>
                      : <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 shrink-0"><FileText size={9} />Arquivo</span>}
                    <span className="text-slate-500 truncate flex-1 min-w-0">{api ? '' : (ev.filename || 'Pedido manual')}</span>
                    <span className="text-slate-500 shrink-0 tabular-nums">
                      {ev.total_orders_file} ped.
                      {i > 0 && ev.new_orders_count != null && ev.new_orders_count > 0 && <b className="text-emerald-600"> +{ev.new_orders_count}</b>}
                    </span>
                  </li>
                )
              })}
            </ol>
          )}
        </div>

        {/* Ações */}
        {b && (
          <div className="flex gap-2 mt-auto">
            {s.source !== 'manual' && (
              <button onClick={() => onExpedicao(b.id)} className="flex-1 flex items-center justify-center gap-1.5 text-sm font-bold py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm">
                <Truck size={15} /> Expedição
              </button>
            )}
            <button onClick={() => onViewOrders(b.id)} className="flex-1 flex items-center justify-center gap-1.5 text-sm font-semibold py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50">
              <Eye size={15} /> Ver pedidos
            </button>
          </div>
        )}
        {!b && <p className="text-xs text-slate-400 flex items-center gap-1.5"><PackageCheck size={13} /> Lote antigo — pedidos já fora da janela carregada.</p>}
      </div>
    </div>
  )
}

function Num({ label, value, tone = 'text-slate-800' }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`text-2xl font-black tabular-nums leading-tight ${tone}`} style={{ fontFamily: 'Nunito,sans-serif' }}>{value}</p>
    </div>
  )
}
