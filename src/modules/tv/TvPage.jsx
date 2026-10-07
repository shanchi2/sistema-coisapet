import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Siren, WifiOff, Tv, AlertTriangle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { moduleByKey, normalizeModules, countdown, whenLabel, fmtHour } from './tvModules'

// TV da Produção (07/10, fase100) — endereço próprio (/sistema/tv), sem
// login e sem menu. O aparelho guarda o código dele (gerado por diretor
// na tela "TV da Produção") e busca tudo na Edge Function `tv-feed` a
// cada minuto. Sem internet, continua mostrando o último dado com aviso.

const CODE_KEY = 'coisapet_tv_code'
const REFRESH_MS = 60 * 1000
const RELOAD_MS = 6 * 60 * 60 * 1000 // recarrega a página inteira a cada 6h (TV ligada o dia todo)
const TZ = 'America/Sao_Paulo'

function readCode() { try { return localStorage.getItem(CODE_KEY) || '' } catch { return '' } }
function saveCode(c) { try { c ? localStorage.setItem(CODE_KEY, c) : localStorage.removeItem(CODE_KEY) } catch { /* sem storage */ } }

// Escala tudo pela largura da tela: 16px de base numa TV 1920 de largura
function useTvScale() {
  useEffect(() => {
    const html = document.documentElement
    const prev = html.style.fontSize
    const apply = () => { html.style.fontSize = `${Math.max(8, (window.innerWidth / 1920) * 16)}px` }
    apply()
    window.addEventListener('resize', apply)
    return () => { window.removeEventListener('resize', apply); html.style.fontSize = prev }
  }, [])
}

function CodeForm({ error, onSubmit }) {
  const [v, setV] = useState('')
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-8">
      <form onSubmit={e => { e.preventDefault(); if (v.trim()) onSubmit(v.trim()) }} className="w-full max-w-[40rem] bg-slate-900 border border-slate-800 rounded-3xl p-10 flex flex-col gap-5">
        <Tv className="w-14 h-14 text-emerald-400" />
        <h1 className="text-[2.4rem] font-black">TV da Produção</h1>
        <p className="text-xl text-slate-400">Digite o <b className="text-slate-200">código desta TV</b>. Ele é gerado no sistema, em <b className="text-slate-200">Diretoria → TV da Produção → Gerar código</b>.</p>
        <input value={v} onChange={e => setV(e.target.value)} autoFocus placeholder="tv-xxxxxxxx" autoComplete="off" spellCheck={false}
          className="text-2xl font-mono bg-slate-950 border border-slate-700 rounded-xl px-5 py-4 outline-none focus:border-emerald-500" />
        {error && <p className="text-xl text-rose-400">{error}</p>}
        <button className="text-2xl font-bold bg-emerald-600 hover:bg-emerald-500 rounded-xl py-4">Entrar</button>
      </form>
    </div>
  )
}

export function TvPage() {
  useTvScale()
  const [params, setParams] = useSearchParams()
  const [code, setCode] = useState(() => params.get('code') || readCode())
  const [feed, setFeed] = useState(null)
  const [error, setError] = useState(null)
  const [offline, setOffline] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [tick, setTick] = useState(0)
  const [cursorHidden, setCursorHidden] = useState(false)

  // ?code=... na URL: guarda e limpa a URL (não fica visível na TV)
  useEffect(() => {
    const c = params.get('code')
    if (c) { saveCode(c); setCode(c); params.delete('code'); setParams(params, { replace: true }) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    if (!code) return
    try {
      const { data, error: err } = await supabase.functions.invoke('tv-feed', { body: { token: code } })
      if (err) {
        const status = err.context?.status
        if (status === 401) { saveCode(''); setCode(''); setFeed(null); setError('Código inválido ou revogado — gere outro no sistema.'); return }
        throw err
      }
      setFeed(data); setOffline(false); setError(null)
    } catch {
      setOffline(true)
    }
  }, [code])

  useEffect(() => {
    load()
    const r = setInterval(load, REFRESH_MS)
    const reload = setTimeout(() => window.location.reload(), RELOAD_MS)
    return () => { clearInterval(r); clearTimeout(reload) }
  }, [load])

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])

  const slideMs = (feed?.settings?.slide_seconds || 10) * 1000
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), slideMs); return () => clearInterval(t) }, [slideMs])

  // Tela sempre acesa (quando o navegador da TV deixa) + cursor some parado
  useEffect(() => {
    let lock
    const ask = async () => { try { lock = await navigator.wakeLock?.request('screen') } catch { /* sem suporte */ } }
    ask()
    const onVis = () => document.visibilityState === 'visible' && ask()
    document.addEventListener('visibilitychange', onVis)
    return () => { document.removeEventListener('visibilitychange', onVis); lock?.release?.() }
  }, [])
  const hideTimer = useRef()
  useEffect(() => {
    const move = () => { setCursorHidden(false); clearTimeout(hideTimer.current); hideTimer.current = setTimeout(() => setCursorHidden(true), 3000) }
    move()
    window.addEventListener('mousemove', move)
    return () => window.removeEventListener('mousemove', move)
  }, [])

  const view = useMemo(() => {
    if (!feed?.data) return null
    const d = feed.data
    const mods = normalizeModules(feed.settings?.modules).filter(m => m.enabled)
    const alertsOn = mods.some(m => m.key === 'alertas')
    const content = mods.map(m => moduleByKey[m.key]).filter(m => m && !m.stripOnly)
    const withData = content.filter(m => m.has?.(d))
    // Coleta do Full HOJE: volta pro destaque a cada 2 slides
    const coletaToday = withData.some(m => m.key === 'coleta_full') && d.alertas?.some(a => a.kind === 'coleta' && a.level === 'critico')
    let seq = withData.map(m => m.key)
    if (coletaToday) seq = seq.filter(k => k !== 'coleta_full').flatMap(k => ['coleta_full', k])
    if (!seq.length) seq = content.slice(0, 1).map(m => m.key)
    return { d, mods, alertsOn, content, seq, alerts: alertsOn ? (d.alertas || []) : [] }
  }, [feed])

  if (!code) return <CodeForm error={error} onSubmit={c => { saveCode(c); setError(null); setCode(c) }} />
  if (!view) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-400 flex items-center justify-center text-3xl">
        {offline ? <span className="flex items-center gap-3"><WifiOff className="w-10 h-10" />Sem conexão — tentando de novo…</span> : 'Carregando…'}
      </div>
    )
  }

  const { d, content, seq, alerts } = view
  const today = feed.today
  const mode = feed.settings?.mode === 'slides' ? 'slides' : 'consultorio'
  const mainKey = seq[tick % seq.length]
  const Main = moduleByKey[mainKey]?.Big
  const minis = content.filter(m => m.key !== mainKey && m.Mini)
    .sort((a, b) => (b.has?.(d) ? 1 : 0) - (a.has?.(d) ? 1 : 0)) // com dado primeiro
  const off = minis.length ? Math.floor(tick / 2) % minis.length : 0
  const side = [...minis.slice(off), ...minis.slice(0, off)].slice(0, 4)
  const critical = alerts.filter(a => a.level === 'critico')
  const strip = critical.length ? critical : alerts.filter(a => a.level === 'atencao')
  const shown = strip.length ? strip[Math.floor(now / 6000) % strip.length] : null
  const nowDate = new Date(now)

  return (
    <div className={`h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 flex flex-col ${cursorHidden ? 'cursor-none' : ''}`}
      onDoubleClick={() => document.fullscreenElement ? document.exitFullscreen?.() : document.documentElement.requestFullscreen?.()}>
      <style>{`@keyframes tvPulse{0%{box-shadow:0 0 0 0 rgba(244,63,94,.75)}70%{box-shadow:0 0 0 1.4rem rgba(244,63,94,0)}100%{box-shadow:0 0 0 0 rgba(244,63,94,0)}} .tv-pulse{animation:tvPulse 1.8s ease-out infinite}`}</style>

      {/* Cabeçalho */}
      <header className="flex items-center justify-between px-10 pt-6 pb-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-rose-600 flex items-center justify-center text-2xl font-black">CP</div>
          <div>
            <p className="text-[1.9rem] font-black leading-none">CoisaPet · Produção</p>
            <p className="text-xl text-slate-400 mt-1">{(s => s.charAt(0).toUpperCase() + s.slice(1))(nowDate.toLocaleDateString('pt-BR', { timeZone: TZ, weekday: 'long', day: '2-digit', month: 'long' }))}</p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          {offline && <span className="flex items-center gap-2 text-xl font-bold text-amber-300 bg-amber-950/60 border border-amber-700 rounded-xl px-4 py-2"><WifiOff className="w-6 h-6" />Sem conexão · dados das {fmtHour(feed.generated_at)}</span>}
          <p className="text-[3.6rem] font-black tabular-nums leading-none">{nowDate.toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })}</p>
        </div>
      </header>

      {/* Faixa de alertas */}
      {shown && (
        <div className={`mx-10 mb-4 rounded-2xl px-7 py-4 flex items-center gap-5 ${shown.level === 'critico' ? 'bg-rose-600 tv-pulse' : 'bg-amber-400 text-amber-950'}`}>
          {shown.level === 'critico' ? <Siren className="w-11 h-11 shrink-0" /> : <AlertTriangle className="w-11 h-11 shrink-0" />}
          <p className="text-[2.2rem] font-black leading-tight flex-1 truncate">
            {shown.title}
            {shown.kind === 'coleta' && shown.at && <span className="font-bold"> · {whenLabel(shown.at, today)} · {countdown(shown.at, now)}</span>}
          </p>
          {strip.length > 1 && <span className="text-xl font-bold opacity-80 shrink-0">{(Math.floor(now / 6000) % strip.length) + 1}/{strip.length}</span>}
          {alerts.length > strip.length && <span className="text-xl font-bold opacity-80 shrink-0">+{alerts.length - strip.length} avisos</span>}
        </div>
      )}

      {/* Conteúdo */}
      <main className={`flex-1 min-h-0 px-10 pb-8 ${mode === 'consultorio' ? 'grid grid-cols-[1fr_27rem] gap-6' : ''}`}>
        <section key={mainKey + tick} className="h-full min-h-0 rounded-3xl bg-slate-900/40 border border-slate-800/80 p-8 overflow-hidden animate-[fadeIn_.5s_ease]">
          <style>{'@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}'}</style>
          {Main ? <Main d={d} today={today} now={now} tick={Math.floor(tick / Math.max(1, seq.length))} /> : null}
        </section>
        {mode === 'consultorio' && (
          <aside className="min-h-0 flex flex-col gap-4">
            {side.map(m => <m.Mini key={m.key} d={d} today={today} now={now} />)}
          </aside>
        )}
      </main>
    </div>
  )
}
