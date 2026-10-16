import Phaser from 'phaser'
import { HAMSTER_FRAMES, BOWL_FULL, BOWL_EMPTY, BOTTLE, POOP, paletteFor, spriteCanvas } from './art'

// Mundo em "pixels de jogo" (o Phaser amplia mantendo o pixel nítido)
// 16/10: mundo ampliado de 144x108 pra 200x150 (mesmo 4:3) — os itens mantêm
// o tamanho em pixels, então ficam proporcionalmente menores e o terrário
// ganha espaço livre pra receber mais produtos. Tudo abaixo deriva de W/H.
export const W = 200
export const H = 150
const X_MIN = 16, X_MAX = W - 16
const TABLE = H - 30                                   // tampo da mesa
// Moldura frontal do terrário (e a janela/vão do acrílico dentro dela)
const FX = 2, FY = 40, FW = W - 4, FH = H - 3 - FY
const WIN = { L: FX + 7, R: FX + FW - 8, T: FY + 8, B: FY + FH - 9 }

const HEART = ['.r.r.', 'rRrRr', 'rRRRr', '.rRr.', '..r..']
const ZZZ = ['kkk', '..k', '.k.', 'kkk']
const DROP = ['.c.', 'cCc', '.c.']

// Madeira "amadeirado" dos produtos CoisaPet
const WHEEL_R = 18 // raio da roda (hamster tem 16 px de comprimento)
const WOOD = 0xc8955a, WOOD_D = 0x9a6a3a, WOOD_L = 0xe2b47c, INK = 0x3b2314

// Ponte React ⇄ Phaser
export const bridge = new Phaser.Events.EventEmitter()

export class CageScene extends Phaser.Scene {
  constructor() { super('cage') }

  init(data) {
    this.species = data.species
    this.state = data.state   // { asleep, statusKey, fome, sede, poops, night }
    this.setup = data.setup   // { habitat, substrato, roda, toca }
    const ter = this.setup.habitat === 'terrario'
    // Com substrato fundo o "chão" sobe (ele anda em cima da camada)
    this.floorY = ter && this.setup.substrato ? WIN.B - 12 : WIN.B - 3
    // Posições: toca no canto esquerdo, depois o potinho; bebedouro no canto
    // direito e a roda ao lado dele. O meio fica livre pra itens novos.
    const bottle = this.setup.bebedouro ? WIN.R - 10 : WIN.R - 7
    this.L = {
      toca: this.setup.toca ? 28 : null,
      bowl: this.setup.toca ? 58 : 30,
      wheel: this.setup.roda ? bottle - (this.setup.bebedouro ? 46 : 40) : null,
      bottle,
    }
    // Ponta do bico (onde a gotinha sai) e onde ele para pra beber: virado pra
    // direita, com o focinho (7 px à frente do centro) encostado no bico
    this.spout = this.setup.bebedouro
      ? { x: this.L.bottle - 8, y: this.floorY - 7 }
      : { x: this.L.bottle, y: this.floorY - 29 + 16 }
    this.drinkX = this.spout.x - 8
  }

  create() {
    this.makeTextures()
    this.drawRoom()
    const ter = this.setup.habitat === 'terrario'
    if (ter) this.drawTerrariumBack(); else this.drawCageBack()
    if (this.setup.roda) this.drawWheel()
    if (this.setup.toca) this.drawToca()

    const fy = this.floorY
    this.bowl = this.add.image(this.L.bowl, fy - 1, 'bowl_full').setOrigin(0.5, 1).setDepth(3)
    if (this.setup.bebedouro) {
      // Bebedouro CoisaPet com suporte, em pé no chão
      this.bottle = this.add.image(this.L.bottle, fy + 1, 'bebedouro').setOrigin(0.5, 1).setDepth(3)
      const left = this.L.bottle - 9, top = fy + 1 - 36
      this.waterBox = { x: left + 5, bottom: top + 22, w: 4, max: 20 } // miolo do tubo
    } else {
      this.bottleY = fy - 29
      this.bottle = this.add.image(this.L.bottle, this.bottleY, 'bottle').setOrigin(0.5, 0).setDepth(3)
      this.waterBox = { x: this.L.bottle, bottom: this.bottleY + 11, w: 2, max: 10 }
    }
    this.water = this.add.rectangle(this.waterBox.x, 0, 2, 0, 0x5dade2, this.setup.bebedouro ? 0.85 : 1).setOrigin(0.5, 1).setDepth(3)

    this.poops = []
    this.hamster = this.add.sprite(Math.round(W / 2), fy, 'h_idle').setOrigin(0.5, 1).setDepth(4).setInteractive({ useHandCursor: true })
    this.hamster.on('pointerdown', () => bridge.emit('tap-pet'))
    this.facing = 1
    this.mode = 'idle'
    this.modeUntil = 0
    this.targetX = null

    if (ter) this.drawTerrariumFront(); else this.drawCageFront()
    if (this.setup.toca) this.tocaFront = this.drawTocaFront()

    this.zzz = this.add.image(0, 0, 'zzz').setOrigin(0, 1).setVisible(false).setDepth(30)
    this.night = this.add.rectangle(0, 0, W, H, 0x101a40, 0).setOrigin(0).setDepth(50)

    this.applyState(this.state)
    bridge.on('state', this.applyState, this)
    bridge.on('anim', this.playAnim, this)
    // Desliga a escuta quando a cena para OU quando o jogo inteiro é destruído
    // (no "Recomeçar" o jogo é destruído — só 'shutdown' não bastava e a cena
    // morta continuava recebendo estado → "Cannot read properties of undefined")
    const unbind = () => { this.dead = true; bridge.off('state', this.applyState, this); bridge.off('anim', this.playAnim, this) }
    this.events.once('shutdown', unbind)
    this.events.once('destroy', unbind)
  }

  makeTextures() {
    const pal = paletteFor(this.species)
    const add = (key, rows, p = {}, flip = false) => {
      if (this.textures.exists(key)) this.textures.remove(key)
      this.textures.addCanvas(key, spriteCanvas(rows, p, flip))
    }
    for (const [k, rows] of Object.entries(HAMSTER_FRAMES)) {
      add(`h_${k}`, rows, pal)
      add(`h_${k}_l`, rows, pal, true)
    }
    add('bowl_full', BOWL_FULL); add('bowl_empty', BOWL_EMPTY)
    add('bottle', BOTTLE); add('poop', POOP)
    add('heart', HEART); add('zzz', ZZZ); add('drop', DROP)
    // Roda Silenciosa CoisaPet (fiel ao produto real): disco de trás FECHADO
    // (sem raios — a patinha não prende), aro de madeira com a fileira de
    // recortes, pista de cortiça por dentro e miolo com o logo. Desenhada
    // pixel a pixel (nítida); o giro aparece nos recortes do aro andando.
    // Grande de propósito (mais que o dobro do hamster): roda pequena faz o
    // hamster correr com a coluna curvada — mensagem que a CoisaPet sempre passa.
    const R = WHEEL_R, C = R + 1, S = C * 2 + 1
    const SLOTS = 14
    for (let f = 0; f < 3; f++) {
      const key = `wheel_${f}`
      if (this.textures.exists(key)) this.textures.remove(key)
      const cv = document.createElement('canvas'); cv.width = S; cv.height = S
      const ctx = cv.getContext('2d')
      const px = (x, y, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1) }
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const dx = x - C, dy = y - C, d = Math.hypot(dx, dy)
        if (d > R + 0.5) continue
        const ang = (Math.atan2(dy, dx) / (Math.PI * 2) + 1) % 1
        if (d > R - 0.5) px(x, y, '#5a3418')                        // contorno
        else if (d > R - 3.5) {                                       // aro com a fileira de recortes
          const slot = ((ang * SLOTS + f / 3) % 1) < 0.22 && d > R - 2.5 && d < R - 1.2
          px(x, y, slot ? '#3b2314' : d > R - 1.5 ? '#d9a26a' : '#c58c55')
        } else if (d > R - 4.5) px(x, y, '#6e4122')                   // sombra entre aro e cortiça
        else if (d > R - 6.5) {                                       // pista de cortiça
          px(x, y, (x * 7 + y * 13) % 11 === 0 ? '#b98a57' : '#d3a774')
        } else if (d < 3.6) {                                         // miolo com o logo
          px(x, y, Math.abs(dx) < 1 && Math.abs(dy) < 1 ? '#2a1a0d' : d > 2.6 ? '#8a5228' : '#c98a52')
        } else {                                                      // disco de trás (madeira avermelhada)
          px(x, y, (x * 3 + Math.floor(y / 4)) % 9 === 0 ? '#a8622f' : '#b8723c')
        }
      }
      this.textures.addCanvas(key, cv)
    }
    this.makeTocaTexture()
    this.makeBebedouroTexture()
    this.makeTerrariumFrameTexture()
  }

  // Desenho pixel a pixel num canvas novo
  pixelCanvas(key, w, h, paint) {
    if (this.textures.exists(key)) this.textures.remove(key)
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h
    const ctx = cv.getContext('2d')
    paint((x, y, c) => { if (c) { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1) } })
    this.textures.addCanvas(key, cv)
  }

  makeTocaTexture() {
    const W2 = 28, H2 = 26, cx = 13.5, roofH = 11, hx = 13.5, hy = 15, hr = 4.6
    this.pixelCanvas('toca', W2, H2, px => {
      for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
        const dHole = Math.hypot(x - hx, y - hy)
        if (y >= 24) { px(x, y, y === 25 ? '#3b2314' : '#9a6436'); continue }      // base
        if (y < roofH) {                                                           // telhado (frente do "A")
          const half = (y / roofH) * (W2 / 2) + 0.5
          const dx = Math.abs(x - cx)
          if (dx > half + 0.5) continue
          if (dx > half - 0.8) px(x, y, '#3b2314')
          else if (dx > half - 2.6) px(x, y, '#b07a46')
          else px(x, y, (x + y * 3) % 7 === 0 ? '#c99462' : '#d6a26f')
          continue
        }
        if (x < 2 || x > 25) continue                                              // paredes
        if (x === 2 || x === 25) { px(x, y, '#3b2314'); continue }
        if (dHole < hr) continue                                                   // porta vazada
        if (dHole < hr + 1) { px(x, y, '#7a4a24'); continue }                      // borda da porta
        if (Math.abs(dHole - (hr + 2.2)) < 0.45) { px(x, y, '#b57d49'); continue } // anel gravado
        px(x, y, (y % 4 === 1 && (x * 5 + y) % 9 > 2) ? '#c99462' : '#d6a26f')
      }
      px(21, 21, '#8a5a32'); px(22, 21, '#8a5a32'); px(21, 22, '#8a5a32')       // logo
    })
  }

  makeBebedouroTexture() {
    // 18 x 36: tubo transparente com topo redondo, tampa amarela, bico de metal,
    // painel de madeira com fendas e base com recorte (como o produto real)
    const T = { o: '#3b2314', w: '#a8683a', W: '#c07c46', g: '#9aa6b2', c: '#e8f3fa', y: '#f2c200', Y: '#c99a00', m: '#c8d0d8', M: '#8e98a3' }
    const rows = [
      '...gggg...........',
      '..gccccg..........',
      '..gccccg...ooooo..',
      '..gccccg...owWWo..',
      '.oowwwwwwwwwwWWo..',
      '.ooooooooooowWWo..',
      '..gccccg...owWWo..',
      '..gccccg...owoWo..',
      '..gccccg...owoWo..',
      '..gccccg...owoWo..',
      '..gccccg...owoWo..',
      '..gccccg...owoWo..',
      '..gccccg...owoWo..',
      '..gccccg...owWWo..',
      '..gccccg...owWWo..',
      '..gccccg...owWWo..',
      '..gccccg...owoWo..',
      '..gccccg...owoWo..',
      '..gccccg...owoWo..',
      '..gccccg...owoWo..',
      '..gccccg...owoWo..',
      '..gccccg...owWWo..',
      '.yyyyyyyy..owWWo..',
      '.YyyyyyyY..owWWo..',
      'oowwwwwwwwwwwWWo..',
      'oooooooooooowWWo..',
      '...mM......owWWo..',
      '..mM......owWWWo..',
      '.mM......owWWWWo..',
      '........owWWWWWo..',
      '.......owWWWWWWo..',
      '......owWWWWWWWo..',
      '.oooooowWWWWWWWoo.',
      'owwwwwwwwwwwwwwwwo',
      'owWWWWoooooooWWWWo',
      'oooooooooooooooooo',
    ]
    this.pixelCanvas('bebedouro', 18, 36, px => rows.forEach((r, y) => [...r].forEach((ch, x) => px(x, y, T[ch]))))
  }

  drawRoom() {
    const g = this.add.graphics()
    // Parede com papel listrado
    g.fillStyle(0xf6e7cf).fillRect(0, 0, W, TABLE)
    g.fillStyle(0xefd9b6)
    for (let x = 0; x < W; x += 8) g.fillRect(x, 0, 4, TABLE)
    // Janela: céu de dia (azul com nuvem) e de noite (escuro, lua e estrelas)
    const wx = W - 62, wy = 4, ww = 48, wh = 26, sx = wx + 2, sy = wy + 2, sw = ww - 4, sh = wh - 4
    g.fillStyle(0x8a5a32).fillRect(wx, wy, ww, wh)
    g.fillStyle(0xbfe3f5).fillRect(sx, sy, sw, sh)
    g.fillStyle(0xffffff).fillRect(sx + 3, sy + 4, 8, 2).fillRect(sx + 5, sy + 3, 4, 1).fillRect(sx + 28, sy + 14, 7, 2).fillRect(sx + 29, sy + 13, 4, 1)
    const n = this.add.graphics()
    n.fillStyle(0x1b2550).fillRect(sx, sy, sw, sh)
    n.fillStyle(0xf5f0c8).fillRect(sx + sw - 9, sy + 3, 5, 5).fillStyle(0x1b2550).fillRect(sx + sw - 7, sy + 3, 3, 3) // lua
    n.fillStyle(0xffffff)
    for (const [x, y] of [[3, 3], [8, 12], [14, 4], [4, 18], [27, 5], [30, 16], [40, 14], [18, 15], [35, 10]]) n.fillRect(sx + x, sy + y, 1, 1)
    this.nightSky = n.setVisible(false)
    this.add.graphics().fillStyle(0x8a5a32).fillRect(wx + ww / 2 - 1, sy, 2, sh).fillRect(sx, wy + wh / 2, sw, 1) // caixilho por cima do céu
    // Mesa de madeira
    g.fillStyle(0xa5683a).fillRect(0, TABLE, W, H - TABLE)
    g.fillStyle(0x8c5530)
    for (let y = TABLE + 4; y < H; y += 6) g.fillRect(0, y, W, 1)
    g.fillStyle(0x6e3f22).fillRect(0, TABLE, W, 2)
  }

  // ─── Gaiola de ferro ───────────────────────────────────────────────
  drawCageBack() {
    const g = this.add.graphics()
    const fy = this.floorY
    const T = WIN.T
    g.fillStyle(0x000000, 0.06).fillRect(8, T, W - 16, fy - T + 1)
    // Forro de jornal — substrato raso (o "jeito errado", de propósito)
    g.fillStyle(0xe8d9b0).fillRect(10, fy - 3, W - 20, 4)
    g.fillStyle(0xc9b88a)
    for (let x = 12; x < W - 12; x += 7) g.fillRect(x, fy - 2, 4, 1)
    g.fillStyle(0x9aa3b1, 0.55)
    for (let x = 10; x <= W - 10; x += 6) g.fillRect(x, T, 1, fy - T - 2)
  }

  drawCageFront() {
    const g = this.add.graphics().setDepth(5)
    const fy = this.floorY
    // Grades da frente (por cima do hamster — ele fica "preso" atrás)
    const T = WIN.T
    g.fillStyle(0x7d8694, 0.85)
    for (let x = 13; x <= W - 13; x += 12) g.fillRect(x, T, 1, fy - T)
    g.fillStyle(0x7d8694)
    g.fillRect(8, T - 2, W - 16, 2).fillRect(8, T - 2, 2, fy - T + 4).fillRect(W - 10, T - 2, 2, fy - T + 4)
    g.fillStyle(0xb8c0cc).fillRect(8, T - 2, W - 16, 1)
    g.fillStyle(0x2d6a9f).fillRect(6, fy + 1, W - 12, 8)
    g.fillStyle(0x3f85c2).fillRect(6, fy + 1, W - 12, 2)
    g.fillStyle(0x1e4b72).fillRect(6, fy + 8, W - 12, 1)
    g.lineStyle(1, 0x7d8694).strokeEllipse(W / 2, T - 6, 22, 8)
  }

  // ─── Terrário CoisaPet (MDF amadeirado + frente de acrílico) ───────
  // Terrário CoisaPet (fiel ao produto): moldura frontal grossa de MDF com
  // cantos arredondados, recortes de encaixe, logo no canto, tampa com fendas
  // de ventilação, fundo de madeira com veio vertical e frente de acrílico.
  // Janela (vão do acrílico): WIN (x 9–190, y 48–138 no mundo 200x150).
  drawTerrariumBack() {
    const g = this.add.graphics()
    const { L, R, T, B } = WIN
    // Parede do fundo (veio vertical) + furinhos de fixação
    g.fillStyle(0xe8bd86).fillRect(L, T, R - L + 1, B - T)
    for (let x = L; x <= R; x++) {
      const v = (x * 37) % 11
      if (v < 2) g.fillStyle(0xd9aa72, 1).fillRect(x, T, 1, B - T)
      else if (v === 5) g.fillStyle(0xf0c995, 1).fillRect(x, T, 1, B - T)
    }
    g.fillStyle(0x6e4628)
    for (const f of [0.3, 0.5, 0.7]) { const x = Math.round(W * f); g.fillRect(x, T + 12, 1, 3); g.fillRect(x, T + 19, 1, 3) }
    // Substrato fundo com um túnel visível pelo acrílico
    if (this.setup.substrato) {
      const top = this.floorY - 1
      g.fillStyle(0xe8c98a).fillRect(L, top, R - L + 1, B - top)
      g.fillStyle(0xd1a960)
      const span = R - L - 1
      for (let i = 0; i < 130; i++) g.fillRect(L + 1 + ((i * 37) % span), top + 1 + ((i * 13) % (B - top - 2)), 2, 1)
      g.fillStyle(0xf6dfaa)
      for (let i = 0; i < 75; i++) g.fillRect(L + 1 + ((i * 53) % span), top + ((i * 7) % (B - top - 1)), 1, 1)
      const tx = L + Math.round((R - L) * 0.4)                             // túnel
      g.fillStyle(0x8a6a3a).fillRect(tx, top + 5, 26, 3).fillRect(tx + 24, top + 3, 3, 5).fillRect(tx - 2, top + 5, 3, 5)
      g.fillStyle(0x6e5230).fillRect(tx + 1, top + 6, 24, 1)
    } else {
      g.fillStyle(0xcf9f68).fillRect(L, this.floorY - 1, R - L + 1, B - this.floorY + 1) // fundo de madeira
    }
  }

  drawTerrariumFront() {
    // Tampa com fendas de ventilação (vista de cima, em perspectiva)
    const t = this.add.graphics().setDepth(6)
    t.fillStyle(0x3b2314).fillRect(FX + 3, FY - 6, FW - 6, 7)
    t.fillStyle(0xdcae78).fillRect(FX + 4, FY - 5, FW - 8, 5)
    t.fillStyle(0xe9c08c).fillRect(FX + 4, FY - 5, FW - 8, 1)
    t.fillStyle(0x5a3a22)
    for (let x = FX + 20; x <= FX + FW - 22; x += 4) t.fillRect(x, FY - 3, 2, 1)
    t.fillRect(FX + 5, FY - 4, 3, 1).fillRect(FX + FW - 8, FY - 4, 3, 1)  // encaixes da tampa
    // Abas de encaixe saindo pelas laterais
    const ty = [FY + Math.round(FH * 0.17), FY + Math.round(FH * 0.7)]
    for (const y of ty) {
      t.fillStyle(0xc89058).fillRect(0, y, 3, 6).fillRect(W - 3, y, 3, 6)
      t.fillStyle(0x3b2314).fillRect(0, y, 1, 6).fillRect(W - 1, y, 1, 6)
    }
    // Moldura frontal (pixel a pixel, com cantos arredondados e janela vazada)
    this.add.image(FX, FY, 'terr_frame').setOrigin(0).setDepth(6)
    // Acrílico: leve brilho
    const a = this.add.graphics().setDepth(6)
    a.fillStyle(0xffffff, 0.05).fillRect(WIN.L, WIN.T, WIN.R - WIN.L + 1, WIN.B - WIN.T)
    a.fillStyle(0xffffff, 0.35)
    for (let i = 0; i < 10; i++) a.fillRect(WIN.L + 5 + i, WIN.T + 11 - i, 1, 1)
    for (let i = 0; i < 16; i++) a.fillRect(WIN.L + 11 + i, WIN.T + 17 - i, 1, 1)
  }

  makeTerrariumFrameTexture() {
    // FW x FH, posicionada em (FX,FY). Janela vazada = WIN (em coordenadas locais)
    const W2 = FW, H2 = FH, r = 5, ir = 3
    const wx0 = WIN.L - FX, wx1 = WIN.R - FX, wy0 = WIN.T - FY, wy1 = WIN.B - FY
    const inRound = (x, y, x0, y0, x1, y1, rad) => {
      if (x < x0 || x > x1 || y < y0 || y > y1) return false
      const cx = x < x0 + rad ? x0 + rad : x > x1 - rad ? x1 - rad : x
      const cy = y < y0 + rad ? y0 + rad : y > y1 - rad ? y1 - rad : y
      return Math.hypot(x - cx, y - cy) <= rad + 0.3
    }
    const slots = [
      [W2 / 2 - 4, 3, 8, 1], [16, 3, 7, 1], [W2 - 23, 3, 7, 1],                 // em cima
      [W2 / 2 - 4, H2 - 4, 8, 1], [16, H2 - 4, 7, 1], [W2 - 23, H2 - 4, 7, 1],   // embaixo
      ...[0.22, 0.65].flatMap(f => [[2, Math.round(H2 * f), 1, 6], [W2 - 3, Math.round(H2 * f), 1, 6]]), // laterais
    ]
    this.pixelCanvas('terr_frame', W2, H2, px => {
      for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
        const out = inRound(x, y, 0, 0, W2 - 1, H2 - 1, r)
        if (!out) continue
        const win = inRound(x, y, wx0, wy0, wx1, wy1, ir)
        if (win) continue                                                  // vão do acrílico
        const edgeOut = !inRound(x, y, 1, 1, W2 - 2, H2 - 2, r - 1)
        const edgeIn = inRound(x, y, wx0 - 1, wy0 - 1, wx1 + 1, wy1 + 1, ir + 1)
        if (edgeOut || edgeIn) { px(x, y, '#3b2314'); continue }
        const grain = (y * 7 + Math.floor(x / 9) * 3) % 13
        px(x, y, grain === 0 ? '#c58b52' : grain === 6 ? '#e2ad73' : '#d39a5e')
      }
      for (const [x, y, w, h] of slots) for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) px(x + i, y + j, '#3b2314')
      // logo "coisa pet" gravado no canto inferior direito
      const logo = ['.##.##.#.##..#.', '#..#.#.#.#..#.#', '.##.##.#.##..##']
      logo.forEach((row, j) => [...row].forEach((c, i) => c === '#' && px(W2 - 21 + i, H2 - 8 + j, '#8a5530')))
    })
  }

  // ─── Roda e toca ───────────────────────────────────────────────────
  drawWheel() {
    const x = this.L.wheel, fy = this.floorY
    const g = this.add.graphics().setDepth(2)
    const cy = fy - WHEEL_R - 4
    // Base branca em "T", como a do produto
    g.fillStyle(0x4a4a4a).fillRect(x - 3, cy + 6, 6, fy - cy - 6)
    g.fillStyle(0xf4f4f2).fillRect(x - 2, cy + 6, 4, fy - cy - 7)
    g.fillStyle(0x4a4a4a).fillRect(x - 13, fy - 3, 27, 4)
    g.fillStyle(0xf4f4f2).fillRect(x - 12, fy - 3, 25, 2)
    g.fillStyle(0xd9d9d6).fillRect(x - 12, fy - 1, 25, 1)
    this.wheel = this.add.image(x, cy, 'wheel_0').setDepth(2)
    this.wheelRunY = cy + WHEEL_R - 2                      // chão de dentro da roda
  }

  // Toca CoisaPet: casinha com telhado de duas águas e porta redonda VAZADA —
  // dá pra ver o hamster lá dentro (dormindo ou espiando)
  drawToca() {
    const x = this.L.toca, fy = this.floorY
    // fundo escuro do interior, atrás do hamster
    this.add.rectangle(x, fy - 11, 12, 12, 0x2a1a0e).setDepth(2)
  }

  drawTocaFront() {
    return this.add.image(this.L.toca, this.floorY + 1, 'toca').setOrigin(0.5, 1).setDepth(5)
  }

  applyState(s) {
    // (não usar sys.isActive(): durante o create() a cena ainda não está "ativa"
    // e o primeiro desenho — sujeira, água — era ignorado)
    if (this.dead || !this.bowl?.scene) return // cena já desmontada
    this.state = s
    const fy = this.floorY
    this.bowl.setTexture(s.fome >= 45 ? 'bowl_full' : 'bowl_empty')
    // Nível da água dentro do bebedouro (miolo de 10px)
    const wb = this.waterBox
    this.water.setPosition(wb.x, wb.bottom).setSize(wb.w, Math.round((s.sede / 100) * wb.max))
    this.night.setFillStyle(0x101a40, s.night ? 0.32 : 0)
    this.nightSky?.setVisible(!!s.night)
    // Cocôs: ajusta a quantidade (mantém os que já estão; evita a toca)
    while (this.poops.length > s.poops) this.poops.pop().destroy()
    while (this.poops.length < s.poops) {
      let x = Phaser.Math.Between(X_MIN, X_MAX)
      if (this.L.toca && Math.abs(x - this.L.toca) < 14) x += 30
      const p = this.add.image(x, fy - 1, 'poop').setOrigin(0.5, 1).setDepth(3).setInteractive({ useHandCursor: true })
      p.on('pointerdown', () => {
        this.poops = this.poops.filter(q => q !== p)
        this.sparkle(p.x, p.y - 2)
        p.destroy()
        bridge.emit('clean-one')
      })
      this.poops.push(p)
    }
    // Sem "cortes": com sono ele ANDA até a toca e entra; ao acordar, sai andando.
    // Só no primeiro desenho (abriu o jogo e ele já estava dormindo) aparece direto.
    const first = !this.started
    this.started = true
    if (s.asleep && this.mode !== 'sleep' && !this.sleepPending) this.goSleep(first)
    if (!s.asleep && (this.mode === 'sleep' || this.sleepPending)) this.wake()
  }

  setMode(m, ms = 0) { this.mode = m; this.modeUntil = this.time.now + ms }

  goSleep(instant = false) {
    if (this.mode === 'wheel') this.leaveWheel()
    if (instant || this.mode === 'toca') return this.settleSleep()
    // Vai devagarinho pra cama (toca, ou o cantinho se não tiver toca)
    this.sleepPending = true
    const bed = this.L.toca ?? Math.min(Math.max(this.hamster.x, X_MIN + 8), 34)
    this.walkTo(bed, () => this.enterAndSleep())
  }

  enterAndSleep() {
    if (!this.sleepPending) return
    this.facing = 1
    this.setMode('busy', 99999)
    if (this.L.toca) {
      // Entra pela porta: sobe um pouquinho pra dentro da toca
      this.tweens.add({ targets: this.hamster, y: this.floorY - 5, duration: 700, ease: 'Sine.easeOut', onComplete: () => this.settleSleep() })
    } else {
      this.time.delayedCall(700, () => this.settleSleep())  // se ajeita e deita
    }
  }

  settleSleep() {
    this.sleepPending = false
    this.targetX = null
    this.setMode('sleep')
    this.facing = 1
    if (this.L.toca) this.hamster.setPosition(this.L.toca, this.floorY - 5)
    else this.hamster.y = this.floorY
    this.hamster.setVisible(true)
    this.breath?.stop()
    this.breath = this.tweens.add({ targets: this.hamster, scaleY: 0.92, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })
  }

  wake(scared = false) {
    const wasGoing = this.sleepPending
    this.sleepPending = false
    this.breath?.stop(); this.breath = null
    this.hamster.setScale(1).setVisible(true)
    const after = () => scared ? this.setMode('scared', 900) : this.setMode('idle', 600)
    if (!wasGoing && this.L.toca && this.hamster.y < this.floorY) {
      // Sai da toca pela porta e dá uns passinhos pra fora
      this.setMode('busy', 99999)
      this.tweens.add({ targets: this.hamster, y: this.floorY, duration: scared ? 200 : 600, ease: 'Sine.easeIn', onComplete: () => {
        if (scared) {
          // Leva um susto, treme e sai correndo da toca
          after()
          this.time.delayedCall(750, () => { if (this.mode === 'scared' || this.mode === 'idle') this.walkTo(this.L.toca + 30) })
        } else this.walkTo(this.L.toca + 26)
      } })
    } else {
      this.hamster.y = this.floorY
      after()
    }
  }

  playAnim(kind) {
    if (this.dead) return
    const sleeping = this.mode === 'sleep' || this.sleepPending
    if (sleeping) {
      // Dormindo (ou indo dormir): só um susto acorda; comida/água ficam pra depois
      if (kind === 'scared') this.wake(true)
      return
    }
    if (this.mode === 'wheel') this.leaveWheel()
    if (this.mode === 'toca') this.hamster.y = this.floorY
    if (kind === 'eat') this.walkTo(this.L.bowl + 12, () => this.setMode('eat', 2200))
    else if (kind === 'drink') this.walkTo(this.drinkX, () => { this.facing = 1; this.setMode('drink', 2600) })
    else if (kind === 'happy') { this.hamster.setVisible(true); this.setMode('happy', 900); this.hearts() }
    else if (kind === 'scared') { this.hamster.setVisible(true); this.setMode('scared', 900) }
  }

  walkTo(x, done) {
    if (this.mode === 'sleep') return done?.()
    this.targetX = Phaser.Math.Clamp(x, X_MIN, X_MAX)
    this.onArrive = done
    this.setMode('walk')
  }

  leaveWheel() {
    this.hamster.y = this.floorY
    // Correr na roda diverte e cansa — avisa o React quanto tempo ele correu
    const secs = (this.time.now - (this.wheelStart || this.time.now)) / 1000
    this.wheelStart = null
    if (secs >= 1) { bridge.emit('wheel-run', secs); this.sweat() }
    this.setMode('idle', 800)
  }

  sweat() {
    const d = this.add.image(this.hamster.x + 6, this.hamster.y - 12, 'drop').setDepth(20)
    this.tweens.add({ targets: d, y: d.y + 6, alpha: 0, duration: 900, onComplete: () => d.destroy() })
  }

  hearts() {
    for (let i = 0; i < 3; i++) {
      const h = this.add.image(this.hamster.x + Phaser.Math.Between(-6, 6), this.hamster.y - 12, 'heart').setDepth(20)
      this.tweens.add({ targets: h, y: h.y - 14 - i * 3, alpha: 0, duration: 900 + i * 150, delay: i * 120, onComplete: () => h.destroy() })
    }
  }

  sparkle(x, y) {
    for (let i = 0; i < 4; i++) {
      const s = this.add.rectangle(x, y, 1, 1, 0xfff6a0).setDepth(20)
      this.tweens.add({ targets: s, x: x + Phaser.Math.Between(-6, 6), y: y - Phaser.Math.Between(2, 8), alpha: 0, duration: 450, onComplete: () => s.destroy() })
    }
  }

  update(time, delta) {
    const h = this.hamster
    const s = this.state
    const fy = this.floorY
    const sad = s.statusKey === 'triste' || s.statusKey === 'doente'
    const speed = (this.sleepPending ? 8 : sad ? 9 : 18) * (delta / 1000)  // sonolento anda devagar
    let frame = sad ? 'sad' : 'idle'

    if (this.wheel) this.wheel.setTexture(this.mode === 'wheel' ? `wheel_${Math.floor(time / 80) % 3}` : 'wheel_0')

    if (this.mode === 'sleep') {
      frame = 'sleep'
      const zx = this.L.toca ? this.L.toca + 8 : h.x + 4
      const zy = this.L.toca ? fy - 26 : h.y - 10
      this.zzz.setVisible(true).setPosition(zx, zy - Math.round(Math.sin(time / 500) * 2))
    } else {
      this.zzz.setVisible(false)
      if (this.mode === 'walk' && this.targetX != null) {
        const dx = this.targetX - h.x
        if (Math.abs(dx) <= speed) {
          h.x = this.targetX
          this.targetX = null
          const cb = this.onArrive; this.onArrive = null
          this.setMode('idle', Phaser.Math.Between(1200, 3500))
          cb?.()
        } else {
          h.x += Math.sign(dx) * speed
          this.facing = Math.sign(dx)
          frame = Math.floor(time / 140) % 2 ? 'walk' : 'idle'
        }
      } else if (this.mode === 'wheel') {
        // Correndo dentro da roda
        frame = Math.floor(time / 70) % 2 ? 'walk' : 'idle'
        this.facing = 1
        h.x = this.L.wheel
        h.y = this.wheelRunY
        if (time > this.modeUntil) this.leaveWheel()
      } else if (this.mode === 'busy') {
        frame = 'idle'                                     // entrando/saindo da toca
      } else if (this.mode === 'drink') {
        // Lambendo o bico: estica e volta, e cai uma gotinha de vez em quando
        frame = Math.floor(time / 260) % 2 ? 'drink' : 'idle'
        this.facing = 1
        if (!this.nextDrop || time > this.nextDrop) {
          this.nextDrop = time + 650
          const d = this.add.rectangle(this.spout.x, this.spout.y, 1, 1, 0x5dade2).setDepth(20)
          this.tweens.add({ targets: d, y: d.y + 4, alpha: 0, duration: 450, onComplete: () => d.destroy() })
        }
        if (time > this.modeUntil) this.setMode('idle', 1200)
      } else if (this.mode === 'toca') {
        h.x = this.L.toca
        h.y = fy - 5
        frame = Math.floor(time / 900) % 3 === 0 ? 'eat' : 'idle'   // mexe o focinho espiando
        if (time > this.modeUntil) { h.y = fy; this.walkTo(this.L.toca + 24) }
      } else if (this.mode === 'eat') {
        frame = Math.floor(time / 220) % 2 ? 'eat' : 'idle'
        if (time > this.modeUntil) this.setMode('idle', 1500)
      } else if (this.mode === 'happy') {
        frame = 'idle'
        h.y = fy - (Math.sin((this.modeUntil - time) / 900 * Math.PI) > 0 ? 3 : 0)
        if (time > this.modeUntil) { h.y = fy; this.setMode('idle', 1000) }
      } else if (this.mode === 'scared') {
        frame = 'sad'
        h.x += Math.sin(time / 30) * 0.6
        if (time > this.modeUntil) this.setMode('idle', 1000)
      } else if (time > this.modeUntil) {
        // Decide o que fazer: roda (mais à noite), passear ou ficar parado
        const wheelChance = s.night ? 0.45 : 0.2
        if (this.L.wheel && !sad && Math.random() < wheelChance) {
          this.walkTo(this.L.wheel, () => { this.wheelStart = this.time.now; this.setMode('wheel', Phaser.Math.Between(4000, 9000)) })
        } else if (Math.random() < 0.12 + (s.sede < 60 ? 0.25 : 0) + (s.fome < 60 ? 0.15 : 0)) {
          // Vai sozinho beber ou comer (mais quando está com sede/fome)
          if (Math.random() < (s.sede <= s.fome ? 0.65 : 0.35)) this.walkTo(this.drinkX, () => { this.facing = 1; this.setMode('drink', 2600) })
          else this.walkTo(this.L.bowl + 12, () => { this.facing = -1; this.setMode('eat', 2200) })
        } else if (this.L.toca && Math.random() < (sad ? 0.35 : 0.15)) {
          // Entra na toca e fica espiando pela porta
          this.walkTo(this.L.toca, () => { this.facing = 1; this.setMode('toca', Phaser.Math.Between(3500, 7000)) })
        } else if (!sad || Math.random() < 0.4) this.walkTo(Phaser.Math.Between(X_MIN + 6, X_MAX - 6))
        else this.setMode('idle', 3000)
      }
    }
    h.setTexture(`h_${frame}${this.facing < 0 ? '_l' : ''}`)
  }
}

export function createGame(parent, { species, state, setup }) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: W,
    height: H,
    pixelArt: true,
    roundPixels: true,
    backgroundColor: '#2b1d14',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [],
    banner: false,
    callbacks: {
      postBoot: game => game.scene.add('cage', CageScene, true, { species, state, setup }),
    },
  })
}
