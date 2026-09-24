// Gerador de imagem (slots 3 e 4 do guia de mídia) — Canvas2D puro, sem
// IA nenhuma: desenha a foto real (slot 01, já aprovada) + os dados reais
// do cadastro (largura/altura/profundidade, acessórios inclusos). Nunca
// inventa característica — se o dado não existe no produto, o gerador
// fica desabilitado (ver `canGenerateSlot`). Pedido do Raphael, 24/09.

const W = 1080
const H = 1350

const COLORS = {
  ink:    '#1e293b', // slate-800
  sub:    '#64748b', // slate-500
  faint:  '#cbd5e1', // slate-300
  line:   '#e2e8f0', // slate-200
  accent: '#f43f5e', // rose-500 — cor de marca do sistema
  accentBg: '#fff1f2', // rose-50
  amber:  '#f59e0b',
}

export function canGenerateSlot(slot, product, heroPhotoPath) {
  if (!heroPhotoPath) return false
  if (slot === 4) return !!(product?.width_cm && product?.height_cm)
  if (slot === 3) return !!(accessoryList(product).length)
  return false
}

function accessoryList(product) {
  if (product?.accessories_included?.trim()) {
    return product.accessories_included.split(',').map(s => s.trim()).filter(Boolean)
  }
  if (product?.includes_wheel) {
    return [`Rodinha${product.wheel_diameter_cm ? ` (${product.wheel_diameter_cm}cm de diâmetro)` : ''}`]
  }
  return []
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// Quebra texto em linhas que cabem em `maxWidth` (usa a fonte já setada em ctx)
function wrapText(ctx, text, maxWidth, maxLines = 2) {
  const words = text.split(' ')
  const lines = []
  let current = ''
  for (const word of words) {
    const test = current ? `${current} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current)
      current = word
      if (lines.length === maxLines - 1) break
    } else {
      current = test
    }
  }
  if (current) lines.push(current)
  // Se sobrou texto além do que coube, adiciona reticências na última linha
  const consumed = lines.join(' ').length
  if (consumed < text.length && lines.length >= maxLines) {
    let last = lines[lines.length - 1]
    while (ctx.measureText(last + '…').width > maxWidth && last.length > 1) {
      last = last.slice(0, -1)
    }
    lines[lines.length - 1] = last.trimEnd() + '…'
  }
  return lines.slice(0, maxLines)
}

// object-fit: contain — devolve o retângulo desenhado, centralizado na box
function containFit(imgW, imgH, boxX, boxY, boxW, boxH) {
  const scale = Math.min(boxW / imgW, boxH / imgH)
  const w = imgW * scale
  const h = imgH * scale
  return { x: boxX + (boxW - w) / 2, y: boxY + (boxH - h) / 2, w, h }
}

function drawHeader(ctx, kicker, productName) {
  // Selo "COISAPET · ..."
  ctx.font = '700 22px "Nunito Sans", sans-serif'
  const label = `COISAPET · ${kicker}`
  const labelW = ctx.measureText(label).width
  const pillW = labelW + 48
  const pillX = (W - pillW) / 2
  ctx.fillStyle = COLORS.accentBg
  roundRect(ctx, pillX, 56, pillW, 44, 22)
  ctx.fill()
  ctx.fillStyle = COLORS.accent
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, W / 2, 56 + 22)

  // Nome do produto, centralizado, até 2 linhas
  ctx.font = '800 44px Nunito, sans-serif'
  ctx.fillStyle = COLORS.ink
  const lines = wrapText(ctx, productName || '', W - 160, 2)
  let y = 168
  lines.forEach(line => {
    ctx.fillText(line, W / 2, y)
    y += 54
  })
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  return y + 16 // próximo Y livre
}

function drawFooter(ctx) {
  ctx.strokeStyle = COLORS.line
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(W / 2 - 60, H - 56)
  ctx.lineTo(W / 2 + 60, H - 56)
  ctx.stroke()
  ctx.font = '700 20px "Nunito Sans", sans-serif'
  ctx.fillStyle = COLORS.faint
  ctx.textAlign = 'center'
  ctx.fillText('coisapet.com.br', W / 2, H - 30)
  ctx.textAlign = 'left'
}

function drawMeasureLineH(ctx, x1, x2, y, label) {
  ctx.strokeStyle = COLORS.accent
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(x1, y); ctx.lineTo(x2, y)
  ctx.moveTo(x1, y - 10); ctx.lineTo(x1, y + 10)
  ctx.moveTo(x2, y - 10); ctx.lineTo(x2, y + 10)
  ctx.stroke()

  ctx.font = '800 26px Nunito, sans-serif'
  const textW = ctx.measureText(label).width
  const midX = (x1 + x2) / 2
  ctx.fillStyle = '#ffffff'
  roundRect(ctx, midX - textW / 2 - 16, y - 20, textW + 32, 40, 20)
  ctx.fill()
  ctx.strokeStyle = COLORS.accent
  ctx.lineWidth = 2
  roundRect(ctx, midX - textW / 2 - 16, y - 20, textW + 32, 40, 20)
  ctx.stroke()
  ctx.fillStyle = COLORS.ink
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, midX, y + 1)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}

function drawMeasureLineV(ctx, y1, y2, x, label) {
  ctx.strokeStyle = COLORS.accent
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(x, y1); ctx.lineTo(x, y2)
  ctx.moveTo(x - 10, y1); ctx.lineTo(x + 10, y1)
  ctx.moveTo(x - 10, y2); ctx.lineTo(x + 10, y2)
  ctx.stroke()

  ctx.save()
  const midY = (y1 + y2) / 2
  ctx.translate(x, midY)
  ctx.rotate(-Math.PI / 2)
  ctx.font = '800 26px Nunito, sans-serif'
  const textW = ctx.measureText(label).width
  ctx.fillStyle = '#ffffff'
  roundRect(ctx, -textW / 2 - 16, -20, textW + 32, 40, 20)
  ctx.fill()
  ctx.strokeStyle = COLORS.accent
  ctx.lineWidth = 2
  roundRect(ctx, -textW / 2 - 16, -20, textW + 32, 40, 20)
  ctx.stroke()
  ctx.fillStyle = COLORS.ink
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, 0, 1)
  ctx.restore()
}

function fmtCm(n) {
  const v = Number(n)
  return (Number.isInteger(v) ? v : v.toFixed(1)) + ' cm'
}

function drawDimensions(ctx, product, heroImg) {
  const nextY = drawHeader(ctx, 'DIMENSÕES REAIS', product.name)

  const boxX = 190, boxW = W - 190 * 2 - 40
  const boxY = nextY + 40, boxH = 660
  const img = containFit(heroImg.width, heroImg.height, boxX + 40, boxY, boxW - 40, boxH)

  ctx.save()
  roundRect(ctx, img.x - 4, img.y - 4, img.w + 8, img.h + 8, 16)
  ctx.clip()
  ctx.drawImage(heroImg, img.x, img.y, img.w, img.h)
  ctx.restore()

  if (product.width_cm) {
    drawMeasureLineH(ctx, img.x, img.x + img.w, img.y + img.h + 44, fmtCm(product.width_cm))
  }
  if (product.height_cm) {
    drawMeasureLineV(ctx, img.y, img.y + img.h, img.x - 44, fmtCm(product.height_cm))
  }

  if (product.depth_cm) {
    // Profundidade não dá pra mostrar com uma linha 2D fiel — vira um
    // selo informativo no canto, sempre com o número real do cadastro.
    const chipW = 260, chipH = 64
    const chipX = img.x + img.w - chipW, chipY = img.y - chipH - 24
    ctx.fillStyle = '#ffffff'
    roundRect(ctx, chipX, chipY, chipW, chipH, 16)
    ctx.fill()
    ctx.strokeStyle = COLORS.line
    ctx.lineWidth = 2
    roundRect(ctx, chipX, chipY, chipW, chipH, 16)
    ctx.stroke()
    ctx.font = '700 18px "Nunito Sans", sans-serif'
    ctx.fillStyle = COLORS.sub
    ctx.fillText('PROFUNDIDADE', chipX + 20, chipY + 26)
    ctx.font = '800 26px Nunito, sans-serif'
    ctx.fillStyle = COLORS.ink
    ctx.fillText(fmtCm(product.depth_cm), chipX + 20, chipY + 52)
  }

  drawFooter(ctx)
}

function drawAccessories(ctx, product, heroImg) {
  const nextY = drawHeader(ctx, 'O QUE ACOMPANHA', product.name)

  const boxX = 240, boxW = W - 240 * 2
  const boxY = nextY + 24, boxH = 480
  const img = containFit(heroImg.width, heroImg.height, boxX, boxY, boxW, boxH)
  ctx.save()
  roundRect(ctx, img.x - 4, img.y - 4, img.w + 8, img.h + 8, 16)
  ctx.clip()
  ctx.drawImage(heroImg, img.x, img.y, img.w, img.h)
  ctx.restore()

  const items = accessoryList(product)
  const listTop = boxY + boxH + 56
  const listBottom = H - 110
  const rowH = Math.min(112, (listBottom - listTop) / items.length)
  const rowGap = 14
  const rowInnerH = rowH - rowGap

  items.forEach((text, i) => {
    const y = listTop + i * rowH
    // Cartão da linha
    ctx.fillStyle = '#f8fafc'
    roundRect(ctx, 120, y, W - 240, rowInnerH, 18)
    ctx.fill()

    // Badge numerado
    const cx = 120 + 44, cy = y + rowInnerH / 2
    ctx.fillStyle = COLORS.accent
    ctx.beginPath()
    ctx.arc(cx, cy, 26, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = '800 24px Nunito, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(i + 1), cx, cy + 2)

    // Texto do item
    ctx.font = '700 28px "Nunito Sans", sans-serif'
    ctx.fillStyle = COLORS.ink
    ctx.textAlign = 'left'
    const lines = wrapText(ctx, text, W - 240 - 130, 1)
    ctx.fillText(lines[0] || text, 120 + 84, cy + 2)
    ctx.textBaseline = 'alphabetic'
  })

  drawFooter(ctx)
}

// Desenha o slot pedido no canvas (já deve estar com width=1080 height=1350).
// `heroImg` é um HTMLImageElement já carregado (ver GeneratedSlotImageModal).
export function drawSlotCanvas(canvas, { slot, product, heroImg }) {
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)

  if (slot === 4) drawDimensions(ctx, product, heroImg)
  else if (slot === 3) drawAccessories(ctx, product, heroImg)
}

export const SLOT_IMAGE_SIZE = { width: W, height: H }
