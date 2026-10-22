import { Component, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { X, Loader2, RefreshCw, Siren, AlertTriangle, Info } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { sessionToken } from '../../lib/sessionToken'
import { moduleByKey, countdown, whenLabel, TvScrollContext } from './tvModules'

// Pré-visualização de um módulo da TV (22/10, pedido do irmão do Raphael:
// "opção visualização na hora de ativar o módulo"). Mostra o módulo com os
// dados reais de agora, num "palco" de 1920×1080 encolhido pra caber na
// tela — o mesmo tamanho pra que os módulos foram desenhados (16px de base).

const W = 1920, H = 1080
const noop = () => {}

class Guard extends Component {
  state = { err: null }
  static getDerivedStateFromError(err) { return { err } }
  render() {
    return this.state.err
      ? <p className="text-3xl text-slate-500 p-10">Não deu pra montar a prévia deste módulo com os dados de agora.</p>
      : this.props.children
  }
}

// Busca os dados uma vez por abertura (a TV de verdade busca a cada minuto)
let cache = null
async function loadFeed(force) {
  if (cache && !force && Date.now() - cache.at < 60000) return cache.feed
  const { data, error } = await supabase.functions.invoke('tv-feed', { body: { session: sessionToken() } })
  if (error) {
    const status = error.context?.status
    throw new Error(status === 401 ? 'Sessão sem permissão — saia e entre de novo no sistema.' : 'Não foi possível buscar os dados da TV.')
  }
  cache = { at: Date.now(), feed: data }
  return data
}

function Stage({ children }) {
  const box = useRef(null)
  const [scale, setScale] = useState(0.5)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const fit = () => setScale(el.clientWidth / W)
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={box} className="w-full rounded-xl overflow-hidden border border-slate-800 bg-slate-950" style={{ height: H * scale }}>
      <div style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: '0 0' }}
        className="bg-slate-950 text-slate-100 p-10 flex flex-col">
        {children}
      </div>
    </div>
  )
}

function AlertStrip({ alerts, today, now }) {
  if (!alerts.length) return <p className="text-3xl text-slate-500">Nenhum alerta agora — a faixa só aparece quando tem algo crítico ou de atenção.</p>
  return (
    <div className="flex flex-col gap-4">
      {alerts.slice(0, 6).map((a, i) => (
        <div key={i} className={`rounded-2xl px-7 py-4 flex items-center gap-5 ${a.level === 'critico' ? 'bg-rose-600' : a.level === 'atencao' ? 'bg-amber-400 text-amber-950' : 'bg-slate-800'}`}>
          {a.level === 'critico' ? <Siren className="w-11 h-11 shrink-0" /> : <AlertTriangle className="w-11 h-11 shrink-0" />}
          <p className="text-[2.2rem] font-black leading-tight flex-1 truncate">
            {a.title}
            {a.kind === 'coleta' && a.at && <span className="font-bold"> · {whenLabel(a.at, today)} · {countdown(a.at, now)}</span>}
          </p>
        </div>
      ))}
    </div>
  )
}

export function TvPreviewModal({ moduleKey, onClose }) {
  const def = moduleByKey[moduleKey]
  const [feed, setFeed] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('big')
  const [now, setNow] = useState(Date.now())

  async function fetchFeed(force) {
    setLoading(true); setError(null)
    try { setFeed(await loadFeed(force)) } catch (e) { setError(e.message) } finally { setLoading(false) }
  }
  useEffect(() => { fetchFeed(false) }, [])
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!def) return null
  const d = feed?.data
  const hasData = d ? (def.stripOnly ? (d.alertas?.length > 0) : !!def.has?.(d)) : true
  const Big = def.Big, Mini = def.Mini

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6" onClick={onClose}>
      <div className="w-full max-w-[1100px] max-h-full overflow-y-auto bg-white rounded-2xl shadow-2xl p-4 sm:p-5 flex flex-col gap-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0"><def.icon size={17} className="text-slate-600" /></div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-slate-800">Prévia: {def.label}</h2>
            <p className="text-xs text-slate-500">{def.desc}</p>
          </div>
          <button onClick={() => fetchFeed(true)} disabled={loading} title="Buscar dados de novo" className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-40">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={onClose} title="Fechar" className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"><X size={16} /></button>
        </div>

        {!def.stripOnly && Mini && (
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl self-start">
            {[['big', 'Em destaque (tela grande)'], ['mini', 'Na lateral (mini)']].map(([k, l]) => (
              <button key={k} onClick={() => setView(k)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${view === k ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{l}</button>
            ))}
          </div>
        )}

        {d && !hasData && (
          <p className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <Info size={14} className="shrink-0 mt-0.5" />
            Agora este módulo está sem nada pra mostrar — na TV ele é pulado sozinho até aparecer dado.
          </p>
        )}

        {error ? (
          <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-3">{error}</p>
        ) : !d ? (
          <div className="aspect-video rounded-xl bg-slate-950 flex items-center justify-center"><Loader2 className="animate-spin text-slate-500" /></div>
        ) : (
          <Stage>
            <Guard key={moduleKey + view}>
              <TvScrollContext.Provider value={noop}>
                {def.stripOnly ? (
                  <AlertStrip alerts={d.alertas || []} today={feed.today} now={now} />
                ) : view === 'mini' && Mini ? (
                  <div className="w-[27rem] flex flex-col gap-4"><Mini d={d} today={feed.today} now={now} /></div>
                ) : Big ? (
                  <section className="flex-1 min-h-0 rounded-3xl bg-slate-900/40 border border-slate-800/80 p-8 overflow-hidden">
                    <Big d={d} today={feed.today} now={now} tick={0} />
                  </section>
                ) : null}
              </TvScrollContext.Provider>
            </Guard>
          </Stage>
        )}
        <p className="text-[11px] text-slate-400">Dados reais de agora. Na TV o destaque troca sozinho e conteúdo comprido rola devagar — aqui fica parado no começo.</p>
      </div>
    </div>
  )
}
