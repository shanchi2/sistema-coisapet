import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import {
  ShieldAlert, RefreshCw, Loader2, ExternalLink, Clock, User, MessageSquare, ChevronDown, ChevronUp,
  Package, Undo2, Scale, CheckCircle2, XCircle, StickyNote, Send, Info, AlertTriangle, Hourglass,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { StatTile, Panel, fmtInt } from '../dashboard/widgets'
import { Modal } from '../../components/ui/Modal'

// Reclamações do Mercado Livre (09/10, fase104) — as abertas contra a
// CoisaPet com o próximo passo, prazo, de quem é a vez, status da
// devolução e as mensagens do mediador; histórico de 90 dias com motivo,
// produto e resultado. Dados de `ml_claims` (Edge Function `ml-claims`,
// a cada 30 min + botão). Sem R$.

const TZ = 'America/Sao_Paulo'
const fmtDate = iso => iso ? new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' }).format(new Date(iso)) : '—'
const fmtDateTime = iso => iso ? new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '—'
const daysBetween = (a, b = Date.now()) => Math.floor((new Date(b) - new Date(a)) / 86400000)
function fmtAgo(iso) {
  if (!iso) return 'nunca'
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  return m < 60 ? `há ${Math.max(1, m)} min` : m < 1440 ? `há ${Math.round(m / 60)} h` : `há ${Math.round(m / 1440)} dias`
}
function dueLabel(iso) {
  if (!iso) return null
  const h = (new Date(iso) - Date.now()) / 3600000
  if (h < 0) return { text: `venceu em ${fmtDate(iso)}`, tone: 'text-rose-600' }
  if (h < 24) return { text: `vence HOJE (${fmtDateTime(iso)})`, tone: 'text-rose-600' }
  const d = Math.ceil(h / 24)
  return { text: `vence em ${d} dia${d > 1 ? 's' : ''} (${fmtDate(iso)})`, tone: d <= 2 ? 'text-orange-600' : 'text-slate-600' }
}

const TYPE = {
  mediations:      { label: 'Reclamação', icon: ShieldAlert },
  returns:         { label: 'Devolução', icon: Undo2 },
  cancel_purchase: { label: 'Cancelamento antes da entrega', icon: XCircle },
  fulfillment:     { label: 'Full', icon: Package },
}
const STAGE = { claim: 'Aberta com a CoisaPet', dispute: 'Em mediação — o ML decide', none: '' }
const WHO = {
  complainant: { label: 'Aguardando o comprador', tone: 'bg-slate-100 text-slate-600' },
  respondent:  { label: 'Aguardando VOCÊ', tone: 'bg-rose-100 text-rose-700' },
  mediator:    { label: 'Aguardando o ML', tone: 'bg-sky-100 text-sky-700' },
}
const REASON = {
  repentant_buyer: 'Se arrependeu da compra',
  broken_item: 'Chegou quebrado / com defeito',
  broken_or_in_bad_condition: 'Chegou danificado',
  not_working_item: 'Produto não funciona',
  missing_accessories: 'Faltando peças ou acessórios',
  empty_box: 'Caixa chegou vazia',
  damaged_package_missing_item: 'Embalagem danificada / item faltando',
  delivered_but_not_receive_package: 'Diz que não recebeu',
  different_item: 'Recebeu produto diferente',
  undelivered_repentant_buyer: 'Desistiu antes de receber',
  undelivered_other: 'Cancelou antes de receber',
  estimated_delivery_out_of_time: 'Entrega fora do prazo',
  change_receiver_address: 'Quis mudar o endereço',
}
const reasonLabel = c => REASON[c.reason_name] || c.reason_text || c.reason_name || c.reason_id || 'Motivo não informado'
const RETURN = {
  pending: 'Devolução aberta — aguardando etiqueta',
  label_generated: 'Etiqueta gerada — comprador ainda não postou',
  ready_to_ship: 'Pronta pra postar',
  shipped: 'Devolução a caminho',
  delivered: 'Devolução ENTREGUE — conferir o produto',
  not_delivered: 'Devolução não entregue',
  cancelled: 'Devolução cancelada',
  expired: 'Devolução expirou',
  closed: 'Devolução encerrada',
  failed: 'Falha na devolução',
}
const ROLE = { mediator: 'Mercado Livre', complainant: 'Comprador', respondent: 'CoisaPet' }
const isCancel = c => c.type === 'cancel_purchase'
const wonByUs = c => { const b = c.resolution?.benefited || []; return b.includes('respondent') && !b.includes('complainant') }
const covered = c => !!c.resolution?.applied_coverage
const canMessage = c => (c.our_actions || []).some(a => a.action === 'send_message_to_complainant')
const mustAct = c => c.action_responsible === 'respondent' || (c.our_actions || []).some(a => a.mandatory)
// Mensagens do ML vêm com **negrito** e às vezes HTML (<strong>, <a>): limpa
// as tags, mostra o negrito e — pra quem não é diretor — esconde valores R$
function MessageText({ text, showValues }) {
  let t = String(text || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/?strong>/gi, '**').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  if (!showValues) t = t.replace(/R\$\s?[\d.]+(,\d{2})?/g, 'R$ •••')
  return t.split('**').map((part, i) => i % 2 ? <strong key={i} className="font-semibold text-slate-800">{part}</strong> : <span key={i}>{part}</span>)
}
const saleUrl = id => `https://www.mercadolivre.com.br/vendas/${id}/detalhe`

function ProductLine({ c, big }) {
  const items = c.order_info?.items || []
  const first = items[0]
  return (
    <div className="flex items-center gap-3 min-w-0">
      {first?.thumbnail
        ? <img src={first.thumbnail} alt="" className={`${big ? 'w-14 h-14' : 'w-9 h-9'} rounded-lg object-cover bg-slate-100 shrink-0`} loading="lazy" />
        : <span className={`${big ? 'w-14 h-14' : 'w-9 h-9'} rounded-lg bg-slate-100 shrink-0 flex items-center justify-center text-slate-300`}><Package size={big ? 20 : 14} /></span>}
      <div className="min-w-0">
        <p className={`text-slate-800 ${big ? 'font-semibold leading-snug' : 'text-[13px] font-medium truncate'}`} title={first?.title}>
          {first?.title || (isCancel(c) ? 'Envio cancelado antes da entrega' : `Pedido ${c.order_id}`)}
          {items.length > 1 && <span className="text-slate-400 font-normal"> +{items.length - 1} item(s)</span>}
        </p>
        {first && (first.variation || first.qty > 1 || first.sku) && (
          <p className="text-[11px] text-slate-500">{[first.variation, first.qty > 1 ? `${first.qty} un.` : null, first.sku].filter(Boolean).join(' · ')}</p>
        )}
      </div>
    </div>
  )
}

function OpenClaimCard({ c, onNote, onMessage, showValues }) {
  const [open, setOpen] = useState(mustAct(c))
  const [note, setNote] = useState(c.internal_note || '')
  const T = TYPE[c.type] || { label: c.type, icon: ShieldAlert }
  const who = WHO[c.action_responsible]
  const due = dueLabel(c.due_date)
  const msgs = c.messages || []
  const urgent = mustAct(c)
  return (
    <div className={`rounded-2xl border bg-white overflow-hidden ${urgent ? 'border-rose-300 ring-2 ring-rose-100' : 'border-slate-200'}`}>
      <div className="p-4 grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
        <div className="min-w-0 flex flex-col gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800"><T.icon size={12} />{T.label}</span>
            {c.stage === 'dispute' && <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700"><Scale size={12} />Em mediação</span>}
            <span className="text-[11px] text-slate-400">aberta em {fmtDate(c.date_created)} · há {daysBetween(c.date_created)} dia{daysBetween(c.date_created) === 1 ? '' : 's'}</span>
          </div>
          <ProductLine c={c} big />
          <div className="flex items-start gap-2 text-sm">
            <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
            <p className="text-slate-700"><span className="font-semibold">{reasonLabel(c)}</span>{c.problem && c.problem !== reasonLabel(c) && <span className="text-slate-500"> — {c.problem}</span>}</p>
          </div>
          <div className="flex items-center gap-4 flex-wrap text-[12px] text-slate-500">
            {c.order_info?.buyer && <span className="inline-flex items-center gap-1"><User size={12} />{c.order_info.buyer}</span>}
            <span>Venda <span className="font-mono">{c.order_id}</span></span>
            <span>Reclamação <span className="font-mono">{c.id}</span></span>
          </div>
        </div>

        <div className="rounded-xl bg-slate-50 border border-slate-100 p-3.5 flex flex-col gap-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Situação agora</p>
          <p className="font-bold text-slate-800 leading-snug">{c.detail_title || STAGE[c.stage] || 'Em andamento'}</p>
          {c.detail_description && <p className="text-[12px] text-slate-600 leading-snug">{c.detail_description}</p>}
          <div className="flex items-center gap-2 flex-wrap mt-1">
            {who && <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${who.tone}`}>{who.label}</span>}
            {due && <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${due.tone}`}><Clock size={11} />{due.text}</span>}
          </div>
          {c.return_info?.status && (
            <p className={`text-[12px] font-semibold flex items-center gap-1.5 ${c.return_info.status === 'delivered' ? 'text-rose-600' : 'text-slate-600'}`}>
              <Undo2 size={12} />{RETURN[c.return_info.status] || c.return_info.status}
            </p>
          )}
          <a href={saleUrl(c.order_id)} target="_blank" rel="noreferrer" className="btn-secondary py-1.5 text-xs mt-1 justify-center"><ExternalLink size={12} /> Abrir a venda no Mercado Livre</a>
        </div>
      </div>

      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between gap-2 px-4 py-2 border-t border-slate-100 text-xs font-semibold text-slate-500 hover:bg-slate-50">
        <span className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1"><MessageSquare size={12} />{msgs.length} mensage{msgs.length === 1 ? 'm' : 'ns'}</span>
          {c.internal_note && <span className="inline-flex items-center gap-1 text-violet-600"><StickyNote size={12} />tem anotação</span>}
        </span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {open && (
        <div className="px-4 pb-4 grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4 border-t border-slate-100 pt-3">
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Conversa na reclamação</p>
            {!msgs.length && <p className="text-xs text-slate-400">Nenhuma mensagem ainda.</p>}
            {msgs.slice().sort((a, b) => (a.at || '').localeCompare(b.at || '')).map((m, i) => (
              <div key={i} className={`max-w-[90%] rounded-xl px-3 py-2 text-[13px] ${m.from === 'respondent' ? 'self-end bg-violet-50 border border-violet-100' : m.from === 'mediator' ? 'bg-sky-50 border border-sky-100' : 'bg-slate-50 border border-slate-100'}`}>
                <p className="text-[10px] font-bold text-slate-400 mb-0.5">{ROLE[m.from] || m.from} → {ROLE[m.to] || m.to} · {fmtDateTime(m.at)}{m.attachments ? ` · ${m.attachments} anexo(s)` : ''}</p>
                <p className="text-slate-700 whitespace-pre-line"><MessageText text={m.text} showValues={showValues} /></p>
              </div>
            ))}
            {canMessage(c) && (
              <button onClick={() => onMessage(c)} className="btn-primary py-1.5 text-xs self-start mt-1"><Send size={12} /> Responder ao comprador</button>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Anotação interna (só a equipe vê)</p>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={4} placeholder="Ex.: produto voltou, conferido pela Ana, vai pra estoque…" className="input text-sm resize-y" />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-slate-400">{c.internal_note_at ? `por ${c.internal_note_by || '—'} em ${fmtDateTime(c.internal_note_at)}` : ''}</span>
              <button disabled={note === (c.internal_note || '')} onClick={() => onNote(c, note)} className="btn-secondary py-1.5 text-xs disabled:opacity-40">Salvar anotação</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function MlClaimsPage() {
  const { user } = useAuth()
  const [claims, setClaims] = useState(null)
  const [sync, setSync] = useState(null)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState('open')
  const [showCancels, setShowCancels] = useState(false)
  const [msgFor, setMsgFor] = useState(null)
  const [msgText, setMsgText] = useState('')
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    const [c, s] = await Promise.all([
      supabase.from('ml_claims').select('*').order('last_updated', { ascending: false }).limit(1000),
      supabase.from('ml_claims_sync').select('*').eq('id', 'default').maybeSingle(),
    ])
    if (c.error) toast.error('Erro ao carregar: ' + c.error.message)
    setClaims(c.data || [])
    setSync(s.data || null)
  }, [])
  useEffect(() => { load() }, [load])

  async function refresh() {
    setBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke('ml-claims', { body: { action: 'sync' } })
      if (error || data?.ok === false) throw new Error(data?.error || error.message)
      toast.success(`Atualizado: ${data.open} aberta${data.open === 1 ? '' : 's'}`)
      await load()
    } catch (e) { toast.error('Erro ao atualizar: ' + e.message) } finally { setBusy(false) }
  }

  async function saveNote(c, note) {
    const { data, error } = await supabase.functions.invoke('ml-claims', { body: { action: 'note', claim_id: c.id, note, by: user?.name || null } })
    if (error || data?.ok === false) return toast.error('Erro ao salvar anotação')
    toast.success('Anotação salva')
    load()
  }

  async function sendMessage() {
    setSending(true)
    try {
      const { data, error } = await supabase.functions.invoke('ml-claims', { body: { action: 'send_message', claim_id: msgFor.id, message: msgText, by: user?.name || null } })
      if (error || data?.ok === false || data?.error) throw new Error(data?.error || error?.message)
      toast.success('Mensagem enviada ao comprador')
      setMsgFor(null); setMsgText('')
      load()
    } catch (e) { toast.error('Não enviou: ' + e.message) } finally { setSending(false) }
  }

  const open = useMemo(() => (claims || []).filter(c => c.status === 'opened')
    .sort((a, b) => Number(mustAct(b)) - Number(mustAct(a)) || (a.due_date || '9').localeCompare(b.due_date || '9')), [claims])
  const closed = useMemo(() => (claims || []).filter(c => c.status !== 'opened'), [claims])
  const realClosed = closed.filter(c => !isCancel(c))
  const historyRows = showCancels ? closed : realClosed

  // Rankings dos últimos 90 dias (sem cancelamentos antes da entrega)
  const byReason = useMemo(() => {
    const m = {}
    realClosed.concat(open.filter(c => !isCancel(c))).forEach(c => { const k = reasonLabel(c); m[k] = (m[k] || 0) + 1 })
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [realClosed, open])
  const byProduct = useMemo(() => {
    const m = {}
    realClosed.concat(open.filter(c => !isCancel(c))).forEach(c => {
      const t = c.order_info?.items?.[0]?.title
      if (!t) return
      m[t] ||= { n: 0, thumb: c.order_info.items[0].thumbnail }
      m[t].n++
    })
    return Object.entries(m).sort((a, b) => b[1].n - a[1].n).slice(0, 8)
  }, [realClosed, open])

  const won = realClosed.filter(wonByUs).length
  const cov = realClosed.filter(c => !wonByUs(c) && covered(c)).length

  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#FFE600] to-amber-500 flex items-center justify-center shrink-0 shadow-sm"><ShieldAlert size={20} className="text-[#2D3277]" /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Reclamações ML</h1>
            <p className="text-sm text-slate-500">Reclamações, mediações e devoluções abertas contra a CoisaPet no Mercado Livre · atualizado {fmtAgo(sync?.synced_at)}</p>
          </div>
        </div>
        <button onClick={refresh} disabled={busy} className="btn-primary py-1.5 text-sm disabled:opacity-60">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} {busy ? 'Buscando no ML…' : 'Atualizar agora'}
        </button>
      </div>

      {sync?.error && <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">Última leitura com erro: {sync.error}</div>}

      {!claims ? (
        <div className="card py-24 text-center"><Loader2 size={24} className="mx-auto animate-spin text-slate-300" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile icon={ShieldAlert} tone={open.length ? 'warning' : 'good'} label="Abertas agora" value={fmtInt(open.length)}
              detail={`${open.filter(c => c.type === 'returns').length} devolução · ${open.filter(c => c.type === 'mediations').length} reclamação`} />
            <StatTile icon={Hourglass} tone={open.filter(mustAct).length ? 'critical' : 'good'} label="Aguardando você" value={fmtInt(open.filter(mustAct).length)}
              detail={open.filter(mustAct).length ? 'precisa de resposta/ação da CoisaPet' : 'nada pendente do nosso lado'} />
            <StatTile icon={Scale} tone="violet" label="Em mediação" value={fmtInt(open.filter(c => c.stage === 'dispute').length)} detail="o Mercado Livre está decidindo" />
            <StatTile icon={CheckCircle2} tone="neutral" label="Fechadas · 90 dias" value={fmtInt(realClosed.length)}
              detail={<span>{won} a favor da CoisaPet · {cov} cobertas pelo ML<br /><span className="text-slate-400">+ {closed.length - realClosed.length} cancelamentos antes da entrega</span></span>} />
          </div>

          <div className="flex bg-slate-100 rounded-xl p-1 self-start">
            {[['open', `Abertas (${open.length})`], ['history', 'Histórico 90 dias'], ['ranking', 'Motivos e produtos']].map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className={`h-8 px-4 rounded-lg text-xs font-semibold ${tab === k ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{l}</button>
            ))}
          </div>

          {tab === 'open' && (
            <div className="flex flex-col gap-3">
              {!open.length && <div className="card py-16 text-center text-slate-400"><CheckCircle2 size={28} className="mx-auto mb-2 text-emerald-400" />Nenhuma reclamação aberta. 🎉</div>}
              {open.map(c => <OpenClaimCard key={c.id} c={c} showValues={user?.role === 'admin'} onNote={saveNote} onMessage={x => { setMsgFor(x); setMsgText('') }} />)}
            </div>
          )}

          {tab === 'history' && (
            <Panel title={`${fmtInt(historyRows.length)} encerradas`} subtitle="Últimos 90 dias · mais recentes primeiro"
              right={<label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer"><input type="checkbox" checked={showCancels} onChange={e => setShowCancels(e.target.checked)} />Mostrar cancelamentos antes da entrega</label>}>
              <div className="overflow-x-auto -mx-5">
                <table className="w-full text-[13px] min-w-[860px]">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wide text-slate-400 text-left border-b border-slate-100">
                      <th className="pl-5 pr-2 py-2 font-semibold">Produto</th>
                      <th className="px-2 font-semibold">Motivo</th>
                      <th className="px-2 font-semibold">Tipo</th>
                      <th className="px-2 font-semibold">Aberta</th>
                      <th className="px-2 font-semibold">Resultado</th>
                      <th className="px-2 pr-5" />
                    </tr>
                  </thead>
                  <tbody>
                    {historyRows.map(c => (
                      <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                        <td className="pl-5 pr-2 py-2 max-w-[360px]"><ProductLine c={c} /></td>
                        <td className="px-2 text-slate-600">{reasonLabel(c)}</td>
                        <td className="px-2 text-slate-500 text-xs">{TYPE[c.type]?.label || c.type}</td>
                        <td className="px-2 text-slate-500 text-xs whitespace-nowrap">{fmtDate(c.date_created)}</td>
                        <td className="px-2">
                          {wonByUs(c)
                            ? <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">A favor da CoisaPet</span>
                            : covered(c)
                              ? <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200" title="O comprador foi atendido, mas o Mercado Livre cobriu o custo">Coberta pelo ML</span>
                              : c.resolution ? <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">A favor do comprador</span>
                                : <span className="text-[11px] text-slate-400">—</span>}
                        </td>
                        <td className="px-2 pr-5 text-right">{c.order_id && !isCancel(c) && <a href={saleUrl(c.order_id)} target="_blank" rel="noreferrer" className="text-slate-300 hover:text-sky-500" title="Abrir a venda no ML"><ExternalLink size={14} /></a>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!historyRows.length && <p className="text-sm text-slate-400 text-center py-10">Nada encerrado nos últimos 90 dias.</p>}
              </div>
            </Panel>
          )}

          {tab === 'ranking' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Panel title="Motivos mais comuns" subtitle="Abertas + fechadas nos últimos 90 dias (sem cancelamentos antes da entrega)">
                <div className="flex flex-col gap-2.5">
                  {byReason.map(([r, n]) => (
                    <div key={r}>
                      <div className="flex items-center justify-between text-[13px]"><span className="text-slate-700">{r}</span><span className="font-bold text-slate-800 tabular-nums">{n}</span></div>
                      <div className="h-1.5 rounded-full bg-slate-100 mt-1"><div className="h-full rounded-full bg-amber-400" style={{ width: `${(n / (byReason[0]?.[1] || 1)) * 100}%` }} /></div>
                    </div>
                  ))}
                  {!byReason.length && <p className="text-sm text-slate-400">Sem dados.</p>}
                </div>
              </Panel>
              <Panel title="Produtos com mais reclamações" subtitle="Abertas + fechadas nos últimos 90 dias">
                <div className="flex flex-col gap-2.5">
                  {byProduct.map(([t, v]) => (
                    <div key={t} className="flex items-center gap-3">
                      {v.thumb ? <img src={v.thumb} alt="" className="w-9 h-9 rounded-lg object-cover bg-slate-100 shrink-0" /> : <span className="w-9 h-9 rounded-lg bg-slate-100 shrink-0" />}
                      <p className="text-[13px] text-slate-700 flex-1 min-w-0 truncate" title={t}>{t}</p>
                      <span className="font-bold text-slate-800 tabular-nums">{v.n}</span>
                    </div>
                  ))}
                  {!byProduct.length && <p className="text-sm text-slate-400">Sem dados.</p>}
                </div>
              </Panel>
            </div>
          )}

          <p className="text-[11px] text-slate-400 flex items-start gap-1.5"><Info size={12} className="shrink-0 mt-px" />
            <span>Só entram reclamações <strong className="font-semibold">contra</strong> a CoisaPet (as que a CoisaPet abriu como compradora ficam de fora). "Coberta pelo ML" = o comprador foi atendido, mas quem pagou foi o Mercado Livre. Atualiza sozinho a cada 30 minutos.</span>
          </p>
        </>
      )}

      <Modal open={!!msgFor} onClose={() => !sending && setMsgFor(null)} title="Responder ao comprador"
        subtitle={msgFor ? `Reclamação ${msgFor.id} · a mensagem vai pelo Mercado Livre e o mediador também vê` : ''}
        footer={<div className="flex justify-end gap-2">
          <button onClick={() => setMsgFor(null)} disabled={sending} className="btn-secondary">Cancelar</button>
          <button onClick={sendMessage} disabled={sending || !msgText.trim()} className="btn-primary disabled:opacity-60">{sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Enviar pelo Mercado Livre</button>
        </div>}>
        <textarea value={msgText} onChange={e => setMsgText(e.target.value)} rows={6} maxLength={2000} autoFocus
          placeholder="Olá! Sentimos muito pelo ocorrido…" className="input text-sm w-full resize-y" />
        <p className="text-[11px] text-slate-400 mt-1 text-right">{msgText.length}/2000 · fica registrado quem enviou</p>
      </Modal>
    </div>
  )
}
