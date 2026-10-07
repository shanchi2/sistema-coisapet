import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Wallet, RefreshCw, Loader2, Info } from 'lucide-react'
import { supabase } from '../../lib/supabase'

// Vendido × o que entra na carteira (07/10, fase101). Dados de
// `marketplace_finance`, sincronizada de hora em hora pela Edge Function
// `marketplace-finance` direto do Mercado Pago (ML) e da Shopee:
//   - Líquido = o que sobra depois de tarifa de venda, frete, cupom etc.
//   - Caiu na carteira = líquido LIBERADO (dinheiro disponível) no período.
//   - A liberar = líquido de vendas já feitas que ainda não foi liberado.
// Pagamento devolvido/cancelado/recusado conta como 0.

const TZ = 'America/Sao_Paulo'
const P = { ml: { label: 'Mercado Livre', short: 'ML', color: '#2D3277' }, shopee: { label: 'Shopee', short: 'Shopee', color: '#EE4D2D' } }
const PLATFORMS = ['ml', 'shopee']
const DEAD = ['refunded', 'cancelled', 'rejected', 'charged_back']
const brDate = ts => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(ts))
const toD = s => new Date(`${s}T12:00:00Z`)
const addDays = (s, k) => { const d = toD(s); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10) }
const brl = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const fmtShort = s => `${s.slice(8, 10)}/${s.slice(5, 7)}`
const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const effNet = r => (DEAD.includes(r.status) ? 0 : Number(r.net) || 0)
const effGross = r => (DEAD.includes(r.status) ? 0 : Number(r.gross) || 0)
function fmtAgo(iso) {
  if (!iso) return 'nunca'
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  return m < 60 ? `há ${Math.max(1, m)} min` : m < 1440 ? `há ${Math.round(m / 60)} h` : `há ${Math.round(m / 1440)} dias`
}

async function fetchAll(build) {
  const all = []
  for (let page = 0; page < 40; page++) {
    const { data, error } = await build().range(page * 1000, page * 1000 + 999)
    if (error) throw error
    all.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return all
}

export function WalletSection({ range, soldBy }) {
  const [rows, setRows] = useState(null)
  const [sync, setSync] = useState([])
  const [busy, setBusy] = useState(false)
  const [view, setView] = useState('carteira') // carteira | venda

  const load = async () => {
    // Vendas do período + tudo que foi/será liberado no período (ou depois, pra "a liberar")
    const fromTs = `${addDays(range.from, -60)}T00:00:00-03:00`
    const [r, s] = await Promise.all([
      fetchAll(() => supabase.from('marketplace_finance')
        .select('platform, ref_id, sale_at, status, gross, net, release_at, released')
        .gte('sale_at', fromTs).order('sale_at')),
      supabase.from('marketplace_finance_sync').select('*'),
    ])
    setRows(r); setSync(s.data || [])
  }
  useEffect(() => { setRows(null); load().catch(e => toast.error('Erro ao carregar carteira: ' + e.message)) }, [range.from, range.to]) // eslint-disable-line react-hooks/exhaustive-deps

  async function refresh() {
    setBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke('marketplace-finance', { body: { action: 'sync', days: 45 } })
      if (error) throw error
      const errs = PLATFORMS.filter(p => data?.[p]?.error)
      if (errs.length) toast.error(`Erro ao atualizar ${errs.map(p => P[p].short).join(' e ')}`)
      else toast.success('Valores atualizados com as plataformas.')
      await load()
    } catch (e) { toast.error('Erro ao atualizar: ' + e.message) } finally { setBusy(false) }
  }

  const days = useMemo(() => { const out = []; for (let d = range.from; d <= range.to; d = addDays(d, 1)) out.push(d); return out }, [range.from, range.to])

  const S = useMemo(() => {
    if (!rows) return null
    const z = () => ({ gross: 0, net: 0, released: 0, pending: 0, count: 0, nextRelease: null })
    const out = { ml: z(), shopee: z() }
    const daily = {}
    const today = brDate(Date.now())
    for (const r of rows) {
      const x = out[r.platform]; if (!x) continue
      const sold = r.sale_at && brDate(r.sale_at)
      const rel = r.release_at && brDate(r.release_at)
      if (sold && sold >= range.from && sold <= range.to) {
        x.gross += effGross(r); x.net += effNet(r); x.count++
        if (view === 'venda') { const d = (daily[sold] ||= { ml: { revenue: 0 }, shopee: { revenue: 0 } }); d[r.platform].revenue += effNet(r) }
      }
      if (r.released && rel && rel >= range.from && rel <= range.to) {
        x.released += effNet(r)
        if (view === 'carteira') { const d = (daily[rel] ||= { ml: { revenue: 0 }, shopee: { revenue: 0 } }); d[r.platform].revenue += effNet(r) }
      }
      // A liberar: vendido até o fim do período, ainda não liberado
      if (!r.released && sold && sold <= range.to && effNet(r) > 0) {
        x.pending += effNet(r)
        if (rel && rel >= today && (!x.nextRelease || rel < x.nextRelease)) x.nextRelease = rel
      }
    }
    const tot = k => out.ml[k] + out.shopee[k]
    return { ...out, total: { gross: tot('gross'), net: tot('net'), released: tot('released'), pending: tot('pending') }, daily }
  }, [rows, range.from, range.to, view])

  const firstData = useMemo(() => {
    const m = {}
    for (const r of rows || []) if (r.sale_at && (!m[r.platform] || r.sale_at < m[r.platform])) m[r.platform] = r.sale_at
    return m
  }, [rows])
  const partial = PLATFORMS.filter(p => !firstData[p] || brDate(firstData[p]) > range.from)
  const lastSync = sync.reduce((m, s) => (!m || (s.synced_at && s.synced_at < m) ? s.synced_at : m), null)

  const pctKeep = (net, gross) => (gross ? Math.round((net / gross) * 100) : 0)
  const max = S ? Math.max(1, ...days.flatMap(d => PLATFORMS.map(p => S.daily[d]?.[p]?.revenue || 0))) : 1
  const dense = days.length > 31

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <p className="text-sm font-bold text-slate-700 flex items-center gap-1.5"><Wallet size={14} className="text-slate-400" /> Vendido × o que entra na carteira</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Valores reais das plataformas (Mercado Pago e Shopee), já sem tarifa de venda, frete e cupom · atualizado {fmtAgo(lastSync)}</p>
        </div>
        <button onClick={refresh} disabled={busy} className="btn-secondary py-1.5 text-xs disabled:opacity-50">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} {busy ? 'Buscando nas plataformas…' : 'Atualizar agora'}
        </button>
      </div>

      {!S ? (
        <div className="py-10 text-center"><Loader2 size={20} className="mx-auto animate-spin text-slate-300" /></div>
      ) : (
        <>
          {partial.length > 0 && (
            <p className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-3">
              <Info size={13} className="shrink-0 mt-px" />
              Valores líquidos disponíveis a partir de {partial.map(p => `${P[p].short} ${firstData[p] ? fmtShort(brDate(firstData[p])) : '—'}`).join(' · ')} — antes disso o período fica incompleto.
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[['Total', null], ...PLATFORMS.map(p => [P[p].label, p])].map(([label, p]) => {
              const x = p ? S[p] : S.total
              const sold = p ? soldBy[p].revenue : soldBy.ml.revenue + soldBy.shopee.revenue
              const keep = pctKeep(x.net, x.gross)
              return (
                <div key={label} className="rounded-xl border border-slate-100 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wide flex items-center gap-1" style={{ color: p ? P[p].color : '#64748b' }}>
                    {p && <span className="w-2 h-2 rounded-sm" style={{ background: P[p].color }} />}{label}
                  </p>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-semibold">Vendido</p>
                      <p className="text-lg font-black text-slate-800">{brl(sold)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-semibold">Fica pra CoisaPet</p>
                      <p className="text-lg font-black text-emerald-600">{brl(x.net)}</p>
                    </div>
                  </div>
                  <div className="mt-2.5">
                    <div className="h-2 rounded-full bg-rose-100 overflow-hidden" title={`Fica ${keep}% · tarifas e frete ${100 - keep}%`}>
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${keep}%` }} />
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">Fica <b className="text-slate-700">{keep}%</b> · tarifas, frete e cupons: <b className="text-rose-600">{brl(x.gross - x.net)}</b></p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-slate-100">
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-semibold">Caiu na carteira</p>
                      <p className="text-sm font-bold text-slate-800">{brl(x.released)}</p>
                      <p className="text-[10px] text-slate-400">liberado no período</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-semibold">A liberar</p>
                      <p className="text-sm font-bold text-amber-600">{brl(x.pending)}</p>
                      {p && S[p].nextRelease && <p className="text-[10px] text-slate-400">próxima: {fmtShort(S[p].nextRelease)}</p>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
              <div className="flex bg-slate-100 rounded-lg p-0.5">
                {[['carteira', 'Caiu na carteira por dia'], ['venda', 'Líquido por dia da venda']].map(([k, l]) => (
                  <button key={k} onClick={() => setView(k)} className={`px-2.5 py-1 text-xs font-semibold rounded-md ${view === k ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>{l}</button>
                ))}
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                {PLATFORMS.map(p => <span key={p} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: P[p].color }} />{P[p].label}</span>)}
              </div>
            </div>
            <div className="flex items-end h-40" style={{ gap: dense ? 1 : 4 }}>
              {days.map(d => (
                <div key={d} className="flex-1 flex items-end h-full min-w-0 group relative" style={{ gap: 2 }}>
                  {PLATFORMS.map(p => { const v = S.daily[d]?.[p]?.revenue || 0; return <div key={p} className="flex-1 rounded-t-[3px]" style={{ height: `${(v / max) * 100}%`, background: P[p].color, minHeight: v ? 2 : 0 }} /> })}
                  <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-20 bg-slate-800 text-white text-[11px] rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-lg">
                    <p className="font-bold mb-0.5">{DOW[toD(d).getUTCDay()]}, {fmtShort(d)}</p>
                    {PLATFORMS.map(p => <p key={p}>{P[p].short}: {brl(S.daily[d]?.[p]?.revenue || 0)}</p>)}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex mt-1" style={{ gap: dense ? 1 : 4 }}>
              {days.map((d, i) => (
                <span key={d} className="flex-1 text-center text-[9px] text-slate-400 min-w-0">
                  {days.length <= 14 ? `${DOW[toD(d).getUTCDay()]} ${d.slice(8, 10)}` : i % Math.ceil(days.length / 15) === 0 ? fmtShort(d) : ''}
                </span>
              ))}
            </div>
          </div>
          <p className="text-[10px] text-slate-400 mt-3 leading-relaxed">
            "Vendido" é o faturamento lá de cima (qtd × preço dos pedidos). "Fica pra CoisaPet" vem das plataformas: no ML é o valor líquido do Mercado Pago de cada pagamento; na Shopee é o valor do repasse (escrow). Devolvidos e cancelados contam zero. O ML libera o dinheiro ~28 dias depois da venda; a Shopee, depois que o pedido é entregue e confirmado.
          </p>
        </>
      )}
    </div>
  )
}
