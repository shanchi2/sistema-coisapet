import { useEffect, useRef, useState } from 'react'
import { HAMSTER_FRAMES, paletteFor, spriteCanvas } from './art'
import { api } from './cloud'
import { canRun } from './sim'
import Corrida, { meta as mCorrida } from './games/Corrida'
import Sementes, { meta as mSementes } from './games/Sementes'
import Labirinto, { meta as mLabirinto } from './games/Labirinto'
import Rodinha, { meta as mRodinha } from './games/Rodinha'
import Memoria, { meta as mMemoria } from './games/Memoria'
import Velha, { meta as mVelha } from './games/Velha'

// ─── Fliperama (0.6, 22/10 — pedido do Raphael: jogo em TELA CHEIA, não modal)
// Ocupa a tela toda (e pede tela cheia ao navegador quando dá). Tela inicial
// com os minijogos; cada um abre ocupando tudo, com intro → partida → resultado.
// O servidor assina o início e confere tempo × pontos de cada jogo.
export const GAMES = [
  { ...mCorrida, C: Corrida }, { ...mSementes, C: Sementes }, { ...mLabirinto, C: Labirinto },
  { ...mRodinha, C: Rodinha }, { ...mMemoria, C: Memoria }, { ...mVelha, C: Velha },
]
const sprite = (sp, f = 'idle') => spriteCanvas(HAMSTER_FRAMES[f], paletteFor(sp)).toDataURL()

function goFullscreen() {
  try { if (!document.fullscreenElement && document.documentElement.requestFullscreen && matchMedia('(pointer: coarse)').matches) document.documentElement.requestFullscreen().catch(() => {}) } catch { /* sem suporte (iPhone) */ }
}
function leaveFullscreen() {
  try { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}) } catch { /* ok */ }
}

export default function Arcade({ pet, token, me, onClose, onFinish, initial }) {
  const [sel, setSel] = useState(initial || null)
  const back = useRef(null) // o jogo aberto diz o que o "voltar" faz (pergunta se sai da partida)
  useEffect(() => { goFullscreen(); return leaveFullscreen }, [])
  // botão "voltar" do celular: no jogo volta pros jogos (ou pergunta se sai
  // da partida); na tela inicial fecha o fliperama — nunca sai do app
  useEffect(() => {
    history.pushState({ arcade: 1 }, '')
    const onPop = () => {
      if (back.current) { history.pushState({ arcade: 1 }, ''); back.current() }
      else onClose()
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  back.current = sel ? back.current : null
  const close = () => { if (history.state?.arcade) history.back(); else onClose() }

  const game = GAMES.find(g => g.key === sel)
  return (
    <div className="fixed inset-0 z-50 bg-[#2b1d14] text-[#fbeedd] flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {game
        ? <Play key={game.key} game={game} pet={pet} token={token} me={me} onBack={() => setSel(null)} onFinish={onFinish} backRef={back} />
        : <Hub pet={pet} me={me} onPick={setSel} onClose={close} />}
    </div>
  )
}

function Hub({ pet, me, onPick, onClose }) {
  const gate = canRun(pet)
  return (
    <div className="flex-1 overflow-y-auto">
      <header className="flex items-center gap-3 px-3 sm:px-5 py-3">
        <button onClick={onClose} className="pixel-btn rounded-md bg-[#fbeedd] text-[#3b2314] px-3 py-2 text-[13px] font-extrabold">← Voltar</button>
        <h1 className="pixel text-xs sm:text-sm flex-1">🕹️ Fliperama</h1>
        <img src={sprite(pet.species, 'walk')} alt="" className="w-10 h-[30px]" style={{ imageRendering: 'pixelated' }} />
      </header>
      <div className="px-3 sm:px-5 max-w-4xl mx-auto">
        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="bg-[#fbeedd] text-[#3b2314] pixel-box rounded-md px-3 py-2">
            <p className="text-[11px] font-bold text-[#8a6a52]">Energia do {pet.name}</p>
            <div className="h-3 mt-1 bg-[#3b2314] rounded-sm p-[2px]"><div className="h-full rounded-[1px]" style={{ width: `${Math.max(3, pet.needs.energia)}%`, background: pet.needs.energia >= 30 ? '#2ecc71' : '#e74c3c' }} /></div>
          </div>
          <div className="bg-[#fbeedd] text-[#3b2314] pixel-box rounded-md px-3 py-2">
            <p className="text-[11px] font-bold text-[#8a6a52]">XP dos jogos hoje</p>
            <p className="font-extrabold text-[15px] leading-tight">{me ? `${me.run_xp_today}/${me.run_xp_cap}` : '—'}</p>
          </div>
        </div>
        {!gate.ok && <p className="bg-[#e74c3c] text-white font-bold text-[13px] rounded-md px-3 py-2 mb-3">{gate.msg}</p>}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 pb-6">
          {GAMES.map(g => {
            const best = me?.bests?.[g.key] || 0
            const today = me?.today_games?.[g.key]?.count || 0
            return (
              <button key={g.key} onClick={() => onPick(g.key)} className="pixel-btn rounded-lg p-3 sm:p-4 text-left text-[#3b2314] flex flex-col gap-1 min-h-[130px]" style={{ background: g.color }}>
                <span className="text-4xl leading-none">{g.icon}</span>
                <span className="pixel text-[10px] sm:text-[11px] leading-relaxed mt-1">{g.label}</span>
                <span className="text-[11px] font-bold mt-auto">🏆 recorde {best}{today ? ` · ${today}x hoje` : ''}</span>
              </button>
            )
          })}
        </div>
        <p className="text-[11px] text-[#d9bfa0] text-center pb-6">Cada partida cansa um pouquinho o {pet.name} e dá sementinhas 🌻. Os recordes da semana entram no ranking!</p>
      </div>
    </div>
  )
}

function Play({ game, pet, token, me, onBack, onFinish, backRef }) {
  const [phase, setPhase] = useState('intro') // intro | play | over
  const [result, setResult] = useState(null)
  const [round, setRound] = useState(0)
  const [askQuit, setAskQuit] = useState(false)
  const paused = useRef(false)
  paused.current = askQuit
  const run = useRef(null)
  // Voltar no meio da partida: pausa e pergunta. Sair = abandona (não conta
  // ponto, não cansa o pet, não vale XP)
  const goBack = () => { if (phase === 'play') setAskQuit(true); else onBack() }
  backRef.current = goBack
  useEffect(() => () => { backRef.current = null }, [backRef])
  function quit() { setAskQuit(false); run.current = null; setPhase('intro') ; onBack() }
  const gate = canRun(pet)
  const best = me?.bests?.[game.key] || 0
  const portrait = typeof window !== 'undefined' && matchMedia('(orientation: portrait)').matches

  function start() {
    if (!gate.ok) return
    // sem internet joga igual, só não vale ponto
    run.current = { ticket: api('run_start', { token, game: game.key }).then(r => r.run_id).catch(() => null), startedAt: performance.now() }
    setResult(null); setRound(r => r + 1); setPhase('play')
  }
  async function end({ score, seeds }) {
    if (!run.current) return // partida abandonada
    const ms = Math.round(performance.now() - run.current.startedAt)
    const res = { score, seeds, sending: true }
    setResult(res); setPhase('over')
    onFinish({ seeds })
    const runId = await run.current.ticket
    if (!runId) { setResult({ ...res, sending: false, error: 'Sem internet: essa partida não entrou no ranking.' }); return }
    try {
      const r = await api('run_submit', { token, run_id: runId, score, ms, seeds })
      setResult({ ...res, sending: false, gained: r.gained, record: r.record })
      onFinish({ me: r.me })
    } catch (e) { setResult({ ...res, sending: false, error: e.message }) }
  }

  const G = game.C
  return (
    <>
      <header className="flex items-center gap-2 px-3 py-2 shrink-0">
        <button onClick={goBack} className="pixel-btn rounded-md bg-[#fbeedd] text-[#3b2314] px-3 py-1.5 text-[12px] font-extrabold">{phase === 'play' ? '✕ Sair' : '← Jogos'}</button>
        <h1 className="pixel text-[10px] sm:text-xs flex-1 truncate">{game.icon} {game.label}</h1>
        <span className="text-[11px] font-bold text-[#ffd36b] whitespace-nowrap">🏆 {Math.max(best, result?.score || 0)}</span>
      </header>
      <main className="relative flex-1 min-h-0">
        {phase === 'play' && <G key={round} pet={pet} onEnd={end} paused={paused} />}
        {askQuit && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 px-6">
            <div className="bg-[#fbeedd] text-[#3b2314] pixel-box rounded-lg p-5 max-w-xs w-full text-center">
              <p className="pixel text-xs leading-relaxed">Sair da partida?</p>
              <p className="text-[13px] mt-2">O jogo está pausado. Se sair agora, os pontos dessa partida <b>não contam</b>.</p>
              <div className="flex gap-2 mt-4">
                <button onClick={() => setAskQuit(false)} className="pixel-btn flex-1 rounded-md py-2.5 bg-[#2ecc71] text-white text-[13px] font-extrabold">Continuar</button>
                <button onClick={quit} className="pixel-btn flex-1 rounded-md py-2.5 bg-[#e74c3c] text-white text-[13px] font-extrabold">Sair</button>
              </div>
            </div>
          </div>
        )}
        {phase === 'intro' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <img src={sprite(pet.species, 'walk')} alt="" className="w-28 h-[84px] animate-bounce" style={{ imageRendering: 'pixelated' }} />
            <p className="pixel text-sm sm:text-base text-[#ffd36b] leading-relaxed">{game.icon} {game.label}</p>
            <p className="text-[14px] max-w-md leading-snug">{game.how}</p>
            {game.wide && portrait && <p className="text-[12px] text-[#d9bfa0]">📱↔ Dica: deite o celular pra ver mais longe.</p>}
            {gate.ok
              ? <button onClick={start} className="pixel-btn rounded-md px-8 py-3 bg-[#2ecc71] text-white pixel text-sm mt-2">Jogar!</button>
              : <p className="bg-[#e74c3c] text-white font-bold text-[13px] rounded-md px-3 py-2 max-w-sm">{gate.msg}</p>}
          </div>
        )}
        {phase === 'over' && result && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center bg-[#2b1d14]/85">
            <img src={sprite(pet.species, result.record ? 'eat' : 'sad')} alt="" className="w-24 h-[72px]" style={{ imageRendering: 'pixelated' }} />
            <p className="pixel text-sm text-[#ffd36b]">{result.record ? '🏆 Novo recorde!' : 'Fim de jogo!'}</p>
            <p className="text-[22px] font-extrabold">{result.score} pontos</p>
            <p className="text-[13px] font-bold">+{result.seeds} 🌻 sementinhas</p>
            <p className="text-[13px] font-bold min-h-[20px] text-[#c8f0c0]">{result.sending ? 'Enviando…' : result.error ? <span className="text-[#ffb3b3]">{result.error}</span> : result.gained ? `+${result.gained} XP` : 'Limite de XP dos jogos de hoje atingido — o recorde vale igual!'}</p>
            <div className="flex gap-2 mt-2">
              <button onClick={() => setPhase('intro')} className="pixel-btn rounded-md px-5 py-2.5 bg-[#2ecc71] text-white text-[13px] font-extrabold">Jogar de novo</button>
              <button onClick={onBack} className="pixel-btn rounded-md px-5 py-2.5 bg-[#fbeedd] text-[#3b2314] text-[13px] font-extrabold">Outros jogos</button>
            </div>
          </div>
        )}
      </main>
    </>
  )
}
