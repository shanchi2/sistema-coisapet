import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  NEEDS, NEED_INFO, SPECIES, HABITATS, TIPS, newPet, advance, status, poopCount, isDaytime,
  feed, water, cleanOne, cleanAll, pet_, treat,
} from './sim'
import { HAMSTER_FRAMES, paletteFor, spriteCanvas } from './art'
import { createGame, bridge } from './scene'

// MinhaCoisaPet — protótipo 0.1 (16/10). Por enquanto o progresso fica salvo
// no próprio aparelho (localStorage); login e resgate de códigos vêm depois.
const SAVE_KEY = 'minhacoisapet_v1'

function load() {
  try { const p = JSON.parse(localStorage.getItem(SAVE_KEY)); return p?.v === 1 ? p : null } catch { return null }
}
function save(p) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(p)) } catch { /* sem storage */ } }

function spriteURL(species, frame = 'idle') {
  return spriteCanvas(HAMSTER_FRAMES[frame], paletteFor(species)).toDataURL()
}

export default function App() {
  const [pet, setPet] = useState(() => {
    const p = load()
    return p ? advance(p) : null
  })
  useEffect(() => { if (pet) save(pet) }, [pet])

  if (!pet) return <Onboarding onStart={p => setPet(p)} />
  return <Game pet={pet} setPet={setPet} onReset={() => { localStorage.removeItem(SAVE_KEY); setPet(null) }} />
}

// ─── Boas-vindas: escolher espécie e nome ────────────────────────────
function Onboarding({ onStart }) {
  const [species, setSpecies] = useState('sirio')
  const [name, setName] = useState('')
  const valid = name.trim().length >= 2
  return (
    <div className="min-h-full flex items-center justify-center p-4 bg-[#2b1d14]">
      <div className="w-full max-w-md bg-[#fbeedd] pixel-box rounded-lg p-5 sm:p-6">
        <h1 className="pixel text-[#c0392b] text-lg sm:text-xl text-center leading-relaxed">MinhaCoisaPet</h1>
        <p className="text-center text-sm text-[#6b4a32] mt-2">Você agora é tutor de um hamster! Cuide bem dele: comida, água, limpeza e muito carinho.</p>

        <p className="pixel text-[10px] text-[#3b2314] mt-6 mb-2">1. Escolha seu pet</p>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(SPECIES).map(([k, s]) => (
            <button key={k} onClick={() => setSpecies(k)}
              className={`pixel-btn rounded-md p-2 flex flex-col items-center gap-1 ${species === k ? 'bg-[#ffd36b]' : 'bg-white'}`}>
              <img src={spriteURL(k)} alt="" className="w-16 h-12" style={{ imageRendering: 'pixelated' }} />
              <span className="text-[11px] font-bold leading-tight text-center">{s.label.replace('Hamster ', '')}</span>
            </button>
          ))}
        </div>

        <p className="pixel text-[10px] text-[#3b2314] mt-6 mb-2">2. Dê um nome</p>
        <input value={name} onChange={e => setName(e.target.value.slice(0, 16))} placeholder="Ex.: Bolinha"
          className="w-full pixel-box rounded-md px-3 py-2.5 text-base font-bold bg-white outline-none" />

        <button disabled={!valid} onClick={() => onStart(newPet({ name: name.trim(), species }))}
          className="pixel-btn w-full mt-6 rounded-md py-3 bg-[#2ecc71] text-white pixel text-xs">
          Começar a cuidar
        </button>
        <p className="text-[11px] text-center text-[#8a6a52] mt-3">Ele começa numa gaiolinha de ferro simples… com o tempo você pode dar um lar melhor pra ele 😉</p>
      </div>
    </div>
  )
}

// ─── Jogo ────────────────────────────────────────────────────────────
function Game({ pet, setPet, onReset }) {
  const [toast, setToast] = useState(null)
  const [tip, setTip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)])
  const [menu, setMenu] = useState(false)
  const st = status(pet)
  const night = !isDaytime(Date.now())

  // Relógio: avança a simulação a cada 5 s e quando a aba volta a aparecer
  useEffect(() => {
    const tick = () => setPet(p => advance(p))
    const id = setInterval(tick, 5000)
    const vis = () => document.visibilityState === 'visible' && tick()
    document.addEventListener('visibilitychange', vis)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', vis) }
  }, [setPet])

  // Troca a dica do rodapé de tempos em tempos
  useEffect(() => {
    const id = setInterval(() => setTip(TIPS[Math.floor(Math.random() * TIPS.length)]), 25000)
    return () => clearInterval(id)
  }, [])

  const say = useCallback((msg, t) => {
    if (msg) { setToast(msg); clearTimeout(say.t); say.t = setTimeout(() => setToast(null), 2600) }
    if (t) setTip(t)
  }, [])

  const act = useCallback(fn => {
    setPet(p => {
      const r = fn(advance(p))
      if (r.anim) bridge.emit('anim', r.anim)
      queueMicrotask(() => say(r.msg, r.tip))
      return r.pet
    })
  }, [setPet, say])

  // Eventos vindos da cena (tocar no hamster / na sujeirinha)
  useEffect(() => {
    const onPet = () => act(pet_)
    const onClean = () => act(cleanOne)
    bridge.on('tap-pet', onPet); bridge.on('clean-one', onClean)
    return () => { bridge.off('tap-pet', onPet); bridge.off('clean-one', onClean) }
  }, [act])

  const sceneState = useMemo(() => ({
    asleep: pet.asleep, statusKey: st.key, fome: pet.needs.fome, sede: pet.needs.sede, poops: poopCount(pet), night,
  }), [pet, st.key, night])

  const days = Math.max(1, Math.ceil((Date.now() - pet.born) / 86400000))

  return (
    <div className="min-h-[100dvh] landscape:h-[100dvh] bg-[#2b1d14] flex flex-col">
      {/* Cabeçalho */}
      <header className="flex items-center gap-2 px-3 sm:px-5 py-2 text-[#fbeedd]" style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}>
        <img src={spriteURL(pet.species)} alt="" className="w-8 h-6" style={{ imageRendering: 'pixelated' }} />
        <div className="min-w-0 flex-1">
          <p className="pixel text-[11px] sm:text-xs truncate">{pet.name}</p>
          <p className="text-[11px] text-[#d9bfa0]">{SPECIES[pet.species].label} · dia {days} · {HABITATS[pet.habitat].label}</p>
        </div>
        <span className="pixel text-[9px] sm:text-[10px] bg-[#fbeedd] text-[#3b2314] rounded px-2 py-1.5 whitespace-nowrap">{st.emoji} {st.label}</span>
        <span className="pixel text-[9px] sm:text-[10px] bg-[#ffd36b] text-[#3b2314] rounded px-2 py-1.5 whitespace-nowrap" title="Sementinhas: você ganha cuidando do seu pet">🌻 {pet.seeds}</span>
        <button onClick={() => setMenu(m => !m)} className="text-[#fbeedd] text-xl px-1" aria-label="Menu">☰</button>
      </header>

      {menu && (
        <div className="mx-3 sm:mx-5 mb-2 bg-[#fbeedd] pixel-box rounded-md p-3 text-sm flex items-center justify-between gap-3">
          <span>Protótipo 0.1 — o progresso fica salvo neste aparelho.</span>
          <button onClick={() => { if (confirm(`Recomeçar do zero? ${pet.name} vai ser substituído.`)) onReset() }} className="text-[#c0392b] font-bold whitespace-nowrap">Recomeçar</button>
        </div>
      )}

      {/* Corpo: em pé = coluna; deitado/PC = cena à esquerda, painel à direita */}
      <main className="flex-1 flex flex-col landscape:flex-row gap-3 px-3 sm:px-5 pb-3 min-h-0">
        <div className="relative w-full portrait:aspect-[4/3] portrait:max-h-[58dvh] landscape:flex-1 landscape:min-h-0 flex items-center justify-center">
          <GameCanvas species={pet.species} state={sceneState} />
          {toast && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-[#fbeedd] pixel-box rounded-md px-3 py-1.5 text-sm font-bold whitespace-nowrap shadow-lg">{toast}</div>
          )}
          {pet.asleep && (
            <div className="absolute bottom-2 left-2 text-[11px] bg-black/50 text-white rounded px-2 py-1">Shhh… {pet.name} está dormindo</div>
          )}
        </div>

        <aside className="landscape:w-[300px] xl:landscape:w-[340px] shrink-0 flex flex-col gap-3 landscape:overflow-y-auto">
          {/* Necessidades */}
          <div className="bg-[#fbeedd] pixel-box rounded-md p-3 grid grid-cols-2 landscape:grid-cols-1 [@media(orientation:landscape)_and_(max-height:520px)]:grid-cols-2 [@media(orientation:landscape)_and_(max-height:520px)]:p-2 gap-x-4 gap-y-2">
            {NEEDS.map(k => <NeedBar key={k} k={k} v={pet.needs[k]} />)}
            <NeedBar k="saude" v={pet.health} label="Saúde" icon="❤️" />
          </div>

          {/* Ações */}
          <div className="grid grid-cols-5 landscape:grid-cols-3 gap-2">
            <ActionBtn icon="🌾" label="Ração" color="#ffd36b" onClick={() => act(feed)} />
            <ActionBtn icon="💧" label="Água" color="#9fd8f5" onClick={() => act(water)} />
            <ActionBtn icon="🧹" label="Limpar" color="#c8f0c0" onClick={() => act(cleanAll)} />
            <ActionBtn icon="🤚" label="Carinho" color="#ffc2cf" onClick={() => act(pet_)} />
            <ActionBtn icon="🌻" label="Petisco" color="#ffe2a8" onClick={() => act(treat)} />
          </div>

          {/* Dica educativa */}
          <div className="bg-[#fff7e6] pixel-box rounded-md p-3 text-[13px] leading-snug text-[#3b2314] [@media(orientation:landscape)_and_(max-height:520px)]:hidden">
            <p className="pixel text-[9px] text-[#c0392b] mb-1.5">Dica do tutor</p>
            {tip}
          </div>
          <p className="text-[10px] text-[#a88a70] text-center">Toque no {pet.name} pra fazer carinho · toque na sujeirinha pra limpar</p>
        </aside>
      </main>
    </div>
  )
}

function NeedBar({ k, v, label, icon }) {
  const info = NEED_INFO[k] || { label, icon }
  const color = v >= 60 ? '#2ecc71' : v >= 30 ? '#f1c40f' : '#e74c3c'
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between text-[12px] font-bold">
        <span className="truncate">{info.icon} {info.label}</span>
        <span className="tabular-nums text-[#8a6a52]">{Math.round(v)}</span>
      </div>
      <div className="h-3 mt-0.5 bg-[#3b2314] rounded-sm p-[2px]">
        <div className="h-full rounded-[1px] transition-all duration-500" style={{ width: `${Math.max(3, v)}%`, background: color }} />
      </div>
    </div>
  )
}

function ActionBtn({ icon, label, color, onClick }) {
  return (
    <button onClick={onClick} className="pixel-btn rounded-md py-2 flex flex-col items-center gap-0.5" style={{ background: color }}>
      <span className="text-xl leading-none">{icon}</span>
      <span className="text-[11px] font-extrabold">{label}</span>
    </button>
  )
}

// Monta o Phaser uma vez e repassa o estado pela ponte
function GameCanvas({ species, state }) {
  const ref = useRef(null)
  const gameRef = useRef(null)
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    gameRef.current = createGame(ref.current, { species, state: stateRef.current })
    return () => { gameRef.current?.destroy(true); gameRef.current = null }
  }, [species])

  useEffect(() => { bridge.emit('state', state) }, [state])

  return <div ref={ref} className="w-full h-full min-h-[200px]" />
}
