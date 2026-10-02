import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import {
  Search, X, PauseCircle, PlayCircle, StopCircle, Wallet, Target, Loader2, ListChecks,
  ExternalLink, History, KeyRound, Sparkles, Clock, CalendarClock, Download, ArrowUpDown,
} from 'lucide-react'
import { useShopeeAds } from '../hooks/useShopeeAds'
import { useAuth } from '../../../contexts/AuthContext'
import { ConfirmWriteModal } from '../../ml-insights/ConfirmWriteModal'
import { InfoTooltip } from '../../ml-insights/InfoTooltip'
import {
  derive, fmtMoney, fmtNum, fmtPct, fmtRoas, fmtDayShort, fmtDateTime, fmtEpoch, todayISO, addDays,
  campaignStatusCfg, PLACEMENT_LABEL, BIDDING_LABEL, HELP, ChartTooltip, Legend, EmptyState,
  COLOR_SPEND, COLOR_SALES, SHOPEE_ORANGE, SELLER_ADS_URL, exportXlsx,
} from './adsUtils'

const STATUS_TABS = [
  { key: 'all',     label: 'Todas' },
  { key: 'ongoing', label: 'Em andamento' },
  { key: 'paused',  label: 'Pausadas' },
  { key: 'ended',   label: 'Encerradas' },
]
const SORTS = [
  { key: 'expense',   label: 'Gasto' },
  { key: 'broad_gmv', label: 'Vendas' },
  { key: 'roas',      label: 'ROAS' },
  { key: 'acos',      label: 'ACOS' },
  { key: 'broad_order', label: 'Pedidos' },
  { key: 'clicks',    label: 'Cliques' },
  { key: 'ctr',       label: 'CTR' },
  { key: 'budget',    label: 'Orçamento' },
]

const ACTION_LABEL = {
  pause: 'Pausar', resume: 'Retomar', stop: 'Encerrar', start: 'Iniciar',
  change_budget: 'Orçamento', change_roas_target: 'ROAS alvo', change_duration: 'Período', edit_keywords: 'Palavras-chave',
}

function roasTone(roas, target) {
  if (roas == null) return 'text-slate-400'
  if (target && roas < target) return 'text-rose-600'
  return 'text-emerald-700'
}

// ── Modal de edição (orçamento / ROAS alvo / data fim) ────────────────
function EditValueModal({ open, title, label, help, initial, step = '0.01', type = 'number', onCancel, onNext }) {
  const [v, setV] = useState(initial ?? '')
  useEffect(() => { setV(initial ?? '') }, [initial, open])
  if (!open) return null
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[55] p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <p className="text-base font-semibold text-slate-800">{title}</p>
        <div>
          <label className="text-xs font-semibold text-slate-500">{label}</label>
          <input type={type} step={step} value={v} onChange={e => setV(e.target.value)} autoFocus
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200"/>
          {help && <p className="text-[11px] text-slate-400 mt-1">{help}</p>}
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg">Cancelar</button>
          <button onClick={() => onNext(v)} disabled={v === '' || v == null}
            className="px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50" style={{ background: SHOPEE_ORANGE }}>Continuar</button>
        </div>
      </div>
    </div>
  )
}

// ── Painel lateral da campanha ─────────────────────────────────────────
function CampaignDrawer({ c, items, settings, onClose, onChanged }) {
  const ads = useShopeeAds()
  const { user } = useAuth()
  const d = derive(c.totals)
  const st = campaignStatusCfg(c.status)
  const target = settings?.target_roas != null ? Number(settings.target_roas) : null
  const isAutoBid = c.bidding_method === 'auto'

  const [hourly, setHourly] = useState(null)
  const [hourlyDay, setHourlyDay] = useState(todayISO())
  const [log, setLog] = useState([])
  const [roasRec, setRoasRec] = useState(null)
  const [kwRec, setKwRec] = useState(null)
  const [kwLoading, setKwLoading] = useState(false)
  const [editing, setEditing] = useState(null)   // 'budget' | 'roas' | 'end'
  const [confirm, setConfirm] = useState(null)   // { title, description, detail, payload }
  const [saving, setSaving] = useState(false)

  const mainItem = c.item_ids?.[0] || c.auto_products?.[0]?.item_id

  useEffect(() => {
    setHourly(null)
    ads.fetchCampaignHourly(c.campaign_id, hourlyDay).then(setHourly).catch(() => setHourly([]))
  }, [c.campaign_id, hourlyDay, ads.fetchCampaignHourly])
  useEffect(() => { ads.fetchActionsLog(c.campaign_id, 50).then(setLog).catch(() => {}) }, [c.campaign_id, ads.fetchActionsLog])
  useEffect(() => {
    if (!mainItem || !isAutoBid) return
    ads.fetchRecommendedRoi(mainItem).then(setRoasRec).catch(() => setRoasRec(null))
  }, [mainItem, isAutoBid, ads.fetchRecommendedRoi])

  const loadKeywords = () => {
    if (!mainItem) return
    setKwLoading(true)
    ads.fetchRecommendedKeywords(mainItem).then(r => setKwRec(r.keywords || [])).catch(e => toast.error(e.message)).finally(() => setKwLoading(false))
  }

  const daily = c.daily.map(x => ({ ...x, label: fmtDayShort(x.date) }))
  const hourlyData = Array.from({ length: 24 }, (_, h) => {
    const r = (hourly || []).find(x => Number(x.hour) === h)
    return { hour: `${String(h).padStart(2, '0')}h`, expense: r?.expense || 0, gmv: r?.broad_gmv || 0 }
  })

  const ask = (action, extra = {}, detail) => setConfirm({
    title: `${ACTION_LABEL[action] || action} — ${c.name}`,
    description: detail?.description || 'Confirme a alteração abaixo.',
    detail: detail?.node,
    payload: { campaign_id: c.campaign_id, ad_type: c.ad_type, edit_action: action, ...extra },
  })

  const run = async () => {
    setSaving(true)
    try {
      await ads.editCampaign({ ...confirm.payload, user_name: user?.name, before: { status: c.status, budget: c.budget, roas_target: c.roas_target, end_time: c.end_time } })
      toast.success('Campanha atualizada na Shopee!')
      setConfirm(null)
      onChanged()
      onClose()
    } catch (e) {
      toast.error(e.message, { duration: 8000 })
    } finally {
      setSaving(false)
    }
  }

  const productList = c.item_ids?.length
    ? c.item_ids.map(id => ({ item_id: id, ...(items[String(id)] || {}) }))
    : (c.auto_products || []).map(p => ({ ...p, ...(items[String(p.item_id)] || {}), title: items[String(p.item_id)]?.title || p.name }))

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="w-full max-w-3xl h-full bg-slate-50 overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Cabeçalho */}
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${st.badge}`}>{st.label}</span>
                <span className="text-[11px] text-slate-400">#{c.campaign_id} · {PLACEMENT_LABEL[c.placement] || c.placement || '—'}</span>
              </div>
              <p className="text-lg font-bold text-slate-800 mt-1 leading-snug">{c.name}</p>
              <p className="text-xs text-slate-500 mt-0.5">{BIDDING_LABEL[c.bidding_method] || c.bidding_method || '—'}</p>
            </div>
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"><X size={18}/></button>
          </div>

          {/* Ações */}
          <div className="flex items-center gap-2 flex-wrap mt-3">
            {c.status === 'ongoing' && (
              <button onClick={() => ask('pause', {}, { description: 'A campanha para de aparecer até ser retomada. O orçamento e as configurações ficam guardados.' })}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-lg">
                <PauseCircle size={14}/> Pausar
              </button>
            )}
            {c.status === 'paused' && (
              <button onClick={() => ask('resume', {}, { description: 'A campanha volta a rodar e a gastar crédito de Ads.' })}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg">
                <PlayCircle size={14}/> Retomar
              </button>
            )}
            {['ongoing', 'paused', 'scheduled'].includes(c.status) && (
              <>
                <button onClick={() => setEditing('budget')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg">
                  <Wallet size={14}/> Orçamento diário
                </button>
                {isAutoBid && c.ad_type !== 'auto' && (
                  <button onClick={() => setEditing('roas')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg">
                    <Target size={14}/> ROAS alvo
                  </button>
                )}
                <button onClick={() => setEditing('end')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg">
                  <CalendarClock size={14}/> Data de término
                </button>
                <button onClick={() => ask('stop', {}, { description: 'ENCERRAR é definitivo — a campanha não pode ser retomada depois (pra parar temporariamente use Pausar).' })}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 rounded-lg">
                  <StopCircle size={14}/> Encerrar
                </button>
              </>
            )}
            <a href={SELLER_ADS_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 ml-auto">
              Seller Center <ExternalLink size={12}/>
            </a>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Config atual */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              ['Orçamento/dia', c.budget === 0 ? 'Ilimitado' : fmtMoney(c.budget)],
              ['ROAS alvo', isAutoBid ? (c.roas_target ? fmtRoas(c.roas_target) : 'Automático') : '—'],
              ['Início', fmtEpoch(c.start_time) || '—'],
              ['Término', c.end_time ? fmtEpoch(c.end_time) : 'Sem data'],
            ].map(([l, v]) => (
              <div key={l} className="bg-white border border-slate-200 rounded-xl px-3 py-2.5">
                <p className="text-[10px] uppercase font-semibold text-slate-400">{l}</p>
                <p className="text-sm font-bold text-slate-800 mt-0.5">{v}</p>
              </div>
            ))}
          </div>

          {/* Métricas do período */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              ['Gasto', fmtMoney(d.expense), HELP.expense],
              ['Vendas por Ads', fmtMoney(d.broad_gmv), HELP.gmv],
              ['ROAS', fmtRoas(d.roas), HELP.roas, roasTone(d.roas, target)],
              ['ACOS', fmtPct(d.acos), HELP.acos],
              ['Pedidos', fmtNum(d.broad_order), HELP.orders],
              ['Cliques', fmtNum(d.clicks), HELP.clicks],
              ['CTR', fmtPct(d.ctr, 2), HELP.ctr],
              ['Custo/pedido', fmtMoney(d.cost_per_order), HELP.cost_per_order],
            ].map(([l, v, h, tone]) => (
              <div key={l} className="bg-white border border-slate-200 rounded-xl px-3 py-2.5">
                <div className="flex items-center gap-1"><p className="text-[10px] uppercase font-semibold text-slate-400">{l}</p><InfoTooltip source="nosso" text={h}/></div>
                <p className={`text-base font-bold mt-0.5 ${tone || 'text-slate-800'}`}>{v}</p>
              </div>
            ))}
          </div>

          {/* Diário */}
          {daily.length > 1 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <p className="text-sm font-semibold text-slate-700">Por dia no período</p>
                <Legend items={[{ label: 'Gasto', color: COLOR_SPEND }, { label: 'Vendas', color: COLOR_SALES }]}/>
              </div>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={daily} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9"/>
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} minTickGap={10}/>
                    <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} width={48} tickFormatter={v => `R$${fmtNum(v)}`}/>
                    <Tooltip content={<ChartTooltip/>} cursor={{ fill: '#F8FAFC' }}/>
                    <Bar dataKey="expense" name="Gasto" fill={COLOR_SPEND} radius={[4, 4, 0, 0]} maxBarSize={12}/>
                    <Bar dataKey="broad_gmv" name="Vendas" fill={COLOR_SALES} radius={[4, 4, 0, 0]} maxBarSize={12}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Por hora */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <div className="flex items-center gap-1.5"><Clock size={14} className="text-slate-400"/><p className="text-sm font-semibold text-slate-700">Por hora</p></div>
              <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
                {[[todayISO(), 'Hoje'], [addDays(todayISO(), -1), 'Ontem']].map(([k, l]) => (
                  <button key={k} onClick={() => setHourlyDay(k)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md ${hourlyDay === k ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>{l}</button>
                ))}
              </div>
            </div>
            <div className="h-40">
              {hourly == null ? (
                <div className="h-full flex items-center justify-center text-slate-300"><Loader2 className="animate-spin"/></div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourlyData} barGap={1}>
                    <XAxis dataKey="hour" tick={{ fontSize: 9, fill: '#94A3B8' }} axisLine={false} tickLine={false} interval={2}/>
                    <YAxis hide/>
                    <Tooltip content={<ChartTooltip/>} cursor={{ fill: '#F8FAFC' }}/>
                    <Bar dataKey="expense" name="Gasto" fill={COLOR_SPEND} radius={[3, 3, 0, 0]} maxBarSize={8}/>
                    <Bar dataKey="gmv" name="Vendas" fill={COLOR_SALES} radius={[3, 3, 0, 0]} maxBarSize={8}/>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Produtos */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <p className="text-sm font-semibold text-slate-700 mb-2">Produto(s) anunciado(s)</p>
            {productList.length === 0 ? <p className="text-xs text-slate-400">Nenhum produto informado pela Shopee.</p> : (
              <div className="space-y-2">
                {productList.map(p => (
                  <div key={p.item_id} className="flex items-center gap-3">
                    {p.thumbnail ? <img src={p.thumbnail} alt="" className="w-10 h-10 rounded-lg object-cover border border-slate-100"/> : <div className="w-10 h-10 rounded-lg bg-slate-100"/>}
                    <div className="min-w-0 flex-1">
                      <Link to={`/shopee/item/${p.item_id}`} className="text-sm text-slate-700 hover:text-orange-600 truncate block">{p.title || `Item ${p.item_id}`}</Link>
                      <p className="text-[11px] text-slate-400">#{p.item_id}{p.price != null ? ` · ${fmtMoney(p.price)}` : ''}{p.status ? ` · ${p.status}` : ''}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ROAS recomendado */}
          {isAutoBid && roasRec && (roasRec.exact || roasRec.lower_bound || roasRec.upper_bound) && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <div className="flex items-center gap-1.5 mb-2">
                <Sparkles size={14} className="text-violet-500"/>
                <p className="text-sm font-semibold text-slate-700">ROAS alvo recomendado pela Shopee</p>
                <InfoTooltip source="nosso" text="Sugestão da própria Shopee pra este produto. ROAS alvo MAIS ALTO = gasta menos e só aparece quando a chance de venda é maior (menos volume). MAIS BAIXO = mais exposição e mais vendas, com retorno menor por real."/>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[['Mais vendas', roasRec.lower_bound], ['Equilibrado', roasRec.exact], ['Mais retorno', roasRec.upper_bound]].map(([l, r]) => (
                  <div key={l} className="bg-slate-50 rounded-lg py-2">
                    <p className="text-[10px] uppercase text-slate-400 font-semibold">{l}</p>
                    <p className="text-base font-bold text-slate-800">{r?.value != null ? fmtRoas(r.value) : '—'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Palavras-chave */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
              <div className="flex items-center gap-1.5"><KeyRound size={14} className="text-slate-400"/><p className="text-sm font-semibold text-slate-700">Palavras-chave</p></div>
              {mainItem && (
                <button onClick={loadKeywords} disabled={kwLoading}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-violet-600 hover:text-violet-800 disabled:opacity-50">
                  {kwLoading ? <Loader2 size={12} className="animate-spin"/> : <Sparkles size={12}/>} Ver sugestões da Shopee
                </button>
              )}
            </div>
            {c.keywords.length === 0 ? (
              <p className="text-xs text-slate-400">{isAutoBid ? 'Campanha com lance automático — a Shopee escolhe as palavras-chave sozinha.' : 'Nenhuma palavra-chave cadastrada.'}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {c.keywords.map(k => (
                  <span key={k.keyword} className={`text-xs px-2 py-1 rounded-md border ${k.status === 'deleted' ? 'bg-slate-50 text-slate-300 border-slate-100 line-through' : 'bg-slate-50 text-slate-600 border-slate-200'}`}
                    title={`${k.match_type === 'exact' ? 'Exata' : 'Ampla'} · lance ${fmtMoney(k.bid)}`}>
                    {k.keyword} <span className="text-slate-400">{fmtMoney(k.bid)}</span>
                  </span>
                ))}
              </div>
            )}
            {kwRec && (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <p className="text-[11px] uppercase font-semibold text-slate-400 mb-1.5">Sugeridas pela Shopee pro produto</p>
                {kwRec.length === 0 ? <p className="text-xs text-slate-400">Sem sugestões.</p> : (
                  <table className="w-full text-xs">
                    <thead className="text-slate-400"><tr><th className="text-left font-semibold py-1">Palavra</th><th className="text-right font-semibold">Buscas</th><th className="text-right font-semibold">Qualidade</th><th className="text-right font-semibold">Lance sugerido</th></tr></thead>
                    <tbody className="divide-y divide-slate-50">
                      {kwRec.slice(0, 30).map(k => (
                        <tr key={k.keyword}><td className="py-1 text-slate-700">{k.keyword}</td><td className="text-right">{fmtNum(k.search_volume)}</td><td className="text-right">{k.quality_score ?? '—'}</td><td className="text-right">{fmtMoney(k.suggested_bid)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>

          {/* Histórico */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <div className="flex items-center gap-1.5 mb-2"><History size={14} className="text-slate-400"/><p className="text-sm font-semibold text-slate-700">Alterações feitas pelo sistema</p></div>
            {log.length === 0 ? <p className="text-xs text-slate-400">Nenhuma alteração feita por aqui ainda.</p> : (
              <ul className="space-y-1.5">
                {log.map(l => (
                  <li key={l.id} className="text-xs text-slate-600 flex items-center gap-2">
                    <span className="text-slate-400 w-28 shrink-0">{fmtDateTime(l.created_at)}</span>
                    <span className="font-semibold">{ACTION_LABEL[l.action] || l.action}</span>
                    {l.detail?.budget != null && <span>→ {fmtMoney(l.detail.budget)}/dia</span>}
                    {l.detail?.roas_target != null && <span>→ {fmtRoas(l.detail.roas_target)}</span>}
                    {l.detail?.end_date && <span>→ até {l.detail.end_date}</span>}
                    <span className="text-slate-400 ml-auto">{l.user_name || '—'}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <EditValueModal open={editing === 'budget'} title="Orçamento diário" label="Novo orçamento diário (R$)"
        help={`Atual: ${c.budget === 0 ? 'ilimitado' : fmtMoney(c.budget)}. É o máximo que a campanha pode gastar por dia.`}
        initial={c.budget || ''} onCancel={() => setEditing(null)}
        onNext={v => { setEditing(null); ask('change_budget', { budget: Number(v) }, { description: 'Muda o orçamento diário da campanha na Shopee.', node: <p className="text-sm text-slate-700">{c.budget === 0 ? 'Ilimitado' : fmtMoney(c.budget)} → <b>{fmtMoney(Number(v))}</b> por dia</p> }) }}/>
      <EditValueModal open={editing === 'roas'} title="ROAS alvo" label="Novo ROAS alvo (ex.: 8 = R$8 em vendas pra cada R$1)"
        help={`Atual: ${c.roas_target ? fmtRoas(c.roas_target) : 'automático'}.${roasRec?.exact?.value ? ` Recomendado pela Shopee: ${fmtRoas(roasRec.exact.value)}.` : ''}`}
        initial={c.roas_target || ''} step="0.1" onCancel={() => setEditing(null)}
        onNext={v => { setEditing(null); ask('change_roas_target', { roas_target: Number(v) }, { description: 'Muda o ROAS alvo — a Shopee ajusta os lances sozinha pra tentar bater esse retorno.', node: <p className="text-sm text-slate-700">{c.roas_target ? fmtRoas(c.roas_target) : 'automático'} → <b>{fmtRoas(Number(v))}</b></p> }) }}/>
      <EditValueModal open={editing === 'end'} title="Data de término" label="Rodar até (inclusive)" type="date" step={undefined}
        help="A Shopee não aceita data no passado. Pra rodar sem data de término, use o Seller Center."
        initial={addDays(todayISO(), 30)} onCancel={() => setEditing(null)}
        onNext={v => { setEditing(null); ask('change_duration', { start_date: todayISO(), end_date: v }, { description: 'Define até quando a campanha roda.', node: <p className="text-sm text-slate-700">Término: <b>{v.split('-').reverse().join('/')}</b></p> }) }}/>

      <ConfirmWriteModal open={!!confirm} title={confirm?.title} description={confirm?.description} detail={confirm?.detail}
        confirming={saving} onConfirm={run} onCancel={() => setConfirm(null)}
        platform="Shopee" confirmLabel="Sim, aplicar na Shopee"/>
    </div>
  )
}

export function AdsCampaignsTab({ camp, settings, range, onChanged }) {
  const [statusTab, setStatusTab] = useState('ongoing')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('expense')
  const [hideIdle, setHideIdle] = useState(false)
  const [open, setOpen] = useState(null)
  const campaigns = camp?.campaigns || []
  const items = camp?.items || {}
  const target = settings?.target_roas != null ? Number(settings.target_roas) : null
  const maxAcos = settings?.max_acos != null ? Number(settings.max_acos) / 100 : null

  const counts = useMemo(() => {
    const c = { all: campaigns.length }
    campaigns.forEach(x => { const k = ['ended', 'closed', 'deleted'].includes(x.status) ? 'ended' : x.status; c[k] = (c[k] || 0) + 1 })
    return c
  }, [campaigns])

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    return campaigns
      .map(c => ({ ...c, m: derive(c.totals) }))
      .filter(c => statusTab === 'all' || (statusTab === 'ended' ? ['ended', 'closed', 'deleted'].includes(c.status) : c.status === statusTab))
      .filter(c => !hideIdle || c.totals.expense > 0)
      .filter(c => !term || (c.name || '').toLowerCase().includes(term) || String(c.campaign_id).includes(term)
        || (c.item_ids || []).some(id => (items[String(id)]?.title || '').toLowerCase().includes(term)))
      .sort((a, b) => {
        const va = sort === 'budget' ? (a.budget || 0) : (a.m[sort] ?? -Infinity)
        const vb = sort === 'budget' ? (b.budget || 0) : (b.m[sort] ?? -Infinity)
        return sort === 'acos' ? (va === -Infinity ? 1 : vb === -Infinity ? -1 : va - vb) : vb - va
      })
  }, [campaigns, statusTab, hideIdle, q, sort, items])

  const total = derive(rows.reduce((t, c) => {
    Object.keys(c.totals).forEach(k => { t[k] = (t[k] || 0) + c.totals[k] })
    return t
  }, {}))

  const doExport = () => exportXlsx(`shopee-ads-campanhas_${range.start}_${range.end}.xlsx`, {
    Campanhas: rows.map(c => ({
      'ID': c.campaign_id, 'Campanha': c.name, 'Status': campaignStatusCfg(c.status).label,
      'Lance': c.bidding_method, 'Posição': PLACEMENT_LABEL[c.placement] || c.placement,
      'Orçamento/dia': c.budget, 'ROAS alvo': c.roas_target,
      'Gasto': c.m.expense, 'Vendas Ads': c.m.broad_gmv, 'Vendas diretas': c.m.direct_gmv,
      'ROAS': c.m.roas != null ? Number(c.m.roas.toFixed(2)) : null, 'ACOS %': c.m.acos != null ? Number((c.m.acos * 100).toFixed(2)) : null,
      'Pedidos': c.m.broad_order, 'Cliques': c.m.clicks, 'Impressões': c.m.impression,
      'CTR %': c.m.ctr != null ? Number((c.m.ctr * 100).toFixed(2)) : null, 'CPC': c.m.cpc != null ? Number(c.m.cpc.toFixed(2)) : null,
    })),
  })

  if (!camp) return <EmptyState icon={ListChecks} title="Sem dados de campanhas" text="Não foi possível carregar as campanhas — tente Atualizar."/>

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5">
          {STATUS_TABS.map(t => (
            <button key={t.key} onClick={() => setStatusTab(t.key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md ${statusTab === t.key ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-800'}`}>
              {t.label} <span className="opacity-60">{counts[t.key] || 0}</span>
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar campanha ou produto…"
            className="w-full pl-8 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-100"/>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <ArrowUpDown size={13}/>
          <select value={sort} onChange={e => setSort(e.target.value)} className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs">
            {SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
          <input type="checkbox" checked={hideIdle} onChange={e => setHideIdle(e.target.checked)} className="accent-orange-500"/> Só com gasto no período
        </label>
        <button onClick={doExport} className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg">
          <Download size={13}/> Exportar Excel
        </button>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={ListChecks} title="Nenhuma campanha nesse filtro"/>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
          <table className="w-full text-sm min-w-[1100px]">
            <thead className="bg-slate-50 text-[11px] uppercase text-slate-400">
              <tr>
                <th className="text-left font-semibold px-4 py-2.5">Campanha</th>
                <th className="text-right font-semibold px-3 py-2.5">Orç./dia</th>
                <th className="text-right font-semibold px-3 py-2.5">ROAS alvo</th>
                <th className="text-right font-semibold px-3 py-2.5">Gasto</th>
                <th className="text-right font-semibold px-3 py-2.5">Vendas</th>
                <th className="text-right font-semibold px-3 py-2.5">ROAS</th>
                <th className="text-right font-semibold px-3 py-2.5">ACOS</th>
                <th className="text-right font-semibold px-3 py-2.5">Pedidos</th>
                <th className="text-right font-semibold px-3 py-2.5">Cliques</th>
                <th className="text-right font-semibold px-3 py-2.5">CTR</th>
                <th className="text-right font-semibold px-4 py-2.5">CPC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(c => {
                const st = campaignStatusCfg(c.status)
                const thumb = items[String(c.item_ids?.[0])]?.thumbnail
                const noSales = c.totals.expense >= 10 && c.totals.broad_gmv === 0
                return (
                  <tr key={c.campaign_id} onClick={() => setOpen(c)} className="hover:bg-orange-50/40 cursor-pointer">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {thumb ? <img src={thumb} alt="" className="w-9 h-9 rounded-md object-cover border border-slate-100 shrink-0"/> : <div className="w-9 h-9 rounded-md bg-slate-100 shrink-0"/>}
                        <div className="min-w-0">
                          <p className="truncate max-w-[360px] text-slate-700 font-medium">{c.name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${st.badge}`}>{st.label}</span>
                            <span className="text-[10px] text-slate-400">{c.bidding_method === 'auto' ? 'Lance auto' : 'Lance manual'} · {PLACEMENT_LABEL[c.placement] || '—'}</span>
                            {noSales && <span className="text-[10px] font-bold text-rose-600">gastando sem vender</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-600">{c.budget === 0 ? '∞' : fmtMoney(c.budget)}</td>
                    <td className="px-3 py-2.5 text-right text-slate-600">{c.roas_target ? fmtRoas(c.roas_target) : '—'}</td>
                    <td className="px-3 py-2.5 text-right text-slate-800 font-medium">{fmtMoney(c.m.expense)}</td>
                    <td className="px-3 py-2.5 text-right text-slate-800">{fmtMoney(c.m.broad_gmv)}</td>
                    <td className={`px-3 py-2.5 text-right font-semibold ${roasTone(c.m.roas, target)}`}>{fmtRoas(c.m.roas)}</td>
                    <td className={`px-3 py-2.5 text-right ${maxAcos && c.m.acos > maxAcos ? 'text-rose-600 font-semibold' : 'text-slate-600'}`}>{fmtPct(c.m.acos)}</td>
                    <td className="px-3 py-2.5 text-right text-slate-600">{fmtNum(c.m.broad_order)}</td>
                    <td className="px-3 py-2.5 text-right text-slate-600">{fmtNum(c.m.clicks)}</td>
                    <td className="px-3 py-2.5 text-right text-slate-600">{fmtPct(c.m.ctr, 2)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{fmtMoney(c.m.cpc)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="bg-slate-50 font-semibold text-slate-700 text-sm">
              <tr>
                <td className="px-4 py-2.5">Total ({rows.length})</td>
                <td className="px-3 py-2.5 text-right">{fmtMoney(rows.filter(c => c.status === 'ongoing').reduce((s, c) => s + (c.budget || 0), 0))}</td>
                <td/>
                <td className="px-3 py-2.5 text-right">{fmtMoney(total.expense)}</td>
                <td className="px-3 py-2.5 text-right">{fmtMoney(total.broad_gmv)}</td>
                <td className={`px-3 py-2.5 text-right ${roasTone(total.roas, target)}`}>{fmtRoas(total.roas)}</td>
                <td className="px-3 py-2.5 text-right">{fmtPct(total.acos)}</td>
                <td className="px-3 py-2.5 text-right">{fmtNum(total.broad_order)}</td>
                <td className="px-3 py-2.5 text-right">{fmtNum(total.clicks)}</td>
                <td className="px-3 py-2.5 text-right">{fmtPct(total.ctr, 2)}</td>
                <td className="px-4 py-2.5 text-right">{fmtMoney(total.cpc)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="text-[11px] text-slate-400">
        ROAS em vermelho = abaixo da meta {target ? `(${fmtRoas(target)})` : ''}; ACOS em vermelho = acima do máximo {settings?.max_acos != null ? `(${fmtNum(settings.max_acos, 1)}%)` : ''}. Metas configuráveis na aba Créditos → Configurações. Clique numa campanha pra ver detalhes e editar.
      </p>

      {open && <CampaignDrawer c={open} items={items} settings={settings} onClose={() => setOpen(null)} onChanged={onChanged}/>}
    </div>
  )
}
