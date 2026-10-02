import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import {
  Wallet, Plus, Loader2, ExternalLink, Pencil, Trash2, Settings2, Save, CalendarClock,
  Zap, Scale, PiggyBank, RefreshCw, X, Gift, Receipt,
} from 'lucide-react'
import { useShopeeAds } from '../hooks/useShopeeAds'
import { useAuth } from '../../../contexts/AuthContext'
import { InfoTooltip } from '../../ml-insights/InfoTooltip'
import {
  fmtMoney, fmtNum, fmtDate, fmtDateTime, todayISO, addDays, daysBetween,
  KpiCard, ChartTooltip, Legend, HELP, COLOR_SPEND, COLOR_SALES, SHOPEE_ORANGE, SELLER_ADS_URL, exportXlsx,
} from './adsUtils'

const TIPOS = [
  { key: 'recarga',            label: 'Recarga' },
  { key: 'recarga_automatica', label: 'Recarga automática' },
  { key: 'bonus',              label: 'Bônus / crédito grátis' },
  { key: 'estorno',            label: 'Estorno / reembolso' },
  { key: 'ajuste',             label: 'Ajuste' },
]
const TIPO_LABEL = Object.fromEntries(TIPOS.map(t => [t.key, t.label]))
const FORMAS = ['Pix', 'Cartão de crédito', 'Boleto', 'Saldo da carteira Shopee', 'Outro']

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const monthLabel = (ym) => `${MONTHS[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`

// Crédito que entra no saldo de Ads: valor pago + bônus (estorno conta
// como entrada; "ajuste" pode ser negativo via observação — usa o valor).
const creditIn = (c) => Number(c.valor || 0) + Number(c.bonus || 0)

function CreditModal({ open, initial, categories, onClose, onSave }) {
  const empty = { data: todayISO(), tipo: 'recarga', valor: '', bonus: '', forma_pagamento: 'Pix', observacao: '' }
  const [f, setF] = useState(empty)
  const [launch, setLaunch] = useState(false)
  const [categoryId, setCategoryId] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!open) return
    setF(initial ? { ...empty, ...initial, bonus: initial.bonus || '' } : empty)
    setLaunch(false)
    const mkt = categories.find(c => /marketing|publicidade|propaganda|ads|anúncio/i.test(c.name))
    setCategoryId(mkt?.id || '')
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null
  const set = (k) => (e) => setF(p => ({ ...p, [k]: e.target.value }))
  const submit = async () => {
    if (!(Number(f.valor) > 0)) { toast.error('Informe o valor.'); return }
    setSaving(true)
    try { await onSave(f, { launchInFinance: launch, categoryId }) } finally { setSaving(false) }
  }
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-base font-semibold text-slate-800">{initial ? 'Editar lançamento' : 'Lançar recarga de crédito'}</p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18}/></button>
        </div>
        {!initial && (
          <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            A recarga em si (pagamento) é feita no Seller Center — a Shopee não permite recarregar pela API. Aqui fica o <b>registro</b> dela pro nosso controle.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-500">Data</label>
            <input type="date" value={f.data} onChange={set('data')} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"/>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Tipo</label>
            <select value={f.tipo} onChange={set('tipo')} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
              {TIPOS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Valor pago (R$)</label>
            <input type="number" step="0.01" min="0" value={f.valor} onChange={set('valor')} autoFocus className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"/>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 flex items-center gap-1">Bônus (R$) <InfoTooltip source="nosso" text="Crédito extra que a Shopee deu junto (promoção de recarga, cupom de Ads). Entra no saldo mas não sai do caixa."/></label>
            <input type="number" step="0.01" min="0" value={f.bonus} onChange={set('bonus')} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"/>
          </div>
          <div className="col-span-2">
            <label className="text-xs font-semibold text-slate-500">Forma de pagamento</label>
            <select value={f.forma_pagamento || ''} onChange={set('forma_pagamento')} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
              {FORMAS.map(x => <option key={x}>{x}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-xs font-semibold text-slate-500">Observação</label>
            <input value={f.observacao || ''} onChange={set('observacao')} placeholder="Ex.: campanha Black Friday" className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"/>
          </div>
        </div>
        {!initial && (
          <div className="border border-slate-200 rounded-lg px-3 py-2.5 space-y-2">
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" checked={launch} onChange={e => setLaunch(e.target.checked)} className="accent-orange-500"/>
              Lançar também no Financeiro (Contas a Pagar, já paga)
            </label>
            {launch && (
              <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
                <option value="">Sem categoria</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg">Cancelar</button>
          <button onClick={submit} disabled={saving} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm text-white rounded-lg disabled:opacity-60" style={{ background: SHOPEE_ORANGE }}>
            {saving && <Loader2 size={14} className="animate-spin"/>} Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

function SettingsCard({ settings, onSaved }) {
  const { saveSettings } = useShopeeAds()
  const { user } = useAuth()
  const [f, setF] = useState({})
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    setF({
      low_balance_threshold: settings?.low_balance_threshold ?? '',
      monthly_budget: settings?.monthly_budget ?? '',
      target_roas: settings?.target_roas ?? '',
      max_acos: settings?.max_acos ?? '',
    })
  }, [settings])
  const save = async () => {
    setSaving(true)
    try {
      const n = (v) => (v === '' || v == null ? null : Number(v))
      await saveSettings({
        low_balance_threshold: n(f.low_balance_threshold), monthly_budget: n(f.monthly_budget),
        target_roas: n(f.target_roas), max_acos: n(f.max_acos),
      }, user?.name)
      toast.success('Configurações salvas!')
      onSaved()
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }
  const fields = [
    ['low_balance_threshold', 'Alerta de saldo baixo (R$)', 'Quando o saldo ficar abaixo disso, o sino avisa admin/marketplace (checagem a cada 3h, no máx. 1 aviso por dia). Vazio = sem alerta.'],
    ['monthly_budget', 'Orçamento mensal de Ads (R$)', 'Nosso teto de gasto do mês — a Shopee não conhece esse número; serve pra acompanhar aqui se o mês vai estourar.'],
    ['target_roas', 'Meta de ROAS (x)', 'Campanha com ROAS abaixo disso aparece em vermelho e gera alerta na Visão Geral.'],
    ['max_acos', 'ACOS máximo (%)', 'Campanha com ACOS acima disso aparece em vermelho.'],
  ]
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <div className="flex items-center gap-1.5 mb-3"><Settings2 size={15} className="text-slate-400"/><p className="text-sm font-semibold text-slate-700">Configurações, metas e alertas</p></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {fields.map(([k, l, h]) => (
          <div key={k}>
            <label className="text-xs font-semibold text-slate-500 flex items-center gap-1">{l} <InfoTooltip source="nosso" text={h}/></label>
            <input type="number" step="0.01" value={f[k] ?? ''} onChange={e => setF(p => ({ ...p, [k]: e.target.value }))}
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"/>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
        <p className="text-[11px] text-slate-400">{settings?.updated_by_name ? `Última alteração: ${settings.updated_by_name} em ${fmtDateTime(settings.updated_at)}` : ''}</p>
        <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-slate-800 hover:bg-slate-900 rounded-lg disabled:opacity-60">
          {saving ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>} Salvar
        </button>
      </div>
    </div>
  )
}

export function AdsCreditsTab({ settings, onSettingsSaved, campaigns }) {
  const ads = useShopeeAds()
  const { user } = useAuth()
  const [balance, setBalance] = useState(null)
  const [history, setHistory] = useState([])
  const [credits, setCredits] = useState(null)
  const [spendDaily, setSpendDaily] = useState(null)
  const [categories, setCategories] = useState([])
  const [modal, setModal] = useState(null) // null | 'new' | credit
  const [loadingBal, setLoadingBal] = useState(false)

  const today = todayISO()
  const monthStart = `${today.slice(0, 7)}-01`

  const loadBalance = useCallback(() => {
    setLoadingBal(true)
    // Lê o saldo AO VIVO e já grava um ponto no histórico (no máx. 1/h)
    ads.snapshotBalance().then(setBalance).catch(e => setBalance({ error: e.message }))
      .finally(() => { setLoadingBal(false); ads.fetchBalanceHistory(120).then(setHistory).catch(() => {}) })
  }, [ads.snapshotBalance, ads.fetchBalanceHistory])

  const loadCredits = useCallback(() => ads.fetchCredits().then(setCredits).catch(e => { toast.error(e.message); setCredits([]) }), [ads.fetchCredits])

  useEffect(() => { loadBalance() }, [loadBalance])
  useEffect(() => { loadCredits() }, [loadCredits])
  useEffect(() => { ads.fetchExpenseCategories().then(setCategories) }, [ads.fetchExpenseCategories])

  // Gasto real diário: 6 meses pra trás, ou desde a 1ª recarga lançada
  // (pra conciliação), o que for mais antigo — teto de 400 dias.
  const firstCredit = credits?.length ? credits[credits.length - 1].data : null
  const spendStart = useMemo(() => {
    const sixMonths = `${addDays(today, -185).slice(0, 7)}-01`
    let s = firstCredit && firstCredit < sixMonths ? firstCredit : sixMonths
    if (s < addDays(today, -399)) s = addDays(today, -399)
    return s
  }, [firstCredit, today])
  useEffect(() => {
    if (credits == null) return
    ads.fetchShopDaily(spendStart, today).then(setSpendDaily).catch(() => setSpendDaily([]))
  }, [spendStart, today, credits == null, ads.fetchShopDaily]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Contas ──
  const spendBy = (from, to) => (spendDaily || []).filter(d => d.date >= from && d.date <= to).reduce((s, d) => s + d.expense, 0)
  const avg7 = spendDaily ? spendBy(addDays(today, -7), addDays(today, -1)) / 7 : null
  const avg30 = spendDaily ? spendBy(addDays(today, -30), addDays(today, -1)) / 30 : null
  const bal = balance?.total_balance
  const runwayDays = bal != null && avg7 > 0 ? bal / avg7 : null
  const dailyBudget = campaigns.filter(c => c.status === 'ongoing').reduce((s, c) => s + (Number(c.budget) || 0), 0)

  const monthSpend = spendDaily ? spendBy(monthStart, today) : null
  const daysInMonth = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0).getDate()
  const dayOfMonth = Number(today.slice(8, 10))
  const monthProjection = monthSpend != null ? (monthSpend / dayOfMonth) * daysInMonth : null
  const monthlyBudget = settings?.monthly_budget != null ? Number(settings.monthly_budget) : null
  const monthCredits = (credits || []).filter(c => c.data >= monthStart).reduce((s, c) => s + Number(c.valor || 0), 0)

  // Conciliação: desde a 1ª recarga lançada, saldo esperado = entradas − gasto.
  const recon = useMemo(() => {
    if (!firstCredit || !spendDaily || bal == null) return null
    const inTotal = (credits || []).reduce((s, c) => s + creditIn(c), 0)
    const spent = spendDaily.filter(d => d.date >= firstCredit).reduce((s, d) => s + d.expense, 0)
    return { inTotal, spent, expected: inTotal - spent, diff: bal - (inTotal - spent) }
  }, [firstCredit, spendDaily, bal, credits])

  // Recargas × gasto por mês
  const monthly = useMemo(() => {
    const map = {}
    for (let d = spendStart.slice(0, 7); d <= today.slice(0, 7);) {
      map[d] = { ym: d, label: monthLabel(d), spend: 0, credit: 0 }
      const [y, m] = d.split('-').map(Number)
      d = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
    }
    ;(spendDaily || []).forEach(x => { const k = x.date.slice(0, 7); if (map[k]) map[k].spend += x.expense })
    ;(credits || []).forEach(c => { const k = c.data.slice(0, 7); if (map[k]) map[k].credit += creditIn(c) })
    return Object.values(map)
  }, [spendDaily, credits, spendStart, today])

  const histData = history.map(h => ({ label: fmtDateTime(h.captured_at), balance: Number(h.balance) }))

  // ── Ações ──
  const saveCredit = async (f, opts) => {
    try {
      if (modal && modal !== 'new') {
        await ads.updateCredit(modal.id, {
          data: f.data, tipo: f.tipo, valor: Number(f.valor), bonus: Number(f.bonus || 0),
          forma_pagamento: f.forma_pagamento, observacao: f.observacao || null,
        })
        toast.success('Lançamento atualizado!')
      } else {
        await ads.addCredit({
          data: f.data, tipo: f.tipo, valor: f.valor, bonus: f.bonus || 0,
          forma_pagamento: f.forma_pagamento, observacao: f.observacao || null,
        }, { ...opts, user })
        toast.success(opts.launchInFinance ? 'Recarga lançada (e registrada no Financeiro)!' : 'Recarga lançada!')
      }
      setModal(null)
      loadCredits()
    } catch (e) { toast.error(e.message, { duration: 8000 }) }
  }
  const removeCredit = async (c) => {
    if (!window.confirm(`Excluir o lançamento de ${fmtMoney(c.valor)} em ${fmtDate(c.data)}?${c.bill_id ? '\n\nA conta criada no Financeiro NÃO é apagada — exclua lá se precisar.' : ''}`)) return
    try { await ads.deleteCredit(c.id); toast.success('Lançamento excluído.'); loadCredits() } catch (e) { toast.error(e.message) }
  }
  const doExport = () => exportXlsx(`shopee-ads-creditos_${today}.xlsx`, {
    Recargas: (credits || []).map(c => ({ Data: c.data, Tipo: TIPO_LABEL[c.tipo] || c.tipo, 'Valor pago': Number(c.valor), 'Bônus': Number(c.bonus || 0), Forma: c.forma_pagamento, Obs: c.observacao, 'Lançado por': c.created_by_name, 'No Financeiro': c.bill_id ? 'sim' : 'não' })),
    'Por mês': monthly.map(m => ({ Mês: m.label, 'Créditos lançados': Number(m.credit.toFixed(2)), 'Gasto real': Number(m.spend.toFixed(2)) })),
  })

  return (
    <div className="space-y-5">
      {/* Saldo + ações */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: `${SHOPEE_ORANGE}15` }}>
            <Wallet size={26} style={{ color: SHOPEE_ORANGE }}/>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-semibold text-slate-500 uppercase">Saldo de Ads agora</p>
              <InfoTooltip source="nosso" text={HELP.balance}/>
              <button onClick={loadBalance} disabled={loadingBal} className="text-slate-300 hover:text-slate-600">{loadingBal ? <Loader2 size={12} className="animate-spin"/> : <RefreshCw size={12}/>}</button>
            </div>
            <p className={`text-3xl font-bold ${bal != null && bal <= 0 ? 'text-rose-600' : 'text-slate-800'}`}>{balance?.error ? '—' : fmtMoney(bal)}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Recarga automática: <b className={balance?.auto_top_up ? 'text-emerald-600' : 'text-slate-700'}>{balance?.auto_top_up == null ? '—' : balance.auto_top_up ? 'LIGADA' : 'desligada'}</b>
              {balance?.campaign_surge != null && <> · Impulso de campanhas: <b>{balance.campaign_surge ? 'ligado' : 'desligado'}</b></>}
            </p>
            {balance?.error && <p className="text-xs text-rose-600 mt-1">{balance.error}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <a href={SELLER_ADS_URL} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white rounded-lg" style={{ background: SHOPEE_ORANGE }}>
            <ExternalLink size={14}/> Recarregar no Seller Center
          </a>
          <button onClick={() => setModal('new')} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg">
            <Plus size={14}/> Lançar recarga
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={CalendarClock} tone="violet" label="Saldo dura" help={HELP.runway}
          value={runwayDays == null ? '—' : `~${fmtNum(runwayDays, 1)} dia(s)`}
          sub={runwayDays != null ? `até ~${fmtDate(addDays(today, Math.floor(runwayDays)))}` : avg7 === 0 ? 'sem gasto nos últimos 7 dias' : null}/>
        <KpiCard icon={Zap} tone="orange" label="Gasto médio / dia" value={fmtMoney(avg7)} sub={`7 dias · 30 dias: ${fmtMoney(avg30)}`}/>
        <KpiCard icon={Scale} tone="amber" label="Orçamento diário ativo" value={fmtMoney(dailyBudget)} help={HELP.budget_daily}
          sub={dailyBudget ? `≈ ${fmtMoney(dailyBudget * 30)}/mês no máximo` : null}/>
        <KpiCard icon={Receipt} tone="sky" label="Recarregado no mês" value={fmtMoney(monthCredits)} sub="lançado aqui (valor pago)"/>
      </div>

      {/* Mês atual x orçamento */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
          <div className="flex items-center gap-1.5"><PiggyBank size={15} className="text-slate-400"/><p className="text-sm font-semibold text-slate-700">Gasto do mês × orçamento mensal</p></div>
          <p className="text-xs text-slate-500">dia {dayOfMonth} de {daysInMonth}</p>
        </div>
        {monthSpend == null ? <div className="h-10 flex items-center text-slate-300"><Loader2 size={16} className="animate-spin"/></div> : (
          <>
            <div className="flex items-end gap-6 flex-wrap">
              <div><p className="text-[11px] text-slate-400 uppercase font-semibold">Gasto até hoje</p><p className="text-xl font-bold text-slate-800">{fmtMoney(monthSpend)}</p></div>
              <div><p className="text-[11px] text-slate-400 uppercase font-semibold">Projeção do mês</p><p className="text-xl font-bold text-slate-800">{fmtMoney(monthProjection)}</p></div>
              <div><p className="text-[11px] text-slate-400 uppercase font-semibold">Orçamento mensal</p><p className="text-xl font-bold text-slate-800">{monthlyBudget ? fmtMoney(monthlyBudget) : <span className="text-sm text-slate-400 font-normal">não definido (configure abaixo)</span>}</p></div>
            </div>
            {monthlyBudget > 0 && (
              <div className="mt-3">
                <div className="h-3 bg-slate-100 rounded-full overflow-hidden relative">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(monthSpend / monthlyBudget * 100, 100)}%`, background: monthProjection > monthlyBudget ? '#E11D48' : COLOR_SALES }}/>
                  <div className="absolute top-0 h-full w-0.5 bg-slate-500" style={{ left: `${Math.min(dayOfMonth / daysInMonth * 100, 100)}%` }} title="hoje"/>
                </div>
                <p className={`text-xs mt-1.5 ${monthProjection > monthlyBudget ? 'text-rose-600 font-semibold' : 'text-slate-500'}`}>
                  {fmtNum(monthSpend / monthlyBudget * 100, 0)}% usado ·{' '}
                  {monthProjection > monthlyBudget
                    ? `no ritmo atual estoura em ${fmtMoney(monthProjection - monthlyBudget)}`
                    : `no ritmo atual sobram ${fmtMoney(monthlyBudget - monthProjection)}`}
                  {' '}· disponível por dia até o fim do mês: {fmtMoney(Math.max(monthlyBudget - monthSpend, 0) / Math.max(daysInMonth - dayOfMonth + 1, 1))}
                </p>
              </div>
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Recargas x gasto por mês */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
            <p className="text-sm font-semibold text-slate-700">Créditos lançados × gasto real, por mês</p>
            <Legend items={[{ label: 'Créditos lançados', color: COLOR_SALES }, { label: 'Gasto real', color: COLOR_SPEND }]}/>
          </div>
          <div className="h-60">
            {spendDaily == null ? <div className="h-full flex items-center justify-center text-slate-300"><Loader2 className="animate-spin"/></div> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9"/>
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false}/>
                  <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} width={56} tickFormatter={v => `R$${fmtNum(v)}`}/>
                  <Tooltip content={<ChartTooltip/>} cursor={{ fill: '#F8FAFC' }}/>
                  <Bar dataKey="credit" name="Créditos lançados" fill={COLOR_SALES} radius={[4, 4, 0, 0]} maxBarSize={18}/>
                  <Bar dataKey="spend" name="Gasto real" fill={COLOR_SPEND} radius={[4, 4, 0, 0]} maxBarSize={18}/>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Histórico do saldo */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center gap-1.5 mb-2">
            <p className="text-sm font-semibold text-slate-700">Saldo ao longo do tempo</p>
            <InfoTooltip source="nosso" text="O sistema lê o saldo real na Shopee a cada 3 horas (e sempre que esta aba é aberta). O histórico começa a partir da instalação do módulo."/>
          </div>
          <div className="h-60">
            {histData.length < 2 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400 text-center px-6">O gráfico aparece assim que houver pelo menos 2 leituras do saldo (a cada 3h, automático).</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={histData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9"/>
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#94A3B8' }} axisLine={false} tickLine={false} minTickGap={40}/>
                  <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} width={56} tickFormatter={v => `R$${fmtNum(v)}`}/>
                  <Tooltip content={<ChartTooltip/>}/>
                  <Line type="stepAfter" dataKey="balance" name="Saldo" stroke={SHOPEE_ORANGE} strokeWidth={2} dot={false} activeDot={{ r: 4 }}/>
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Conciliação */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex items-center gap-1.5 mb-3">
          <Scale size={15} className="text-slate-400"/>
          <p className="text-sm font-semibold text-slate-700">Conciliação do crédito</p>
          <InfoTooltip source="nosso" text="Confere se as recargas lançadas aqui batem com o saldo real: (tudo que entrou desde a 1ª recarga lançada) − (gasto real da Shopee no mesmo período) deveria dar o saldo de hoje. Se tiver diferença, provavelmente falta lançar alguma recarga (ex.: automática) ou bônus — ou já havia saldo antes da 1ª recarga lançada."/>
        </div>
        {!firstCredit ? (
          <p className="text-xs text-slate-400">Lance as recargas pra começar a conciliar. Dica: comece lançando um “Ajuste” com o saldo de hoje — a partir daí todo centavo fica rastreado.</p>
        ) : !recon ? (
          <Loader2 size={16} className="animate-spin text-slate-300"/>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-center">
            {[
              ['Entradas lançadas', fmtMoney(recon.inTotal), `desde ${fmtDate(firstCredit)}`],
              ['− Gasto real (API)', fmtMoney(recon.spent), `${daysBetween(firstCredit, today)} dias`],
              ['= Saldo esperado', fmtMoney(recon.expected)],
              ['Saldo real', fmtMoney(bal)],
            ].map(([l, v, s]) => (
              <div key={l}><p className="text-[11px] uppercase font-semibold text-slate-400">{l}</p><p className="text-lg font-bold text-slate-800">{v}</p>{s && <p className="text-[11px] text-slate-400">{s}</p>}</div>
            ))}
            <div className={`rounded-xl px-3 py-2 ${Math.abs(recon.diff) < 1 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
              <p className="text-[11px] uppercase font-semibold">Diferença</p>
              <p className="text-lg font-bold">{fmtMoney(recon.diff)}</p>
              <p className="text-[11px]">{Math.abs(recon.diff) < 1 ? 'Tudo batendo ✓' : recon.diff > 0 ? 'Entrou crédito não lançado' : 'Falta crédito / gasto não coberto'}</p>
            </div>
          </div>
        )}
      </div>

      {/* Lançamentos */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-5 py-3.5 border-b border-slate-100 flex-wrap">
          <p className="text-sm font-semibold text-slate-700">Recargas e créditos lançados</p>
          <div className="flex items-center gap-2">
            <button onClick={doExport} className="text-xs font-semibold text-slate-500 hover:text-slate-800">Exportar Excel</button>
            <button onClick={() => setModal('new')} className="inline-flex items-center gap-1 text-xs font-semibold text-white px-3 py-1.5 rounded-lg" style={{ background: SHOPEE_ORANGE }}><Plus size={12}/> Lançar</button>
          </div>
        </div>
        {credits == null ? <div className="py-8 flex justify-center text-slate-300"><Loader2 className="animate-spin"/></div>
          : credits.length === 0 ? <p className="text-sm text-slate-400 px-5 py-6">Nenhuma recarga lançada ainda.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="bg-slate-50 text-[11px] uppercase text-slate-400">
                <tr>
                  <th className="text-left font-semibold px-5 py-2">Data</th>
                  <th className="text-left font-semibold px-3 py-2">Tipo</th>
                  <th className="text-right font-semibold px-3 py-2">Valor pago</th>
                  <th className="text-right font-semibold px-3 py-2">Bônus</th>
                  <th className="text-left font-semibold px-3 py-2">Forma</th>
                  <th className="text-left font-semibold px-3 py-2">Observação</th>
                  <th className="text-left font-semibold px-3 py-2">Lançado por</th>
                  <th className="px-5 py-2"/>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {credits.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-5 py-2.5 text-slate-700">{fmtDate(c.data)}</td>
                    <td className="px-3 py-2.5 text-slate-600">{TIPO_LABEL[c.tipo] || c.tipo}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-slate-800">{fmtMoney(c.valor)}</td>
                    <td className="px-3 py-2.5 text-right text-slate-500">{Number(c.bonus) > 0 ? <span className="inline-flex items-center gap-1"><Gift size={11}/>{fmtMoney(c.bonus)}</span> : '—'}</td>
                    <td className="px-3 py-2.5 text-slate-600">{c.forma_pagamento || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-500 max-w-[220px] truncate">{c.observacao || '—'}{c.bill_id && <span className="ml-1.5 text-[10px] font-bold text-emerald-600">no Financeiro</span>}</td>
                    <td className="px-3 py-2.5 text-slate-500">{c.created_by_name || '—'}</td>
                    <td className="px-5 py-2.5 text-right whitespace-nowrap">
                      <button onClick={() => setModal(c)} className="p-1 text-slate-400 hover:text-slate-700"><Pencil size={14}/></button>
                      <button onClick={() => removeCredit(c)} className="p-1 text-slate-400 hover:text-rose-600"><Trash2 size={14}/></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <SettingsCard settings={settings} onSaved={onSettingsSaved}/>

      <CreditModal open={!!modal} initial={modal && modal !== 'new' ? modal : null} categories={categories}
        onClose={() => setModal(null)} onSave={saveCredit}/>
    </div>
  )
}
