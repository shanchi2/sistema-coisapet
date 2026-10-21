import { useEffect, useRef } from 'react'
import { hamsterSprites, text } from './common'

// 🎡 Rodinha Turbo (0.6) — jogo de ritmo: a setinha vai e volta na barra;
// toque quando ela estiver na faixa verde pra dar impulso na roda. Errou o
// tempo, o hamster tropeça e perde velocidade. 30 s; pontos = metros rodados.
const VW = 160, VH = 176, DUR = 30, CX = 80, CY = 74, R = 52

export const meta = {
  key: 'rodinha', label: 'Rodinha Turbo', icon: '🎡', color: '#ffc2cf',
  how: 'Toque na tela (ou espaço) quando a setinha estiver na faixa verde: o hamster acelera! Errou o tempo, ele tropeça. Você tem 30 segundos.',
}

export default function Rodinha({ pet, onEnd, paused }) {
  const ref = useRef(null)
  useEffect(() => {
    const canvas = ref.current, ctx = canvas.getContext('2d')
    const H = hamsterSprites(pet.species)
    const g = { t: 0, speed: 0, dist: 0, ang: 0, cur: 0, cdir: 1, combo: 0, best: 0, msg: null, msgT: 0, stumble: 0, over: false }
    const zone = () => { const w = Math.max(0.1, 0.24 - g.combo * 0.012); return [0.5 - w / 2, 0.5 + w / 2] }
    const tap = () => {
      if (g.over) return
      const [a, b] = zone()
      if (g.cur >= a && g.cur <= b) {
        const perfect = Math.abs(g.cur - 0.5) < (b - a) * 0.18
        g.speed = Math.min(14, g.speed + (perfect ? 2.2 : 1.5)); g.combo++; g.best = Math.max(g.best, g.combo)
        g.msg = perfect ? 'PERFEITO!' : g.combo >= 5 ? `COMBO x${g.combo}` : 'BOA!'; g.msgT = 0.6
      } else {
        g.speed *= 0.55; g.combo = 0; g.stumble = 0.35; g.msg = 'OPA!'; g.msgT = 0.6
        if (navigator.vibrate) navigator.vibrate(40)
      }
    }
    const area = canvas.parentElement
    const pd = e => { e.preventDefault(); tap() }
    const kd = e => { if (e.code === 'Space' && !e.repeat) { e.preventDefault(); tap() } }
    area.addEventListener('pointerdown', pd); window.addEventListener('keydown', kd)

    function draw() {
      ctx.imageSmoothingEnabled = false
      ctx.fillStyle = '#d6e8dd'; ctx.fillRect(0, 0, VW, VH)
      ctx.fillStyle = '#e8cf9a'; ctx.fillRect(0, CY + R + 6, VW, VH)
      ctx.fillStyle = '#3b2314'; ctx.fillRect(0, CY + R + 6, VW, 1)
      // suporte
      ctx.fillStyle = '#9aa3ad'; ctx.fillRect(CX - 3, CY, 6, R + 6); ctx.fillRect(CX - 22, CY + R + 3, 44, 4)
      // roda (madeira CoisaPet) com raios girando
      ctx.lineWidth = 6; ctx.strokeStyle = '#3b2314'; ctx.beginPath(); ctx.arc(CX, CY, R, 0, Math.PI * 2); ctx.stroke()
      ctx.lineWidth = 4; ctx.strokeStyle = '#c8955a'; ctx.beginPath(); ctx.arc(CX, CY, R, 0, Math.PI * 2); ctx.stroke()
      ctx.fillStyle = '#e2b47c'; ctx.beginPath(); ctx.arc(CX, CY, R - 4, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = '#9a6a3a'; ctx.lineWidth = 2
      for (let i = 0; i < 8; i++) {
        const a = g.ang + i * Math.PI / 4
        ctx.beginPath(); ctx.moveTo(CX, CY); ctx.lineTo(CX + Math.cos(a) * (R - 5), CY + Math.sin(a) * (R - 5)); ctx.stroke()
      }
      ctx.fillStyle = '#3b2314'; ctx.fillRect(CX - 3, CY - 3, 6, 6)
      // hamster correndo dentro (2x)
      const fast = g.speed > 0.3
      const frame = g.stumble > 0 ? H.sad : fast && Math.floor(g.t * (4 + g.speed * 1.5)) % 2 ? H.walk : H.idle
      ctx.drawImage(frame, CX - 16, CY + R - 30, 32, 24)
      // barra de ritmo
      const bx = 14, by = 150, bw = VW - 28, bh = 10
      const [za, zb] = zone()
      ctx.fillStyle = '#3b2314'; ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4)
      ctx.fillStyle = '#fbeedd'; ctx.fillRect(bx, by, bw, bh)
      ctx.fillStyle = '#2ecc71'; ctx.fillRect(bx + za * bw, by, (zb - za) * bw, bh)
      ctx.fillStyle = '#27ae60'; ctx.fillRect(bx + bw / 2 - 1, by, 2, bh)
      const cx = bx + g.cur * bw
      ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.moveTo(cx, by + bh + 1); ctx.lineTo(cx - 4, by + bh + 7); ctx.lineTo(cx + 4, by + bh + 7); ctx.fill()
      ctx.fillRect(cx - 1, by - 1, 2, bh + 2)
      // placar
      text(ctx, `${Math.floor(g.dist)}m`, 4, 4)
      text(ctx, `${Math.max(0, Math.ceil(DUR - g.t))}s`, VW - 4, 4, { align: 'right', color: DUR - g.t < 6 ? '#e74c3c' : '#3b2314' })
      text(ctx, `${g.speed.toFixed(1)} m/s`, 4, 14, { size: 6, color: '#6b4a32' })
      if (g.msgT > 0) text(ctx, g.msg, CX, 20, { align: 'center', size: 10, color: g.msg === 'OPA!' ? '#e74c3c' : '#27ae60' })
      if (g.over) {
        ctx.fillStyle = 'rgba(43,29,20,0.8)'; ctx.fillRect(0, CY - 12, VW, 24)
        text(ctx, 'TEMPO!', CX, CY - 5, { align: 'center', size: 10, color: '#ffd36b' })
      }
    }

    let raf, last = performance.now()
    function step(now) {
      const dt = Math.min(0.033, (now - last) / 1000); last = now
      if (paused.current) { raf = requestAnimationFrame(step); return }
      g.t += dt; g.msgT -= dt; g.stumble -= dt
      // setinha vai e volta, mais rápida com o combo
      g.cur += g.cdir * dt * (0.9 + Math.min(g.combo, 12) * 0.07)
      if (g.cur > 1) { g.cur = 1; g.cdir = -1 } else if (g.cur < 0) { g.cur = 0; g.cdir = 1 }
      g.speed = Math.max(0, g.speed - 0.9 * dt)
      g.dist += g.speed * dt
      g.ang += g.speed * dt / (R / 20)
      if (g.t >= DUR && !g.over) {
        g.over = true; draw()
        const score = Math.floor(g.dist)
        setTimeout(() => onEnd({ score, seeds: Math.floor(score / 50) }), 900)
        return
      }
      draw()
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => { cancelAnimationFrame(raf); area.removeEventListener('pointerdown', pd); window.removeEventListener('keydown', kd) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="absolute inset-0 flex items-center justify-center touch-none select-none">
      <canvas ref={ref} width={VW} height={VH} className="w-full h-full object-contain" style={{ imageRendering: 'pixelated' }} />
    </div>
  )
}
