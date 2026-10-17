// "8 bits não tão 8 bits" (17/10, pedido do Raphael): a tela do jogo passou
// a ter 4x mais resolução (câmera com zoom 4) — tudo que já existia continua
// igual (cada pixel do mundo = 4x4), mas estas cenas especiais são desenhadas
// com traço vetorial em 4x, pra dar pra ler detalhe pequeno (óculos, listras
// da cadeira, toalha). Coordenadas aqui = pixels do MUNDO; o ctx já vem
// escalado. `pal` = pelagem da espécie (art.js → COATS).

function ellipse(ctx, x, y, rx, ry, rot, fill, stroke, lw = 0.7) {
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2)
  if (fill) { ctx.fillStyle = fill; ctx.fill() }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke() }
}
function line(ctx, pts, color, lw = 1, cap = 'round') {
  ctx.beginPath()
  ctx.moveTo(pts[0][0], pts[0][1])
  for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y)
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = cap; ctx.lineJoin = 'round'
  ctx.stroke()
}
function roundRect(ctx, x, y, w, h, r, fill, stroke, lw = 0.6) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  if (fill) { ctx.fillStyle = fill; ctx.fill() }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke() }
}

// Lona listrada seguindo um caminho (assento + encosto)
function stripedPath(ctx, pts, width, colors, step = 2) {
  let k = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1]
    const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.round(len / step))
    for (let j = 0; j < n; j++) {
      const a = j / n, b = (j + 1) / n
      line(ctx, [[x0 + (x1 - x0) * a, y0 + (y1 - y0) * a], [x0 + (x1 - x0) * b, y0 + (y1 - y0) * b]], colors[k++ % colors.length], width, 'butt')
    }
  }
}

// ─── Cadeira de praia + hamster de óculos escuros (36 x 24) ─────────
export const CHILL_SIZE = [36, 24]
export function drawChill(ctx, pal) {
  const wood = '#8a5a32', woodD = '#5e3a1c'
  // Pés de madeira (em X na frente, um atrás)
  line(ctx, [[7, 15.6], [11.5, 23.6]], woodD, 1.3); line(ctx, [[11.5, 15.6], [7, 23.6]], wood, 1.3)
  line(ctx, [[25.5, 16.2], [30, 23.6]], wood, 1.3)
  // Armação
  line(ctx, [[4.5, 15.2], [25.5, 16.2], [32.5, 4.2]], woodD, 1.1)
  // Lona listrada (vermelho e branco), com sombrinha embaixo
  const seat = [[4, 13.6], [25, 14.6], [32, 3]]
  line(ctx, seat.map(([x, y]) => [x, y + 1.6]), 'rgba(0,0,0,0.18)', 2.4)
  stripedPath(ctx, seat, 2.8, ['#e74c3c', '#ffffff'], 2.2)

  const o = pal.o
  // Rabinho e pezinhos (na ponta do assento)
  ellipse(ctx, 7.6, 11.6, 1.6, 1, 0.3, pal.p, o, 0.5)
  ellipse(ctx, 8.6, 9.6, 1.5, 0.95, -0.2, pal.p, o, 0.5)
  // Corpo deitado de barriga pra cima, encostado no encosto
  ellipse(ctx, 17, 10.6, 8.8, 4.4, -0.22, pal.b, o, 0.8)
  ellipse(ctx, 13, 12, 4.2, 1.8, -0.22, pal.d)                       // mancha das costas
  ellipse(ctx, 16.8, 8.7, 6.6, 2.3, -0.22, pal.l)                    // barriguinha clara
  // Patinhas da frente em cima da barriga
  ellipse(ctx, 19.6, 7.6, 1.1, 0.8, 0, pal.p, o, 0.4)
  ellipse(ctx, 21.6, 7.1, 1.1, 0.8, 0, pal.p, o, 0.4)
  // Cabeça
  ellipse(ctx, 24.4, 2.4, 1.8, 2.2, -0.3, pal.b, o, 0.6)              // orelha
  ellipse(ctx, 24.5, 2.6, 0.9, 1.2, -0.3, pal.p)
  ellipse(ctx, 26.6, 6.4, 4.7, 4.3, 0, pal.b, o, 0.8)
  ellipse(ctx, 28, 8.1, 2.4, 1.7, 0, pal.l)                          // bochecha
  ellipse(ctx, 31, 6.8, 0.85, 0.75, 0, pal.p)                        // focinho
  line(ctx, [[29.4, 8.6], [30.2, 9.1], [31, 8.7]], o, 0.45)          // sorrisinho
  line(ctx, [[31.2, 7.3], [33.6, 6.6]], 'rgba(255,255,255,0.8)', 0.3) // bigodes
  line(ctx, [[31.2, 7.6], [33.6, 7.9]], 'rgba(255,255,255,0.8)', 0.3)
  // Óculos escuros (com hastezinha e brilho na lente) 😎
  line(ctx, [[26.2, 5.3], [23.6, 4.6]], '#111', 0.6)
  roundRect(ctx, 26.1, 4.1, 4.6, 2.7, 1.1, '#151515', '#000', 0.4)
  line(ctx, [[27.1, 4.9], [28.3, 4.6]], '#ffffff', 0.5)
  line(ctx, [[29.2, 5.9], [29.8, 5.6]], 'rgba(255,255,255,0.7)', 0.35)
}

// ─── Guarda-sol listrado (28 x 36) ──────────────────────────────────
export const UMBRELLA_SIZE = [28, 36]
export function drawUmbrella(ctx) {
  line(ctx, [[14, 7], [14, 35.5]], '#6b6b6b', 1.4)
  line(ctx, [[14, 7], [14, 35.5]], '#e9e9e9', 0.8)
  const cx = 14, cy = 9.5, rx = 13, ry = 7.5, seg = 6
  for (let i = 0; i < seg; i++) {
    const a0 = Math.PI + (i / seg) * Math.PI, a1 = Math.PI + ((i + 1) / seg) * Math.PI
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.ellipse(cx, cy, rx, ry, 0, a0, a1)
    ctx.closePath()
    ctx.fillStyle = i % 2 ? '#ffffff' : '#e74c3c'; ctx.fill()
    ctx.strokeStyle = '#7a2a20'; ctx.lineWidth = 0.4; ctx.stroke()
  }
  // Barrinha ondulada embaixo
  for (let i = 0; i < seg; i++) {
    const x0 = cx - rx + (i * 2 * rx) / seg, w = (2 * rx) / seg
    ctx.beginPath(); ctx.ellipse(x0 + w / 2, cy, w / 2, 1.2, 0, 0, Math.PI)
    ctx.fillStyle = i % 2 ? '#ffffff' : '#e74c3c'; ctx.fill()
  }
  ellipse(ctx, 14, 1.8, 1, 1, 0, '#c0392b')
}

// ─── Suquinho com canudo e guarda-chuvinha (8 x 12) ─────────────────
export const DRINK_SIZE = [8, 12]
export function drawDrink(ctx) {
  line(ctx, [[4.2, 6], [6.6, 0.8]], '#ff7eb6', 0.6)                 // canudo
  ctx.beginPath(); ctx.moveTo(1, 4); ctx.lineTo(6.4, 4); ctx.lineTo(5.6, 11.6); ctx.lineTo(1.8, 11.6); ctx.closePath()
  ctx.fillStyle = 'rgba(220,240,255,0.55)'; ctx.fill()
  ctx.beginPath(); ctx.moveTo(1.3, 6); ctx.lineTo(6.1, 6); ctx.lineTo(5.6, 11.6); ctx.lineTo(1.8, 11.6); ctx.closePath()
  ctx.fillStyle = '#ffa630'; ctx.fill()
  ctx.strokeStyle = '#5b7a8c'; ctx.lineWidth = 0.4
  ctx.beginPath(); ctx.moveTo(1, 4); ctx.lineTo(1.8, 11.6); ctx.lineTo(5.6, 11.6); ctx.lineTo(6.4, 4); ctx.stroke()
  ellipse(ctx, 6.2, 4.4, 1.1, 1.1, 0, '#f1c40f')                     // rodela de laranja
  ctx.beginPath(); ctx.moveTo(0.6, 3); ctx.quadraticCurveTo(2.4, 0.6, 4.2, 3); ctx.closePath()
  ctx.fillStyle = '#2ecc71'; ctx.fill()                              // guarda-chuvinha
  line(ctx, [[2.4, 2.2], [3, 6]], '#8a5a32', 0.35)
}

// ─── Enrolado na toalha, com turbante (20 x 16) ─────────────────────
export const TOWEL_SIZE = [20, 16]
export function drawTowel(ctx, pal) {
  const o = pal.o, towel = '#8fd0f2', towelD = '#5aa9d6'
  // pezinhos
  ellipse(ctx, 5.5, 15.2, 1.6, 0.8, 0, pal.p, o, 0.4)
  ellipse(ctx, 11, 15.2, 1.6, 0.8, 0, pal.p, o, 0.4)
  // corpo enrolado na toalha (listras brancas)
  ctx.save()
  roundRect(ctx, 1.5, 6, 13, 9.2, 3.4, towel, null)
  ctx.clip()
  for (let x = 3; x < 15; x += 3.2) line(ctx, [[x, 5], [x - 1.2, 16]], '#ffffff', 0.9)
  line(ctx, [[2, 8.5], [14, 11]], towelD, 0.7)                       // dobra da toalha
  ctx.restore()
  roundRect(ctx, 1.5, 6, 13, 9.2, 3.4, null, towelD, 0.6)
  // cabeça
  ellipse(ctx, 15, 8, 4.4, 4, 0, pal.b, o, 0.7)
  ellipse(ctx, 16.2, 9.6, 2.2, 1.5, 0, pal.l)
  ellipse(ctx, 16.6, 7.2, 0.8, 0.8, 0, '#111')                       // olhinho
  ellipse(ctx, 16.85, 6.95, 0.28, 0.28, 0, '#fff')
  ellipse(ctx, 19.2, 8.4, 0.75, 0.65, 0, pal.p)                      // focinho
  // turbante de toalha na cabeça
  ellipse(ctx, 14.4, 4.4, 4.6, 2.5, -0.1, towel, towelD, 0.5)
  line(ctx, [[11, 4.8], [17.6, 3.4]], '#ffffff', 0.7)
  ellipse(ctx, 10.6, 3.2, 1.5, 1.2, 0.4, towel, towelD, 0.5)          // pontinha torcida
}
