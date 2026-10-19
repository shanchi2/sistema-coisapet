import { useEffect, useMemo, useState } from 'react'
import { UserPlus, UserMinus, TrendingUp, Users, Copy, Download, Loader2, Info, Trophy, CalendarDays } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { fmtInt } from './igApi'
import { toCsv, WEEKDAYS, formatOf } from './igStats'
import { Thumb } from './IgDashboard'

// Seguidores por dia (20/10, pedido do Raphael): a Isa contava na mão, todo
// fim de dia, quantos seguidores entraram. Agora vem da Meta
// (follows_and_unfollows por dia, ver syncFollows na função) + a foto do
// total que o sistema tira de hora em hora (ig_account_daily.followers_count).
// A Meta só devolve ~30 dias pra trás; daí pra frente o histórico é nosso.

const pad = n => String(n).padStart(2, '0')
const isoDay = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDay(d) }
const brDay = iso => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
const signed = n => n == null ? '—' : `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtInt(Math.abs(n))}`
const monthLabel = ym => { const s = new Date(ym + '-15T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); return s.charAt(0).toUpperCase() + s.slice(1) }

function presets(today) {
  const d = new Date(today + 'T12:00:00')
  const firstThis = isoDay(new Date(d.getFullYear(), d.getMonth(), 1))
  const firstPrev = isoDay(new Date(d.getFullYear(), d.getMonth() - 1, 1))
  const lastPrev = isoDay(new Date(d.getFullYear(), d.getMonth(), 0))
  return {
    hoje: { label: 'Hoje', from: today, to: today },
    ontem: { label: 'Ontem', from: addDays(today, -1), to: addDays(today, -1) },
    '7d': { label: '7 dias', from: addDays(today, -6), to: today },
    '30d': { label: '30 dias', from: addDays(today, -29), to: today },
    mes: { label: 'Este mês', from: firstThis, to: today },
    mesant: { label: 'Mês passado', from: firstPrev, to: lastPrev },
  }
}

export function IgFollowers({ account, media }) {
  const [rows, setRows] = useState(null)
  const today = isoDay(new Date())
  const P = useMemo(() => presets(today), [today])
  const [preset, setPreset] = useState('30d')
  const [range, setRange] = useState(P['30d'])

  useEffect(() => {
    supabase.from('ig_account_daily').select('day, followers_count, new_follows, unfollows').order('day')
      .then(({ data }) => setRows(data || []))
  }, [])

  // Uma linha por dia, com saldo e total (total que falta é reconstruído
  // de trás pra frente a partir da foto mais próxima: total(d-1) = total(d) − saldo(d)).
  const days = useMemo(() => {
    if (!rows) return []
    const map = Object.fromEntries(rows.map(r => [r.day, r]))
    const first = rows.find(r => r.new_follows != null || r.followers_count != null)?.day
    if (!first) return []
    const list = []
    for (let d = first; d <= today; d = addDays(d, 1)) {
      const r = map[d] || {}
      let gains = r.new_follows ?? null, losses = r.unfollows ?? null
      // A Meta libera novos/deixaram com 1–2 dias de atraso: nos dias recentes
      // vem 0/0 até o número sair. Aí vale o saldo pela contagem total.
      const pending = d >= addDays(today, -2) && !gains && !losses
      if (pending) { gains = null; losses = null }
      list.push({ day: d, gains, losses, pending, snap: r.followers_count ?? null })
    }
    // hoje: o total "agora" é o da conta
    if (list.length && account?.followers_count != null) list[list.length - 1].snap = account.followers_count
    for (let i = 0; i < list.length; i++) {
      const x = list[i], prev = list[i - 1]
      x.snapNet = prev?.snap != null && x.snap != null ? x.snap - prev.snap : null
      x.net = x.gains != null && x.losses != null ? x.gains - x.losses : x.snapNet
      x.fromTotal = x.gains == null && x.snapNet != null
    }
    // total no fim do dia: a foto do dia; sem foto, reconstrói de trás pra
    // frente (total(d−1) = total(d) − saldo(d)); dia sem saldo conta como 0 (≈)
    let next = null
    for (let i = list.length - 1; i >= 0; i--) {
      const x = list[i]
      if (x.snap != null) { x.total = x.snap; x.estimated = false }
      else if (next && next.total != null) { x.total = next.total - (next.net || 0); x.estimated = true }
      else x.total = null
      next = x
    }
    return list
  }, [rows, account, today])

  const postsByDay = useMemo(() => {
    const g = {}
    for (const m of media) { const d = isoDay(new Date(m.posted_at)); (g[d] = g[d] || []).push(m) }
    return g
  }, [media])

  const sel = days.filter(d => d.day >= range.from && d.day <= range.to)
  const has = sel.filter(d => d.gains != null)
  const sum = k => has.reduce((s, d) => s + (d[k] || 0), 0)
  const gains = sum('gains'), losses = sum('losses')
  const totalOnly = sel.filter(d => d.fromTotal)              // dias só com saldo pela contagem total
  const netAll = gains - losses + totalOnly.reduce((s, d) => s + d.net, 0)
  const pendingDays = sel.filter(d => d.pending).length
  const before = days.find(d => d.day === addDays(range.from, -1))?.total
  const endTotal = [...sel].reverse().find(d => d.total != null)?.total
  const best = [...has].sort((a, b) => b.gains - a.gains)[0]
  const fullDays = has.filter(d => d.day !== today).length

  const months = useMemo(() => {
    const g = {}
    for (const d of days) {
      const ym = d.day.slice(0, 7)
      g[ym] = g[ym] || { ym, gains: 0, losses: 0, n: 0, total: null }
      if (d.gains != null) { g[ym].gains += d.gains; g[ym].losses += d.losses || 0; g[ym].n++ }
      if (d.total != null) g[ym].total = d.total
    }
    return Object.values(g).filter(m => m.n).reverse()
  }, [days])

  function pick(k) { setPreset(k); setRange(P[k]) }

  function copyText() {
    const head = range.from === range.to
      ? `📊 Seguidores @${account?.username || 'coisapet'} — ${brDay(range.from)} (${WEEKDAYS[new Date(range.from + 'T12:00:00').getDay()]})${range.from === today ? ' até agora' : ''}`
      : `📊 Seguidores @${account?.username || 'coisapet'} — ${brDay(range.from)} a ${brDay(range.to)}`
    const lines = [head, has.length
      ? `✅ ${fmtInt(gains)} novos · ❌ ${fmtInt(losses)} deixaram de seguir · saldo ${signed(netAll)}`
      : `Saldo: ${signed(netAll)} (a Meta ainda não liberou novos/deixaram desse dia)`]
    if (endTotal != null) lines.push(`👥 Total: ${fmtInt(endTotal)} seguidores`)
    if (range.from !== range.to && has.length <= 31) {
      lines.push('')
      for (const d of sel.filter(x => x.net != null)) lines.push(`${brDay(d.day)} ${WEEKDAYS[new Date(d.day + 'T12:00:00').getDay()]}: ${d.gains != null ? `+${d.gains} / −${d.losses ?? 0} = ` : 'saldo '}${signed(d.net)}`)
    }
    navigator.clipboard.writeText(lines.join('\n')).then(() => toast.success('Resumo copiado — é só colar no WhatsApp'))
  }

  function exportCsv() {
    const out = [['Dia', 'Dia da semana', 'Ganhos', 'Perdidos', 'Saldo', 'Total no fim do dia', 'Posts no dia']]
    for (const d of sel) out.push([brDay(d.day) + '/' + d.day.slice(0, 4), WEEKDAYS[new Date(d.day + 'T12:00:00').getDay()], d.gains ?? '', d.losses ?? '', d.net ?? '', d.total ?? '', (postsByDay[d.day] || []).length])
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([toCsv(out)], { type: 'text/csv;charset=utf-8' }))
    a.download = `seguidores-${range.from}-a-${range.to}.csv`; a.click()
  }

  if (!rows) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-slate-400" /></div>
  if (!days.length) return (
    <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">
      Os números de seguidores por dia aparecem depois da próxima atualização automática (até 1 hora). Se tiver pressa, clique em <b>Atualizar</b> lá em cima.
    </div>
  )

  const maxBar = Math.max(1, ...sel.map(d => Math.max(d.gains || 0, d.losses || 0)))
  const firstDay = days.find(d => d.gains != null)?.day

  return (
    <div className="flex flex-col gap-4">
      {/* Período */}
      <div className="flex flex-wrap items-center gap-2">
        {Object.entries(P).map(([k, p]) => (
          <button key={k} onClick={() => pick(k)}
            className={`px-3 py-1.5 rounded-xl text-sm font-semibold ${preset === k ? 'bg-pink-500 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{p.label}</button>
        ))}
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-xl border text-sm ${preset === 'custom' ? 'border-pink-400 bg-pink-50' : 'border-slate-200 bg-white'}`}>
          <CalendarDays size={14} className="text-slate-400" />
          <input type="date" value={range.from} max={range.to} onChange={e => { setPreset('custom'); setRange(r => ({ ...r, from: e.target.value })) }} className="bg-transparent text-xs" />
          <span className="text-slate-400 text-xs">até</span>
          <input type="date" value={range.to} min={range.from} max={today} onChange={e => { setPreset('custom'); setRange(r => ({ ...r, to: e.target.value })) }} className="bg-transparent text-xs" />
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={copyText} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600"><Copy size={14} /> Copiar resumo</button>
          <button onClick={exportCsv} title="Baixar planilha (CSV)" className="p-2 rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"><Download size={15} /></button>
        </div>
      </div>

      {/* Números do período */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={UserPlus} label="Novos seguidores" value={has.length ? `+${fmtInt(gains)}` : '—'} tone="text-emerald-600"
          detail={!has.length && pendingDays ? 'a Meta libera em 1–2 dias' : fullDays > 1 ? `média de ${fmtInt(has.filter(d => d.day !== today).reduce((s, d) => s + d.gains, 0) / fullDays)} por dia` : range.to === today ? 'hoje até agora' : null} />
        <Kpi icon={UserMinus} label="Deixaram de seguir" value={has.length ? `−${fmtInt(losses)}` : '—'} tone="text-red-500"
          detail={gains ? `${Math.round((losses / gains) * 100)}% dos que entraram` : null} />
        <Kpi icon={TrendingUp} label="Saldo do período" value={signed(netAll)} tone={netAll >= 0 ? 'text-violet-700' : 'text-red-600'}
          detail={totalOnly.length ? `inclui ${totalOnly.length} dia${totalOnly.length === 1 ? '' : 's'} pela contagem total` : before ? `${(netAll / before * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% de crescimento` : null} />
        <Kpi icon={Users} label={range.to === today ? 'Seguidores agora' : 'Seguidores no fim'} value={fmtInt(endTotal)}
          detail={best ? `melhor dia: ${brDay(best.day)} (+${best.gains})` : null} />
      </div>

      {/* Gráfico */}
      {sel.length > 1 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <div className="flex items-center gap-4 mb-2 text-xs text-slate-500">
            <p className="text-sm font-bold text-slate-700 mr-auto">Entradas e saídas por dia</p>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> novos</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-400" /> deixaram</span>
          </div>
          <div className="flex items-stretch gap-[2px] h-44">
            {sel.map(d => (
              <div key={d.day} className="flex-1 flex flex-col group relative min-w-0"
                title={`${brDay(d.day)} (${WEEKDAYS[new Date(d.day + 'T12:00:00').getDay()]}): +${d.gains ?? '?'} / −${d.losses ?? '?'} · saldo ${signed(d.net)}${(postsByDay[d.day] || []).length ? ` · ${(postsByDay[d.day] || []).length} post(s)` : ''}`}>
                <div className="flex-1 flex items-end">
                  <div className={`w-full rounded-t-sm ${d.day === today ? 'bg-emerald-300' : 'bg-emerald-500'} group-hover:opacity-80`} style={{ height: `${((d.gains || 0) / maxBar) * 100}%`, minHeight: d.gains ? 2 : 0 }} />
                </div>
                <div className="h-px bg-slate-300" />
                <div className="flex-1 flex items-start">
                  <div className="w-full rounded-b-sm bg-red-400 group-hover:opacity-80" style={{ height: `${((d.losses || 0) / maxBar) * 100}%`, minHeight: d.losses ? 2 : 0 }} />
                </div>
                {(postsByDay[d.day] || []).length > 0 && <span className="absolute left-1/2 -translate-x-1/2 bottom-0 w-1.5 h-1.5 rounded-full bg-violet-500" />}
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-slate-400 mt-1"><span>{brDay(sel[0].day)}</span><span>{brDay(sel[sel.length - 1].day)}</span></div>
          <p className="text-[11px] text-slate-400 mt-1">Bolinha roxa = dia com post publicado. Passe o mouse numa barra pra ver o dia.</p>
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_300px] gap-4 items-start">
        {/* Dia a dia */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <p className="text-sm font-bold text-slate-700 px-4 py-3 border-b border-slate-100">Dia a dia</p>
          <div className="overflow-x-auto max-h-[560px]">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase text-slate-500 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold">Dia</th>
                  <th className="text-right px-2 py-2 font-semibold">Novos</th>
                  <th className="text-right px-2 py-2 font-semibold">Deixaram</th>
                  <th className="text-right px-2 py-2 font-semibold">Saldo</th>
                  <th className="text-right px-2 py-2 font-semibold">Total</th>
                  <th className="text-left px-3 py-2 font-semibold">Posts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...sel].reverse().map(d => (
                  <tr key={d.day} className={d.day === today ? 'bg-pink-50/40' : ''}>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <span className="font-semibold text-slate-700">{brDay(d.day)}</span>
                      <span className="text-xs text-slate-400 ml-1.5">{WEEKDAYS[new Date(d.day + 'T12:00:00').getDay()]}{d.day === today && ' · até agora'}</span>
                    </td>
                    {d.pending ? (
                      <td colSpan={2} className="px-2 py-2 text-right text-[11px] text-amber-600" title="A Meta libera os números de novos/deixaram com 1–2 dias de atraso">aguardando a Meta</td>
                    ) : (<>
                      <td className="px-2 py-2 text-right tabular-nums font-semibold text-emerald-600">{d.gains != null ? `+${fmtInt(d.gains)}` : <span className="text-slate-300">—</span>}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-red-500">{d.losses != null ? (d.losses ? `−${fmtInt(d.losses)}` : '0') : <span className="text-slate-300">—</span>}</td>
                    </>)}
                    <td className={`px-2 py-2 text-right tabular-nums font-bold ${d.net > 0 ? 'text-violet-700' : d.net < 0 ? 'text-red-600' : 'text-slate-500'}`} title={d.fromTotal ? 'Pela contagem total de seguidores (fim do dia anterior → fim deste dia)' : undefined}>{signed(d.net)}{d.fromTotal && <span className="text-[9px] font-normal text-slate-400 ml-0.5">total</span>}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-600" title={d.estimated ? 'Calculado a partir dos dias seguintes' : undefined}>{d.total != null ? `${d.estimated ? '≈ ' : ''}${fmtInt(d.total)}` : '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        {(postsByDay[d.day] || []).slice(0, 3).map(m => (
                          <a key={m.id} href={m.permalink} target="_blank" rel="noreferrer" title={`${formatOf(m)}: ${m.caption?.split('\n')[0] || ''}`}>
                            <Thumb url={m.thumbnail_url || (m.media_type !== 'VIDEO' ? m.media_url : null)} video={m.media_type === 'VIDEO'} size="w-7 h-7" />
                          </a>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Por mês */}
        <div className="flex flex-col gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <p className="text-sm font-bold text-slate-700 px-4 py-3 border-b border-slate-100 flex items-center gap-1.5"><Trophy size={14} className="text-amber-500" /> Por mês</p>
            {months.map(m => (
              <button key={m.ym} onClick={() => {
                const last = isoDay(new Date(Number(m.ym.slice(0, 4)), Number(m.ym.slice(5, 7)), 0))
                setPreset('custom'); setRange({ from: m.ym + '-01', to: last > today ? today : last })
              }} className="w-full text-left px-4 py-2.5 border-b border-slate-50 hover:bg-slate-50">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-700">{monthLabel(m.ym)}</span>
                  <span className={`text-sm font-bold ${m.gains - m.losses >= 0 ? 'text-violet-700' : 'text-red-600'}`}>{signed(m.gains - m.losses)}</span>
                </div>
                <p className="text-[11px] text-slate-400">+{fmtInt(m.gains)} novos · −{fmtInt(m.losses)} saíram · {m.n} dia{m.n === 1 ? '' : 's'} com dado{m.total != null ? ` · ${fmtInt(m.total)} no fim` : ''}</p>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-400 flex gap-1.5 px-1"><Info size={12} className="shrink-0 mt-0.5" />
            Números da própria Meta, por dia (horário de Brasília), atualizados de hora em hora. A Meta libera novos/deixaram com 1–2 dias de atraso — até lá, o saldo vem da contagem total de seguidores (marcado "total"), que o sistema anota de hora em hora. A Meta só guarda os últimos 30 dias — por isso o histórico começa em {firstDay ? brDay(firstDay) : '—'}; daqui pra frente o sistema guarda tudo. Total com "≈" foi calculado a partir dos dias seguintes.
          </p>
        </div>
      </div>
    </div>
  )
}

function Kpi({ icon: Icon, label, value, detail, tone = 'text-slate-800' }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-1"><Icon size={14} className="text-slate-400" /><p className="text-xs font-semibold text-slate-500 uppercase">{label}</p></div>
      <p className={`text-2xl font-bold ${tone}`}>{value}</p>
      {detail && <p className="text-[11px] text-slate-400 mt-0.5">{detail}</p>}
    </div>
  )
}
