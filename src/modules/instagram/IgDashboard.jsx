import { useMemo } from 'react'
import { Users, Eye, Heart, Sparkles, Clock, CalendarClock, MapPin, Image as ImageIcon } from 'lucide-react'
import { fmtInt, fmtPct, fmtDateTime, bestHours, hourlyLocal, engagement, KIND, STATUS } from './igApi'
import { IgPostsTable } from './IgPostsTable'
import { IgLearnings } from './IgLearnings'

function Kpi({ icon: Icon, label, value, detail, tone = 'text-slate-800' }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-1"><Icon size={14} className="text-slate-400" /><p className="text-xs font-semibold text-slate-500 uppercase">{label}</p></div>
      <p className={`text-2xl font-bold ${tone}`}>{value}</p>
      {detail && <p className="text-[11px] text-slate-400 mt-0.5">{detail}</p>}
    </div>
  )
}

// Barras simples (uma série) com dica no hover
function Bars({ data, height = 90, color = 'fill-pink-500', label }) {
  const max = Math.max(1, ...data.map(d => d.v || 0))
  const w = 100 / Math.max(1, data.length)
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} role="img" aria-label={label}>
      {data.map((d, i) => {
        const h = d.v ? Math.max(2, (d.v / max) * (height - 2)) : 1
        return (
          <rect key={i} x={i * w + w * 0.12} y={height - h} width={w * 0.76} height={h} rx={0.6} className={d.v ? color : 'fill-slate-200'}>
            <title>{d.title}</title>
          </rect>
        )
      })}
    </svg>
  )
}

function Line({ points, height = 90 }) {
  if (points.length < 2) return <p className="text-xs text-slate-400 py-8 text-center">O gráfico aparece a partir do 2º dia de dados.</p>
  const vals = points.map(p => p.v)
  const min = Math.min(...vals), max = Math.max(...vals)
  const span = Math.max(1, max - min)
  const xy = points.map((p, i) => [i / (points.length - 1) * 100, height - 6 - ((p.v - min) / span) * (height - 12)])
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      <polyline points={xy.map(p => p.join(',')).join(' ')} fill="none" className="stroke-violet-500" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      {xy.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1" className="fill-violet-500"><title>{points[i].title}</title></circle>)}
    </svg>
  )
}

export function IgDashboard({ account, daily, media, posts, onOpenPost }) {
  const followers = account?.followers_count || 0
  const t = account?.totals_28d || {}

  const followersSeries = useMemo(() => daily.filter(d => d.followers_count != null).slice(-60)
    .map(d => ({ v: d.followers_count, title: `${new Date(d.day + 'T12:00:00').toLocaleDateString('pt-BR')}: ${fmtInt(d.followers_count)} seguidores` })), [daily])
  const reachSeries = useMemo(() => daily.slice(-30)
    .map(d => ({ v: d.reach || 0, title: `${new Date(d.day + 'T12:00:00').toLocaleDateString('pt-BR')}: ${fmtInt(d.reach)} contas alcançadas` })), [daily])
  const gained = followersSeries.length > 1 ? followersSeries.at(-1).v - followersSeries[Math.max(0, followersSeries.length - 8)].v : null

  const last30 = media.filter(m => Date.now() - new Date(m.posted_at) < 30 * 86400e3 && m.media_product_type !== 'STORY')
  const avgEng = last30.length ? last30.reduce((s, m) => s + (engagement(m, followers) || 0), 0) / last30.length : null

  const hours = hourlyLocal(account?.online_followers)
  const best = bestHours(account?.online_followers, 3)

  const upcoming = posts.filter(p => ['agendado', 'publicando', 'erro'].includes(p.status)).slice(0, 6)

  // Melhor formato (média de alcance por tipo nos últimos 60 dias)
  const byFormat = useMemo(() => {
    const g = {}
    for (const m of media.filter(m => m.insights?.reach != null)) {
      const k = m.media_product_type === 'REELS' ? 'Reels' : m.media_product_type === 'STORY' ? 'Story' : m.media_type === 'CAROUSEL_ALBUM' ? 'Carrossel' : 'Foto'
      g[k] = g[k] || { n: 0, reach: 0, eng: 0 }
      g[k].n++; g[k].reach += m.insights.reach; g[k].eng += engagement(m, followers) || 0
    }
    return Object.entries(g).map(([k, v]) => ({ k, n: v.n, reach: v.reach / v.n, eng: v.eng / v.n })).sort((a, b) => b.reach - a.reach)
  }, [media, followers])

  const demo = account?.demographics || {}
  const cities = (demo.city || []).sort((a, b) => b.v - a.v).slice(0, 6)
  const ages = useMemo(() => {
    const g = {}
    for (const r of demo.age_gender || []) { const age = r.k?.[0]; g[age] = (g[age] || 0) + r.v }
    return Object.entries(g).sort((a, b) => a[0].localeCompare(b[0]))
  }, [demo])
  const genders = useMemo(() => {
    const g = {}
    for (const r of demo.age_gender || []) { const gd = r.k?.[1]; g[gd] = (g[gd] || 0) + r.v }
    return g
  }, [demo])
  const demoTotal = Object.values(genders).reduce((s, v) => s + v, 0)

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={Users} label="Seguidores" value={fmtInt(followers)}
          detail={gained != null ? `${gained >= 0 ? '+' : ''}${fmtInt(gained)} nos últimos 7 dias` : t.follower != null ? `+${fmtInt(t.follower)} novos em 28 dias` : 'segue no sistema a partir de hoje'}
          tone="text-violet-700" />
        <Kpi icon={Eye} label="Alcance (28 dias)" value={fmtInt(t.reach)} detail={t.views != null ? `${fmtInt(t.views)} visualizações` : 'contas únicas que viram'} />
        <Kpi icon={Heart} label="Interações (28 dias)" value={fmtInt(t.total_interactions)}
          detail={[t.likes != null && `${fmtInt(t.likes)} curtidas`, t.saves != null && `${fmtInt(t.saves)} salvos`, t.shares != null && `${fmtInt(t.shares)} compart.`].filter(Boolean).join(' · ') || null} tone="text-pink-600" />
        <Kpi icon={Sparkles} label="Engajamento médio" value={fmtPct(avgEng)} detail={`posts dos últimos 30 dias (${last30.length}) · interações ÷ alcance`} tone="text-emerald-600" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-bold text-slate-700">Alcance por dia (30 dias)</p>
            {t.profile_links_taps != null && <p className="text-[11px] text-slate-400">{fmtInt(t.profile_links_taps)} cliques no link da bio em 28 dias</p>}
          </div>
          <Bars data={reachSeries} label="Alcance por dia" />
          <p className="text-sm font-bold text-slate-700 mt-4 mb-1">Seguidores</p>
          <Line points={followersSeries} height={70} />
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <p className="text-sm font-bold text-slate-700 flex items-center gap-1.5"><Clock size={15} className="text-slate-400" /> Melhor horário pra postar</p>
          {best.length ? (
            <>
              <div className="flex gap-2 my-3">
                {best.map((b, i) => (
                  <div key={b.hour} className={`flex-1 rounded-xl px-2 py-2 text-center ${i === 0 ? 'bg-pink-50 text-pink-700' : 'bg-slate-50 text-slate-600'}`}>
                    <p className="text-lg font-bold">{String(b.hour).padStart(2, '0')}h</p>
                    <p className="text-[10px]">{fmtInt(b.v)} online</p>
                  </div>
                ))}
              </div>
              <Bars data={hours.map(h => ({ v: h.v, title: `${h.hour}h: ~${fmtInt(h.v)} seguidores online` }))} height={60} color="fill-violet-400" label="Seguidores online por hora" />
              <div className="flex justify-between text-[10px] text-slate-400 mt-1"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span></div>
              <p className="text-[11px] text-slate-400 mt-2">Média de seguidores online por hora (horário de Brasília). Poste um pouquinho antes do pico.</p>
            </>
          ) : <p className="text-xs text-slate-400 mt-3">A Meta libera esse dado depois de alguns dias de conta conectada (e com 100+ seguidores).</p>}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <p className="text-sm font-bold text-slate-700 flex items-center gap-1.5 mb-3"><CalendarClock size={15} className="text-slate-400" /> Próximos posts</p>
          {upcoming.length ? (
            <div className="flex flex-col gap-2">
              {upcoming.map(p => (
                <button key={p.id} onClick={() => onOpenPost(p)} className="flex items-center gap-2.5 text-left rounded-xl hover:bg-slate-50 p-1.5 -m-1.5">
                  <Thumb url={p.media?.[0]?.type === 'IMAGE' ? p.media[0].url : null} video={p.media?.[0]?.type === 'VIDEO'} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-700 truncate">{p.caption?.split('\n')[0] || '(sem legenda)'}</p>
                    <p className="text-[11px] text-slate-400">{KIND[p.kind].emoji} {KIND[p.kind].label} · {fmtDateTime(p.scheduled_at)}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS[p.status].chip}`}>{STATUS[p.status].label}</span>
                </button>
              ))}
            </div>
          ) : <p className="text-xs text-slate-400">Nada agendado. Use "Novo post" ou o Calendário.</p>}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <p className="text-sm font-bold text-slate-700 mb-3">Qual formato rende mais</p>
          {byFormat.length ? (
            <div className="flex flex-col gap-2.5">
              {byFormat.map((f, i) => (
                <div key={f.k}>
                  <div className="flex justify-between text-xs mb-1"><span className="font-semibold text-slate-600">{f.k} <span className="text-slate-400 font-normal">({f.n})</span></span><span className="text-slate-500">{fmtInt(f.reach)} de alcance · {fmtPct(f.eng)}</span></div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full rounded-full ${i === 0 ? 'bg-pink-500' : 'bg-violet-300'}`} style={{ width: `${(f.reach / byFormat[0].reach) * 100}%` }} /></div>
                </div>
              ))}
              <p className="text-[11px] text-slate-400">Média de alcance por post (todos os posts com métrica).</p>
            </div>
          ) : <p className="text-xs text-slate-400">Aparece depois da primeira atualização.</p>}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <p className="text-sm font-bold text-slate-700 flex items-center gap-1.5 mb-3"><MapPin size={15} className="text-slate-400" /> Quem segue</p>
          {demoTotal ? (
            <>
              <div className="flex gap-2 mb-3">
                {Object.entries(genders).map(([g, v]) => (
                  <div key={g} className="flex-1 bg-slate-50 rounded-xl px-2 py-1.5 text-center">
                    <p className="text-sm font-bold text-slate-700">{fmtPct(v / demoTotal)}</p>
                    <p className="text-[10px] text-slate-400">{g === 'F' ? 'mulheres' : g === 'M' ? 'homens' : 'não informado'}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-1 mb-3">
                {ages.map(([a, v]) => <span key={a} className="text-[11px] bg-violet-50 text-violet-700 rounded-full px-2 py-0.5">{a}: {fmtPct(v / demoTotal)}</span>)}
              </div>
              {cities.map(c => (
                <div key={c.k?.[0]} className="flex justify-between text-xs py-0.5"><span className="text-slate-600 truncate">{c.k?.[0]}</span><span className="text-slate-400">{fmtInt(c.v)}</span></div>
              ))}
            </>
          ) : <p className="text-xs text-slate-400">A Meta só mostra o público de contas com 100+ seguidores.</p>}
        </div>
      </div>

      <IgLearnings media={media} />

      <IgPostsTable media={media} followers={followers} />
    </div>
  )
}

export function Thumb({ url, video, size = 'w-10 h-10' }) {
  return (
    <div className={`${size} rounded-lg bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center`}>
      {url ? <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" /> : video ? <span className="text-sm">🎬</span> : <ImageIcon size={14} className="text-slate-300" />}
    </div>
  )
}
