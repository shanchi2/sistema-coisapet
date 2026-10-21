import { useEffect, useRef } from 'react'
import { hamsterSprites, sprite, pad, rand, text } from './common'

// 🏃 Corrida do Hamster (0.5) — estilo "dinossauro do Chrome", com o hamster
// do jogador. Pula rolo de papelão, pedrinha e gato; pega sementes.
// Pontos = distância/8 + 10 por semente.
const VW = 200, VH = 100, GROUND = 84, HX = 26
const GRAV = 560, JUMP = -205, CUT = -85
const ROLL = ['.NNNNNN.', 'NnTTTTnN', 'NttttttN', 'NttttttN', 'NTTTTTTN', 'NttttttN', 'NttttttN', 'NTTTTTTN', 'NttttttN', '.NNNNNN.']
const ROLLS = [...ROLL.slice(0, 5), '.NNNNNN.', ...ROLL.slice(0, 5), '.NNNNNN.', ...ROLL.slice(0, 5), '.NNNNNN.']
const STONE = ['..kkkk...', '.kSSSsk..', 'kSSssssk.', 'kSsssssSk', 'kssssssk.', '.kkkkkkk.']
const CAT = [
  '.k......k.', 'kak....kak', 'kaakkkkaak', 'kaaaaaaaak', 'kagkaagkak', 'kaaaapaaak', '.kaawwaak.',
  '..kaaaak......kk', '.kaAaaAaak...kak', '.kaAaaAaaak.kak.', '.kaAaaAaaaakk..', '.kaaaaaaaaak...', '.kwwkkkkwwk....', '..kk....kk.....',
]
const BIG_SEED = ['..k..', '.kwk.', 'kwkwk', 'kwkwk', 'kwkwk', '.kwk.', '..k..']
const OBST = { roll: { rows: ROLL, min: 0 }, stone: { rows: STONE, min: 0 }, rolls: { rows: ROLLS, min: 120 }, cat: { rows: pad(CAT), min: 250 } }
let SPR = null
const spr = () => SPR || (SPR = { seed: sprite(BIG_SEED), ...Object.fromEntries(Object.entries(OBST).map(([k, o]) => [k, sprite(o.rows)])) })

export const meta = {
  key: 'corrida', label: 'Corrida do Hamster', icon: '🏃', color: '#9fd8f5', wide: true,
  how: 'Toque na tela (ou espaço) pra pular. Segure pra pular mais alto. Pegue as sementes e não bata nos obstáculos!',
}

export default function Corrida({ pet, onEnd }) {
  const ref = useRef(null)
  useEffect(() => {
    const canvas = ref.current, ctx = canvas.getContext('2d')
    const H = hamsterSprites(pet.species), S = spr()
    const g = { t: 0, dist: 0, y: GROUND, vy: 0, obs: [], seeds: [], nextObs: 140, nextSeed: 70, score: 0, seedsGot: 0, dead: false, speed: 75 }
    const jump = () => { if (g.y >= GROUND - 0.5 && !g.dead) g.vy = JUMP }
    const release = () => { if (g.vy < CUT) g.vy = CUT }
    const kd = e => { if (['Space', 'ArrowUp', 'KeyW'].includes(e.code)) { e.preventDefault(); if (!e.repeat) jump() } }
    const ku = e => { if (['Space', 'ArrowUp', 'KeyW'].includes(e.code)) release() }
    const area = canvas.parentElement
    const pd = e => { e.preventDefault(); jump() }
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku)
    area.addEventListener('pointerdown', pd); window.addEventListener('pointerup', release)

    function draw() {
      ctx.imageSmoothingEnabled = false
      ctx.fillStyle = '#d6e8dd'; ctx.fillRect(0, 0, VW, GROUND)
      ctx.fillStyle = '#c3d9cc'; ctx.fillRect(0, GROUND - 26, VW, 26)
      const wx = -((g.dist * 0.2) % 120)
      for (let x = wx; x < VW; x += 120) {
        ctx.fillStyle = '#8fbcd4'; ctx.fillRect(x + 20, 10, 30, 20)
        ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 34, 10, 2, 20); ctx.fillRect(x + 20, 19, 30, 2)
        ctx.strokeStyle = '#3b2314'; ctx.lineWidth = 2; ctx.strokeRect(x + 19, 9, 32, 22)
      }
      ctx.fillStyle = '#e8cf9a'; ctx.fillRect(0, GROUND, VW, VH - GROUND)
      ctx.fillStyle = '#3b2314'; ctx.fillRect(0, GROUND, VW, 1)
      ctx.fillStyle = '#c9a76a'
      const off = g.dist % 16
      for (let x = -off; x < VW; x += 16) { ctx.fillRect(x + 3, GROUND + 4, 4, 1); ctx.fillRect(x + 10, GROUND + 9, 3, 1); ctx.fillRect(x + 6, GROUND + 13, 5, 1) }
      for (const s of g.seeds) if (!s.got) ctx.drawImage(S.seed, Math.round(s.x), Math.round(s.y))
      for (const o of g.obs) ctx.drawImage(S[o.kind], Math.round(o.x), GROUND - o.h)
      const frame = g.dead ? H.sad : (g.y < GROUND - 1 ? H.walk : (Math.floor(g.t * 9) % 2 ? H.walk : H.idle))
      ctx.drawImage(frame, HX, Math.round(g.y - 12))
      text(ctx, String(g.score).padStart(5, '0'), VW - 6, 5, { align: 'right' })
      ctx.drawImage(H.seedSmall, 6, 6); text(ctx, String(g.seedsGot), 12, 5)
    }

    let raf, last = performance.now()
    function step(now) {
      const dt = Math.min(0.033, (now - last) / 1000); last = now
      g.t += dt
      g.speed = Math.min(190, 75 + g.t * 2.2)
      const dx = g.speed * dt
      g.dist += dx
      g.vy += GRAV * dt; g.y += g.vy * dt
      if (g.y >= GROUND) { g.y = GROUND; g.vy = 0 }
      g.nextObs -= dx
      if (g.nextObs <= 0) {
        const kinds = Object.entries(OBST).filter(([, o]) => g.score >= o.min).map(([k]) => k)
        const kind = kinds[Math.floor(Math.random() * kinds.length)]
        g.obs.push({ kind, x: VW + 4, w: S[kind].width, h: S[kind].height })
        g.nextObs = rand(95, 180) * (g.speed / 110) + 40
      }
      g.nextSeed -= dx
      if (g.nextSeed <= 0) {
        g.seeds.push({ x: VW + 4, y: Math.random() < 0.45 ? GROUND - 40 : GROUND - 10 })
        g.nextSeed = rand(80, 170)
      }
      for (const o of g.obs) o.x -= dx
      for (const s of g.seeds) s.x -= dx
      g.obs = g.obs.filter(o => o.x > -30)
      g.seeds = g.seeds.filter(s => s.x > -10 && !s.got)
      const hb = { l: HX + 3, r: HX + 14, t: g.y - 10, b: g.y - 1 }
      for (const s of g.seeds) if (s.x < hb.r && s.x + 5 > hb.l && s.y < hb.b && s.y + 7 > hb.t) { s.got = true; g.seedsGot++ }
      for (const o of g.obs) {
        if (hb.r > o.x + 2 && hb.l < o.x + o.w - 2 && hb.b > GROUND - o.h + 2) g.dead = true
      }
      g.score = Math.floor(g.dist / 8) + g.seedsGot * 10
      draw()
      if (g.dead) { setTimeout(() => onEnd({ score: g.score, seeds: g.seedsGot }), 450); return }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku)
      area.removeEventListener('pointerdown', pd); window.removeEventListener('pointerup', release)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="absolute inset-0 flex items-center justify-center touch-none select-none">
      <canvas ref={ref} width={VW} height={VH} className="max-w-full max-h-full w-full h-full object-contain" style={{ imageRendering: 'pixelated' }} />
    </div>
  )
}
