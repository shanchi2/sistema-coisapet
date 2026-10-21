import { useEffect, useRef, useState } from 'react'
import { HAMSTER_FRAMES, SEED, paletteFor, spriteCanvas } from './art'
import { api } from './cloud'
import { canRun } from './sim'

// ─── Corrida do Hamster (0.5, 21/10) ─────────────────────────────────
// Minijogo estilo "dinossauro do Chrome", com o hamster DO JOGADOR (mesma
// pelagem do pet). Pula rolo de papelão, pedrinha e gato; pega sementes.
// O servidor assina o início da partida e confere tempo × pontos no fim
// (ninguém manda 99999 pelo console). Desenho 100% em pixel, por código.
const VW = 200, VH = 100, GROUND = 84, HX = 26
const GRAV = 560, JUMP = -205, CUT = -85
const PAL = {
  a: '#e67e22', A: '#f5b041', k: '#2b1d14', w: '#ffffff', p: '#f19aa8', g: '#58d68d',
  n: '#7a4a24', N: '#a0662f', t: '#efe0bd', T: '#c9b88a', s: '#8d8d99', S: '#b9b9c4', y: '#f1c40f', Y: '#f9e79f',
}
const pad = rows => { const w = Math.max(...rows.map(r => r.length)); return rows.map(r => r.padEnd(w, '.')) }
const ROLL = pad([
  '.NNNNNN.', 'NnTTTTnN', 'NttttttN', 'NttttttN', 'NTTTTTTN', 'NttttttN', 'NttttttN', 'NTTTTTTN', 'NttttttN', '.NNNNNN.',
])
const ROLLS = pad([
  '.NNNNNN.', 'NnTTTTnN', 'NttttttN', 'NTTTTTTN', 'NttttttN', '.NNNNNN.',
  '.NNNNNN.', 'NnTTTTnN', 'NttttttN', 'NTTTTTTN', 'NttttttN', '.NNNNNN.',
  '.NNNNNN.', 'NnTTTTnN', 'NttttttN', 'NTTTTTTN', 'NttttttN', '.NNNNNN.',
])
const STONE = pad(['..kkkk...', '.kSSSsk..', 'kSSssssk.', 'kSsssssSk', 'kssssssk.', '.kkkkkkk.'])
const CAT = pad([
  '.k......k.', 'kak....kak', 'kaakkkkaak', 'kaaaaaaaak', 'kagkaagkak', 'kaaaapaaak', '.kaawwaak.',
  '..kaaaak......kk', '.kaAaaAaak...kak', '.kaAaaAaaak.kak.', '.kaAaaAaaaakk..', '.kaaaaaaaaak...', '.kwwkkkkwwk....', '..kk....kk.....',
])
const BIG_SEED = pad(['..k..', '.kwk.', 'kwkwk', 'kwkwk', 'kwkwk', '.kwk.', '..k..'])
const OBST = {
  roll:  { rows: ROLL, minScore: 0 },
  stone: { rows: STONE, minScore: 0 },
  rolls: { rows: ROLLS, minScore: 120 },
  cat:   { rows: CAT, minScore: 250 },
}

function useSprites(species) {
  const ref = useRef(null)
  if (!ref.current || ref.current.species !== species) {
    const hp = paletteFor(species)
    ref.current = {
      species,
      idle: spriteCanvas(HAMSTER_FRAMES.idle, hp), walk: spriteCanvas(HAMSTER_FRAMES.walk, hp), sad: spriteCanvas(HAMSTER_FRAMES.sad, hp),
      seed: spriteCanvas(BIG_SEED, PAL), seedSmall: spriteCanvas(SEED, PAL),
      ...Object.fromEntries(Object.entries(OBST).map(([k, o]) => [k, spriteCanvas(o.rows, PAL)])),
    }
  }
  return ref.current
}

export default function Runner({ pet, token, onClose, onFinish, best }) {
  const canvasRef = useRef(null)
  const sprites = useSprites(pet.species)
  const [phase, setPhase] = useState('intro') // intro | play | over
  const [result, setResult] = useState(null)   // { score, seeds, sending, gained, record, error }
  const runRef = useRef(null)
  const gate = canRun(pet)

  // Desenho de fundo/cena (também usado parado na intro)
  function draw(ctx, g) {
    ctx.imageSmoothingEnabled = false
    // parede do quarto + janelinhas com parallax
    ctx.fillStyle = '#d6e8dd'; ctx.fillRect(0, 0, VW, GROUND)
    ctx.fillStyle = '#c3d9cc'; ctx.fillRect(0, GROUND - 26, VW, 26)
    const wx = -((g.dist * 0.2) % 120)
    for (let x = wx; x < VW; x += 120) {
      ctx.fillStyle = '#8fbcd4'; ctx.fillRect(x + 20, 10, 30, 20)
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 34, 10, 2, 20); ctx.fillRect(x + 20, 19, 30, 2)
      ctx.strokeStyle = '#3b2314'; ctx.lineWidth = 2; ctx.strokeRect(x + 19, 9, 32, 22)
    }
    // chão de substrato (aspen) com lascas que andam
    ctx.fillStyle = '#e8cf9a'; ctx.fillRect(0, GROUND, VW, VH - GROUND)
    ctx.fillStyle = '#3b2314'; ctx.fillRect(0, GROUND, VW, 1)
    ctx.fillStyle = '#c9a76a'
    const off = g.dist % 16
    for (let x = -off; x < VW; x += 16) { ctx.fillRect(x + 3, GROUND + 4, 4, 1); ctx.fillRect(x + 10, GROUND + 9, 3, 1); ctx.fillRect(x + 6, GROUND + 13, 5, 1) }
    // sementes e obstáculos
    for (const s of g.seeds) if (!s.got) ctx.drawImage(sprites.seed, Math.round(s.x), Math.round(s.y))
    for (const o of g.obs) ctx.drawImage(sprites[o.kind], Math.round(o.x), GROUND - o.h)
    // hamster (2x na altura do sprite original: 16x12)
    const frame = g.dead ? sprites.sad : (g.y < GROUND - 1 ? sprites.walk : (Math.floor(g.t * 9) % 2 ? sprites.walk : sprites.idle))
    ctx.drawImage(frame, HX, Math.round(g.y - 12))
    // placar
    ctx.fillStyle = '#3b2314'; ctx.font = '8px "Press Start 2P", monospace'; ctx.textBaseline = 'top'
    ctx.textAlign = 'right'; ctx.fillText(String(g.score).padStart(5, '0'), VW - 6, 5)
    ctx.textAlign = 'left'; ctx.drawImage(sprites.seedSmall, 6, 6); ctx.fillText(String(g.seedsGot), 12, 5)
  }

  function newGame() {
    return { t: 0, dist: 0, y: GROUND, vy: 0, obs: [], seeds: [], nextObs: 140, nextSeed: 70, score: 0, seedsGot: 0, dead: false, hold: false, speed: 75 }
  }

  // Desenha a cena parada na intro
  useEffect(() => {
    if (phase !== 'intro') return
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) draw(ctx, newGame())
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  async function start() {
    if (!gate.ok) return
    setResult(null)
    // pede ao servidor a "assinatura" do início (sem internet joga igual, só não vale ponto)
    const ticket = api('run_start', { token }).then(r => r.run_id).catch(() => null)
    const g = newGame()
    runRef.current = { g, ticket, startedAt: performance.now() }
    setPhase('play')
  }

  // Loop do jogo
  useEffect(() => {
    if (phase !== 'play') return
    const ctx = canvasRef.current.getContext('2d')
    const run = runRef.current
    const g = run.g
    let raf, last = performance.now()
    const jump = () => { if (g.y >= GROUND - 0.5 && !g.dead) { g.vy = JUMP; g.hold = true } }
    const release = () => { g.hold = false; if (g.vy < CUT) g.vy = CUT }
    const kd = e => { if (['Space', 'ArrowUp', 'KeyW'].includes(e.code)) { e.preventDefault(); if (!e.repeat) jump() } }
    const ku = e => { if (['Space', 'ArrowUp', 'KeyW'].includes(e.code)) release() }
    const el = canvasRef.current
    const pd = e => { e.preventDefault(); jump() }
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku)
    el.addEventListener('pointerdown', pd); window.addEventListener('pointerup', release)

    const rand = (a, b) => a + Math.random() * (b - a)
    function step(now) {
      const dt = Math.min(0.033, (now - last) / 1000); last = now
      g.t += dt
      g.speed = Math.min(190, 75 + g.t * 2.2)
      const dx = g.speed * dt
      g.dist += dx
      // pulo
      g.vy += GRAV * dt; g.y += g.vy * dt
      if (g.y >= GROUND) { g.y = GROUND; g.vy = 0 }
      // obstáculos
      g.nextObs -= dx
      if (g.nextObs <= 0) {
        const kinds = Object.entries(OBST).filter(([, o]) => g.score >= o.minScore).map(([k]) => k)
        const kind = kinds[Math.floor(Math.random() * kinds.length)]
        const img = sprites[kind]
        g.obs.push({ kind, x: VW + 4, w: img.width, h: img.height })
        g.nextObs = rand(95, 180) * (g.speed / 110) + 40
      }
      g.nextSeed -= dx
      if (g.nextSeed <= 0) {
        const high = Math.random() < 0.45
        g.seeds.push({ x: VW + 4, y: high ? GROUND - 40 : GROUND - 10 })
        g.nextSeed = rand(80, 170)
      }
      for (const o of g.obs) o.x -= dx
      for (const s of g.seeds) s.x -= dx
      g.obs = g.obs.filter(o => o.x > -30)
      g.seeds = g.seeds.filter(s => s.x > -10 && !s.got)
      // colisões (caixa do hamster um pouco menor que o desenho)
      const hb = { l: HX + 3, r: HX + 14, t: g.y - 10, b: g.y - 1 }
      for (const s of g.seeds) {
        if (s.x < hb.r && s.x + 5 > hb.l && s.y < hb.b && s.y + 7 > hb.t) { s.got = true; g.seedsGot++ }
      }
      for (const o of g.obs) {
        const ob = { l: o.x + 2, r: o.x + o.w - 2, t: GROUND - o.h + 2 }
        if (hb.r > ob.l && hb.l < ob.r && hb.b > ob.t) { g.dead = true }
      }
      g.score = Math.floor(g.dist / 8) + g.seedsGot * 10
      draw(ctx, g)
      if (g.dead) { finish(); return }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku)
      el.removeEventListener('pointerdown', pd); window.removeEventListener('pointerup', release)
    }
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  async function finish() {
    const { g, ticket, startedAt } = runRef.current
    const ms = Math.round(performance.now() - startedAt)
    const res = { score: g.score, seeds: g.seedsGot, sending: true }
    setResult(res); setPhase('over')
    onFinish({ seeds: g.seedsGot })
    const runId = await ticket
    if (!runId) { setResult({ ...res, sending: false, error: 'Sem internet: essa partida não entrou no ranking.' }); return }
    try {
      const r = await api('run_submit', { token, run_id: runId, score: g.score, ms, seeds: g.seedsGot })
      setResult({ ...res, sending: false, gained: r.gained, record: r.record, me: r.me })
      onFinish({ me: r.me })
    } catch (e) { setResult({ ...res, sending: false, error: e.message }) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3" onClick={phase === 'play' ? undefined : onClose}>
      <div className="w-full max-w-2xl bg-[#fbeedd] pixel-box rounded-lg p-3 sm:p-4 select-none" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="pixel text-xs sm:text-sm text-[#3b2314]">🏃 Corrida do {pet.name}</h2>
          {phase !== 'play' && <button onClick={onClose} className="text-2xl leading-none px-2 text-[#8a6a52]" aria-label="Fechar">×</button>}
        </div>
        <div className="relative">
          <canvas ref={canvasRef} width={VW} height={VH} className="w-full pixel-box rounded-md bg-[#d6e8dd] touch-none" style={{ imageRendering: 'pixelated', aspectRatio: `${VW}/${VH}` }} />
          {phase === 'intro' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/35 rounded-md text-center px-4">
              {gate.ok ? <>
                <p className="pixel text-[10px] sm:text-xs text-white drop-shadow">Toque na tela (ou espaço) pra pular</p>
                <p className="text-[12px] text-white font-bold drop-shadow">Pule os obstáculos e pegue as sementes 🌻</p>
                <button onClick={start} className="pixel-btn rounded-md px-5 py-2.5 bg-[#2ecc71] text-white pixel text-xs mt-1">Correr!</button>
              </> : <p className="text-[13px] text-white font-extrabold drop-shadow max-w-xs">{gate.msg}</p>}
            </div>
          )}
          {phase === 'over' && result && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/45 rounded-md text-center px-4 text-white">
              <p className="pixel text-xs drop-shadow">{result.record ? '🏆 Novo recorde!' : 'Ops! Bateu 😵'}</p>
              <p className="text-[13px] font-extrabold">{result.score} pontos · {result.seeds} 🌻</p>
              <p className="text-[12px] font-bold min-h-[18px]">{result.sending ? 'Enviando…' : result.error ? result.error : result.gained ? `+${result.gained} XP` : 'Limite de XP dos jogos de hoje atingido — o recorde vale igual!'}</p>
              <div className="flex gap-2 mt-1">
                <button onClick={() => setPhase('intro')} className="pixel-btn rounded-md px-4 py-2 bg-[#2ecc71] text-white text-[12px] font-extrabold">Jogar de novo</button>
                <button onClick={onClose} className="pixel-btn rounded-md px-4 py-2 bg-[#fbeedd] text-[#3b2314] text-[12px] font-extrabold">Sair</button>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 mt-2 text-[11px] text-[#6b4a32] font-bold flex-wrap">
          <span>⚡ Energia do {pet.name}: {Math.round(pet.needs.energia)} · cada corrida cansa um pouco</span>
          <span>Seu recorde: {best || 0}</span>
        </div>
      </div>
    </div>
  )
}
