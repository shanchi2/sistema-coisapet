import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Megaphone, Loader2, RefreshCw, Info, AlertTriangle, ArrowRight, Wallet, MousePointerClick, Eye, Percent, Coins } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { todayISO } from '../../lib/dateBR'
import { useMlInsights } from '../ml-insights/hooks/useMlInsights'
import { useShopeeAds } from '../shopee-insights/hooks/useShopeeAds'
import { PLAT, PLATFORMS, usePlatformFilter, PlatformFilter, PlatBadge, Segmented, brl, brl2, fmtN, isCancelled, fetchAll } from './shared'

// Ads unificado ML + Shopee (Fase 2 da unificação, 09/10). Lê os mesmos
// dados das telas de Publicidade (ML, `ads_dashboard`) e Shopee Ads
// (`ads_dashboard` + `ads_campaigns`) e cruza com o faturamento total de
// cada plataforma no período (pedidos do sistema, mesma régua da Visão
// Geral): TACoS = investido ÷ faturamento total, e quanto do faturamento
// veio de Ads. As ações (pausar, orçamento, ROAS alvo) continuam nas telas
// de cada plataforma.
// Atenção: cada plataforma atribui venda ao anúncio do seu jeito (ML:
// direta + indireta; Shopee: "broad GMV") — ROAS lado a lado, não é a
// mesma régua exata.

const PERIODS = [['7', '7 dias'], ['15', '15 dias'], ['30', '30 dias'], ['60', '60 dias']]
const addDays = (s, n) => { const d = new Date(`${s}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const pct = v => v == null || !isFinite(v) ? '—' : `${(v * 100).toFixed(1).replace('.', ',')}%`
const roasFmt = v => v == null || !isFinite(v) ? '—' : `${v.toFixed(2).replace('.', ',')}x`
const STATUS = {
  active: ['Ativa', 'bg-emerald-50 text-emerald-700 border-emerald-200'], ongoing: ['Ativa', 'bg-emerald-50 text-emerald-700 border-emerald-200'],
  paused: ['Pausada', 'bg-amber-50 text-amber-700 border-amber-200'], ended: ['Encerrada', 'bg-slate-100 text-slate-500 border-slate-200'],
  scheduled: ['Agendada', 'bg-sky-50 text-sky-700 border-sky-200'], idle: ['Parada', 'bg-slate-100 text-slate-500 border-slate-200'],
}

function Metric({ icon: Icon, label, hint, values, fmt, plat, combine = 'sum' }) {
  const plats = plat ? [plat] : PLATFORMS
  const total = combine === 'sum' ? plats.reduce((t, p) => t + (values[p] ?? 0), 0) : values.total
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-2" title={hint}>
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1.5"><Icon size={13} />{label}</p>
      <p className="text-2xl font-black text-slate-800 tabular-nums">{plat ? fmt(values[plat]) : fmt(total)}</p>
      {!plat && (
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          {PLATFORMS.map(p => <p key={p} className="flex items-center gap-1 text-slate-500"><span className="w-2 h-2 rounded-sm" style={{ background: PLAT[p].color }} />{PLAT[p].short} <span className="font-bold text-slate-700 tabular-nums">{fmt(values[p])}</span></p>)}
        </div>
      )}
      {hint && <p className="text-[10px] text-slate-400 leading-snug">{hint}</p>}
    </div>
  )
}

export function MarketplaceAdsPage() {
  const { fetchAdsDashboard } = useMlInsights()
  const { fetchDashboard, fetchCampaigns } = useShopeeAds()
  const [plat, setPlat] = usePlatformFilter()
  const [period, setPeriod] = useState('30')
  const [ml, setMl] = useState(null)
  const [sh, setSh] = useState(null)
  const [shCamps, setShCamps] = useState(null)
  const [rev, setRev] = useState(null)
  const [errs, setErrs] = useState({})
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    const days = Number(period), end = todayISO(), start = addDays(end, -(days - 1))
    setMl(null); setSh(null); setShCamps(null); setRev(null); setErrs({})
    const fail = (k) => e => alive && setErrs(x => ({ ...x, [k]: e.message || String(e) }))
    fetchAdsDashboard(days).then(d => alive && setMl(d)).catch(e => { fail('ml')(e); alive && setMl({}) })
    fetchDashboard(start, end).then(d => alive && setSh(d)).catch(e => { fail('shopee')(e); alive && setSh({}) })
    fetchCampaigns(start, end).then(d => alive && setShCamps(d?.campaigns || [])).catch(() => alive && setShCamps([]))
    fetchAll(() => supabase.from('orders').select('source, status_ml, marketplace_status, items:order_items(qty, preco_unit)')
      .in('source', PLATFORMS).gte('data_venda', `${start}T00:00:00-03:00`).lt('data_venda', `${addDays(end, 1)}T00:00:00-03:00`).order('data_venda'))
      .then(rows => {
        const r = { ml: 0, shopee: 0 }
        rows.forEach(o => { if (!isCancelled(o) && o.source in r) r[o.source] += (o.items || []).reduce((t, i) => t + (Number(i.qty) || 0) * (Number(i.preco_unit) || 0), 0) })
        alive && setRev(r)
      }).catch(() => alive && setRev({ ml: 0, shopee: 0 }))
    return () => { alive = false }
  }, [period, tick]) // eslint-disable-line react-hooks/exhaustive-deps

  const loading = ml === null || sh === null
  const M = useMemo(() => {
    const s = ml?.summary || {}, t = sh?.totals || {}
    const v = {
      cost: { ml: s.cost ?? 0, shopee: t.expense ?? 0 },
      revenue: { ml: s.revenue ?? 0, shopee: t.broad_gmv ?? 0 },
      clicks: { ml: s.clicks ?? 0, shopee: t.clicks ?? 0 },
      prints: { ml: s.prints ?? 0, shopee: t.impression ?? 0 },
    }
    const plats = plat ? [plat] : PLATFORMS
    const sum = k => plats.reduce((a, p) => a + v[k][p], 0)
    const ratio = (a, b) => b > 0 ? a / b : null
    const total = { rev: rev ? plats.reduce((a, p) => a + (rev[p] || 0), 0) : null }
    return {
      ...v,
      roas: { ml: ratio(v.revenue.ml, v.cost.ml), shopee: ratio(v.revenue.shopee, v.cost.shopee), total: ratio(sum('revenue'), sum('cost')) },
      ctr: { ml: ratio(v.clicks.ml, v.prints.ml), shopee: ratio(v.clicks.shopee, v.prints.shopee), total: ratio(sum('clicks'), sum('prints')) },
      cpc: { ml: ratio(v.cost.ml, v.clicks.ml), shopee: ratio(v.cost.shopee, v.clicks.shopee), total: ratio(sum('cost'), sum('clicks')) },
      tacos: { ml: rev ? ratio(v.cost.ml, rev.ml) : null, shopee: rev ? ratio(v.cost.shopee, rev.shopee) : null, total: total.rev ? ratio(sum('cost'), total.rev) : null },
      share: { ml: rev ? ratio(v.revenue.ml, rev.ml) : null, shopee: rev ? ratio(v.revenue.shopee, rev.shopee) : null },
    }
  }, [ml, sh, rev, plat])

  const campaigns = useMemo(() => {
    const list = []
    for (const c of ml?.campaigns || []) list.push({ platform: 'ml', key: `ml|${c.id}`, name: c.name || `Campanha ${c.id}`, status: c.status, budget: c.daily_budget ?? c.budget, cost: c.cost, revenue: c.revenue, clicks: c.clicks, roas: c.cost > 0 ? c.revenue / c.cost : null })
    for (const c of shCamps || []) { const t = c.totals || {}; list.push({ platform: 'shopee', key: `sh|${c.campaign_id}`, name: c.name || `Campanha ${c.campaign_id}`, status: c.status, budget: c.budget || null, cost: t.expense || 0, revenue: t.broad_gmv || 0, clicks: t.clicks || 0, roas: t.expense > 0 ? t.broad_gmv / t.expense : null }) }
    return list.filter(c => !plat || c.platform === plat).filter(c => c.cost > 0 || ['active', 'ongoing'].includes(c.status)).sort((a, b) => b.cost - a.cost)
  }, [ml, shCamps, plat])

  const balance = sh?.balance && !sh.balance.error ? (sh.balance.total_balance ?? sh.balance.balance ?? null) : null

  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#FFE600] to-[#EE4D2D] flex items-center justify-center shrink-0 shadow-sm"><Megaphone size={20} className="text-white" /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Ads</h1>
            <p className="text-sm text-slate-500">Mercado Ads e Shopee Ads lado a lado · e quanto do faturamento de cada um veio de anúncio</p>
          </div>
        </div>
        <button onClick={() => setTick(t => t + 1)} disabled={loading} className="btn-secondary py-1.5 text-sm disabled:opacity-50">{loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Atualizar</button>
      </div>

      <div className="card !p-3 flex items-center gap-3 flex-wrap">
        <PlatformFilter value={plat} onChange={setPlat} />
        <div className="ml-auto"><Segmented value={period} onChange={setPeriod} options={PERIODS} /></div>
      </div>

      {Object.entries(errs).map(([p, e]) => <div key={p} className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 flex items-center gap-2"><AlertTriangle size={13} />Não consegui ler o Ads {p === 'ml' ? 'do ML' : 'da Shopee'}: {e}</div>)}
      {ml && ml.available === false && <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">Mercado Ads não está disponível pra conta (sem anunciante ativo).</div>}

      {loading ? (
        <div className="card py-24 text-center"><Loader2 size={24} className="mx-auto animate-spin text-slate-300" /><p className="text-xs text-slate-400 mt-2">Buscando o Ads do ML e da Shopee…</p></div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Metric icon={Wallet} label="Investido" values={M.cost} fmt={brl} plat={plat} />
            <Metric icon={Coins} label="Vendas atribuídas a Ads" values={M.revenue} fmt={brl} plat={plat} />
            <Metric icon={Percent} label="ROAS" values={M.roas} fmt={roasFmt} plat={plat} combine="total" hint="vendas por Ads ÷ investido" />
            <Metric icon={Percent} label="TACoS" values={M.tacos} fmt={pct} plat={plat} combine="total" hint="investido ÷ faturamento TOTAL da plataforma no período" />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Metric icon={MousePointerClick} label="Cliques" values={M.clicks} fmt={fmtN} plat={plat} />
            <Metric icon={Eye} label="Impressões" values={M.prints} fmt={fmtN} plat={plat} />
            <Metric icon={Percent} label="CTR" values={M.ctr} fmt={pct} plat={plat} combine="total" />
            <Metric icon={Coins} label="Custo por clique" values={M.cpc} fmt={v => v == null ? '—' : brl2(v)} plat={plat} combine="total" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
            <div className="card xl:col-span-2 !p-0 overflow-hidden">
              <div className="px-5 pt-4 pb-2 flex items-center justify-between gap-2">
                <p className="font-bold text-slate-800 text-[15px]">Campanhas <span className="text-xs font-normal text-slate-400">com gasto no período ou ativas · maior investimento primeiro</span></p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px] min-w-[760px]">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wide text-slate-400 text-left border-b border-slate-100">
                      <th className="pl-5 pr-2 py-2 font-semibold">Campanha</th><th className="px-2 font-semibold">Status</th><th className="px-2 font-semibold text-right">Orçamento/dia</th>
                      <th className="px-2 font-semibold text-right">Investido</th><th className="px-2 font-semibold text-right">Vendas</th><th className="px-2 pr-5 font-semibold text-right">ROAS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map(c => {
                      const st = STATUS[c.status] || [c.status || '—', 'bg-slate-100 text-slate-500 border-slate-200']
                      return (
                        <tr key={c.key} className="border-b border-slate-50 hover:bg-slate-50/60">
                          <td className="pl-0 pr-2 py-2" style={{ boxShadow: `inset 4px 0 0 ${PLAT[c.platform].color}` }}><div className="pl-5 flex items-center gap-2"><PlatBadge p={c.platform} /><span className="text-slate-700">{c.name}</span></div></td>
                          <td className="px-2"><span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${st[1]}`}>{st[0]}</span></td>
                          <td className="px-2 text-right tabular-nums text-slate-500">{c.budget ? brl(c.budget) : <span className="text-slate-300">—</span>}</td>
                          <td className="px-2 text-right tabular-nums font-semibold text-slate-800">{brl(c.cost)}</td>
                          <td className="px-2 text-right tabular-nums text-slate-600">{brl(c.revenue)}</td>
                          <td className={`px-2 pr-5 text-right tabular-nums font-black ${c.roas == null ? 'text-slate-300' : c.roas >= 5 ? 'text-emerald-600' : c.roas >= 2 ? 'text-amber-600' : 'text-rose-600'}`}>{roasFmt(c.roas)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {shCamps === null && <p className="text-xs text-slate-400 text-center py-4"><Loader2 size={12} className="inline animate-spin mr-1" />carregando campanhas da Shopee…</p>}
                {shCamps !== null && !campaigns.length && <p className="text-sm text-slate-400 text-center py-10">Nenhuma campanha com gasto no período.</p>}
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="card">
                <p className="font-bold text-slate-800 text-[15px] mb-1">Quanto do faturamento veio de Ads</p>
                <p className="text-xs text-slate-400 mb-4">Vendas atribuídas a anúncio ÷ faturamento total da plataforma (pedidos do sistema)</p>
                <div className="flex flex-col gap-3">
                  {(plat ? [plat] : PLATFORMS).map(p => {
                    const s = M.share[p]
                    return (
                      <div key={p}>
                        <div className="flex items-center justify-between text-[13px]"><span className="flex items-center gap-1.5 text-slate-700"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: PLAT[p].color }} />{PLAT[p].label}</span><span className="font-black tabular-nums">{pct(s)}</span></div>
                        <div className="h-2 rounded-full bg-slate-100 mt-1 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, (s || 0) * 100)}%`, background: PLAT[p].bar }} /></div>
                        <p className="text-[10px] text-slate-400 mt-0.5">{brl(M.revenue[p])} de {rev ? brl(rev[p]) : '…'} · TACoS {pct(M.tacos[p])}</p>
                        {s > 1 && <p className="text-[10px] text-amber-600 mt-0.5">Passa de 100% porque a plataforma também conta como "venda do anúncio" compras indiretas (outro produto da loja, até dias depois do clique).</p>}
                      </div>
                    )
                  })}
                </div>
              </div>
              {(!plat || plat === 'shopee') && balance != null && (
                <div className="card">
                  <p className="font-bold text-slate-800 text-[15px] mb-1">Saldo Shopee Ads</p>
                  <p className="text-2xl font-black text-slate-800 tabular-nums">{brl(balance)}</p>
                  <Link to="/shopee/ads" className="text-xs text-slate-500 hover:underline">recargas e créditos na tela da Shopee →</Link>
                </div>
              )}
              <div className="card">
                <p className="font-bold text-slate-800 text-[15px] mb-2">Ajustar campanhas</p>
                <p className="text-xs text-slate-500 mb-3">Pausar, mudar orçamento ou ROAS alvo continua na tela de cada plataforma.</p>
                <div className="grid grid-cols-2 gap-2">
                  <Link to="/ml/publicidade" className="rounded-xl px-3 py-2 text-xs font-bold text-center" style={{ background: PLAT.ml.soft, color: PLAT.ml.ink }}>Publicidade ML <ArrowRight size={11} className="inline" /></Link>
                  <Link to="/shopee/ads" className="rounded-xl px-3 py-2 text-xs font-bold text-center" style={{ background: PLAT.shopee.soft, color: PLAT.shopee.ink }}>Shopee Ads <ArrowRight size={11} className="inline" /></Link>
                </div>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 flex items-start gap-1.5"><Info size={12} className="shrink-0 mt-px" />
            <span>Cada plataforma atribui a venda ao anúncio do seu jeito (ML: venda direta + indireta; Shopee: "vendas amplas") — o ROAS fica lado a lado, mas não é exatamente a mesma régua. Investido e cliques somam sem problema. TACoS e "% do faturamento" usam o faturamento dos pedidos do sistema (mesma régua da Visão Geral).</span>
          </p>
        </>
      )}
    </div>
  )
}
