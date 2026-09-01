import { useState, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Rocket, RefreshCw, Loader2, AlertTriangle, ExternalLink, Truck, TrendingDown, Ghost, DollarSign, Boxes, Megaphone, HeartPulse } from 'lucide-react'
import { useMlInsights } from './hooks/useMlInsights'

function fmtMoney(v) {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Mesmo limite de "alto tráfego, baixa conversão" já usado em Tráfego &
// Conversão (visits >= 10 && conversion < 1%) — não reinventa outro
// critério pro mesmo diagnóstico aparecer em 2 telas diferentes.
function lowConversion(r) {
  return r.visits >= 10 && (r.conversion ?? 1) < 0.01
}

// Item parado de verdade: tem estoque, NUNCA vendeu no período analisado
// E já está anunciado há tempo suficiente pra isso não ser só "acabou de
// publicar, ainda não teve tempo". Diferente do candidato a relâmpago (em
// Promoções) — aquele é "vende pouco", este é "não vende nada".
const ZUMBI_MIN_DAYS = 60

function suggestedCauses(r, priceInfo) {
  const causes = []
  if (r.title_analysis && r.title_analysis.score < 70) causes.push('título fraco')
  if (!r.shipping?.free_shipping) causes.push('sem frete grátis')
  if (priceInfo?.price_to_win_status === 'competing') causes.push('perdendo buy box')
  if ((r.available_quantity ?? 0) === 0) causes.push('sem estoque')
  return causes
}

// Link do anúncio: sempre prefere o `permalink` real que a API devolve
// (é o mesmo padrão usado no resto do módulo ML) — o fallback construído
// só entra se o permalink não veio por algum motivo (item sem meta
// resolvida, erro pontual naquele lote).
function itemLink(r) {
  return r.permalink || `https://produto.mercadolivre.com.br/${r.item_id}`
}

function ItemRow({ r, right, tags }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-slate-50 rounded-lg px-3 py-2.5">
      <div className="min-w-0">
        <a href={itemLink(r)} target="_blank" rel="noreferrer"
          className="text-sm text-slate-700 hover:text-emerald-600 inline-flex items-center gap-1.5 min-w-0 truncate">
          {r.title || r.item_id}<ExternalLink size={11} className="text-slate-300 shrink-0"/>
        </a>
        {tags?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {tags.map(t => (
              <span key={t} className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">{t}</span>
            ))}
          </div>
        )}
      </div>
      <Link to={`/ml/saude/${r.item_id}`} title="Ajustar na Saúde do Anúncio"
        className="shrink-0 flex items-center gap-1 text-xs text-slate-400 hover:text-emerald-600 border border-slate-200 hover:border-emerald-300 rounded-lg px-2 py-1 transition-colors">
        <HeartPulse size={12}/> Ajustar
      </Link>
      <div className="text-right shrink-0">{right}</div>
    </div>
  )
}

function EmptyHint({ children }) {
  return <p className="text-sm text-slate-400">{children}</p>
}

export function MlOpportunitiesPage() {
  const { loading, progress, error, fetchTrafficAudit, fetchPriceScan, fetchAdsCoverage, fetchComboSuggestions } = useMlInsights()
  const [merged, setMerged] = useState(null) // null = nunca escaneado
  const [combos, setCombos] = useState(null) // null = nunca buscado
  const [combosLoading, setCombosLoading] = useState(false)
  const [tab, setTab] = useState('boost')

  const scan = useCallback(async () => {
    const [traffic, priceRows, adsData] = await Promise.all([
      fetchTrafficAudit(30),
      fetchPriceScan(),
      fetchAdsCoverage(),
    ])
    const priceMap = new Map(priceRows.map(p => [p.item_id, p]))
    const adsSet = new Set(adsData.item_ids || [])
    setMerged(traffic.map(r => ({ ...r, price_info: priceMap.get(r.item_id) || null, has_ads: adsSet.has(r.item_id) })))
  }, [fetchTrafficAudit, fetchPriceScan, fetchAdsCoverage])

  const searchCombos = useCallback(async () => {
    setCombosLoading(true)
    try {
      const data = await fetchComboSuggestions(180)
      setCombos(data)
    } catch { /* erro já fica em `error` do hook */ }
    finally { setCombosLoading(false) }
  }, [fetchComboSuggestions])

  const buckets = useMemo(() => {
    if (!merged) return null

    const boost = merged
      .filter(r => r.sales > 0 && !r.has_ads && (r.available_quantity ?? 0) > 0)
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 15)

    const freeShipping = merged
      .filter(r => r.sales > 0 && !r.shipping?.free_shipping)
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 15)

    const lowConv = merged
      .filter(lowConversion)
      .map(r => ({ ...r, causes: suggestedCauses(r, r.price_info) }))
      .sort((a, b) => b.visits - a.visits)
      .slice(0, 15)

    const zumbi = merged
      .filter(r => (r.available_quantity ?? 0) > 0 && r.sales === 0 && (r.days_listed ?? 0) >= ZUMBI_MIN_DAYS)
      .sort((a, b) => (b.days_listed ?? 0) - (a.days_listed ?? 0))
      .slice(0, 15)

    const pricePriority = merged
      .filter(r => r.price_info?.price_to_win_status === 'competing' && r.sales > 0)
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 15)

    return { boost, freeShipping, lowConv, zumbi, pricePriority }
  }, [merged])

  const TABS = [
    { key: 'boost',       icon: Megaphone,    label: 'Impulsionar',    count: buckets?.boost.length },
    { key: 'shipping',    icon: Truck,        label: 'Frete grátis',   count: buckets?.freeShipping.length },
    { key: 'conversion',  icon: TrendingDown, label: 'Baixa conversão', count: buckets?.lowConv.length },
    { key: 'zombie',      icon: Ghost,        label: 'Parado',         count: buckets?.zumbi.length },
    { key: 'price',       icon: DollarSign,   label: 'Preço',          count: buckets?.pricePriority.length },
    { key: 'combos',      icon: Boxes,        label: 'Combos',         count: combos?.results.length },
  ]

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shrink-0">
              <Rocket size={20} strokeWidth={1.5} className="text-white"/>
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-800">Oportunidades de Venda</h1>
              <p className="text-sm text-slate-500">Cruza tráfego, preço, frete e Ads pra sugerir onde vale mais a pena agir</p>
            </div>
          </div>
          <button onClick={scan} disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-xl disabled:opacity-60 transition-colors">
            {loading ? <Loader2 size={15} className="animate-spin"/> : <RefreshCw size={15}/>}
            {loading ? (progress ? `Analisando ${progress.done}/${progress.total}...` : 'Analisando...') : 'Analisar'}
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
            <AlertTriangle size={15}/> {error}
          </div>
        )}

        {/* Abas */}
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-all ${tab === t.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <t.icon size={13}/> {t.label}
              {t.count != null && <span className="text-slate-400">({t.count})</span>}
            </button>
          ))}
        </div>

        {tab === 'boost' && (
          merged === null ? (
            <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
              <Megaphone size={32} strokeWidth={1} className="mx-auto mb-3 text-slate-200"/>
              <p className="text-slate-500 mb-1">Nenhuma análise ainda</p>
              <p className="text-sm text-slate-400">Clique em "Analisar" — cruza a mesma varredura de Tráfego & Conversão com preço/buy box e cobertura de Ads.</p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs text-slate-400 mb-3">Já vendem de verdade nos últimos 30 dias, têm estoque, e ainda não têm nenhuma campanha de Ads ativa — maior chance de retorno pra quem for começar a investir em Ads agora.</p>
              {buckets.boost.length === 0 ? <EmptyHint>Nenhum candidato claro — ou já vende sem Ads mas está sem estoque, ou quem vende bem já está impulsionado.</EmptyHint> : (
                <div className="space-y-2">
                  {buckets.boost.map(r => (
                    <ItemRow key={r.item_id} r={r}
                      right={<><p className="text-sm font-bold text-slate-800">{r.sales} vendas/30d</p><p className="text-xs text-slate-400">{r.available_quantity} em estoque</p></>}/>
                  ))}
                </div>
              )}
            </div>
          )
        )}

        {tab === 'shipping' && (
          merged === null ? (
            <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
              <Truck size={32} strokeWidth={1} className="mx-auto mb-3 text-slate-200"/>
              <p className="text-slate-500 mb-1">Nenhuma análise ainda</p>
              <p className="text-sm text-slate-400">Clique em "Analisar" pra ver quem vende sem ter frete grátis.</p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs text-slate-400 mb-3">Vendem de verdade mas ainda não oferecem frete grátis — isso pesa bastante no ranking de busca do ML, vale revisar o custo de frete embutido no preço.</p>
              {buckets.freeShipping.length === 0 ? <EmptyHint>Todo mundo que vende já tem frete grátis.</EmptyHint> : (
                <div className="space-y-2">
                  {buckets.freeShipping.map(r => (
                    <ItemRow key={r.item_id} r={r}
                      right={<><p className="text-sm font-bold text-slate-800">{r.sales} vendas/30d</p><p className="text-xs text-slate-400">{r.shipping?.is_full ? 'Full' : 'sem frete grátis'}</p></>}/>
                  ))}
                </div>
              )}
            </div>
          )
        )}

        {tab === 'conversion' && (
          merged === null ? (
            <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
              <TrendingDown size={32} strokeWidth={1} className="mx-auto mb-3 text-slate-200"/>
              <p className="text-slate-500 mb-1">Nenhuma análise ainda</p>
              <p className="text-sm text-slate-400">Clique em "Analisar" pra ver quem tem tráfego mas não converte.</p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs text-slate-400 mb-3">Muita gente vê, poucos compram. Além do diagnóstico (já em Tráfego & Conversão), aqui cruza com os outros dados pra sugerir POR ONDE começar a mexer.</p>
              {buckets.lowConv.length === 0 ? <EmptyHint>Nenhum anúncio nesse padrão agora.</EmptyHint> : (
                <div className="space-y-2">
                  {buckets.lowConv.map(r => (
                    <ItemRow key={r.item_id} r={r} tags={r.causes.length ? r.causes : ['sem causa óbvia — vale olhar fotos/descrição']}
                      right={<p className="text-sm font-bold text-slate-800">{r.visits}v · {((r.conversion ?? 0) * 100).toFixed(1)}%</p>}/>
                  ))}
                </div>
              )}
            </div>
          )
        )}

        {tab === 'zombie' && (
          merged === null ? (
            <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
              <Ghost size={32} strokeWidth={1} className="mx-auto mb-3 text-slate-200"/>
              <p className="text-slate-500 mb-1">Nenhuma análise ainda</p>
              <p className="text-sm text-slate-400">Clique em "Analisar" pra ver quem não vende há muito tempo.</p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs text-slate-400 mb-3">{`Tem estoque disponível mas não vendeu NENHUMA unidade nos últimos 30 dias, e já está anunciado há ${ZUMBI_MIN_DAYS}+ dias — vale revisar (título, fotos, preço) ou considerar pausar.`}</p>
              {buckets.zumbi.length === 0 ? <EmptyHint>Nenhum anúncio parado nesse critério.</EmptyHint> : (
                <div className="space-y-2">
                  {buckets.zumbi.map(r => (
                    <ItemRow key={r.item_id} r={r}
                      right={<><p className="text-sm font-bold text-slate-800">{r.days_listed}d anunciado</p><p className="text-xs text-slate-400">{r.available_quantity} em estoque</p></>}/>
                  ))}
                </div>
              )}
            </div>
          )
        )}

        {tab === 'price' && (
          merged === null ? (
            <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
              <DollarSign size={32} strokeWidth={1} className="mx-auto mb-3 text-slate-200"/>
              <p className="text-slate-500 mb-1">Nenhuma análise ainda</p>
              <p className="text-sm text-slate-400">Clique em "Analisar" pra ver quem perde buy box e ainda vende bem.</p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs text-slate-400 mb-3">Perdendo buy box (concorrência com preço melhor) E com venda de verdade — ajustar preço aqui tem impacto imediato, diferente de perder buy box num anúncio que quase não vende.</p>
              {buckets.pricePriority.length === 0 ? <EmptyHint>Nenhum anúncio que vende está perdendo buy box agora.</EmptyHint> : (
                <div className="space-y-2">
                  {buckets.pricePriority.map(r => (
                    <ItemRow key={r.item_id} r={r}
                      right={<><p className="text-sm font-bold text-slate-800">{r.sales} vendas/30d</p><p className="text-xs text-rose-600">sugerido: {fmtMoney(r.price_info?.suggested_price)}</p></>}/>
                  ))}
                </div>
              )}
            </div>
          )
        )}

        {tab === 'combos' && (
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
              <p className="text-xs text-slate-400">Só do NOSSO histórico de pedidos (últimos 180 dias) — pares de produto que apareceram juntos no mesmo pedido pelo menos 3 vezes. Não confirma se os 2 anúncios ainda estão ativos.</p>
              <button onClick={searchCombos} disabled={combosLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-emerald-300 text-slate-600 text-xs font-medium rounded-lg disabled:opacity-50 transition-colors shrink-0">
                {combosLoading ? <Loader2 size={13} className="animate-spin"/> : <Boxes size={13}/>}
                Buscar
              </button>
            </div>

            {combos === null ? (
              <EmptyHint>Clique em "Buscar" pra cruzar o histórico de pedidos.</EmptyHint>
            ) : combos.results.length === 0 ? (
              <EmptyHint>Nenhum par com pelo menos 3 ocorrências juntas nos últimos 180 dias.</EmptyHint>
            ) : (
              <div className="space-y-2 mt-3">
                {combos.results.map((c, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 bg-slate-50 rounded-lg px-3 py-2.5">
                    <p className="text-sm text-slate-700 min-w-0 truncate">{c.titulo_a} <span className="text-slate-300">+</span> {c.titulo_b}</p>
                    <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full shrink-0">{c.count}x juntos</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
