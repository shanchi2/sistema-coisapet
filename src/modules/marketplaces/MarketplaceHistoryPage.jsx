import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { History, Loader2, Search, X, ChevronLeft, ChevronRight, Info, User, Check, Copy } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { PLAT, usePlatformFilter, PlatformFilter, PlatBadge, Segmented, norm, brl2, fetchAll } from './shared'

// Histórico de alterações ML + Shopee (Fase 3 da unificação, 10/10): tudo
// que o sistema gravou nos anúncios das duas plataformas (`ml_item_updates`
// + `shopee_item_updates`) numa linha do tempo só, com quem fez. Nome/foto
// do anúncio vêm da foto `marketplace_stock`. Cruzamento: mudança de
// conteúdo/foto/ficha no ML mostra se já foi marcada como replicada na
// Shopee (`ml_item_sync_checks`, marcado na tela de Histórico do ML).
// Valores em R$ (preço promocional) só pra diretoria.

const DAYS = [['7', '7 dias'], ['30', '30 dias'], ['90', '90 dias']]
const CAT = {
  estoque:     { label: 'Estoque', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  preco:       { label: 'Preço / status', tone: 'bg-amber-50 text-amber-700 border-amber-200' },
  conteudo:    { label: 'Título, descrição, ficha', tone: 'bg-violet-50 text-violet-700 border-violet-200' },
  fotos:       { label: 'Fotos', tone: 'bg-sky-50 text-sky-700 border-sky-200' },
  campanhas:   { label: 'Campanhas e cupons', tone: 'bg-rose-50 text-rose-700 border-rose-200' },
  atendimento: { label: 'Atendimento', tone: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  outros:      { label: 'Outros', tone: 'bg-slate-100 text-slate-500 border-slate-200' },
}
const ACTION = {
  update_stock: ['estoque', 'Estoque alterado'], quick_fields: ['preco', 'Preço/estoque/status'], update_item_price: ['preco', 'Preço alterado'], update_price: ['preco', 'Preço alterado'],
  toggle_status: ['preco', 'Pausado/reativado'], update_item_status: ['preco', 'Pausado/reativado'],
  attributes: ['conteudo', 'Ficha técnica'], update_technical: ['conteudo', 'Ficha técnica (peso/medidas)'], content: ['conteudo', 'Título/descrição'], apply_content: ['conteudo', 'Título/descrição'], create: ['conteudo', 'Anúncio criado'],
  picture_added: ['fotos', 'Foto adicionada'], picture_removed: ['fotos', 'Foto removida'], picture_reordered: ['fotos', 'Fotos reordenadas'], picture_unlinked: ['fotos', 'Foto desvinculada'], picture_moved: ['fotos', 'Foto movida'], pictures_replaced: ['fotos', 'Fotos substituídas'],
  promotion_join: ['campanhas', 'Entrou em campanha'], promotion_leave: ['campanhas', 'Saiu de campanha'], seller_campaign_create: ['campanhas', 'Campanha criada'], seller_campaign_delete: ['campanhas', 'Campanha excluída'],
  voucher_created: ['campanhas', 'Cupom criado'], voucher_updated: ['campanhas', 'Cupom editado'], voucher_deleted: ['campanhas', 'Cupom excluído'], voucher_ended: ['campanhas', 'Cupom encerrado'], flash_sale_created: ['campanhas', 'Flash Sale criada'],
  question_answer: ['atendimento', 'Pergunta respondida'], comment_reply: ['atendimento', 'Avaliação respondida'], claim_message: ['atendimento', 'Mensagem em reclamação'],
}
const actionOf = a => ACTION[a] || ['outros', a || '—']
const SYNCABLE = new Set(['conteudo', 'fotos'])
const TZ = 'America/Sao_Paulo'
const dayKey = iso => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(iso))
const dayLabel = k => { const t = dayKey(new Date().toISOString()); const y = dayKey(new Date(Date.now() - 86400e3).toISOString()); return k === t ? 'Hoje' : k === y ? 'Ontem' : new Date(`${k}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'UTC' }) }
const hhmm = iso => new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

function summary(r, showValues) {
  const d = r.detail || {}
  const money = v => showValues ? brl2(v) : 'R$ •••'
  switch (r.action) {
    case 'update_stock': return `${d.variation ? `${d.variation}: ` : ''}${d.before ?? '?'} → ${d.available_quantity ?? d.stock ?? '?'} un.`
    case 'quick_fields': return Object.entries(d).filter(([k]) => k !== 'by').map(([k, v]) => k === 'price' ? `preço ${money(v)}` : k === 'available_quantity' ? `estoque ${v}` : k === 'status' ? (v === 'active' ? 'reativado' : 'pausado') : `${k}: ${v}`).join(' · ')
    case 'promotion_join': return `${d.promotion_type || 'campanha'}${d.deal_price != null ? ` · preço promo ${money(d.deal_price)}` : ''}${d.stock ? ` · ${d.stock} un.` : ''}`
    case 'promotion_leave': return d.promotion_type || null
    case 'content': return [d.title && 'título', d.description && 'descrição'].filter(Boolean).join(' e ') || null
    case 'attributes': return d.count ? `${d.count} campo(s)` : null
    case 'comment_reply': case 'question_answer': return d.text ? `"${String(d.text).slice(0, 120)}${String(d.text).length > 120 ? '…' : ''}"` : null
    case 'create': return d.title || null
    case 'pictures_replaced': return Array.isArray(d.new) ? `${d.new.length} foto(s) nova(s)` : null
    case 'update_technical': return [d.weight != null && `peso ${d.weight} kg`, d.dimension && 'medidas'].filter(Boolean).join(' · ') || null
    case 'seller_campaign_create': return d.name ? `${d.name}${d.start_date ? ` · ${d.start_date.split('-').reverse().join('/')} a ${(d.finish_date || '').split('-').reverse().join('/')}` : ''}` : null
    default: return d.name || d.voucher_name || null
  }
}

export function MarketplaceHistoryPage() {
  const { user } = useAuth()
  const showValues = user?.role === 'admin'
  const [plat, setPlat] = usePlatformFilter()
  const [days, setDays] = useState('30')
  const [cat, setCat] = useState('')
  const [search, setSearch] = useState('')
  const [raw, setRaw] = useState(null)
  const [page, setPage] = useState(0)
  const PAGE = 60

  useEffect(() => {
    setRaw(null)
    // As tabelas de log só são lidas com service role → via edge function
    Promise.all([
      supabase.functions.invoke('shopee-extra', { body: { action: 'history', days: Number(days) } }),
      fetchAll(() => supabase.from('marketplace_stock').select('platform, item_id, title, thumbnail')),
    ]).then(([{ data: h, error }, st]) => {
      if (error || !h?.ok) throw error || new Error(h?.error)
      const names = {}
      st.forEach(s => { names[`${s.platform}|${s.item_id}`] ||= { title: s.title, thumb: s.thumbnail } })
      setRaw({ rows: [...h.ml.map(r => ({ ...r, platform: 'ml' })), ...h.shopee.map(r => ({ ...r, platform: 'shopee' }))], names, checks: Object.fromEntries(h.checks.map(c => [c.item_id, c])) })
    }).catch(() => setRaw({ rows: [], names: {}, checks: {} }))
  }, [days])

  const rows = useMemo(() => {
    if (!raw) return []
    const q = norm(search)
    return raw.rows
      .map(r => ({ ...r, cat: actionOf(r.action)[0], label: actionOf(r.action)[1], name: raw.names[`${r.platform}|${r.item_id}`], by: r.detail?.by || null }))
      .filter(r => !plat || r.platform === plat)
      .filter(r => !cat || r.cat === cat)
      .filter(r => !q || norm(`${r.name?.title || ''} ${r.item_id} ${r.label} ${r.by || ''}`).includes(q))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  }, [raw, plat, cat, search])

  useEffect(() => { setPage(0) }, [plat, cat, search, days])
  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const cur = Math.min(page, pages - 1)
  const pageRows = rows.slice(cur * PAGE, cur * PAGE + PAGE)
  const counts = { ml: raw?.rows.filter(r => r.platform === 'ml').length || 0, shopee: raw?.rows.filter(r => r.platform === 'shopee').length || 0 }
  let lastDay = null

  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      <div className="flex items-center gap-3.5">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#FFE600] to-[#EE4D2D] flex items-center justify-center shrink-0 shadow-sm"><History size={20} className="text-white" /></div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Histórico de alterações</h1>
          <p className="text-sm text-slate-500">Tudo que foi mudado pelo sistema nos anúncios do ML e da Shopee — estoque, preço, fotos, ficha, campanhas, respostas</p>
        </div>
      </div>

      <div className="card !p-0">
        <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 border-b border-slate-100">
          <PlatformFilter value={plat} onChange={setPlat} counts={counts} />
          <Segmented value={days} onChange={setDays} options={DAYS} />
        </div>
        <div className="flex items-center gap-2 flex-wrap px-4 py-3">
          <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 h-9 flex-1 min-w-[200px] max-w-sm bg-white focus-within:border-slate-400">
            <Search size={14} className="text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Anúncio, código ou quem fez…" className="bg-transparent outline-none text-sm w-full placeholder:text-slate-400" />
            {search && <button onClick={() => setSearch('')} className="text-slate-400"><X size={13} /></button>}
          </div>
          <Segmented value={cat} onChange={setCat} options={[['', 'Tudo'], ...Object.entries(CAT).filter(([k]) => k !== 'outros').map(([k, v]) => [k, v.label])]} />
        </div>
      </div>

      {!raw ? (
        <div className="card py-24 text-center"><Loader2 size={24} className="mx-auto animate-spin text-slate-300" /></div>
      ) : (
        <div className="card !p-0 overflow-hidden">
          {!rows.length && <p className="text-sm text-slate-400 text-center py-14">Nenhuma alteração com esses filtros.</p>}
          {pageRows.map(r => {
            const dk = dayKey(r.updated_at)
            const header = dk !== lastDay ? (lastDay = dk, <div key={`d${dk}`} className="px-5 py-2 bg-slate-50 border-y border-slate-100 text-[11px] font-bold uppercase tracking-wide text-slate-500 capitalize">{dayLabel(dk)}</div>) : null
            const s = summary(r, showValues)
            const chk = r.platform === 'ml' && SYNCABLE.has(r.cat) ? (raw.checks[r.item_id] || null) : undefined
            return [
              header,
              <div key={`${r.platform}${r.id}`} className="flex items-center gap-3 px-5 py-2.5 border-b border-slate-50 hover:bg-slate-50/60" style={{ boxShadow: `inset 4px 0 0 ${PLAT[r.platform].color}` }}>
                <span className="text-[11px] text-slate-400 tabular-nums w-10 shrink-0">{hhmm(r.updated_at)}</span>
                {r.name?.thumb ? <img src={r.name.thumb} alt="" className="w-9 h-9 rounded-lg object-cover bg-slate-100 shrink-0" loading="lazy" /> : <span className="w-9 h-9 rounded-lg bg-slate-100 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <PlatBadge p={r.platform} />
                    <span className={`text-[10px] font-bold px-1.5 py-px rounded border ${CAT[r.cat].tone}`}>{r.label}</span>
                    <span className="text-[13px] text-slate-700 truncate" title={r.name?.title}>{r.name?.title || (r.action === 'claim_message' ? `Reclamação ${r.item_id}` : r.item_id || '—')}</span>
                  </div>
                  {s && <p className="text-[12px] text-slate-500 mt-0.5 truncate">{s}</p>}
                </div>
                {chk !== undefined && (chk
                  ? <span className="text-[10px] font-bold text-emerald-600 inline-flex items-center gap-0.5 shrink-0" title={`Marcado por ${chk.checked_by || '—'}`}><Check size={11} />replicado na Shopee</span>
                  : <Link to="/ml/historico" className="text-[10px] font-bold text-amber-600 inline-flex items-center gap-0.5 shrink-0 hover:underline" title="Mudança no ML que talvez precise ser feita na Shopee também"><Copy size={11} />replicar na Shopee?</Link>)}
                {r.by && <span className="text-[11px] text-slate-400 inline-flex items-center gap-1 shrink-0"><User size={11} />{r.by}</span>}
              </div>,
            ]
          })}
          {rows.length > PAGE && (
            <div className="flex items-center justify-between px-5 py-3 text-xs text-slate-500">
              <span>{cur * PAGE + 1}–{Math.min(rows.length, (cur + 1) * PAGE)} de {rows.length}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(cur - 1)} disabled={cur === 0} className="p-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-30"><ChevronLeft size={14} /></button>
                <span className="px-2">página {cur + 1} de {pages}</span>
                <button onClick={() => setPage(cur + 1)} disabled={cur >= pages - 1} className="p-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-30"><ChevronRight size={14} /></button>
              </div>
            </div>
          )}
        </div>
      )}

      <p className="text-[11px] text-slate-400 flex items-start gap-1.5"><Info size={12} className="shrink-0 mt-px" />
        <span>Só aparece o que foi feito <strong className="font-semibold">pelo sistema</strong> (alteração direto no painel do ML/Shopee não fica registrada aqui). "Replicar na Shopee?" = mudança de conteúdo/foto no ML ainda não marcada como feita na Shopee — a marcação é na tela de Histórico do ML. Registros antigos não têm "quem fez".</span>
      </p>
    </div>
  )
}
