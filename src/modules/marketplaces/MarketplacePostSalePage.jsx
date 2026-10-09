import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  LifeBuoy, Loader2, RefreshCw, Clock, User, ArrowRight, PackageOpen, Hourglass, CheckCircle2, ShieldAlert,
  Undo2, Info, Package, Search, X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { usePermissions } from '../../contexts/PermissionsContext'
import { StatTile, fmtInt } from '../dashboard/widgets'
import { PLAT, PLATFORMS, usePlatformFilter, PlatformFilter, PlatBadge, Segmented, norm, fetchAll } from './shared'
import { TYPE as ML_TYPE, WHO as ML_WHO, RETURN as ML_RETURN, reasonLabel as mlReason, isCancel, wonByUs, covered, mustAct } from '../ml-insights/MlClaimsPage'
import { STATUS_LABELS as SH_STATUS, REASON_LABELS as SH_REASON, LOGISTICS_LABELS as SH_LOG, itemBack, deadlineOf, outcomeOf } from '../shopee-insights/ShopeeReturnsPage'

// Pós-venda unificado (Fase 2 da unificação, 09/10): Reclamações do ML
// (`ml_claims`) + Devoluções da Shopee (`shopee_returns` +
// `shopee_return_receipts`) numa lista só, com o próximo passo/prazo de
// cada caso e o resultado dos encerrados. Cruzamento: motivo agrupado em
// categorias comuns às duas plataformas e produto do sistema pelo SKU
// (soma ML + Shopee). As ações (responder, aceitar, disputar, registrar
// recebimento) continuam na tela de cada plataforma — o botão leva direto
// ao caso. Sem R$.

const DAYS = 90
const TZ = 'America/Sao_Paulo'
const fmtDate = iso => iso ? new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' }).format(new Date(iso)) : '—'
function countdown(iso) {
  if (!iso) return null
  const h = (new Date(iso) - Date.now()) / 3600000
  if (h < 0) return { text: `venceu em ${fmtDate(iso)}`, tone: 'text-rose-600' }
  if (h < 24) return { text: `vence HOJE`, tone: 'text-rose-600' }
  const d = Math.ceil(h / 24)
  return { text: `vence em ${d} dia${d > 1 ? 's' : ''} (${fmtDate(iso)})`, tone: d <= 2 ? 'text-orange-600' : 'text-slate-500' }
}

// Motivos das duas plataformas agrupados em categorias comuns
const CATS = {
  arrependimento: { label: 'Se arrependeu / mudou de ideia', codes: ['repentant_buyer', 'CHANGE_MIND'] },
  defeito:        { label: 'Quebrado, danificado ou com defeito', codes: ['broken_item', 'not_working_item', 'broken_or_in_bad_condition', 'BROKEN_PRODUCTS', 'PHYSICAL_DMG', 'FUNCTIONAL_DMG', 'DAMAGED_OTHERS'] },
  faltando:       { label: 'Faltando peça, item ou caixa vazia', codes: ['missing_accessories', 'empty_box', 'damaged_package_missing_item', 'ITEM_MISSING', 'MISSING_PARTS'] },
  diferente:      { label: 'Diferente do anúncio / produto errado', codes: ['different_item', 'WRONG_ITEM', 'DIFFERENT_DESCRIPTION', 'EXPECTATION_FAILED', 'WRONG_DAMAGED_PRODUCT'] },
  nao_serviu:     { label: 'Não serviu / tamanho', codes: ['ITEM_NOT_FIT'] },
  nao_recebeu:    { label: 'Diz que não recebeu', codes: ['delivered_but_not_receive_package', 'NOT_RECEIPT'] },
  outros:         { label: 'Outros', codes: [] },
}
const catOf = code => Object.keys(CATS).find(k => CATS[k].codes.includes(code)) || 'outros'

const OUTCOME = {
  nosso:     { label: 'A favor da CoisaPet', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200', bar: '#10b981' },
  coberto:   { label: 'Coberto pela plataforma', tone: 'bg-sky-50 text-sky-700 border-sky-200', bar: '#38bdf8', hint: 'o comprador foi atendido, mas quem pagou foi o ML/Shopee' },
  comprador: { label: 'A favor do comprador', tone: 'bg-rose-50 text-rose-700 border-rose-200', bar: '#f43f5e' },
  neutro:    { label: 'Encerrada', tone: 'bg-slate-100 text-slate-500 border-slate-200', bar: '#cbd5e1' },
}

// ── Normalização: um formato só pras duas plataformas ─────────────────
function fromMl(c) {
  const it = c.order_info?.items?.[0]
  const open = c.status === 'opened'
  return {
    platform: 'ml', key: `ml|${c.id}`, id: String(c.id), link: `/ml/reclamacoes?id=${c.id}`,
    kind: ML_TYPE[c.type]?.label || c.type, cancelBeforeDelivery: isCancel(c),
    title: it?.title || (isCancel(c) ? 'Cancelamento antes da entrega' : `Venda ${c.order_id}`), variation: it?.variation || null, qty: it?.qty || null,
    thumb: it?.thumbnail || null, skus: (c.order_info?.items || []).map(i => i.sku).filter(Boolean),
    buyer: c.order_info?.buyer || null, reason: mlReason(c), reasonCode: c.reason_name, buyerText: c.problem && c.problem !== mlReason(c) ? c.problem : null,
    created: c.date_created, open,
    stage: c.detail_title || (c.stage === 'dispute' ? 'Em mediação' : 'Aberta'),
    next: open ? { label: ML_WHO[c.action_responsible]?.label || 'Em andamento', at: c.due_date, ours: mustAct(c) } : null,
    returnText: c.return_info?.status ? ML_RETURN[c.return_info.status] || c.return_info.status : null,
    productBack: c.return_info?.status === 'delivered',
    outcome: open ? null : wonByUs(c) ? 'nosso' : covered(c) ? 'coberto' : c.resolution ? 'comprador' : 'neutro',
  }
}
function fromShopee(r, rec) {
  const it = (r.items || [])[0]
  const v = it && (r.variations?.[String(it.model_id)] || (it.variation_sku ? { sku: it.variation_sku } : null))
  const o = outcomeOf(r)
  const open = o === 'open'
  const d = deadlineOf(r)
  const back = itemBack(r)
  return {
    platform: 'shopee', key: `shopee|${r.return_sn}`, id: r.return_sn, link: `/shopee/retornos?sn=${r.return_sn}`,
    kind: r.return_solution === 1 ? 'Só reembolso' : 'Devolução', cancelBeforeDelivery: false,
    title: it?.name || `Pedido ${r.order_sn}`, variation: v?.name || null, qty: it?.amount || null,
    thumb: v?.image || it?.images?.[0] || null, skus: [v?.sku, ...Object.values(r.variations || {}).map(x => x.sku)].filter(Boolean).slice(0, 1),
    buyer: r.buyer_username || null, reason: SH_REASON[r.reason] || r.reason || 'Motivo não informado', reasonCode: r.reason, buyerText: r.text_reason || null,
    created: r.create_time, open,
    stage: SH_STATUS[r.status] || r.status,
    next: open ? (d ? { label: d.label, at: d.at, ours: d.ours } : { label: 'Em análise', at: null, ours: false }) : null,
    returnText: r.reverse_logistics_status && r.reverse_logistics_status !== 'LOGISTICS_NOT_STARTED' ? SH_LOG[r.reverse_logistics_status] || r.reverse_logistics_status : null,
    productBack: back && (!rec || rec.status === 'aguardando'),
    outcome: open ? null : o === 'kept' ? 'nosso' : o === 'compensated' ? 'coberto' : o === 'refunded' ? 'comprador' : 'neutro',
  }
}

function CaseRow({ c }) {
  const { canAccess } = usePermissions()
  const P = PLAT[c.platform]
  const canOpen = canAccess(c.platform === 'ml' ? 'ml-reclamacoes' : 'shopee-retornos')
  const due = c.next?.at ? countdown(c.next.at) : null
  return (
    <div className={`rounded-2xl border bg-white overflow-hidden ${c.next?.ours ? 'border-rose-300 ring-2 ring-rose-100' : c.productBack ? 'border-amber-300' : 'border-slate-200'}`}
      style={{ boxShadow: `inset 4px 0 0 ${P.color}` }}>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3 p-4 pl-5">
        <div className="flex gap-3 min-w-0">
          {c.thumb ? <img src={c.thumb} alt="" className="w-14 h-14 rounded-lg object-cover bg-slate-100 shrink-0" loading="lazy" /> : <span className="w-14 h-14 rounded-lg bg-slate-100 shrink-0 flex items-center justify-center text-slate-300"><Package size={18} /></span>}
          <div className="min-w-0 flex flex-col gap-1">
            <div className="flex items-center gap-2 flex-wrap text-[11px]">
              <PlatBadge p={c.platform} />
              <span className="font-bold text-slate-600">{c.kind}</span>
              <span className="text-slate-400">aberta em {fmtDate(c.created)}</span>
            </div>
            <p className="font-semibold text-slate-800 leading-snug">{c.title}</p>
            {(c.variation || c.qty > 1) && <p className="text-[11px] text-slate-500">{[c.variation, c.qty > 1 ? `${c.qty} un.` : null].filter(Boolean).join(' · ')}</p>}
            <p className="text-[13px] text-slate-700"><span className="font-semibold">{c.reason}</span>{c.buyerText && <span className="text-slate-500"> — "{c.buyerText}"</span>}</p>
            {c.buyer && <p className="text-[11px] text-slate-400 flex items-center gap-1"><User size={11} />{c.buyer}</p>}
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 flex flex-col gap-1.5">
          <p className="text-[13px] font-bold text-slate-800 leading-snug">{c.stage}</p>
          {c.next && <p className={`text-xs font-semibold ${c.next.ours ? 'text-rose-600' : 'text-slate-600'}`}>{c.next.ours ? '⚠ ' : ''}{c.next.label}</p>}
          {due && <p className={`text-xs font-semibold flex items-center gap-1 ${due.tone}`}><Clock size={11} />{due.text}</p>}
          {c.returnText && <p className="text-xs text-slate-600 flex items-center gap-1"><Undo2 size={11} />{c.returnText}</p>}
          {c.productBack && <p className="text-xs font-bold text-amber-700 flex items-center gap-1"><PackageOpen size={12} />Produto voltou — conferir e registrar</p>}
          {canOpen
            ? <Link to={c.link} className="btn-secondary py-1.5 text-xs justify-center mt-1">Abrir {c.platform === 'ml' ? 'nas Reclamações ML' : 'nos Retornos Shopee'} <ArrowRight size={12} /></Link>
            : <p className="text-[10px] text-slate-400 mt-1">Você não tem acesso à tela de {c.platform === 'ml' ? 'Reclamações ML' : 'Retornos Shopee'}.</p>}
        </div>
      </div>
    </div>
  )
}

export function MarketplacePostSalePage() {
  const [plat, setPlat] = usePlatformFilter()
  const [raw, setRaw] = useState(null)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState('open')
  const [showCancels, setShowCancels] = useState(false)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    const since = new Date(Date.now() - DAYS * 86400e3).toISOString()
    try {
      const [ml, sh, rec, prods, sync] = await Promise.all([
        fetchAll(() => supabase.from('ml_claims').select('id, order_id, type, stage, status, reason_name, reason_text, problem, detail_title, due_date, action_responsible, our_actions, resolution, return_info, order_info, date_created, last_updated').order('date_created', { ascending: false })),
        fetchAll(() => supabase.from('shopee_returns').select('return_sn, order_sn, status, reason, text_reason, create_time, due_date, return_seller_due_date, return_ship_due_date, return_solution, reverse_logistics_status, buyer_username, items, variations, compensation_amount, tracking_number').or(`create_time.gte.${since},status.in.(REQUESTED,PROCESSING,JUDGING,SELLER_DISPUTE)`).order('create_time', { ascending: false })),
        fetchAll(() => supabase.from('shopee_return_receipts').select('return_sn, status')),
        fetchAll(() => supabase.from('products').select('id, sku, name, parent_product_id')),
        supabase.from('ml_claims_sync').select('synced_at').eq('id', 'default').maybeSingle(),
      ])
      setRaw({ ml, sh, rec, prods, mlSync: sync.data?.synced_at })
    } catch (e) { toast.error('Erro ao carregar: ' + e.message); setRaw({ ml: [], sh: [], rec: [], prods: [] }) }
  }, [])
  useEffect(() => { load() }, [load])

  async function refresh() {
    setBusy(true)
    try {
      await supabase.functions.invoke('ml-claims', { body: { action: 'sync' } })
      await supabase.functions.invoke('shopee-insights', { body: { action: 'returns_sync', full: false, detail_limit: 60 } }).catch(() => {})
      await load()
      toast.success('Atualizado')
    } catch (e) { toast.error('Erro ao atualizar: ' + e.message) } finally { setBusy(false) }
  }

  const cases = useMemo(() => {
    if (!raw) return []
    const recBy = Object.fromEntries((raw.rec || []).map(r => [r.return_sn, r]))
    const since = Date.now() - DAYS * 86400e3
    return [
      ...raw.ml.map(fromMl),
      ...raw.sh.map(r => fromShopee(r, recBy[r.return_sn])),
    ].filter(c => c.open || new Date(c.created).getTime() >= since)
  }, [raw])

  // SKU → produto "pai" do sistema (variações somam no produto)
  const productOf = useMemo(() => {
    const bySku = {}, byId = {}
    for (const p of raw?.prods || []) { byId[p.id] = p; if (p.sku) bySku[norm(p.sku)] = p }
    return c => {
      for (const s of c.skus) { const p = bySku[norm(s)]; if (p) { const parent = p.parent_product_id ? byId[p.parent_product_id] : null; return parent || p } }
      return null
    }
  }, [raw])

  const plats = plat ? [plat] : PLATFORMS
  const q = norm(search)
  const inScope = cases.filter(c => plats.includes(c.platform) && (showCancels || !c.cancelBeforeDelivery) && (!q || norm(`${c.title} ${c.buyer} ${c.id} ${c.reason}`).includes(q)))
  const open = inScope.filter(c => c.open).sort((a, b) => Number(b.next?.ours) - Number(a.next?.ours) || Number(b.productBack) - Number(a.productBack) || (a.next?.at || '9').localeCompare(b.next?.at || '9'))
  const closed = inScope.filter(c => !c.open).sort((a, b) => (b.created || '').localeCompare(a.created || ''))
  const ours = open.filter(c => c.next?.ours).length
  const back = open.filter(c => c.productBack).length
  const outcomeCount = k => closed.filter(c => c.outcome === k).length
  const countsPlat = { ml: cases.filter(c => c.platform === 'ml' && c.open && (showCancels || !c.cancelBeforeDelivery)).length, shopee: cases.filter(c => c.platform === 'shopee' && c.open).length }

  const byCat = useMemo(() => {
    const m = Object.fromEntries(Object.keys(CATS).map(k => [k, { ml: 0, shopee: 0 }]))
    inScope.filter(c => !c.cancelBeforeDelivery).forEach(c => { m[catOf(c.reasonCode)][c.platform]++ })
    return Object.entries(m).filter(([, v]) => v.ml + v.shopee > 0).sort((a, b) => (b[1].ml + b[1].shopee) - (a[1].ml + a[1].shopee))
  }, [inScope]) // eslint-disable-line react-hooks/exhaustive-deps

  const byProduct = useMemo(() => {
    const m = {}
    inScope.filter(c => !c.cancelBeforeDelivery).forEach(c => {
      const p = productOf(c)
      const k = p ? `p:${p.id}` : `t:${c.platform}|${norm(c.title)}`
      m[k] ||= { name: p?.name || c.title, linked: !!p, thumb: c.thumb, ml: 0, shopee: 0, cats: {} }
      m[k][c.platform]++
      const cat = catOf(c.reasonCode); m[k].cats[cat] = (m[k].cats[cat] || 0) + 1
    })
    return Object.values(m).sort((a, b) => (b.ml + b.shopee) - (a.ml + a.shopee)).slice(0, 12)
  }, [inScope, productOf]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#FFE600] to-[#EE4D2D] flex items-center justify-center shrink-0 shadow-sm"><LifeBuoy size={20} className="text-white" /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Pós-venda</h1>
            <p className="text-sm text-slate-500">Reclamações do Mercado Livre e devoluções da Shopee num lugar só · últimos {DAYS} dias + tudo que está aberto</p>
          </div>
        </div>
        <button onClick={refresh} disabled={busy} className="btn-primary py-1.5 text-sm disabled:opacity-60">{busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} {busy ? 'Buscando nas plataformas…' : 'Atualizar agora'}</button>
      </div>

      <div className="card !p-3 flex items-center gap-3 flex-wrap">
        <PlatformFilter value={plat} onChange={setPlat} counts={countsPlat} />
        <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 h-9 flex-1 min-w-[200px] max-w-sm bg-white focus-within:border-slate-400">
          <Search size={14} className="text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Produto, comprador, motivo ou nº…" className="bg-transparent outline-none text-sm w-full placeholder:text-slate-400" />
          {search && <button onClick={() => setSearch('')} className="text-slate-400"><X size={13} /></button>}
        </div>
        <label className="ml-auto flex items-center gap-2 text-xs text-slate-500 cursor-pointer"><input type="checkbox" checked={showCancels} onChange={e => setShowCancels(e.target.checked)} />Incluir cancelamentos antes da entrega (ML)</label>
      </div>

      {!raw ? (
        <div className="card py-24 text-center"><Loader2 size={24} className="mx-auto animate-spin text-slate-300" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile icon={ShieldAlert} tone={open.length ? 'warning' : 'good'} label="Abertos agora" value={fmtInt(open.length)}
              detail={plat ? PLAT[plat].label : <span><span className="font-semibold" style={{ color: PLAT.ml.ink }}>ML {open.filter(c => c.platform === 'ml').length}</span> · <span className="font-semibold" style={{ color: PLAT.shopee.ink }}>Shopee {open.filter(c => c.platform === 'shopee').length}</span></span>} />
            <StatTile icon={Hourglass} tone={ours ? 'critical' : 'good'} label="Aguardando a CoisaPet" value={fmtInt(ours)} detail={ours ? 'responder, aceitar ou disputar dentro do prazo' : 'nada pendente do nosso lado'} />
            <StatTile icon={PackageOpen} tone={back ? 'warning' : 'neutral'} label="Produto voltou" value={fmtInt(back)} detail={back ? 'chegou de volta — conferir e registrar' : 'nenhuma devolução esperando conferência'} />
            <StatTile icon={CheckCircle2} tone="neutral" label={`Encerrados · ${DAYS} dias`} value={fmtInt(closed.length)}
              detail={closed.length ? (
                <span className="flex flex-col gap-1">
                  <span className="flex h-1.5 rounded-full overflow-hidden bg-slate-100 mt-0.5">{Object.entries(OUTCOME).map(([k, o]) => outcomeCount(k) > 0 && <span key={k} style={{ width: `${(outcomeCount(k) / closed.length) * 100}%`, background: o.bar }} title={`${o.label}: ${outcomeCount(k)}`} />)}</span>
                  <span>{outcomeCount('nosso')} a favor · {outcomeCount('coberto')} cobertos · {outcomeCount('comprador')} contra</span>
                </span>) : 'nada encerrado'} />
          </div>

          <div className="flex bg-slate-100 rounded-xl p-1 self-start">
            {[['open', `Abertos (${open.length})`], ['history', `Encerrados (${closed.length})`], ['ranking', 'Motivos e produtos']].map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className={`h-8 px-4 rounded-lg text-xs font-semibold ${tab === k ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{l}</button>
            ))}
          </div>

          {tab === 'open' && (
            <div className="flex flex-col gap-3">
              {!open.length && <div className="card py-16 text-center text-slate-400"><CheckCircle2 size={28} className="mx-auto mb-2 text-emerald-400" />Nenhum caso aberto. 🎉</div>}
              {open.map(c => <CaseRow key={c.key} c={c} />)}
            </div>
          )}

          {tab === 'history' && (
            <div className="card !p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-[13px] min-w-[900px]">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wide text-slate-400 text-left border-b border-slate-100">
                      <th className="pl-5 pr-2 py-2.5 font-semibold">Produto</th><th className="px-2 font-semibold">Motivo</th><th className="px-2 font-semibold">Tipo</th><th className="px-2 font-semibold">Aberto</th><th className="px-2 font-semibold">Resultado</th><th className="px-2 pr-5" />
                    </tr>
                  </thead>
                  <tbody>
                    {closed.map(c => (
                      <tr key={c.key} className="border-b border-slate-50 hover:bg-slate-50/60">
                        <td className="pl-0 pr-2 py-2" style={{ boxShadow: `inset 4px 0 0 ${PLAT[c.platform].color}` }}>
                          <div className="flex items-center gap-2.5 pl-5 max-w-[420px]">
                            {c.thumb ? <img src={c.thumb} alt="" className="w-9 h-9 rounded-lg object-cover bg-slate-100 shrink-0" loading="lazy" /> : <span className="w-9 h-9 rounded-lg bg-slate-100 shrink-0" />}
                            <div className="min-w-0"><p className="text-slate-700 truncate" title={c.title}>{c.title}</p><p className="text-[10px] flex items-center gap-1.5"><PlatBadge p={c.platform} />{c.variation && <span className="text-slate-400">{c.variation}</span>}</p></div>
                          </div>
                        </td>
                        <td className="px-2 text-slate-600">{c.reason}</td>
                        <td className="px-2 text-xs text-slate-500">{c.kind}</td>
                        <td className="px-2 text-xs text-slate-500 whitespace-nowrap">{fmtDate(c.created)}</td>
                        <td className="px-2"><span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${OUTCOME[c.outcome].tone}`} title={OUTCOME[c.outcome].hint}>{OUTCOME[c.outcome].label}</span></td>
                        <td className="px-2 pr-5 text-right"><Link to={c.link} className="text-slate-300 hover:text-sky-500" title="Abrir"><ArrowRight size={14} /></Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!closed.length && <p className="text-sm text-slate-400 text-center py-10">Nada encerrado no período.</p>}
              </div>
            </div>
          )}

          {tab === 'ranking' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="card">
                <p className="font-bold text-slate-800 text-[15px]">Por que reclamam</p>
                <p className="text-xs text-slate-400 mb-4">Motivos das duas plataformas agrupados · abertos + encerrados em {DAYS} dias</p>
                <div className="flex flex-col gap-3">
                  {byCat.map(([k, v]) => {
                    const tot = v.ml + v.shopee, max = byCat[0][1].ml + byCat[0][1].shopee
                    return (
                      <div key={k}>
                        <div className="flex items-center justify-between text-[13px]"><span className="text-slate-700">{CATS[k].label}</span><span className="font-black text-slate-800 tabular-nums">{tot}</span></div>
                        <div className="flex h-2 rounded-full overflow-hidden bg-slate-100 mt-1" style={{ width: `${Math.max(6, (tot / max) * 100)}%` }}>
                          {plats.map(p => v[p] > 0 && <div key={p} style={{ width: `${(v[p] / tot) * 100}%`, background: PLAT[p].bar }} title={`${PLAT[p].short}: ${v[p]}`} />)}
                        </div>
                        {!plat && <p className="text-[10px] text-slate-400 mt-0.5">ML {v.ml} · Shopee {v.shopee}</p>}
                      </div>
                    )
                  })}
                  {!byCat.length && <p className="text-sm text-slate-400">Sem dados.</p>}
                </div>
              </div>
              <div className="card">
                <p className="font-bold text-slate-800 text-[15px]">Produtos com mais problemas</p>
                <p className="text-xs text-slate-400 mb-4">Somando ML + Shopee pelo produto do sistema (SKU) · principal motivo de cada um</p>
                <div className="flex flex-col gap-3">
                  {byProduct.map((p, i) => {
                    const top = Object.entries(p.cats).sort((a, b) => b[1] - a[1])[0]
                    return (
                      <div key={p.name + i} className="flex items-center gap-3">
                        {p.thumb ? <img src={p.thumb} alt="" className="w-10 h-10 rounded-lg object-cover bg-slate-100 shrink-0" /> : <span className="w-10 h-10 rounded-lg bg-slate-100 shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] text-slate-700 truncate" title={p.name}>{p.name}</p>
                          <p className="text-[10px] text-slate-400">{top ? CATS[top[0]].label : ''}{!p.linked && ' · sem SKU ligado ao cadastro'}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {p.ml > 0 && <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-[#FFE600] text-[#2D3277] tabular-nums">ML {p.ml}</span>}
                          {p.shopee > 0 && <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-[#EE4D2D] text-white tabular-nums">Shopee {p.shopee}</span>}
                        </div>
                      </div>
                    )
                  })}
                  {!byProduct.length && <p className="text-sm text-slate-400">Sem dados.</p>}
                </div>
              </div>
            </div>
          )}

          <p className="text-[11px] text-slate-400 flex items-start gap-1.5"><Info size={12} className="shrink-0 mt-px" />
            <span>As ações (responder o comprador, aceitar, disputar, registrar o recebimento com fotos) continuam na tela de cada plataforma — o botão "Abrir" leva direto ao caso. "Coberto pela plataforma" = o comprador foi atendido, mas o custo ficou com o ML/Shopee. Reclamações do ML atualizam sozinhas a cada 30 min{raw.mlSync ? ` (última: ${new Date(raw.mlSync).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })})` : ''}.</span>
          </p>
        </>
      )}
    </div>
  )
}
