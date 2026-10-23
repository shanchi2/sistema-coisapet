import { useEffect, useMemo, useState } from 'react'
import { Loader2, X, ExternalLink, Eye, Users, MessageCircle, LogOut, UserPlus, Radio, Clock } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { BUCKET, fmtInt, fmtPct, fmtDateTime } from './igApi'

// Stories (23/10, pedido do Raphael). A Meta só mostra os stories que estão
// NO AR e as métricas somem quando ele expira (24h) — o cron guarda tudo a
// cada ~15 min em ig_stories (com a imagem copiada pro bucket). Por isso o
// histórico começa em 23/10: os anteriores a Meta não devolve mais.

const PERIODS = [['7', '7 dias'], ['30', '30 dias'], ['90', '90 dias'], ['all', 'Tudo']]
const SORTS = [
  ['recent', 'Mais recentes'], ['reach', 'Alcance'], ['views', 'Visualizações'],
  ['interactions', 'Interações'], ['exit', 'Menos saídas'], ['replies', 'Respostas'],
]
const NAV = [
  ['tap_forward', 'Avançou pro próximo', 'bg-sky-400'],
  ['tap_back', 'Voltou pra ver de novo', 'bg-emerald-400'],
  ['tap_exit', 'Saiu dos stories', 'bg-rose-400'],
  ['swipe_forward', 'Pulou pra outro perfil', 'bg-amber-400'],
]

const imgOf = s => s.media_path ? supabase.storage.from(BUCKET).getPublicUrl(s.media_path).data.publicUrl : s.media_url
const ins = s => s.insights || {}
// Taxa de saída: quantos dos que viram saíram dos stories nesse ponto
const exitRate = s => (s.navigation?.tap_exit != null && ins(s).reach) ? s.navigation.tap_exit / ins(s).reach : null
const live = s => new Date(s.expires_at) > new Date()
const hoursLeft = s => Math.max(0, Math.round((new Date(s.expires_at) - Date.now()) / 3600e3))
const spHour = iso => Number(new Date(iso).toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false })) % 24

function Card({ label, value, detail, icon: Icon }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-1"><Icon size={14} className="text-slate-400" /><p className="text-xs font-semibold text-slate-500 uppercase">{label}</p></div>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      {detail && <p className="text-[11px] text-slate-400 mt-0.5">{detail}</p>}
    </div>
  )
}

export function IgStories() {
  const [rows, setRows] = useState(null)
  const [period, setPeriod] = useState('30')
  const [sort, setSort] = useState('recent')
  const [open, setOpen] = useState(null)

  useEffect(() => {
    supabase.from('ig_stories').select('*').order('posted_at', { ascending: false }).limit(500)
      .then(({ data }) => setRows(data || []))
  }, [])

  const list = useMemo(() => {
    if (!rows) return []
    const since = period === 'all' ? 0 : Date.now() - Number(period) * 86400e3
    const r = rows.filter(s => new Date(s.posted_at).getTime() >= since)
    const key = {
      recent: s => new Date(s.posted_at).getTime(), reach: s => ins(s).reach ?? -1, views: s => ins(s).views ?? -1,
      interactions: s => ins(s).total_interactions ?? -1, exit: s => -(exitRate(s) ?? 9), replies: s => ins(s).replies ?? -1,
    }[sort]
    return [...r].sort((a, b) => key(b) - key(a))
  }, [rows, period, sort])

  const withIns = list.filter(s => s.insights)
  const sum = k => withIns.reduce((t, s) => t + (ins(s)[k] || 0), 0)
  const avg = k => withIns.length ? sum(k) / withIns.length : null
  const exits = withIns.map(exitRate).filter(v => v != null)
  const avgExit = exits.length ? exits.reduce((a, b) => a + b, 0) / exits.length : null
  const nowLive = (rows || []).filter(live)

  // Melhor horário pros stories (média de alcance por faixa de horário)
  const byHour = useMemo(() => {
    const g = {}
    for (const s of withIns) {
      const h = spHour(s.posted_at), slot = h < 6 ? 'Madrugada (0–6h)' : h < 12 ? 'Manhã (6–12h)' : h < 18 ? 'Tarde (12–18h)' : 'Noite (18–24h)'
      ;(g[slot] ||= []).push(ins(s).reach || 0)
    }
    return Object.entries(g).map(([k, v]) => ({ k, n: v.length, reach: v.reduce((a, b) => a + b, 0) / v.length })).sort((a, b) => b.reach - a.reach)
  }, [withIns])

  if (!rows) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-slate-400" /></div>

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
          {PERIODS.map(([k, l]) => (
            <button key={k} onClick={() => setPeriod(k)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${period === k ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{l}</button>
          ))}
        </div>
        <label className="text-xs font-semibold text-slate-500 flex items-center gap-1.5 ml-auto">Ordenar por
          <select value={sort} onChange={e => setSort(e.target.value)} className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700">
            {SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card icon={Radio} label="Stories" value={fmtInt(list.length)} detail={nowLive.length ? `${nowLive.length} no ar agora` : 'nenhum no ar agora'} />
        <Card icon={Users} label="Alcance médio" value={fmtInt(avg('reach'))} detail="contas por story" />
        <Card icon={Eye} label="Visualizações" value={fmtInt(avg('views'))} detail={`média por story · ${fmtInt(sum('views'))} no total`} />
        <Card icon={LogOut} label="Taxa de saída" value={fmtPct(avgExit)} detail="dos que viram, quantos saíram" />
        <Card icon={MessageCircle} label="Respostas" value={fmtInt(sum('replies'))} detail={`${fmtInt(sum('profile_visits'))} visitas ao perfil · ${fmtInt(sum('follows'))} seguidores`} />
      </div>

      {byHour.length > 1 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <p className="text-sm font-bold text-slate-700 flex items-center gap-1.5 mb-3"><Clock size={15} className="text-slate-400" /> Que horário os stories rendem mais</p>
          <div className="flex flex-col gap-2">
            {byHour.map((h, i) => (
              <div key={h.k}>
                <div className="flex justify-between text-xs mb-1"><span className="font-semibold text-slate-600">{h.k} <span className="text-slate-400 font-normal">({h.n})</span></span><span className="text-slate-500">{fmtInt(h.reach)} de alcance médio</span></div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full rounded-full ${i === 0 ? 'bg-pink-500' : 'bg-violet-300'}`} style={{ width: `${(h.reach / byHour[0].reach) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">
          Nenhum story nesse período. O sistema guarda os stories enquanto estão no ar (a Meta não devolve os antigos) — o histórico começa em 23/10.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
          {list.map(s => {
            const er = exitRate(s)
            return (
              <button key={s.id} onClick={() => setOpen(s)} className="text-left bg-white border border-slate-200 rounded-2xl overflow-hidden hover:border-pink-300 hover:shadow-sm transition">
                <div className="relative aspect-[9/16] bg-slate-100">
                  {imgOf(s) ? <img src={imgOf(s)} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" onError={e => { e.currentTarget.style.display = 'none' }} /> : null}
                  {live(s) && <span className="absolute top-2 left-2 text-[10px] font-bold bg-emerald-500 text-white rounded-full px-2 py-0.5">no ar · {hoursLeft(s)}h</span>}
                  {s.media_type === 'VIDEO' && <span className="absolute top-2 right-2 text-[10px] font-bold bg-black/60 text-white rounded-full px-2 py-0.5">vídeo</span>}
                  <span className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent text-white text-[11px] font-semibold px-2 pt-6 pb-1.5">{fmtDateTime(s.posted_at)}</span>
                </div>
                <div className="p-2.5 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px]">
                  <span className="text-slate-400">Alcance</span><span className="text-right font-bold text-slate-700">{fmtInt(ins(s).reach)}</span>
                  <span className="text-slate-400">Visualiz.</span><span className="text-right font-semibold text-slate-600">{fmtInt(ins(s).views)}</span>
                  <span className="text-slate-400">Saída</span><span className={`text-right font-semibold ${er == null ? 'text-slate-300' : er > 0.25 ? 'text-rose-500' : 'text-emerald-600'}`}>{fmtPct(er)}</span>
                  <span className="text-slate-400">Respostas</span><span className="text-right font-semibold text-slate-600">{fmtInt(ins(s).replies)}</span>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {open && <StoryModal s={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

function StoryModal({ s, onClose }) {
  const i = ins(s), nav = s.navigation || {}
  const navTotal = NAV.reduce((t, [k]) => t + (nav[k] || 0), 0)
  const rows = [
    ['Alcance (contas)', i.reach], ['Visualizações', i.views], ['Interações', i.total_interactions],
    ['Respostas', i.replies], ['Compartilhamentos', i.shares], ['Visitas ao perfil', i.profile_visits], ['Seguidores ganhos', i.follows],
  ]
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto flex flex-col sm:flex-row" onClick={e => e.stopPropagation()}>
        <div className="sm:w-72 shrink-0 bg-slate-900 relative aspect-[9/16] sm:aspect-auto">
          {imgOf(s) && <img src={imgOf(s)} alt="" className="absolute inset-0 w-full h-full object-contain" />}
        </div>
        <div className="p-5 flex-1 flex flex-col gap-4">
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <p className="font-bold text-slate-800">Story de {fmtDateTime(s.posted_at)}</p>
              <p className="text-xs text-slate-500">{live(s) ? `No ar — expira em ${hoursLeft(s)}h` : 'Expirado'}{s.insights_at && ` · métricas de ${fmtDateTime(s.insights_at)}`}</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={16} /></button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {rows.map(([l, v]) => (
              <div key={l} className="rounded-xl bg-slate-50 px-3 py-2"><p className="text-[10px] text-slate-400 uppercase">{l}</p><p className="text-lg font-bold text-slate-800">{fmtInt(v)}</p></div>
            ))}
          </div>
          {navTotal > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-600 mb-2">O que as pessoas fizeram nesse story</p>
              <div className="flex h-3 rounded-full overflow-hidden mb-2">
                {NAV.map(([k, , c]) => nav[k] ? <div key={k} className={c} style={{ width: `${(nav[k] / navTotal) * 100}%` }} /> : null)}
              </div>
              {NAV.map(([k, l, c]) => (
                <div key={k} className="flex items-center gap-2 text-xs py-0.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${c}`} /><span className="flex-1 text-slate-600">{l}</span>
                  <span className="font-semibold text-slate-700">{fmtInt(nav[k] || 0)}</span><span className="text-slate-400 w-12 text-right">{fmtPct((nav[k] || 0) / navTotal)}</span>
                </div>
              ))}
              <p className="text-[11px] text-slate-400 mt-1.5">Muita gente "saindo" = o story não prendeu. "Voltou pra ver de novo" é ótimo sinal.</p>
            </div>
          )}
          {s.permalink && live(s) && (
            <a href={s.permalink} target="_blank" rel="noreferrer" className="self-start flex items-center gap-1.5 text-xs font-semibold text-pink-600 hover:underline"><ExternalLink size={13} />Abrir no Instagram</a>
          )}
        </div>
      </div>
    </div>
  )
}
