import { useEffect, useMemo, useState } from 'react'
import { ArrowUp, ArrowDown, ArrowUpDown, ExternalLink, Search, Download, X, Heart, MessageCircle, Bookmark, Share2, Eye, Users, UserPlus, MousePointerClick, Clock, Info, Hash, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { fmtInt, fmtPct, engagement } from './igApi'
import { formatOf, likesOf, hashtagsOf, buildScorer, toCsv, avg, WEEKDAYS } from './igStats'
import { Thumb } from './IgDashboard'

// Posts publicados (20/10, pedido do Raphael): "Ordenar por" com todas as
// métricas, clique no cabeçalho pra ordenar, filtros (formato, período,
// busca), resumo do recorte, exportar CSV e painel de detalhes do post.

const PERIODS = { '30': '30 dias', '90': '90 dias', '180': '6 meses', '365': '1 ano', all: 'Tudo' }
const FORMATS = ['Todos', 'Foto', 'Carrossel', 'Reels']

export function IgPostsTable({ media, followers }) {
  const score = useMemo(() => buildScorer(media), [media])
  const COLS = useMemo(() => [
    { k: 'posted_at', label: 'Data',          short: 'Data',      get: m => new Date(m.posted_at).getTime() },
    { k: 'views',     label: 'Visualizações', short: 'Visualiz.', get: m => m.insights?.views, icon: Eye },
    { k: 'reach',     label: 'Alcance',       short: 'Alcance',   get: m => m.insights?.reach, icon: Users },
    { k: 'likes',     label: 'Curtidas',      short: 'Curtidas',  get: m => likesOf(m), icon: Heart },
    { k: 'comments',  label: 'Comentários',   short: 'Coment.',   get: m => m.comments_count, icon: MessageCircle },
    { k: 'saved',     label: 'Salvamentos',   short: 'Salvos',    get: m => m.insights?.saved, icon: Bookmark },
    { k: 'shares',    label: 'Compartilhamentos', short: 'Compart.', get: m => m.insights?.shares, icon: Share2 },
    { k: 'eng',       label: 'Engajamento',   short: 'Engaj.',    get: m => engagement(m, followers), pct: true },
    { k: 'score',     label: 'Desempenho vs. média', short: 'vs. média', get: m => score(m), score: true },
  ], [followers, score])
  const EXTRA_SORTS = [
    { k: 'follows',  label: 'Seguidores ganhos', get: m => m.insights?.follows },
    { k: 'visits',   label: 'Visitas ao perfil', get: m => m.insights?.profile_visits },
    { k: 'saverate', label: 'Taxa de salvamento (salvos ÷ alcance)', get: m => m.insights?.reach ? (m.insights.saved || 0) / m.insights.reach : null },
    { k: 'caption',  label: 'Tamanho da legenda', get: m => (m.caption || '').length },
  ]
  const ALL = [...COLS, ...EXTRA_SORTS]

  const [sort, setSort] = useState({ k: 'posted_at', dir: 'desc' })
  const [fmt, setFmt] = useState('Todos')
  const [period, setPeriod] = useState('all')
  const [q, setQ] = useState('')
  const [limit, setLimit] = useState(20)
  const [open, setOpen] = useState(null)

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase()
    const since = period === 'all' ? 0 : Date.now() - Number(period) * 86400e3
    return media.filter(m => m.media_product_type !== 'STORY')
      .filter(m => fmt === 'Todos' || formatOf(m) === fmt)
      .filter(m => new Date(m.posted_at).getTime() >= since)
      .filter(m => !qq || (m.caption || '').toLowerCase().includes(qq))
  }, [media, fmt, period, q])

  const sorted = useMemo(() => {
    const col = ALL.find(c => c.k === sort.k) || COLS[0]
    // sem valor vai pro fim, nos dois sentidos
    return [...filtered].sort((a, b) => {
      const va = col.get(a), vb = col.get(b)
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      return sort.dir === 'asc' ? va - vb : vb - va
    })
  }, [filtered, sort, COLS]) // eslint-disable-line react-hooks/exhaustive-deps

  const withIns = filtered.filter(m => m.insights?.reach != null)
  const summary = {
    n: filtered.length,
    reach: avg(withIns.map(m => m.insights.reach)),
    likes: avg(filtered.map(likesOf)),
    saved: withIns.reduce((s, m) => s + (m.insights.saved || 0), 0),
    eng: avg(filtered.map(m => engagement(m, followers))),
  }
  const missing = filtered.length - withIns.length

  const clickCol = k => setSort(s => s.k === k ? { k, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { k, dir: 'desc' })

  function exportCsv() {
    const head = ['Data', 'Formato', 'Legenda', 'Link', 'Visualizações', 'Alcance', 'Curtidas', 'Comentários', 'Salvamentos', 'Compartilhamentos', 'Seguidores ganhos', 'Visitas ao perfil', 'Engajamento %', 'Desempenho vs média']
    const rows = sorted.map(m => [
      new Date(m.posted_at).toLocaleString('pt-BR'), formatOf(m), (m.caption || '').replace(/\s+/g, ' ').slice(0, 300), m.permalink,
      m.insights?.views ?? '', m.insights?.reach ?? '', likesOf(m) ?? '', m.comments_count ?? '', m.insights?.saved ?? '', m.insights?.shares ?? '',
      m.insights?.follows ?? '', m.insights?.profile_visits ?? '',
      engagement(m, followers) != null ? (engagement(m, followers) * 100).toFixed(2).replace('.', ',') : '',
      score(m) != null ? score(m).toFixed(2).replace('.', ',') : '',
    ])
    const blob = new Blob([toCsv([head, ...rows])], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `instagram-posts-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-100">
        <p className="text-sm font-bold text-slate-700 mr-auto">Posts publicados</p>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={e => { setQ(e.target.value); setLimit(20) }} placeholder="Buscar na legenda ou #hashtag" className="pl-7 pr-2 py-1.5 text-xs border border-slate-200 rounded-lg w-52" />
        </div>
        <select value={fmt} onChange={e => { setFmt(e.target.value); setLimit(20) }} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
          {FORMATS.map(f => <option key={f} value={f}>{f === 'Todos' ? 'Todos os formatos' : f}</option>)}
        </select>
        <select value={period} onChange={e => { setPeriod(e.target.value); setLimit(20) }} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
          {Object.entries(PERIODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <div className="flex items-center gap-1 bg-pink-50 border border-pink-200 rounded-lg pl-2">
          <span className="text-xs font-semibold text-pink-700 whitespace-nowrap">Ordenar por</span>
          <select value={sort.k} onChange={e => setSort(s => ({ ...s, k: e.target.value }))} className="text-xs font-semibold text-pink-700 bg-transparent py-1.5 pr-1 focus:outline-none">
            {ALL.map(c => <option key={c.k} value={c.k}>{c.label}</option>)}
          </select>
          <button onClick={() => setSort(s => ({ ...s, dir: s.dir === 'desc' ? 'asc' : 'desc' }))} title={sort.dir === 'desc' ? 'Maior → menor' : 'Menor → maior'}
            className="px-1.5 py-1.5 text-pink-700 hover:bg-pink-100 rounded-r-lg border-l border-pink-200">
            {sort.dir === 'desc' ? <ArrowDown size={13} /> : <ArrowUp size={13} />}
          </button>
        </div>
        <button onClick={exportCsv} title="Baixar planilha (CSV) com o recorte atual" className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><Download size={14} /></button>
      </div>

      {/* Resumo do recorte */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-px bg-slate-100 border-b border-slate-100">
        {[
          ['Posts', fmtInt(summary.n)],
          ['Alcance médio', fmtInt(summary.reach)],
          ['Curtidas médias', fmtInt(summary.likes)],
          ['Salvamentos', fmtInt(summary.saved)],
          ['Engajamento médio', fmtPct(summary.eng)],
        ].map(([l, v]) => (
          <div key={l} className="bg-white px-4 py-2"><p className="text-[10px] uppercase font-semibold text-slate-400">{l}</p><p className="text-sm font-bold text-slate-700">{v}</p></div>
        ))}
      </div>

      {sorted.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">Post</th>
                {COLS.map(c => (
                  <th key={c.k} className={`px-2 py-2 font-semibold whitespace-nowrap ${c.k === 'posted_at' ? 'text-left' : 'text-right'}`}>
                    <button onClick={() => clickCol(c.k)} title={`Ordenar por ${c.label.toLowerCase()}`}
                      className={`inline-flex items-center gap-0.5 uppercase hover:text-pink-600 ${sort.k === c.k ? 'text-pink-600' : ''}`}>
                      {c.short}
                      {sort.k === c.k ? (sort.dir === 'desc' ? <ArrowDown size={11} /> : <ArrowUp size={11} />) : <ArrowUpDown size={10} className="opacity-30" />}
                    </button>
                  </th>
                ))}
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.slice(0, limit).map(m => {
                const d = new Date(m.posted_at)
                return (
                  <tr key={m.id} onClick={() => setOpen(m)} className="hover:bg-pink-50/40 cursor-pointer">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2.5 min-w-[220px]">
                        <Thumb url={m.thumbnail_url || (m.media_type !== 'VIDEO' ? m.media_url : null)} video={m.media_type === 'VIDEO'} />
                        <div className="min-w-0">
                          <p className="text-xs text-slate-700 line-clamp-1 max-w-[300px]">{m.caption?.split('\n')[0] || '(sem legenda)'}</p>
                          <p className="text-[11px] text-slate-400">{formatOf(m)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-xs text-slate-500 whitespace-nowrap">
                      {d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                      <span className="block text-[10px] text-slate-400">{WEEKDAYS[d.getDay()]} · {d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                    </td>
                    {COLS.slice(1).map(c => {
                      const v = c.get(m)
                      if (c.score) return (
                        <td key={c.k} className="px-2 py-2 text-right">
                          {v == null ? <span className="text-slate-300">—</span> : (
                            <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${v >= 1.3 ? 'bg-emerald-100 text-emerald-700' : v <= 0.7 ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-600'}`}>
                              {v.toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}×
                            </span>
                          )}
                        </td>
                      )
                      return <td key={c.k} className={`px-2 py-2 text-right tabular-nums ${c.pct ? 'font-semibold text-emerald-600' : ''} ${sort.k === c.k ? 'bg-pink-50/50' : ''}`}>{v == null ? <span className="text-slate-300">—</span> : c.pct ? fmtPct(v) : fmtInt(v)}</td>
                    })}
                    <td className="px-3 py-2 text-right" onClick={e => e.stopPropagation()}>{m.permalink && <a href={m.permalink} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-pink-500"><ExternalLink size={14} /></a>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="text-sm text-slate-400 p-6 text-center">Nenhum post nesse filtro.</p>}

      <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-t border-slate-100">
        <p className="text-[11px] text-slate-400 flex items-center gap-1 mr-auto">
          <Info size={11} /> Clique num post pra ver tudo dele. "vs. média" compara com a mediana do mesmo formato (1,0× = post típico).
          {missing > 0 && ` ${missing} post${missing === 1 ? '' : 's'} ainda sem métricas — chegam nas próximas atualizações automáticas.`}
        </p>
        {sorted.length > limit && <button onClick={() => setLimit(l => l + 30)} className="text-xs font-semibold text-pink-600 hover:underline">Mostrar mais ({sorted.length - limit})</button>}
      </div>

      {open && <PostDetail m={open} all={media} followers={followers} score={score} onClose={() => setOpen(null)} />}
    </div>
  )
}

function PostDetail({ m, all, followers, score, onClose }) {
  const [comments, setComments] = useState(null)
  useEffect(() => {
    supabase.from('ig_comments').select('id, username, text, commented_at, from_self, parent_id').eq('media_id', m.id).order('commented_at', { ascending: false }).limit(30)
      .then(({ data }) => setComments(data || []))
  }, [m.id])
  useEffect(() => {
    const k = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [onClose])

  const peers = all.filter(x => formatOf(x) === formatOf(m) && x.insights?.reach != null)
  const peerAvg = k => avg(peers.map(x => k === 'likes' ? likesOf(x) : x.insights?.[k]))
  const i = m.insights || {}
  const metrics = [
    { k: 'views', label: 'Visualizações', icon: Eye, v: i.views },
    { k: 'reach', label: 'Alcance', icon: Users, v: i.reach },
    { k: 'likes', label: 'Curtidas', icon: Heart, v: likesOf(m) },
    { k: 'comments', label: 'Comentários', icon: MessageCircle, v: m.comments_count },
    { k: 'saved', label: 'Salvamentos', icon: Bookmark, v: i.saved },
    { k: 'shares', label: 'Compartilhamentos', icon: Share2, v: i.shares },
    { k: 'follows', label: 'Seguidores ganhos', icon: UserPlus, v: i.follows },
    { k: 'profile_visits', label: 'Visitas ao perfil', icon: MousePointerClick, v: i.profile_visits },
    { k: 'ig_reels_avg_watch_time', label: 'Tempo médio assistido', icon: Clock, v: i.ig_reels_avg_watch_time, fmt: v => `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s` },
  ].filter(x => x.v != null)
  const sc = score(m)
  const tags = hashtagsOf(m)
  const d = new Date(m.posted_at)

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-lg h-full bg-white overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-5 py-3 flex items-center gap-2">
          <p className="font-bold text-slate-800">{formatOf(m)} · {d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
          <span className="text-xs text-slate-400">{WEEKDAYS[d.getDay()]}, {d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <div className="flex gap-4">
            <div className="w-36 shrink-0">
              {(m.thumbnail_url || m.media_url) && <img src={m.thumbnail_url || m.media_url} alt="" className="w-full rounded-xl object-cover aspect-[4/5]" />}
            </div>
            <div className="min-w-0 flex flex-col gap-2">
              {sc != null && (
                <div className={`rounded-xl px-3 py-2 ${sc >= 1.3 ? 'bg-emerald-50 text-emerald-700' : sc <= 0.7 ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-600'}`}>
                  <p className="text-2xl font-black">{sc.toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}×</p>
                  <p className="text-[11px]">{sc >= 1.3 ? 'acima' : sc <= 0.7 ? 'abaixo' : 'na linha'} da média de {formatOf(m).toLowerCase()}s da conta</p>
                </div>
              )}
              <p className="text-xs text-slate-500">Engajamento: <b className="text-emerald-600">{fmtPct(engagement(m, followers))}</b></p>
              {m.permalink && <a href={m.permalink} target="_blank" rel="noreferrer" className="text-xs font-semibold text-pink-600 flex items-center gap-1 hover:underline">Abrir no Instagram <ExternalLink size={12} /></a>}
            </div>
          </div>

          {metrics.length ? (
            <div className="grid grid-cols-2 gap-2">
              {metrics.map(x => {
                const pa = ['views', 'reach', 'likes', 'saved', 'shares'].includes(x.k) ? peerAvg(x.k) : null
                const diff = pa ? x.v / pa - 1 : null
                return (
                  <div key={x.k} className="bg-slate-50 rounded-xl px-3 py-2">
                    <p className="text-[11px] text-slate-500 flex items-center gap-1"><x.icon size={12} /> {x.label}</p>
                    <p className="text-lg font-bold text-slate-800">{x.fmt ? x.fmt(x.v) : fmtInt(x.v)}</p>
                    {diff != null && <p className={`text-[10px] font-semibold ${diff >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{diff >= 0 ? '+' : ''}{Math.round(diff * 100)}% vs. média ({fmtInt(pa)})</p>}
                  </div>
                )
              })}
            </div>
          ) : <p className="text-xs text-slate-400">Métricas detalhadas ainda não chegaram pra esse post — o sistema busca sozinho nas próximas horas.</p>}

          {tags.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase mb-1 flex items-center gap-1"><Hash size={12} /> Hashtags ({tags.length})</p>
              <div className="flex flex-wrap gap-1">{tags.map(t => <span key={t} className="text-[11px] bg-violet-50 text-violet-700 rounded-full px-2 py-0.5">{t}</span>)}</div>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Legenda ({(m.caption || '').length} caracteres)</p>
            <p className="text-sm text-slate-700 whitespace-pre-line bg-slate-50 rounded-xl p-3">{m.caption || '(sem legenda)'}</p>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Comentários</p>
            {!comments ? <Loader2 size={16} className="animate-spin text-slate-400" />
              : comments.length ? comments.map(c => (
                <p key={c.id} className={`text-sm py-1 ${c.parent_id ? 'ml-4 text-slate-500' : 'text-slate-700'}`}><b className={c.from_self ? 'text-pink-600' : ''}>@{c.username}</b> {c.text}</p>
              )) : <p className="text-xs text-slate-400">{m.comments_count ? 'Comentários de posts com mais de 45 dias não são sincronizados.' : 'Sem comentários.'}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
