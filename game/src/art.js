// ─── Pixel art desenhada por código ──────────────────────────────────
// Cada sprite é uma lista de linhas; cada caractere é um pixel e aponta
// pra uma cor da paleta ('.' = transparente). Assim a arte é 100% nossa
// (sem licença de terceiros) e dá pra trocar a pelagem por espécie.

export const COATS = {
  dourado: { o: '#4a2a14', b: '#e09a48', d: '#c47a2c', l: '#fbe6c2', p: '#f19aa8', e: '#1a1010', w: '#ffffff' },
  cinza:   { o: '#2f2f38', b: '#a3a6b4', d: '#7d8090', l: '#f1f1f5', p: '#f2a7b3', e: '#111111', w: '#ffffff' },
  panda:   { o: '#2a2320', b: '#f7f3ea', d: '#3a302b', l: '#ffffff', p: '#f2a7b3', e: '#111111', w: '#ffffff' },
}

// Hamster olhando pra direita, 16x12. b=corpo d=mancha/sombra l=barriga
const H_IDLE = [
  '..........oo....',
  '...oo....oppo...',
  '..oppoooooooo...',
  '.obbbbbbbbbbbo..',
  'obddbbbbbbbbebo.',
  'obdddbbbbbbbbbpo',
  'obddbbbbbbllllo.',
  'obbbbbbbblllllo.',
  '.obbbbbllllllo..',
  '..oooooooooooo..',
  '...pp......pp...',
  '................',
]
const H_WALK = [
  '..........oo....',
  '...oo....oppo...',
  '..oppoooooooo...',
  '.obbbbbbbbbbbo..',
  'obddbbbbbbbbebo.',
  'obdddbbbbbbbbbpo',
  'obddbbbbbbllllo.',
  'obbbbbbbblllllo.',
  '.obbbbbllllllo..',
  '..oooooooooooo..',
  '..pp........pp..',
  '................',
]
const H_SLEEP = [
  '................',
  '................',
  '................',
  '..........oo....',
  '...oooooooppo...',
  '..obbbbbbbbbbo..',
  '.obddbbbbbbbbbo.',
  'obdddbbbbbbooobo',
  'obddbbbbbbllllpo',
  '.obbbbbllllllo..',
  '..oooooooooooo..',
  '................',
]
const H_EAT = [
  '................',
  '..........oo....',
  '...oo....oppo...',
  '..oppoooooooo...',
  '.obbbbbbbbbbbo..',
  'obddbbbbbbbbebo.',
  'obdddbbbbbbbllpo',
  'obddbbbbbbllllll',
  '.obbbbbllllllo..',
  '..oooooooooooo..',
  '...pp......pp...',
  '................',
]
const H_SAD = [
  '................',
  '..oo.......oo...',
  '.oppoooooooppo..',
  '.obbbbbbbbbbbo..',
  'obddbbbbbbbbbbo.',
  'obdddbbbbbbbobpo',
  'obddbbbbbbbbllo.',
  'obbbbbbbblllllo.',
  '.obbbbbllllllo..',
  '..oooooooooooo..',
  '...pp......pp...',
  '................',
]

export const HAMSTER_FRAMES = { idle: H_IDLE, walk: H_WALK, sleep: H_SLEEP, eat: H_EAT, sad: H_SAD }

// Objetos (paleta fixa)
const OBJ_PAL = {
  k: '#2b2b33', g: '#6f7785', s: '#aab3c2', h: '#dfe6ef', // metal
  r: '#c0392b', R: '#e74c3c', y: '#f1c40f', Y: '#f9e79f', // vermelho/amarelo
  c: '#5dade2', C: '#aed6f1', // água
  n: '#7a4a24', N: '#a0662f', // marrom (cocô / ração)
  t: '#e8d9b0', T: '#c9b88a', // jornal / serragem
  w: '#ffffff',
}
// Potinho de ração (12x6) — cheio e vazio
export const BOWL_FULL = [
  '...nNnNNn...',
  '..NnNNnNnN..',
  '.krrrrrrrrk.',
  '.kRRRRRRRRk.',
  '..krrrrrrk..',
  '...kkkkkk...',
]
export const BOWL_EMPTY = [
  '............',
  '............',
  '.krrrrrrrrk.',
  '.kRkkkkkkRk.',
  '..krrrrrrk..',
  '...kkkkkk...',
]
// Bebedouro de bico (6x16) — `level` é desenhado à parte
export const BOTTLE = [
  '.kkkk.',
  'kChhCk',
  'kC..Ck',
  'kC..Ck',
  'kC..Ck',
  'kC..Ck',
  'kC..Ck',
  'kC..Ck',
  'kC..Ck',
  'kC..Ck',
  'kC..Ck',
  '.kssk.',
  '..ss..',
  '..gg..',
  '..gg..',
  '..kk..',
]
export const POOP = ['.nn.', 'nNNn', '.nn.']
export const SEED = ['.Y.', 'YyY', '.y.']

export function paletteFor(species) {
  return COATS[{ sirio: 'dourado', anao: 'cinza', panda: 'panda' }[species] || 'dourado']
}

// Desenha um sprite num canvas novo (escala 1 — o Phaser amplia com pixelArt)
export function spriteCanvas(rows, pal, flip = false) {
  const h = rows.length, w = rows[0].length
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const ctx = c.getContext('2d')
  rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) {
      const ch = row[flip ? w - 1 - x : x]
      const col = pal[ch] || OBJ_PAL[ch]
      if (ch === '.' || !col) continue
      ctx.fillStyle = col
      ctx.fillRect(x, y, 1, 1)
    }
  })
  return c
}

export const OBJECT_PALETTE = OBJ_PAL
