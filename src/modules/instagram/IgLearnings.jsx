import { useMemo } from 'react'
import { Lightbulb, CalendarDays, Clock, Hash, Text, Activity } from 'lucide-react'
import { buildScorer, hashtagsOf, avg, WEEKDAYS, SLOTS } from './igStats'

// Aprendizados (20/10): o que funciona MELHOR na conta, a partir do
// histórico de posts do último ano. Usa o índice "vs. média" (cada post
// comparado com a mediana do próprio formato) pra comparar justo.

const fmtX = v => v == null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}×`

function Card({ icon: Icon, title, tip, children }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <p className="text-sm font-bold text-slate-700 flex items-center gap-1.5"><Icon size={15} className="text-slate-400" /> {title}</p>
      {tip && <p className="text-xs text-pink-700 bg-pink-50 rounded-lg px-2.5 py-1.5 mt-2">💡 {tip}</p>}
      <div className="mt-3">{children}</div>
    </div>
  )
}

function Rank({ rows, max }) {
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((r, i) => (
        <div key={r.label}>
          <div className="flex justify-between text-xs mb-0.5">
            <span className="font-semibold text-slate-600 truncate">{r.label} {r.sub && <span className="text-slate-400 font-normal">{r.sub}</span>}</span>
            <span className="text-slate-500 shrink-0 ml-2">{fmtX(r.v)} <span className="text-slate-400">· {r.n} post{r.n === 1 ? '' : 's'}</span></span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div className={`h-full rounded-full ${i === 0 && r.v > 1 ? 'bg-pink-500' : 'bg-violet-300'}`} style={{ width: `${Math.min(100, ((r.v || 0) / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function IgLearnings({ media }) {
  const data = useMemo(() => {
    const posts = media.filter(m => m.media_product_type !== 'STORY' && Date.now() - new Date(m.posted_at) < 365 * 86400e3)
    const score = buildScorer(posts)
    const scored = posts.map(m => ({ m, s: score(m), d: new Date(m.posted_at) })).filter(x => x.s != null)
    const group = (keyFn, labels) => {
      const g = {}
      for (const x of scored) { const k = keyFn(x); if (k == null) continue; (g[k] = g[k] || []).push(x.s) }
      return labels.map(l => ({ ...l, v: avg(g[l.k] || []), n: (g[l.k] || []).length })).filter(r => r.n > 0)
    }
    const weekdays = group(x => x.d.getDay(), WEEKDAYS.map((w, i) => ({ k: i, label: w })))
    const slots = group(x => SLOTS.find(s => s.test(x.d.getHours()))?.k, SLOTS.map(s => ({ k: s.k, label: s.label, sub: s.sub })))
    const lens = group(x => { const n = (x.m.caption || '').length; return n < 150 ? 'curta' : n < 600 ? 'media' : 'longa' },
      [{ k: 'curta', label: 'Curta', sub: '< 150 caracteres' }, { k: 'media', label: 'Média', sub: '150–600' }, { k: 'longa', label: 'Longa', sub: '> 600' }])

    const tagMap = {}
    for (const x of scored) for (const t of hashtagsOf(x.m)) (tagMap[t] = tagMap[t] || []).push(x.s)
    const tags = Object.entries(tagMap).filter(([, v]) => v.length >= 3)
      .map(([t, v]) => ({ label: t, v: avg(v), n: v.length })).sort((a, b) => b.v - a.v)

    // ritmo: posts por semana nas últimas 12 semanas
    const weeks = Array.from({ length: 12 }, (_, i) => {
      const end = Date.now() - i * 7 * 86400e3, start = end - 7 * 86400e3
      return { n: posts.filter(m => { const t = new Date(m.posted_at).getTime(); return t >= start && t < end }).length, i }
    }).reverse()
    const last = posts.length ? Math.floor((Date.now() - Math.max(...posts.map(m => new Date(m.posted_at).getTime()))) / 86400e3) : null
    return { weekdays, slots, lens, tags, weeks, last, n: scored.length }
  }, [media])

  if (data.n < 6) return null
  const best = rows => [...rows].filter(r => r.n >= 2).sort((a, b) => b.v - a.v)[0]
  const maxOf = rows => Math.max(1.2, ...rows.map(r => r.v || 0))
  const bw = best(data.weekdays), bs = best(data.slots), bl = best(data.lens)
  const perWeek = data.weeks.reduce((s, w) => s + w.n, 0) / data.weeks.length
  const maxW = Math.max(1, ...data.weeks.map(w => w.n))

  return (
    <div>
      <p className="text-sm font-bold text-slate-700 flex items-center gap-1.5 mb-2"><Lightbulb size={16} className="text-amber-500" /> Aprendizados da conta <span className="text-xs font-normal text-slate-400">· {data.n} posts do último ano · 1,0× = post típico do formato</span></p>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        <Card icon={CalendarDays} title="Melhor dia pra postar" tip={bw && bw.v > 1.05 ? `Posts de ${bw.label.toLowerCase()} rendem ${fmtX(bw.v)} a média.` : null}>
          <Rank rows={[...data.weekdays].sort((a, b) => b.v - a.v)} max={maxOf(data.weekdays)} />
        </Card>
        <Card icon={Clock} title="Melhor horário (pelos resultados)" tip={bs && bs.v > 1.05 ? `${bs.label} (${bs.sub}) foi o período com melhor resultado.` : null}>
          <Rank rows={[...data.slots].sort((a, b) => b.v - a.v)} max={maxOf(data.slots)} />
          <p className="text-[11px] text-slate-400 mt-2">Diferente do "seguidores online": aqui é o que de fato rendeu quando vocês postaram.</p>
        </Card>
        <Card icon={Activity} title="Ritmo de postagem" tip={perWeek < 2 ? 'Contas que postam 3+ vezes por semana costumam crescer mais rápido — o agendamento ajuda a manter o ritmo.' : null}>
          <div className="flex items-end gap-1 h-16">
            {data.weeks.map(w => (
              <div key={w.i} className="flex-1 flex flex-col items-center justify-end h-full" title={`${w.n} post${w.n === 1 ? '' : 's'} na semana`}>
                <div className={`w-full rounded-t ${w.n ? 'bg-violet-400' : 'bg-slate-200'}`} style={{ height: `${w.n ? Math.max(10, (w.n / maxW) * 100) : 4}%` }} />
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-600 mt-2"><b>{perWeek.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</b> posts/semana nas últimas 12 semanas{data.last != null && <> · último post há <b>{data.last} dia{data.last === 1 ? '' : 's'}</b></>}</p>
        </Card>
        <Card icon={Hash} title="Hashtags que mais rendem" tip={data.tags[0] && data.tags[0].v > 1.1 ? `Posts com ${data.tags[0].label} rendem ${fmtX(data.tags[0].v)} a média.` : null}>
          {data.tags.length ? <Rank rows={data.tags.slice(0, 7)} max={maxOf(data.tags.slice(0, 7))} /> : <p className="text-xs text-slate-400">Aparece quando alguma hashtag tiver sido usada em 3+ posts.</p>}
        </Card>
        <Card icon={Text} title="Tamanho da legenda" tip={bl && bl.v > 1.05 ? `Legendas ${bl.label.toLowerCase()}s têm se saído melhor.` : null}>
          <Rank rows={data.lens} max={maxOf(data.lens)} />
        </Card>
        {data.tags.length > 0 && (
          <Card icon={Hash} title="Hashtags que menos rendem">
            <Rank rows={[...data.tags].reverse().slice(0, 5)} max={maxOf(data.tags)} />
            <p className="text-[11px] text-slate-400 mt-2">Vale testar trocar essas por outras.</p>
          </Card>
        )}
      </div>
    </div>
  )
}
