import { useEffect, useRef } from 'react'
import { FOODS, hamsterSprites, hearts, sprite, rand, text, toCanvas } from './common'

// 🌻 Chuva de Sementes (0.6) — o hamster anda embaixo e pega o que cai.
// Comida boa dá pontos; comida que faz mal (chocolate, uva, cebola, laranja)
// tira uma vida e mostra o porquê — ensina brincando. 3 vidas.
const VW = 120, VH = 160, FLOOR = 148
const GOOD = Object.keys(FOODS).filter(k => FOODS[k].good)
const BAD = Object.keys(FOODS).filter(k => !FOODS[k].good)
let SPR = null
const spr = () => SPR || (SPR = Object.fromEntries(Object.entries(FOODS).map(([k, f]) => [k, sprite(f.rows)])))

export const meta = {
  key: 'sementes', label: 'Chuva de Sementes', icon: '🌻', color: '#ffe2a8',
  how: 'Arraste o dedo (ou use ← →) pra mover o hamster. Pegue sementes, ração e verduras. Fuja de chocolate, uva, cebola e laranja: fazem mal pra ele!',
}

export default function Sementes({ pet, onEnd, paused }) {
  const ref = useRef(null)
  useEffect(() => {
    const canvas = ref.current, ctx = canvas.getContext('2d')
    const H = hamsterSprites(pet.species), F = spr(), HT = hearts()
    const g = { t: 0, x: VW / 2, target: VW / 2, dir: 1, items: [], next: 0.8, score: 0, seeds: 0, lives: 3, msg: null, msgT: 0, flash: 0, eat: 0, over: false, keys: {} }
    const area = canvas.parentElement
    const move = e => { if (e.buttons || e.pointerType === 'touch' || e.type === 'pointerdown') g.target = toCanvas(canvas, e, VW, VH).x }
    const kd = e => { if (['ArrowLeft', 'KeyA'].includes(e.code)) g.keys.l = true; if (['ArrowRight', 'KeyD'].includes(e.code)) g.keys.r = true }
    const ku = e => { if (['ArrowLeft', 'KeyA'].includes(e.code)) g.keys.l = false; if (['ArrowRight', 'KeyD'].includes(e.code)) g.keys.r = false }
    area.addEventListener('pointerdown', move); area.addEventListener('pointermove', move)
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku)

    function draw() {
      ctx.imageSmoothingEnabled = false
      // céu de quarto + terrário ao fundo
      ctx.fillStyle = '#d6e8dd'; ctx.fillRect(0, 0, VW, VH)
      ctx.fillStyle = '#c3d9cc'; for (let y = 8; y < FLOOR; y += 16) ctx.fillRect(0, y, VW, 1)
      ctx.fillStyle = '#e8cf9a'; ctx.fillRect(0, FLOOR, VW, VH - FLOOR)
      ctx.fillStyle = '#3b2314'; ctx.fillRect(0, FLOOR, VW, 1)
      ctx.fillStyle = '#c9a76a'; for (let x = 2; x < VW; x += 11) ctx.fillRect(x, FLOOR + 4 + (x % 3) * 2, 4, 1)
      for (const it of g.items) ctx.drawImage(F[it.kind], Math.round(it.x - 4), Math.round(it.y - 4))
      const left = g.dir < 0
      const frame = g.eat > 0 ? H.eat : (Math.abs(g.target - g.x) > 1 ? (Math.floor(g.t * 10) % 2 ? (left ? H.walkL : H.walk) : (left ? H.idleL : H.idle)) : (left ? H.idleL : H.idle))
      ctx.drawImage(frame, Math.round(g.x - 8), FLOOR - 12)
      if (g.flash > 0) { ctx.fillStyle = `rgba(231,76,60,${g.flash * 0.6})`; ctx.fillRect(0, 0, VW, VH) }
      // placar
      text(ctx, String(g.score), VW - 4, 4, { align: 'right' })
      for (let i = 0; i < 3; i++) ctx.drawImage(i < g.lives ? HT.on : HT.off, 4 + i * 9, 4)
      if (g.msg && g.msgT > 0) {
        ctx.fillStyle = 'rgba(251,238,221,0.95)'; ctx.fillRect(4, 18, VW - 8, 22)
        ctx.strokeStyle = '#3b2314'; ctx.lineWidth = 1; ctx.strokeRect(4.5, 18.5, VW - 9, 21)
        const words = g.msg.split(' '); let line = '', y = 22
        ctx.font = '5px "Press Start 2P", monospace'
        for (const w of words) {
          if (ctx.measureText(line + w).width > VW - 14) { text(ctx, line.trim(), VW / 2, y, { size: 5, align: 'center' }); line = ''; y += 7 }
          line += w + ' '
        }
        text(ctx, line.trim(), VW / 2, y, { size: 5, align: 'center' })
      }
    }

    let raf, last = performance.now()
    function step(now) {
      const dt = Math.min(0.033, (now - last) / 1000); last = now
      if (paused.current) { raf = requestAnimationFrame(step); return }
      g.t += dt
      if (g.keys.l) g.target = g.x - 40
      if (g.keys.r) g.target = g.x + 40
      g.target = Math.max(8, Math.min(VW - 8, g.target))
      const d = g.target - g.x
      if (Math.abs(d) > 0.5) { g.dir = Math.sign(d); g.x += Math.sign(d) * Math.min(Math.abs(d), 110 * dt) }
      // dificuldade sobe com o tempo
      const level = Math.min(1, g.t / 70)
      g.next -= dt
      if (g.next <= 0) {
        const bad = Math.random() < 0.28 + level * 0.14
        const pool = bad ? BAD : (Math.random() < 0.55 ? ['girassol'] : GOOD)
        g.items.push({ kind: pool[Math.floor(Math.random() * pool.length)], x: rand(8, VW - 8), y: -6, v: rand(32, 46) + level * 50 })
        g.next = rand(0.75, 1.05) - level * 0.45
      }
      for (const it of g.items) it.y += it.v * dt
      for (const it of g.items) {
        if (it.y > FLOOR - 14 && it.y < FLOOR + 2 && Math.abs(it.x - g.x) < 10) {
          it.done = true
          const f = FOODS[it.kind]
          if (f.good) { g.score += f.pts; if (it.kind === 'girassol') g.seeds++; g.eat = 0.25 }
          else { g.lives--; g.flash = 1; g.msg = f.why; g.msgT = 2.2; if (navigator.vibrate) navigator.vibrate(80) }
        }
      }
      g.items = g.items.filter(it => !it.done && it.y < VH + 8)
      g.eat -= dt; g.flash = Math.max(0, g.flash - dt * 3); g.msgT -= dt
      draw()
      if (g.lives <= 0) { setTimeout(() => onEnd({ score: g.score, seeds: g.seeds }), 900); return }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(raf)
      area.removeEventListener('pointerdown', move); area.removeEventListener('pointermove', move)
      window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="absolute inset-0 flex items-center justify-center touch-none select-none">
      <canvas ref={ref} width={VW} height={VH} className="w-full h-full object-contain" style={{ imageRendering: 'pixelated' }} />
    </div>
  )
}
