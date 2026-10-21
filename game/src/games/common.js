import { useEffect, useRef } from 'react'
import { HAMSTER_FRAMES, SEED, paletteFor, spriteCanvas } from '../art'

// ─── Peças comuns dos minijogos (0.6, 22/10) ─────────────────────────
// Paleta e sprites em pixel desenhados por código (mesmo esquema do art.js).
export const PAL = {
  a: '#e67e22', A: '#f5b041', k: '#2b1d14', w: '#ffffff', p: '#f19aa8', g: '#58d68d', G: '#27ae60',
  n: '#7a4a24', N: '#a0662f', t: '#efe0bd', T: '#c9b88a', s: '#8d8d99', S: '#b9b9c4', y: '#f1c40f', Y: '#f9e79f',
  c: '#5dade2', C: '#aed6f1', r: '#c0392b', R: '#e74c3c', o: '#e67e22', O: '#f8c471', v: '#7d3c98', V: '#bb8fce',
  b: '#5d3a1a', B: '#8b5a2b', l: '#d5f5e3', e: '#ecf0f1', d: '#6e2c00',
}
export const pad = rows => { const w = Math.max(...rows.map(r => r.length)); return rows.map(r => r.padEnd(w, '.')) }
export const sprite = rows => spriteCanvas(pad(rows), PAL)

// Comidas (Chuva de Sementes) — 8x8
export const FOODS = {
  girassol: { rows: ['...k....', '..kwk...', '.kwkwk..', '.kwkwk..', '.kwkwk..', '.kwkwk..', '..kwk...', '...k....'], good: true, pts: 10, label: 'Semente de girassol' },
  racao:    { rows: ['........', '..kkkk..', '.kNBNBk.', 'kBNBNBNk', 'kNBNBNBk', '.kBNBNk.', '..kkkk..', '........'], good: true, pts: 5, label: 'Ração' },
  cenoura:  { rows: ['....gG..', '...gGg..', '...kkk..', '..koOk..', '..kOok..', '.koOk...', '.kOk....', '..k.....'], good: true, pts: 15, label: 'Cenoura' },
  brocolis: { rows: ['.GgGg...', 'GgGgGg..', 'gGgGgG..', '.GgGg...', '..gg....', '..gg....', '..gg....', '........'], good: true, pts: 15, label: 'Brócolis' },
  chocolate:{ rows: ['kkkkkkk.', 'kdbdbdk.', 'kbdbdbk.', 'kdbdbdk.', 'kbdbdbk.', 'kdbdbdk.', 'kkkkkkk.', '........'], good: false, label: 'Chocolate', why: 'Chocolate é tóxico pro hamster!' },
  uva:      { rows: ['...G....', '..vVv...', '.vVvVv..', '.VvVvV..', '..vVv...', '...v....', '........', '........'], good: false, label: 'Uva', why: 'Uva faz mal pros rins do hamster.' },
  cebola:   { rows: ['...g....', '...g....', '..kek...', '.keVek..', '.kVeVk..', '.keVek..', '..kkk...', '........'], good: false, label: 'Cebola', why: 'Cebola e alho são tóxicos pro hamster!' },
  laranja:  { rows: ['....g...', '..kkk...', '.kOoOk..', 'kOoOoOk.', 'kOoOoOk.', '.kOoOk..', '..kkk...', '........'], good: false, label: 'Laranja', why: 'Fruta cítrica é ácida demais pro hamster.' },
}

// Ícones dos produtos CoisaPet (Memória) — 12x12
export const ITEM_ICONS = {
  terrario: ['kkkkkkkkkkkk', 'kCCCCCCCCCCk', 'kC........Ck', 'kC........Ck', 'kC..kk....Ck', 'kC.kaak...Ck', 'kC.kkkk...Ck', 'kTTTTTTTTTTk', 'kTtTtTtTtTTk', 'kBBBBBBBBBBk', 'kNNNNNNNNNNk', 'kkkkkkkkkkkk'],
  roda:     ['...kkkkkk...', '..kBNNNNBk..', '.kBk....kBk.', 'kBk.k..k.kBk', 'kNk..kk..kNk', 'kNk.kkkk.kNk', 'kNk..kk..kNk', 'kBk.k..k.kBk', '.kBk....kBk.', '..kBNNNNBk..', '...kkSSkk...', '..kSSSSSSk..'],
  toca:     ['.....kk.....', '....kNNk....', '...kNBBNk...', '..kNBBBBNk..', '.kNBBBBBBNk.', 'kkkkkkkkkkkk', '.kBNNNNNNBk.', '.kBNkkkkNBk.', '.kBNkkkkNBk.', '.kBNkkkkNBk.', '.kBBkkkkBBk.', '.kkkkkkkkkk.'],
  bebedouro:['....kkkk....', '...kCCCCk...', '...kCwCCk...', '...kCCCCk...', '...kcccck...', '...kcccck...', '...kcccck...', '....kssk....', '.....ss.....', '.....kk.....', '.kkkkkkkkkk.', '.kNNNNNNNNk.'],
  banheira: ['............', '............', '............', 'kkkkkkkkkkkk', 'knTtTtTtTtnk', 'knTTTTTTTTnk', '.knnnnnnnnk.', '.krrrrrrrrk.', '..krrrrrrk..', '...kkkkkk...', '............', '............'],
  pedra:    ['............', '............', '...kkkkkk...', '..kSSSSSSk..', '.kSSsSSsSSk.', 'kSSsSSSSsSSk', 'kSSSSsSSSSSk', 'ksSSSSSSsSsk', '.kssssssssk.', '..kkkkkkkk..', '............', '............'],
  substrato:['............', '..kkkkkkkk..', '.kTtTtTtTtk.', 'kTtTyTtTtTtk', 'kTTtTtTyTtTk', 'kTtTtTtTtTyk', 'kyTtTtTtTtTk', 'kTtTyTtTtTtk', 'kTTtTtTtyTtk', '.kTtTtTtTtk.', '..kkkkkkkk..', '............'],
  plaquinha:['............', '............', 'kkkkkkkkkkkk', 'kBNNNNNNNNBk', 'kNkNkNkkNkNk', 'kNkNkNkNkkNk', 'kNkkkNkNkNNk', 'kBNNNNNNNNBk', 'kkkkkkkkkkkk', '..k......k..', '..k......k..', '............'],
}

const cache = new Map()
export function hamsterSprites(species) {
  if (!cache.has(species)) {
    const hp = paletteFor(species)
    const f = rows => spriteCanvas(rows, hp)
    const flip = rows => spriteCanvas(rows, hp, true)
    cache.set(species, {
      idle: f(HAMSTER_FRAMES.idle), walk: f(HAMSTER_FRAMES.walk), sad: f(HAMSTER_FRAMES.sad), eat: f(HAMSTER_FRAMES.eat),
      idleL: flip(HAMSTER_FRAMES.idle), walkL: flip(HAMSTER_FRAMES.walk), sleep: f(HAMSTER_FRAMES.sleep),
      seedSmall: spriteCanvas(SEED, PAL),
    })
  }
  return cache.get(species)
}

// Loop por requestAnimationFrame com dt em segundos (máx. 33 ms por passo)
export function useLoop(step, active = true) {
  const ref = useRef(step); ref.current = step
  useEffect(() => {
    if (!active) return
    let raf, last = performance.now()
    const tick = now => {
      const dt = Math.min(0.033, (now - last) / 1000); last = now
      if (ref.current(dt) === false) return
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active])
}

// Texto pixelado (fonte do jogo) no canvas
export function text(ctx, str, x, y, { size = 8, color = '#3b2314', align = 'left' } = {}) {
  ctx.fillStyle = color; ctx.font = `${size}px "Press Start 2P", monospace`; ctx.textBaseline = 'top'; ctx.textAlign = align
  ctx.fillText(str, x, y)
}

export const rand = (a, b) => a + Math.random() * (b - a)

// Converte o toque/clique em coordenada do canvas (o canvas usa object-contain:
// a imagem fica centralizada com faixas, então desconta as faixas)
export function toCanvas(canvas, e, VW, VH) {
  const r = canvas.getBoundingClientRect()
  const k = Math.min(r.width / VW, r.height / VH)
  const ox = r.left + (r.width - VW * k) / 2, oy = r.top + (r.height - VH * k) / 2
  return { x: (e.clientX - ox) / k, y: (e.clientY - oy) / k }
}
const HEART = ['.rr.rr.', 'rRRrRRr', 'rRRRRRr', '.rRRRr.', '..rRr..', '...r...']
const HEART_OFF = HEART.map(r => r.replace(/[rR]/g, 's'))
let HEARTS = null
export const hearts = () => HEARTS || (HEARTS = { on: sprite(HEART), off: sprite(HEART_OFF) })

// Cabeça do gato (adversário do Jogo da Velha) — 10x8
export const CAT_HEAD = ['.k......k.', 'kak....kak', 'kaakkkkaak', 'kaaaaaaaak', 'kagkaagkak', 'kaaaapaaak', '.kaawwaak.', '..kkkkkk..']
