import { useEffect, useMemo, useRef, useState } from 'react'
import { HAMSTER_FRAMES, paletteFor, spriteCanvas } from '../art'
import { ITEM_ICONS, FOODS, sprite, toCanvas } from './common'

// 🀄 Mahjong CoisaPet (22/10, pedido do Raphael: "bastante fase").
// Paciência clássica: as peças ficam empilhadas; só sai peça LIVRE (nada em
// cima e com o lado esquerdo OU o direito livre). Toque em duas iguais → somem.
// 40 fases: 15 desenhadas (coração, patinha, casinha, CP…), 24 geradas que vão
// crescendo e a tartaruga clássica de 144 peças no fim. As peças são sempre
// distribuídas de um jeito que TEM solução (montamos tirando pares livres).
// Cada fase dá até 3 estrelas; passar destrava a próxima (fica no save do pet).
export const meta = {
  key: 'mahjong', label: 'Mahjong CoisaPet', icon: '🀄', color: '#c8e6f5',
  how: 'Toque em duas peças iguais que estejam livres (nada em cima e um dos lados livre) pra tirar o par. Limpe a mesa! São 40 fases — cada uma destrava a próxima.',
}

// ── Desenhos das peças (25 tipos) ─────────────────────────────────────
const EXTRA = {
  pata:    ['.k....k.', 'kak..kak', '.k.kk.k.', '..kaak..', '.kaaaak.', '.kaaaak.', '..kkkk..', '........'],
  coracao: ['.rr.rr..', 'rRRrRRr.', 'rRRRRRr.', '.rRRRr..', '..rRr...', '...r....', '........', '........'],
  estrela: ['...y....', '...y....', 'yyyYyyy.', '.yYYYy..', '..yYy...', '.yy.yy..', '.y...y..', '........'],
  lua:     ['..kkk...', '.kYYk...', 'kYYk....', 'kYYk....', 'kYYk....', '.kYYk...', '..kkk...', '........'],
  gota:    ['...k....', '..kck...', '..kck...', '.kcCck..', '.kccck..', '.kcCck..', '..kkk...', '........'],
  folha:   ['.....kk.', '...kkgk.', '..kgGgk.', '.kgGgk..', '.kGgk...', 'kgk.....', 'k.......', '........'],
}
let FACES = null
function faces() {
  if (FACES) return FACES
  FACES = [
    ...Object.values(ITEM_ICONS).map(r => sprite(r)),
    ...Object.values(FOODS).map(f => sprite(f.rows)),
    ...Object.values(EXTRA).map(r => sprite(r)),
    ...['sirio', 'anao', 'panda'].map(k => spriteCanvas(HAMSTER_FRAMES.idle, paletteFor(k))),
  ]
  return FACES
}

// ── Fases ─────────────────────────────────────────────────────────────
// Cada camada é uma máscara ('#' = peça) em casas inteiras; dx/dy desloca em
// MEIA peça (as pirâmides clássicas ficam "encaixadas" entre as de baixo).
const L = (mask, dx = 0, dy = 0) => ({ mask, dx, dy })
const pyr = (w, h, n) => Array.from({ length: n }, (_, k) => L(Array.from({ length: h - k }, () => '#'.repeat(w - k)), k, k))
const HAND = [
  { name: 'Primeiros pares', layers: pyr(4, 3, 2) },
  { name: 'Corredor', layers: [L(['######', '######']), L(['.####.', '.####.'])] },
  { name: 'Pirâmide', layers: pyr(5, 4, 2) },
  { name: 'Coração', layers: [L(['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...']), L(['.......', '.##.##.', '.#####.', '..###..', '...#...'])] },
  { name: 'Escadinha', layers: pyr(6, 3, 3) },
  { name: 'Patinha', layers: [L(['.##..##.', '.##..##.', '........', '...##...', '..####..', '.######.', '.######.', '..####..']), L(['........', '........', '........', '........', '...##...', '..####..', '..####..'])] },
  { name: 'Cruz', layers: [L(['..##..', '..##..', '######', '######', '..##..', '..##..']), L(['......', '......', '..##..', '..##..']), L(['..#', '..#'], 1, 5)] },
  { name: 'Casinha', layers: [L(['...##...', '..####..', '.######.', '########', '.######.', '.##..##.', '.##..##.']), L(['........', '........', '..####..', '..####..', '..####..']), L(['...##...'], 0, 6)] },
  { name: 'Diamante', layers: [L(['...#...', '..###..', '.#####.', '#######', '.#####.', '..###..', '...#...']), L(['.......', '...#...', '..###..', '.#####.', '..###..', '...#...']), L(['.......', '.......', '...#...', '..###..', '...#...'])] },
  { name: 'Anel', layers: [L(['.######.', '##....##', '##....##', '##....##', '.######.']), L(['.######.', '##....##', '##....##', '##....##', '.######.'])] },
  { name: 'Flor', layers: [L(['..##..', '.####.', '##..##', '##..##', '.####.', '..##..']), L(['..##..', '.####.', '##..##', '##..##', '.####.', '..##..']), L(['......', '.####.', '......', '......', '.####.'])] },
  { name: 'Letras CP', layers: [L(['####.####', '#....#..#', '#....####', '#....#...', '####.#...']), L(['####.####', '#....#..#', '#....####'])] },
  { name: 'Torre', layers: [L(['######', '######', '######', '######']), L(['####', '####', '####', '####'], 2), L(['##', '##', '##', '##'], 4), L(['##', '##'], 4, 2)] },
  { name: 'Borboleta', layers: [L(['##.....##', '###...###', '####.####', '#########', '####.####', '###...###', '##.....##']), L(['.........', '.#.....#.', '.##...##.', '.#######.', '.##...##.', '.#.....#.'])] },
  { name: 'Pirâmide grande', layers: pyr(8, 5, 3) },
]
// Fases geradas: sempre as mesmas pra todo mundo (sorteio com semente)
function rng(seed) { let a = seed >>> 0; return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
const GEN_NAMES = ['Toca', 'Túnel', 'Ninho', 'Despensa', 'Galeria', 'Esconderijo']
function genLevel(i) {
  // tamanho cresce em ordem: ~30 peças na 1ª gerada até ~122 na última
  const target = 30 + i * 4
  let best = null
  for (let tryN = 0; tryN < 60; tryN++) {
    const r = rng(1000 + i * 7919 + tryN * 104729)
    const w = Math.min(11, 6 + Math.floor(i / 3)), h = Math.min(7, 4 + Math.floor(i / 5)), layers = Math.min(5, 2 + Math.floor(i / 6))
    const half = Math.ceil(w / 2)
    let grid = Array.from({ length: h }, () => Array.from({ length: half }, () => r() < 0.78))
    const out = []
    let count = 0
    for (let z = 0; z < layers; z++) {
      if (z > 0) grid = grid.map(row => row.map(v => v && r() < 0.58))
      // espelha na horizontal: desenho simétrico fica bonito
      const mask = grid.map(row => { const left = row.map(v => v ? '#' : '.').join(''); const right = [...left].reverse().join(''); return w % 2 ? left + right.slice(1) : left + right })
      count += mask.join('').split('#').length - 1
      out.push(L(mask))
    }
    if (!best || Math.abs(count - target) < Math.abs(best.count - target)) best = { count, out }
    if (Math.abs(count - target) <= 4) break
  }
  return { name: `${GEN_NAMES[i % GEN_NAMES.length]} ${i + 1}`, layers: best.out }
}
const TURTLE = {
  name: 'Tartaruga (144)', layers: [
    L(['############', '..########..', '.##########.', '############', '############', '.##########.', '..########..', '############']),
    L(['...######...', '...######...', '...######...', '...######...', '...######...', '...######...'], 0, 2),
    L(['....####....', '....####....', '....####....', '....####....'], 0, 4),
    L(['.....##.....', '.....##.....'], 0, 6),
    L(['......#'], -1, 7),
  ], extra: [[-2, 7, 0], [24, 7, 0], [26, 7, 0]],
}
export const LEVELS = [...HAND, ...Array.from({ length: 24 }, (_, i) => genLevel(i)), TURTLE]

export function build(level) {
  const tiles = []
  level.layers.forEach((ly, z) => ly.mask.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '#') tiles.push({ x: c * 2 + ly.dx, y: r * 2 + ly.dy, z }) })))
  for (const [x, y, z] of level.extra || []) tiles.push({ x, y, z })
  if (tiles.length % 2) tiles.splice(tiles.findLastIndex(t => t.z === Math.max(...tiles.map(u => u.z))), 1)
  return tiles.map((t, id) => ({ ...t, id }))
}
// Livre: nada por cima (camada de cima encostando) e um dos lados livre
export function isFree(t, set) {
  let left = false, right = false
  for (const o of set) {
    if (o === t) continue
    if (o.z === t.z + 1 && Math.abs(o.x - t.x) < 2 && Math.abs(o.y - t.y) < 2) return false
    if (o.z === t.z && Math.abs(o.y - t.y) < 2) { if (o.x === t.x - 2) left = true; if (o.x === t.x + 2) right = true }
  }
  return !(left && right)
}
// Distribui os desenhos de um jeito que sempre tem solução: tira pares
// livres até acabar e dá o mesmo desenho pra cada par tirado
export function deal(tiles, nFaces) {
  for (let tries = 0; tries < 200; tries++) {
    let rest = [...tiles], pairs = []
    while (rest.length) {
      const free = rest.filter(t => isFree(t, rest))
      if (free.length < 2) break
      const a = free.splice(Math.floor(Math.random() * free.length), 1)[0]
      const b = free[Math.floor(Math.random() * free.length)]
      pairs.push([a, b]); rest = rest.filter(t => t !== a && t !== b)
    }
    if (rest.length) continue
    const order = Array.from({ length: nFaces }, (_, i) => i).sort(() => Math.random() - 0.5)
    const face = new Map()
    pairs.forEach(([a, b], i) => { const f = order[i % nFaces]; face.set(a.id, f); face.set(b.id, f) })
    return tiles.map(t => ({ ...t, f: face.get(t.id) }))
  }
  // (raríssimo) não achou: distribui em pares aleatórios — o Embaralhar resolve
  const ids = tiles.map(t => t.id).sort(() => Math.random() - 0.5), face = new Map()
  for (let i = 0; i < ids.length; i += 2) { const f = (i / 2) % nFaces; face.set(ids[i], f); face.set(ids[i + 1], f) }
  return tiles.map(t => ({ ...t, f: face.get(t.id) }))
}
const movesLeft = tiles => {
  const seen = {}
  for (const t of tiles) if (isFree(t, tiles)) { if (seen[t.f]) return true; seen[t.f] = true }
  return false
}

// ── Desenho ───────────────────────────────────────────────────────────
const U = 12, V = 15, TW = 24, TH = 30, D = 3, PAD = 6 // meia peça = 12×15 px; profundidade 3 px
export const starsOf = (secs, pairs, helps) => helps === 0 && secs <= pairs * 5 ? 3 : secs <= pairs * 9 && helps <= 1 ? 2 : 1

export default function Mahjong({ pet, onEnd, paused }) {
  const prog = pet.mahjong || { unlocked: 1, stars: {} }
  const [lv, setLv] = useState(null)
  if (lv === null) return <LevelSelect prog={prog} onPick={setLv} />
  return <Board key={lv} lv={lv} onEnd={onEnd} paused={paused} prog={prog} />
}

function LevelSelect({ prog, onPick }) {
  const total = Object.values(prog.stars || {}).reduce((s, n) => s + n, 0)
  return (
    <div className="absolute inset-0 overflow-y-auto px-3 py-3">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-3">
          <p className="pixel text-[10px] sm:text-xs">Escolha a fase</p>
          <p className="text-[12px] font-bold text-[#ffd36b]">⭐ {total}/{LEVELS.length * 3}</p>
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 pb-4">
          {LEVELS.map((l, i) => {
            const open = i < (prog.unlocked || 1)
            const st = prog.stars?.[i] || 0
            return (
              <button key={i} disabled={!open} onClick={() => onPick(i)}
                className={`pixel-btn rounded-md p-1.5 flex flex-col items-center gap-0.5 min-h-[74px] ${open ? (i === LEVELS.length - 1 ? 'bg-[#ffd36b]' : 'bg-[#fbeedd]') : 'bg-[#5a4636] opacity-60'} text-[#3b2314]`}>
                <span className="pixel text-[11px]">{open ? i + 1 : '🔒'}</span>
                <span className="text-[9px] font-bold leading-tight text-center line-clamp-2">{open ? l.name : `Fase ${i + 1}`}</span>
                <span className="text-[10px] leading-none">{open ? '★'.repeat(st) + '☆'.repeat(3 - st) : ''}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Board({ lv, onEnd, paused, prog }) {
  const level = LEVELS[lv]
  const F = faces()
  const base = useMemo(() => build(level), [level])
  const [tiles, setTiles] = useState(() => deal(base, F.length))
  const [sel, setSel] = useState(null)
  const [hint, setHint] = useState(null)
  const [score, setScore] = useState(0)
  const [helps, setHelps] = useState(0)
  const [secs, setSecs] = useState(0)
  const [msg, setMsg] = useState(null)
  const last = useRef(0)
  const done = useRef(false)
  const canvas = useRef(null)
  const pairs = base.length / 2

  // tamanho do desenho
  const box = useMemo(() => {
    const maxX = Math.max(...base.map(t => t.x)), minX = Math.min(...base.map(t => t.x))
    const maxY = Math.max(...base.map(t => t.y)), minY = Math.min(...base.map(t => t.y)), maxZ = Math.max(...base.map(t => t.z))
    return { minX, minY, maxZ, W: (maxX - minX) * U + TW + D + maxZ * D + PAD * 2, H: (maxY - minY) * V + TH + D + maxZ * D + PAD * 2 }
  }, [base])
  const pos = t => ({ px: PAD + (t.x - box.minX) * U + (box.maxZ - t.z) * D, py: PAD + (t.y - box.minY) * V + (box.maxZ - t.z) * D })

  // relógio
  useEffect(() => {
    const id = setInterval(() => { if (!paused?.current && !done.current) setSecs(s => s + 1) }, 1000)
    return () => clearInterval(id)
  }, [paused])

  // desenha
  useEffect(() => {
    const c = canvas.current, ctx = c.getContext('2d')
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, c.width, c.height)
    const order = [...tiles].sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x)
    for (const t of order) {
      const { px, py } = pos(t)
      const free = isFree(t, tiles)
      ctx.fillStyle = '#7a4a24'; ctx.fillRect(px + D, py + D, TW, TH)          // lateral (profundidade)
      ctx.fillStyle = '#c8955a'; ctx.fillRect(px + 1, py + 1, TW + D - 2, TH + D - 2)
      ctx.fillStyle = '#3b2314'; ctx.fillRect(px, py, TW, TH)                   // contorno
      const face = sel === t.id ? '#ffd36b' : hint?.includes(t.id) ? '#9be7a8' : '#fbeedd'
      ctx.fillStyle = face; ctx.fillRect(px + 1, py + 1, TW - 2, TH - 2)
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(px + 1, py + 1, TW - 2, 2)
      const img = F[t.f]
      const k = Math.min(18 / img.width, 22 / img.height)
      const w = img.width * k, h = img.height * k
      ctx.drawImage(img, Math.round(px + (TW - w) / 2), Math.round(py + (TH - h) / 2), w, h)
      if (!free) { ctx.fillStyle = 'rgba(43,29,20,0.28)'; ctx.fillRect(px + 1, py + 1, TW - 2, TH - 2) }
    }
  }, [tiles, sel, hint]) // eslint-disable-line react-hooks/exhaustive-deps

  function finish(final) {
    done.current = true
    const st = starsOf(secs, pairs, helps)
    const bonus = Math.max(0, Math.min(300, (pairs * 5 - secs) * 2))
    const total = Math.max(0, final + bonus)
    setMsg(`Mesa limpa! ${'⭐'.repeat(st)}`)
    setTimeout(() => onEnd({
      score: total, seeds: Math.min(30, Math.round(pairs / 3) + st * 2),
      progress: { mahjong: { level: lv, stars: st } },
      note: `Fase ${lv + 1} · ${level.name} — ${'⭐'.repeat(st)}${lv + 1 < LEVELS.length && lv + 1 >= (prog.unlocked || 1) ? ' · fase ' + (lv + 2) + ' liberada!' : ''}`,
    }), 1400)
  }

  function tap(e) {
    if (done.current || paused?.current) return
    const { x, y } = toCanvas(canvas.current, e, box.W, box.H)
    const hit = [...tiles].sort((a, b) => b.z - a.z || b.y - a.y || b.x - a.x).find(t => { const p = pos(t); return x >= p.px && x < p.px + TW && y >= p.py && y < p.py + TH })
    if (!hit) { setSel(null); return }
    if (!isFree(hit, tiles)) { setMsg('Essa peça está presa 🔒'); setTimeout(() => setMsg(null), 900); return }
    if (sel === null || sel === hit.id) { setSel(sel === hit.id ? null : hit.id); return }
    const a = tiles.find(t => t.id === sel)
    if (a.f !== hit.f) { setSel(hit.id); return }
    // par!
    const now = performance.now()
    const combo = now - last.current < 3000
    last.current = now
    const gained = 10 + (combo ? 5 : 0)
    const rest = tiles.filter(t => t.id !== a.id && t.id !== hit.id)
    setTiles(rest); setSel(null); setHint(null)
    const sc = score + gained
    setScore(sc)
    if (!rest.length) { finish(sc); return }
    if (!movesLeft(rest)) { setMsg('Sem jogadas! Embaralhando…'); setTimeout(() => { shuffle(rest, false); setMsg(null) }, 900) }
  }
  function shuffle(list = tiles, manual = true) {
    setTiles(deal(list.map(t => ({ ...t })), F.length))
    setSel(null); setHint(null)
    if (manual) { setHelps(h => h + 1); setScore(s => Math.max(0, s - 30)) }
  }
  function showHint() {
    const free = tiles.filter(t => isFree(t, tiles))
    for (let i = 0; i < free.length; i++) for (let j = i + 1; j < free.length; j++) if (free[i].f === free[j].f) {
      setHint([free[i].id, free[j].id]); setHelps(h => h + 1); setScore(s => Math.max(0, s - 20))
      setTimeout(() => setHint(null), 2500)
      return
    }
  }

  const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  return (
    <div className="absolute inset-0 flex flex-col items-center gap-2 p-2 select-none">
      <div className="flex items-center gap-3 sm:gap-5 pixel text-[9px] sm:text-[10px] flex-wrap justify-center shrink-0">
        <span className="text-[#ffd36b]">FASE {lv + 1} · {level.name.toUpperCase()}</span>
        <span>PARES {pairs - tiles.length / 2}/{pairs}</span>
        <span>⏱ {fmt(secs)}</span>
        <span className="text-[#c8f0c0]">{score} PTS</span>
      </div>
      <div className="relative flex-1 min-h-0 w-full">
        <canvas ref={canvas} width={box.W} height={box.H} onPointerDown={tap}
          className="absolute inset-0 w-full h-full object-contain touch-none" style={{ imageRendering: 'pixelated' }} />
        {msg && <div className="absolute top-2 left-1/2 -translate-x-1/2 pixel text-[10px] sm:text-xs text-[#ffd36b] bg-[#2b1d14]/90 rounded-md px-4 py-2 whitespace-nowrap pointer-events-none">{msg}</div>}
      </div>
      <div className="flex gap-2 shrink-0 pb-[env(safe-area-inset-bottom)]">
        <button onClick={showHint} className="pixel-btn rounded-md px-4 py-2 bg-[#c8f0c0] text-[#3b2314] text-[12px] font-extrabold">💡 Dica <span className="text-[10px] opacity-70">−20</span></button>
        <button onClick={() => shuffle()} className="pixel-btn rounded-md px-4 py-2 bg-[#fbeedd] text-[#3b2314] text-[12px] font-extrabold">🔀 Embaralhar <span className="text-[10px] opacity-70">−30</span></button>
      </div>
    </div>
  )
}
