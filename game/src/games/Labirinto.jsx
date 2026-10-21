import { useEffect, useRef } from 'react'
import { ITEM_ICONS, hamsterSprites, sprite, text } from './common'

// 🕳️ Labirinto de Túneis (0.6) — guiar o hamster pelos túneis do substrato
// até a toca. Cada fase o labirinto cresce. Tempo corre: chegar na toca dá
// +100 pontos e +12 s; semente no caminho dá +10.
// Mexe com ← ↑ → ↓, deslizando o dedo ou pelos botões. O hamster corre até
// a próxima encruzilhada, seguindo as curvas do túnel sozinho.
const VW = 176, TOP = 16, VH = TOP + 176
const BIG_SEED = ['..k..', '.kwk.', 'kwkwk', 'kwkwk', 'kwkwk', '.kwk.', '..k..']
let SPR = null
const spr = () => SPR || (SPR = { toca: sprite(ITEM_ICONS.toca), seed: sprite(BIG_SEED) })

export const meta = {
  key: 'labirinto', label: 'Labirinto de Túneis', icon: '🕳️', color: '#c8f0c0',
  how: 'Leve o hamster até a toca antes do tempo acabar. Deslize o dedo, use as setas ou os botões. Cada toca vale +100 e mais tempo!',
}

// Labirinto perfeito (backtracking): cada célula guarda paredes abertas {n,s,e,w}
function makeMaze(n) {
  const cells = Array.from({ length: n * n }, () => ({ n: false, s: false, e: false, w: false, seen: false }))
  const at = (x, y) => cells[y * n + x]
  const stack = [[0, 0]]; at(0, 0).seen = true
  const D = [['n', 0, -1, 's'], ['s', 0, 1, 'n'], ['e', 1, 0, 'w'], ['w', -1, 0, 'e']]
  while (stack.length) {
    const [x, y] = stack[stack.length - 1]
    const opts = D.filter(([, dx, dy]) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < n && ny < n && !at(nx, ny).seen })
    if (!opts.length) { stack.pop(); continue }
    const [d, dx, dy, back] = opts[Math.floor(Math.random() * opts.length)]
    at(x, y)[d] = true; at(x + dx, y + dy)[back] = true; at(x + dx, y + dy).seen = true
    stack.push([x + dx, y + dy])
  }
  return { n, at }
}
const DIRS = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }
const BACK = { n: 's', s: 'n', e: 'w', w: 'e' }

export default function Labirinto({ pet, onEnd }) {
  const ref = useRef(null)
  const input = useRef(null)
  useEffect(() => {
    const canvas = ref.current, ctx = canvas.getContext('2d')
    const H = hamsterSprites(pet.species), S = spr()
    const g = { level: 0, time: 40, score: 0, seeds: 0, t: 0, over: false, banner: 0 }
    function newLevel() {
      g.level++
      const n = Math.min(11, 4 + g.level)
      g.maze = makeMaze(n)
      g.cell = Math.floor(176 / n)
      g.off = Math.floor((176 - g.cell * n) / 2)
      g.px = 0; g.py = 0; g.fx = 0; g.fy = 0; g.dir = null; g.face = 1
      g.goal = [n - 1, n - 1]
      g.seedsAt = []
      while (g.seedsAt.length < 3) {
        const s = [Math.floor(Math.random() * n), Math.floor(Math.random() * n)]
        if ((s[0] + s[1]) > 1 && !(s[0] === n - 1 && s[1] === n - 1) && !g.seedsAt.some(o => o[0] === s[0] && o[1] === s[1])) g.seedsAt.push(s)
      }
      g.banner = 1.2
    }
    newLevel()
    input.current = d => { if (!g.over) g.want = d }
    const keyMap = { ArrowUp: 'n', KeyW: 'n', ArrowDown: 's', KeyS: 's', ArrowRight: 'e', KeyD: 'e', ArrowLeft: 'w', KeyA: 'w' }
    const kd = e => { const d = keyMap[e.code]; if (d) { e.preventDefault(); g.want = d } }
    let sx = 0, sy = 0
    const area = canvas.parentElement
    const pd = e => { sx = e.clientX; sy = e.clientY }
    const pu = e => {
      const dx = e.clientX - sx, dy = e.clientY - sy
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return
      g.want = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'e' : 'w') : (dy > 0 ? 's' : 'n')
    }
    window.addEventListener('keydown', kd); area.addEventListener('pointerdown', pd); area.addEventListener('pointerup', pu)

    const open = (x, y, d) => g.maze.at(x, y)[d]
    const exits = (x, y) => Object.keys(DIRS).filter(d => open(x, y, d)).length

    function draw() {
      ctx.imageSmoothingEnabled = false
      ctx.fillStyle = '#2b1d14'; ctx.fillRect(0, 0, VW, VH)
      const { n } = g.maze, c = g.cell, o = g.off, T = TOP
      // túneis (substrato claro) e paredes (terra escura)
      ctx.fillStyle = '#7a4a24'; ctx.fillRect(o, T + o, c * n, c * n)
      const w = Math.max(2, Math.floor(c / 5))
      ctx.fillStyle = '#e8cf9a'
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const cl = g.maze.at(x, y), X = o + x * c, Y = T + o + y * c
        ctx.fillRect(X + w, Y + w, c - 2 * w, c - 2 * w)
        if (cl.e) ctx.fillRect(X + c - w, Y + w, 2 * w, c - 2 * w)
        if (cl.s) ctx.fillRect(X + w, Y + c - w, c - 2 * w, 2 * w)
      }
      const fit = img => { const k = Math.max(1, Math.floor((c - 2 * w) / img.width * 2) / 2); return [img.width * k, img.height * k] }
      for (const [x, y] of g.seedsAt) { const [sw, sh] = fit(S.seed); ctx.drawImage(S.seed, o + x * c + (c - sw) / 2, T + o + y * c + (c - sh) / 2, sw, sh) }
      const [tw, th] = [c - 2 * w, c - 2 * w]
      ctx.drawImage(S.toca, o + g.goal[0] * c + w, T + o + g.goal[1] * c + w, tw, th)
      const img = g.dir ? (Math.floor(g.t * 10) % 2 ? (g.face < 0 ? H.walkL : H.walk) : (g.face < 0 ? H.idleL : H.idle)) : (g.face < 0 ? H.idleL : H.idle)
      const hw = c - 2 * w + 2, hh = hw * 12 / 16
      ctx.drawImage(img, o + g.fx * c + (c - hw) / 2, T + o + g.fy * c + (c - hh) / 2, hw, hh)
      // placar
      text(ctx, `FASE ${g.level}`, 4, 4, { color: '#fbeedd' })
      text(ctx, `${Math.ceil(g.time)}s`, VW / 2, 4, { align: 'center', color: g.time < 10 ? '#e74c3c' : '#fbeedd' })
      text(ctx, String(g.score), VW - 4, 4, { align: 'right', color: '#ffd36b' })
      if (g.banner > 0) {
        ctx.fillStyle = 'rgba(43,29,20,0.8)'; ctx.fillRect(0, VH / 2 - 14, VW, 28)
        text(ctx, g.level === 1 ? 'ACHE A TOCA!' : `FASE ${g.level}!`, VW / 2, VH / 2 - 5, { align: 'center', color: '#ffd36b', size: 10 })
      }
      if (g.over) {
        ctx.fillStyle = 'rgba(43,29,20,0.8)'; ctx.fillRect(0, VH / 2 - 14, VW, 28)
        text(ctx, 'ACABOU O TEMPO!', VW / 2, VH / 2 - 5, { align: 'center', color: '#fbeedd', size: 9 })
      }
    }

    const SPEED = 9 // casas por segundo
    let raf, last = performance.now()
    function step(now) {
      const dt = Math.min(0.033, (now - last) / 1000); last = now
      g.t += dt; g.banner -= dt
      if (!g.over) g.time -= dt
      if (g.time <= 0 && !g.over) { g.over = true; draw(); setTimeout(() => onEnd({ score: g.score, seeds: g.seeds }), 900); return }
      // movimento: parado na casa → aceita direção; andando → corre até curva/encruzilhada
      if (!g.dir && g.want && open(g.px, g.py, g.want)) { g.dir = g.want; g.want = null }
      else if (!g.dir) g.want = g.want && open(g.px, g.py, g.want) ? g.want : null
      // virar pra trás no meio do túnel: vale na hora
      if (g.dir && g.want === BACK[g.dir]) {
        const [bx, by] = DIRS[g.dir]
        g.px += bx; g.py += by; g.dir = g.want; g.want = null
      }
      if (g.dir) {
        const [dx, dy] = DIRS[g.dir]
        if (dx) g.face = dx
        g.fx += dx * SPEED * dt; g.fy += dy * SPEED * dt
        const tx = g.px + dx, ty = g.py + dy
        if ((dx && (g.fx - tx) * dx >= 0) || (dy && (g.fy - ty) * dy >= 0)) {
          g.px = tx; g.py = ty; g.fx = tx; g.fy = ty
          const si = g.seedsAt.findIndex(s => s[0] === tx && s[1] === ty)
          if (si >= 0) { g.seedsAt.splice(si, 1); g.seeds++; g.score += 10 }
          if (tx === g.goal[0] && ty === g.goal[1]) {
            g.score += 100; g.time += 12; newLevel()
          } else {
            // no túnel (2 saídas) segue sozinho, inclusive nas curvas;
            // para no beco sem saída e nas encruzilhadas (a pessoa escolhe)
            if (g.want && g.want !== BACK[g.dir] && open(tx, ty, g.want)) { g.dir = g.want; g.want = null }
            else if (exits(tx, ty) === 2) g.dir = Object.keys(DIRS).find(d => d !== BACK[g.dir] && open(tx, ty, d))
            else g.dir = null
          }
        }
      }
      draw()
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', kd); area.removeEventListener('pointerdown', pd); area.removeEventListener('pointerup', pu)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const Btn = ({ d, label, cls }) => (
    <button onPointerDown={e => { e.stopPropagation(); input.current?.(d) }} className={`pixel-btn rounded-md bg-[#fbeedd] text-[#3b2314] text-xl w-14 h-14 flex items-center justify-center ${cls}`}>{label}</button>
  )
  return (
    <div className="absolute inset-0 flex flex-col landscape:flex-row items-center justify-center gap-2 touch-none select-none p-2">
      <div className="relative flex-1 min-h-0 min-w-0 w-full self-stretch">
        <canvas ref={ref} width={VW} height={VH} className="absolute inset-0 w-full h-full object-contain" style={{ imageRendering: 'pixelated' }} />
      </div>
      <div className="grid grid-cols-3 gap-1.5 shrink-0 pb-[env(safe-area-inset-bottom)]">
        <span /><Btn d="n" label="▲" /><span />
        <Btn d="w" label="◀" /><span /><Btn d="e" label="▶" />
        <span /><Btn d="s" label="▼" /><span />
      </div>
    </div>
  )
}
