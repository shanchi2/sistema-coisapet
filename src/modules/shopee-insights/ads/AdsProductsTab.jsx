import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Package, Sparkles, Loader2, TrendingUp, Flame, Search } from 'lucide-react'
import { useShopeeAds } from '../hooks/useShopeeAds'
import { InfoTooltip } from '../../ml-insights/InfoTooltip'
import { derive, fmtMoney, fmtNum, fmtPct, fmtRoas, EmptyState, HELP } from './adsUtils'

const TAG_LABEL = {
  trending_now: { label: 'Em alta', icon: Flame, cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  best_selling: { label: 'Mais vendido', icon: TrendingUp, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  best_roi:     { label: 'Melhor retorno', icon: TrendingUp, cls: 'bg-sky-50 text-sky-700 border-sky-200' },
}

// Um mesmo produto pode estar em mais de uma campanha (ex.: Terrário
// 100x50x50 tem 1 ongoing + 1 pausada + 1 encerrada) — aqui soma tudo
// por produto, pra responder "quanto esse produto custa e traz em Ads".
function aggregateByItem(campaigns, items) {
  const map = new Map()
  campaigns.forEach(c => {
    const ids = c.item_ids?.length ? c.item_ids : (c.auto_products || []).map(p => p.item_id)
    if (!ids.length) return
    // Campanha com vários produtos: divide igualmente (a API não dá por item).
    const share = 1 / ids.length
    ids.forEach(id => {
      const key = String(id)
      const cur = map.get(key) || {
        item_id: id, ...(items[key] || {}), campaigns: [], active: false,
        totals: { impression: 0, clicks: 0, expense: 0, broad_gmv: 0, direct_gmv: 0, broad_order: 0, direct_order: 0, broad_item_sold: 0, direct_item_sold: 0 },
      }
      Object.keys(cur.totals).forEach(k => { cur.totals[k] += (c.totals[k] || 0) * share })
      cur.campaigns.push({ id: c.campaign_id, status: c.status, name: c.name })
      if (c.status === 'ongoing') cur.active = true
      if (!cur.title) cur.title = c.name
      map.set(key, cur)
    })
  })
  return [...map.values()].map(p => ({ ...p, m: derive(p.totals), shared: p.campaigns.length > 1 }))
}

export function AdsProductsTab({ camp, settings }) {
  const { fetchRecommendedItems } = useShopeeAds()
  const [recs, setRecs] = useState(null)
  const [q, setQ] = useState('')
  const [onlyNoAds, setOnlyNoAds] = useState(true)
  const target = settings?.target_roas != null ? Number(settings.target_roas) : null

  useEffect(() => { fetchRecommendedItems().then(setRecs).catch(() => setRecs([])) }, [fetchRecommendedItems])

  const products = useMemo(() => aggregateByItem(camp?.campaigns || [], camp?.items || {})
    .filter(p => p.totals.expense > 0 || p.active)
    .sort((a, b) => b.m.expense - a.m.expense), [camp])

  const advertisedIds = useMemo(() => new Set(
    (camp?.campaigns || []).filter(c => ['ongoing', 'paused', 'scheduled'].includes(c.status))
      .flatMap(c => c.item_ids?.length ? c.item_ids : (c.auto_products || []).map(p => p.item_id)).map(String),
  ), [camp])

  const recList = useMemo(() => {
    const term = q.trim().toLowerCase()
    return (recs || [])
      .map(r => ({ ...r, advertised: advertisedIds.has(String(r.item_id)) || (r.ongoing_ad_types || []).some(t => t !== 'no_ongoing_promotion') }))
      .filter(r => !onlyNoAds || !r.advertised)
      .filter(r => !term || (r.title || '').toLowerCase().includes(term))
  }, [recs, advertisedIds, onlyNoAds, q])

  const best = products.filter(p => p.m.roas != null && p.m.expense >= 10).sort((a, b) => b.m.roas - a.m.roas).slice(0, 3)
  const worst = products.filter(p => p.m.expense >= 10).sort((a, b) => (a.m.roas ?? 0) - (b.m.roas ?? 0)).slice(0, 3)

  return (
    <div className="space-y-5">
      {/* Destaques */}
      {products.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[['Melhores retornos', best, 'text-emerald-700'], ['Piores retornos (com gasto ≥ R$10)', worst, 'text-rose-600']].map(([title, list, tone]) => (
            <div key={title} className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="text-sm font-semibold text-slate-700 mb-2">{title}</p>
              {list.length === 0 ? <p className="text-xs text-slate-400">Sem dados suficientes no período.</p> : list.map(p => (
                <div key={p.item_id} className="flex items-center gap-2.5 py-1.5">
                  {p.thumbnail ? <img src={p.thumbnail} alt="" className="w-8 h-8 rounded-md object-cover"/> : <div className="w-8 h-8 rounded-md bg-slate-100"/>}
                  <p className="text-sm text-slate-700 truncate flex-1">{p.title}</p>
                  <span className={`text-sm font-bold ${tone}`}>{fmtRoas(p.m.roas)}</span>
                  <span className="text-xs text-slate-400 w-20 text-right">{fmtMoney(p.m.expense)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Tabela por produto */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
        <div className="flex items-center gap-1.5 px-5 py-3.5 border-b border-slate-100">
          <Package size={15} className="text-slate-400"/>
          <p className="text-sm font-semibold text-slate-700">Produtos anunciados — desempenho no período</p>
          <InfoTooltip source="nosso" text="Soma de todas as campanhas de cada produto. Se uma campanha tem vários produtos, o número dela é dividido igualmente entre eles (a Shopee não informa por produto dentro da mesma campanha)."/>
        </div>
        {products.length === 0 ? (
          <p className="text-sm text-slate-400 px-5 py-6">Nenhum produto com anúncio ativo ou gasto no período.</p>
        ) : (
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-slate-50 text-[11px] uppercase text-slate-400">
              <tr>
                <th className="text-left font-semibold px-5 py-2">Produto</th>
                <th className="text-right font-semibold px-3 py-2">Gasto</th>
                <th className="text-right font-semibold px-3 py-2">Vendas</th>
                <th className="text-right font-semibold px-3 py-2">Diretas</th>
                <th className="text-right font-semibold px-3 py-2">ROAS</th>
                <th className="text-right font-semibold px-3 py-2">ACOS</th>
                <th className="text-right font-semibold px-3 py-2">Pedidos</th>
                <th className="text-right font-semibold px-3 py-2">Conversão</th>
                <th className="text-right font-semibold px-5 py-2">Campanhas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.map(p => (
                <tr key={p.item_id} className="hover:bg-slate-50">
                  <td className="px-5 py-2.5">
                    <div className="flex items-center gap-2.5">
                      {p.thumbnail ? <img src={p.thumbnail} alt="" className="w-9 h-9 rounded-md object-cover border border-slate-100"/> : <div className="w-9 h-9 rounded-md bg-slate-100"/>}
                      <div className="min-w-0">
                        <Link to={`/shopee/item/${p.item_id}`} className="truncate max-w-[340px] block text-slate-700 hover:text-orange-600">{p.title || `Item ${p.item_id}`}</Link>
                        <p className="text-[11px] text-slate-400">{p.price != null ? fmtMoney(p.price) : ''} {p.active ? '· anúncio ativo' : '· sem anúncio ativo'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium text-slate-800">{fmtMoney(p.m.expense)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-800">{fmtMoney(p.m.broad_gmv)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-500">{fmtMoney(p.m.direct_gmv)}</td>
                  <td className={`px-3 py-2.5 text-right font-semibold ${p.m.roas == null ? 'text-slate-400' : target && p.m.roas < target ? 'text-rose-600' : 'text-emerald-700'}`}>{fmtRoas(p.m.roas)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{fmtPct(p.m.acos)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{fmtNum(p.m.broad_order, 1)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{fmtPct(p.m.conv_rate, 2)}</td>
                  <td className="px-5 py-2.5 text-right text-slate-500">{p.campaigns.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Recomendados */}
      <div className="bg-white border border-slate-200 rounded-2xl">
        <div className="flex items-center justify-between gap-2 px-5 py-3.5 border-b border-slate-100 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Sparkles size={15} className="text-violet-500"/>
            <p className="text-sm font-semibold text-slate-700">Produtos que a Shopee recomenda anunciar</p>
            <InfoTooltip source="nosso" text="Lista da própria Shopee (get_recommended_item_list) com produtos que têm potencial em Ads — 'Em alta' = procura crescendo agora. Pra criar a campanha, use o Seller Center."/>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"/>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar…" className="pl-7 pr-2 py-1.5 text-xs border border-slate-200 rounded-lg w-40"/>
            </div>
            <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
              <input type="checkbox" checked={onlyNoAds} onChange={e => setOnlyNoAds(e.target.checked)} className="accent-orange-500"/> Só sem anúncio
            </label>
          </div>
        </div>
        {recs == null ? (
          <div className="flex items-center justify-center py-10 text-slate-300"><Loader2 className="animate-spin"/></div>
        ) : recList.length === 0 ? (
          <div className="p-5"><EmptyState icon={Sparkles} title="Nenhum produto nesse filtro"/></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-px bg-slate-100">
            {recList.map(r => (
              <div key={r.item_id} className="bg-white p-3.5 flex items-center gap-3">
                {r.thumbnail ? <img src={r.thumbnail} alt="" className="w-12 h-12 rounded-lg object-cover border border-slate-100"/> : <div className="w-12 h-12 rounded-lg bg-slate-100"/>}
                <div className="min-w-0 flex-1">
                  <Link to={`/shopee/item/${r.item_id}`} className="text-sm text-slate-700 hover:text-orange-600 line-clamp-2 leading-snug">{r.title || `Item ${r.item_id}`}</Link>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {r.price != null && <span className="text-[11px] text-slate-500">{fmtMoney(r.price)}</span>}
                    {(r.tags || []).map(t => {
                      const cfg = TAG_LABEL[t] || { label: t, cls: 'bg-slate-50 text-slate-500 border-slate-200' }
                      return <span key={t} className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${cfg.cls}`}>{cfg.label}</span>
                    })}
                    {r.advertised && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">já anunciado</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="text-[11px] text-slate-400">{HELP.gmv}</p>
    </div>
  )
}
