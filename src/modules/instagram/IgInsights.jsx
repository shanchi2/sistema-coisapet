import { useMemo, useState } from 'react'
import { TrendingUp, TrendingDown, Layers, Users, BarChart3, MapPin, Info } from 'lucide-react'
import { fmtInt, fmtPct } from './igApi'

// Insights (23/10, pedido do Raphael: "mais insights de tudo"). Tudo vem da
// sincronização (instagram-api): totais de 28 dias × os 28 anteriores, de onde
// vem o alcance (Reels / foto / carrossel / stories), seguidores × não
// seguidores, métricas dia a dia e o público que segue, que foi alcançado e
// que engajou.

const COMPARE = [
  ['reach', 'Alcance', 'contas diferentes que viram'],
  ['views', 'Visualizações', 'vezes que o conteúdo apareceu'],
  ['accounts_engaged', 'Contas engajadas', 'curtiram, comentaram, salvaram…'],
  ['total_interactions', 'Interações', 'soma de tudo'],
  ['likes', 'Curtidas'], ['comments', 'Comentários'], ['shares', 'Compartilhamentos'], ['saves', 'Salvos'],
  ['profile_links_taps', 'Cliques nos botões do perfil'],
]
const TYPE_LABEL = { REEL: 'Reels', POST: 'Fotos', CAROUSEL_CONTAINER: 'Carrossel', STORY: 'Stories', AD: 'Anúncios', IGTV: 'Vídeos', LIVE: 'Lives' }
const TYPE_COLOR = { REEL: 'bg-pink-500', POST: 'bg-violet-400', CAROUSEL_CONTAINER: 'bg-amber-400', STORY: 'bg-sky-400', AD: 'bg-emerald-400' }
const DAY_METRICS = [
  ['reach', 'Alcance'], ['views', 'Visualizações'], ['accounts_engaged', 'Contas engajadas'], ['total_interactions', 'Interações'],
  ['likes', 'Curtidas'], ['comments', 'Comentários'], ['shares', 'Compartilhamentos'], ['saves', 'Salvos'], ['new_follows', 'Seguidores novos'],
]
const WEEKDAY = ['no domingo', 'na segunda', 'na terça', 'na quarta', 'na quinta', 'na sexta', 'no sábado']
// A Meta manda "São Paulo, São Paulo (state)" / "Brasília, Federal District"
const cityName = c => String(c || '').replace(/ \(state\)/g, '').replace('Federal District', 'DF')

function Box({ title, icon: Icon, children, note }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <p className="text-sm font-bold text-slate-700 flex items-center gap-1.5 mb-3"><Icon size={15} className="text-slate-400" />{title}</p>
      {children}
      {note && <p className="text-[11px] text-slate-400 mt-3 flex items-start gap-1"><Info size={11} className="shrink-0 mt-0.5" />{note}</p>}
    </div>
  )
}

function Delta({ now, prev }) {
  if (now == null || !prev) return <span className="text-[11px] text-slate-300">sem comparação</span>
  const d = (now - prev) / prev
  const up = d >= 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${up ? 'text-emerald-600' : 'text-rose-500'}`}>
      {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{up ? '+' : ''}{fmtPct(d)}
    </span>
  )
}

export function IgInsights({ account, daily }) {
  const t = account?.totals_28d || {}
  const ins = account?.insights_28d || {}
  const prev = ins.prev || {}
  const [typeMetric, setTypeMetric] = useState('reach')
  const [dayMetric, setDayMetric] = useState('views')
  const [aud, setAud] = useState('followers')

  // ── De onde vem ──
  const byType = Object.entries(ins.by_type?.[typeMetric] || {}).map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v)
  const typeTotal = byType.reduce((s, x) => s + x.v, 0)
  const fol = ins.by_follow?.reach || {}
  const folTotal = (fol.FOLLOWER || 0) + (fol.NON_FOLLOWER || 0)
  const folViews = ins.by_follow?.views || {}
  const folViewsTotal = (folViews.FOLLOWER || 0) + (folViews.NON_FOLLOWER || 0)

  // ── Dia a dia (30 dias) ──
  const series = useMemo(() => daily.slice(-30).map(d => {
    const v = dayMetric === 'reach' ? d.reach : dayMetric === 'new_follows' ? d.new_follows : d.metrics?.[dayMetric]
    return { day: d.day, v: v ?? null }
  }), [daily, dayMetric])
  const valid = series.filter(x => x.v != null)
  const total = valid.reduce((s, x) => s + x.v, 0)
  const max = Math.max(1, ...valid.map(x => x.v))
  const best = valid.length ? valid.reduce((a, b) => (b.v > a.v ? b : a)) : null
  // média por dia da semana (dias com dado)
  const byWeekday = useMemo(() => {
    const g = Array.from({ length: 7 }, () => [])
    for (const x of valid) g[new Date(x.day + 'T12:00:00').getDay()].push(x.v)
    return g.map((v, i) => ({ i, avg: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null })).filter(x => x.avg != null)
  }, [valid])
  const bestWd = byWeekday.length ? byWeekday.reduce((a, b) => (b.avg > a.avg ? b : a)) : null

  // ── Público ──
  const demo = account?.demographics || {}
  const audData = useMemo(() => {
    const src = aud === 'followers' ? null : demo[aud] || {}
    const ages = {}, genders = {}
    if (aud === 'followers') {
      for (const r of demo.age_gender || []) { ages[r.k?.[0]] = (ages[r.k?.[0]] || 0) + r.v; genders[r.k?.[1]] = (genders[r.k?.[1]] || 0) + r.v }
    } else {
      for (const r of src.age || []) ages[r.k?.[0]] = r.v
      for (const r of src.gender || []) genders[r.k?.[0]] = r.v
    }
    const cities = ((aud === 'followers' ? demo.city : src.city) || []).map(r => ({ k: r.k?.[0], v: r.v })).sort((a, b) => b.v - a.v).slice(0, 8)
    const countries = aud === 'followers' ? (demo.country || []).map(r => ({ k: r.k?.[0], v: r.v })).sort((a, b) => b.v - a.v).slice(0, 5) : []
    return { ages: Object.entries(ages).sort((a, b) => a[0].localeCompare(b[0])), genders, cities, countries }
  }, [demo, aud])
  const ageTotal = audData.ages.reduce((s, [, v]) => s + v, 0)
  const genderTotal = Object.values(audData.genders).reduce((s, v) => s + v, 0)
  const countryName = c => { try { return new Intl.DisplayNames(['pt-BR'], { type: 'region' }).of(c) } catch { return c } }

  if (!account?.insights_28d && !account?.totals_28d) {
    return <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">Os insights aparecem depois da próxima atualização (botão Atualizar lá em cima).</div>
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Comparação */}
      <Box title="Últimos 28 dias × 28 dias anteriores" icon={TrendingUp}
        note="Comparação feita pela própria Meta. Verde = cresceu em relação aos 28 dias antes disso.">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {COMPARE.map(([k, l, hint]) => (
            <div key={k} className="rounded-xl bg-slate-50 px-3 py-2.5">
              <p className="text-[10px] text-slate-400 uppercase font-semibold">{l}</p>
              <p className="text-lg font-bold text-slate-800">{fmtInt(t[k])}</p>
              <div className="flex items-center justify-between gap-1">
                <Delta now={t[k]} prev={prev[k]} />
                {prev[k] != null && <span className="text-[10px] text-slate-400">antes {fmtInt(prev[k])}</span>}
              </div>
              {hint && <p className="text-[10px] text-slate-400 mt-0.5">{hint}</p>}
            </div>
          ))}
        </div>
      </Box>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* De onde vem */}
        <Box title="De onde vem o resultado (28 dias)" icon={Layers}
          note="Por tipo de conteúdo. No alcance a soma passa do total porque a mesma pessoa pode ter visto um Reels e um story.">
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit mb-3">
            {[['reach', 'Alcance'], ['views', 'Visualizações'], ['total_interactions', 'Interações']].map(([k, l]) => (
              <button key={k} onClick={() => setTypeMetric(k)} className={`px-3 py-1 rounded-lg text-xs font-semibold ${typeMetric === k ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>{l}</button>
            ))}
          </div>
          {byType.length ? (
            <div className="flex flex-col gap-2.5">
              {byType.map(x => (
                <div key={x.k}>
                  <div className="flex justify-between text-xs mb-1"><span className="font-semibold text-slate-600">{TYPE_LABEL[x.k] || x.k}</span><span className="text-slate-500">{fmtInt(x.v)} · {fmtPct(x.v / typeTotal)}</span></div>
                  <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full rounded-full ${TYPE_COLOR[x.k] || 'bg-slate-400'}`} style={{ width: `${(x.v / byType[0].v) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-slate-400">Sem dado ainda.</p>}
        </Box>

        {/* Seguidores × não seguidores */}
        <Box title="Quem você está alcançando (28 dias)" icon={Users}
          note="Não seguidores = gente nova vendo a CoisaPet (Reels e Explorar). Seguidores = sua base. O ideal é crescer os dois.">
          {folTotal ? (
            <>
              <div className="flex h-5 rounded-full overflow-hidden mb-2">
                <div className="bg-violet-500" style={{ width: `${(fol.FOLLOWER / folTotal) * 100}%` }} />
                <div className="bg-pink-400" style={{ width: `${(fol.NON_FOLLOWER / folTotal) * 100}%` }} />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-xl bg-violet-50 px-3 py-2.5"><p className="text-[10px] font-semibold text-violet-600 uppercase">Seguidores</p><p className="text-lg font-bold text-violet-800">{fmtInt(fol.FOLLOWER)}</p><p className="text-[11px] text-violet-600">{fmtPct(fol.FOLLOWER / folTotal)} do alcance</p></div>
                <div className="rounded-xl bg-pink-50 px-3 py-2.5"><p className="text-[10px] font-semibold text-pink-600 uppercase">Não seguidores</p><p className="text-lg font-bold text-pink-800">{fmtInt(fol.NON_FOLLOWER)}</p><p className="text-[11px] text-pink-600">{fmtPct(fol.NON_FOLLOWER / folTotal)} do alcance</p></div>
              </div>
              {folViewsTotal > 0 && <p className="text-xs text-slate-500 mt-2.5">Visualizações: {fmtPct(folViews.FOLLOWER / folViewsTotal)} de seguidores · {fmtPct(folViews.NON_FOLLOWER / folViewsTotal)} de não seguidores.</p>}
            </>
          ) : <p className="text-xs text-slate-400">Sem dado ainda.</p>}
        </Box>
      </div>

      {/* Dia a dia */}
      <Box title="Dia a dia (últimos 30 dias)" icon={BarChart3} note="Dia de Brasília. Os 1–2 dias mais recentes a Meta ainda pode completar.">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <select value={dayMetric} onChange={e => setDayMetric(e.target.value)} className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700">
            {DAY_METRICS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <span className="text-xs text-slate-500">Total: <b className="text-slate-700">{fmtInt(total)}</b> · média {fmtInt(valid.length ? total / valid.length : null)}/dia
            {best && <> · melhor dia {new Date(best.day + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ({fmtInt(best.v)})</>}
            {bestWd && <> · rende mais <b className="text-slate-700">{WEEKDAY[bestWd.i]}</b></>}</span>
        </div>
        {valid.length ? (
          <>
            <div className="flex items-end gap-[3px] h-32">
              {series.map(x => (
                <div key={x.day} className="flex-1 h-full flex flex-col justify-end group relative">
                  <div className={`rounded-t ${x.v == null ? 'bg-slate-100 h-px' : best && x.day === best.day ? 'bg-pink-500' : 'bg-violet-400 group-hover:bg-violet-500'}`} style={x.v != null ? { height: `${Math.max(2, (x.v / max) * 100)}%` } : undefined} />
                  <span className="pointer-events-none absolute bottom-full mb-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 text-white text-[10px] px-1.5 py-0.5 opacity-0 group-hover:opacity-100 z-10">
                    {new Date(x.day + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}: {fmtInt(x.v)}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-slate-400 mt-1">
              <span>{new Date(series[0].day + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
              <span>{new Date(series[series.length - 1].day + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
            </div>
          </>
        ) : <p className="text-xs text-slate-400">Sem dado ainda pra essa métrica.</p>}
      </Box>

      {/* Público */}
      <Box title="Público" icon={MapPin}
        note={aud === 'followers' ? 'Quem segue a @coisapet hoje.' : aud === 'reached' ? 'Quem VIU o conteúdo neste mês (segue ou não).' : 'Quem curtiu, comentou, salvou ou compartilhou neste mês.'}>
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit mb-4">
          {[['followers', 'Quem segue'], ['reached', 'Quem foi alcançado'], ['engaged', 'Quem engajou']].map(([k, l]) => (
            <button key={k} onClick={() => setAud(k)} className={`px-3 py-1 rounded-lg text-xs font-semibold ${aud === k ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>{l}</button>
          ))}
        </div>
        {ageTotal ? (
          <div className="grid md:grid-cols-3 gap-5">
            <div>
              <p className="text-xs font-bold text-slate-600 mb-2">Idade</p>
              {audData.ages.map(([a, v]) => (
                <div key={a} className="flex items-center gap-2 text-xs py-0.5">
                  <span className="w-12 text-slate-500">{a}</span>
                  <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-violet-400 rounded-full" style={{ width: `${(v / Math.max(...audData.ages.map(x => x[1]))) * 100}%` }} /></div>
                  <span className="w-11 text-right text-slate-600 font-semibold">{fmtPct(v / ageTotal)}</span>
                </div>
              ))}
              {genderTotal > 0 && (
                <div className="flex gap-2 mt-3">
                  {Object.entries(audData.genders).map(([g, v]) => (
                    <div key={g} className="flex-1 bg-slate-50 rounded-xl px-2 py-1.5 text-center">
                      <p className="text-sm font-bold text-slate-700">{fmtPct(v / genderTotal)}</p>
                      <p className="text-[10px] text-slate-400">{g === 'F' ? 'mulheres' : g === 'M' ? 'homens' : 'não informado'}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="text-xs font-bold text-slate-600 mb-2">Cidades</p>
              {audData.cities.map(c => (
                <div key={c.k} className="flex justify-between text-xs py-0.5"><span className="text-slate-600 truncate">{cityName(c.k)}</span><span className="text-slate-400">{fmtInt(c.v)}</span></div>
              ))}
              {!audData.cities.length && <p className="text-xs text-slate-400">Sem dado.</p>}
            </div>
            <div>
              {audData.countries.length > 0 && <>
                <p className="text-xs font-bold text-slate-600 mb-2">Países</p>
                {audData.countries.map(c => (
                  <div key={c.k} className="flex justify-between text-xs py-0.5"><span className="text-slate-600 truncate">{countryName(c.k)}</span><span className="text-slate-400">{fmtInt(c.v)}</span></div>
                ))}
              </>}
            </div>
          </div>
        ) : <p className="text-xs text-slate-400">A Meta atualiza o público 1x por dia (e só para contas com 100+ seguidores). Aparece depois da próxima atualização.</p>}
      </Box>
    </div>
  )
}
