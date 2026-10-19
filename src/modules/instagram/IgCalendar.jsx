import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, FileText, ExternalLink } from 'lucide-react'
import { KIND, STATUS, bestHours, fmtDateTime } from './igApi'
import { Thumb } from './IgDashboard'

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const pad = n => String(n).padStart(2, '0')
const localDay = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

// Calendário do Instagram: o que já saiu (vindo da API), o que está agendado
// e os rascunhos. Clique num dia vazio pra criar um post já naquela data.
export function IgCalendar({ posts, media, account, onNew, onOpen }) {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const today = localDay(new Date())
  const best = bestHours(account?.online_followers, 1)[0]?.hour ?? 19

  const byDay = useMemo(() => {
    const map = {}
    const push = (day, item) => { (map[day] = map[day] || []).push(item) }
    const fromSystem = new Set()
    for (const p of posts) {
      if (p.ig_media_id) fromSystem.add(p.ig_media_id)
      const when = p.status === 'publicado' ? p.published_at : p.scheduled_at
      if (when) push(localDay(new Date(when)), { kind: 'post', when, p })
    }
    for (const m of media) {
      if (fromSystem.has(m.id)) continue
      push(localDay(new Date(m.posted_at)), { kind: 'media', when: m.posted_at, m })
    }
    for (const k in map) map[k].sort((a, b) => new Date(a.when) - new Date(b.when))
    return map
  }, [posts, media])

  const drafts = posts.filter(p => p.status === 'rascunho' && !p.scheduled_at)

  const cells = useMemo(() => {
    const first = new Date(month)
    const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7))
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d })
  }, [month])
  const label = month.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const monthCount = Object.entries(byDay).filter(([d]) => d.startsWith(localDay(month).slice(0, 7))).reduce((s, [, l]) => s + l.length, 0)

  function newAt(d) {
    const at = new Date(d); at.setHours(best, 0, 0, 0)
    if (at < new Date()) { at.setTime(Date.now() + 30 * 60e3); at.setMinutes(Math.ceil(at.getMinutes() / 15) * 15, 0, 0) }
    onNew(at.toISOString())
  }

  return (
    <div className="grid lg:grid-cols-[1fr_260px] gap-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <button onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))} className="p-1.5 rounded-lg hover:bg-slate-100"><ChevronLeft size={18} /></button>
          <p className="font-bold text-slate-700 w-44 text-center">{label.charAt(0).toUpperCase() + label.slice(1)}</p>
          <button onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))} className="p-1.5 rounded-lg hover:bg-slate-100"><ChevronRight size={18} /></button>
          <button onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)) }} className="text-xs font-semibold text-pink-600 px-2 py-1 rounded-lg hover:bg-pink-50">Hoje</button>
          <p className="ml-auto text-xs text-slate-400">{monthCount} post{monthCount === 1 ? '' : 's'} no mês</p>
        </div>
        <div className="grid grid-cols-7 gap-1 text-[11px] font-semibold text-slate-400 mb-1">{WEEKDAYS.map(w => <div key={w} className="px-1">{w}</div>)}</div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map(d => {
            const key = localDay(d)
            const items = byDay[key] || []
            const out = d.getMonth() !== month.getMonth()
            const past = key < today
            return (
              <div key={key} className={`group min-h-[96px] rounded-xl border p-1 flex flex-col gap-0.5 ${key === today ? 'border-pink-400 bg-pink-50/40' : 'border-slate-100'} ${out ? 'opacity-40' : ''}`}>
                <div className="flex items-center justify-between px-0.5">
                  <span className={`text-[11px] font-semibold ${key === today ? 'text-pink-600' : 'text-slate-500'}`}>{d.getDate()}</span>
                  {!past && <button onClick={() => newAt(d)} title="Novo post neste dia" className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-slate-400 hover:text-pink-600 hover:bg-pink-50"><Plus size={13} /></button>}
                </div>
                {items.slice(0, 3).map((it, i) => it.kind === 'post' ? (
                  <button key={i} onClick={() => onOpen(it.p)} title={it.p.caption}
                    className="flex items-center gap-1 text-left rounded-md bg-slate-50 hover:bg-slate-100 px-1 py-0.5 overflow-hidden">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS[it.p.status].dot}`} />
                    <span className="text-[10px] text-slate-600 truncate">{new Date(it.when).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} {KIND[it.p.kind].emoji} {it.p.caption?.split('\n')[0] || KIND[it.p.kind].label}</span>
                  </button>
                ) : (
                  <a key={i} href={it.m.permalink} target="_blank" rel="noreferrer" title={it.m.caption}
                    className="flex items-center gap-1 rounded-md bg-emerald-50/70 hover:bg-emerald-100 px-1 py-0.5 overflow-hidden">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-emerald-500" />
                    <span className="text-[10px] text-emerald-800 truncate">{it.m.media_product_type === 'STORY' ? '⭕' : it.m.media_product_type === 'REELS' ? '🎬' : it.m.media_type === 'CAROUSEL_ALBUM' ? '🗂️' : '🖼️'} {it.m.caption?.split('\n')[0] || 'post'}</span>
                  </a>
                ))}
                {items.length > 3 && <span className="text-[10px] text-slate-400 px-1">+{items.length - 3}</span>}
              </div>
            )
          })}
        </div>
        <div className="flex flex-wrap gap-3 mt-3 text-[11px] text-slate-500">
          {Object.entries(STATUS).map(([k, s]) => <span key={k} className="flex items-center gap-1"><span className={`w-2 h-2 rounded-full ${s.dot}`} />{s.label}</span>)}
          <span className="text-slate-400">· verde-claro = publicado direto pelo app do Instagram</span>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <p className="text-sm font-bold text-slate-700 flex items-center gap-1.5 mb-3"><FileText size={15} className="text-slate-400" /> Rascunhos ({drafts.length})</p>
          {drafts.length ? drafts.map(p => (
            <button key={p.id} onClick={() => onOpen(p)} className="w-full flex items-center gap-2 text-left rounded-xl hover:bg-slate-50 p-1.5">
              <Thumb url={p.media?.[0]?.type === 'IMAGE' ? p.media[0].url : null} video={p.media?.[0]?.type === 'VIDEO'} size="w-9 h-9" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-700 truncate">{p.caption?.split('\n')[0] || '(sem legenda)'}</p>
                <p className="text-[10px] text-slate-400">{KIND[p.kind].label} · {p.created_by_name || ''}</p>
              </div>
            </button>
          )) : <p className="text-xs text-slate-400">Nenhum rascunho sem data.</p>}
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <p className="text-sm font-bold text-slate-700 mb-2">Com problema</p>
          {posts.filter(p => p.status === 'erro').length ? posts.filter(p => p.status === 'erro').map(p => (
            <button key={p.id} onClick={() => onOpen(p)} className="w-full text-left rounded-xl bg-red-50 hover:bg-red-100 p-2 mb-1.5">
              <p className="text-xs font-semibold text-red-700 truncate">{p.caption?.split('\n')[0] || KIND[p.kind].label}</p>
              <p className="text-[10px] text-red-600 line-clamp-2">{p.error}</p>
              <p className="text-[10px] text-red-400">{fmtDateTime(p.scheduled_at)}</p>
            </button>
          )) : <p className="text-xs text-slate-400">Tudo certo por aqui ✨</p>}
        </div>
        <p className="text-[11px] text-slate-400 px-1 flex gap-1"><ExternalLink size={11} className="shrink-0 mt-0.5" /> Agendados saem sozinhos (o sistema confere a cada 5 minutos), mesmo com o computador desligado.</p>
      </div>
    </div>
  )
}
