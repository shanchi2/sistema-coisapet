import Phaser from 'phaser'
import { HAMSTER_FRAMES, BOWL_FULL, BOWL_EMPTY, BOTTLE, POOP, paletteFor, spriteCanvas } from './art'

// Mundo em "pixels de jogo" (o Phaser amplia mantendo o pixel nítido)
export const W = 144
export const H = 108
const X_MIN = 16, X_MAX = 128

const HEART = ['.r.r.', 'rRrRr', 'rRRRr', '.rRr.', '..r..']
const ZZZ = ['kkk', '..k', '.k.', 'kkk']
const DROP = ['.c.', 'cCc', '.c.']

// Madeira "amadeirado" dos produtos CoisaPet
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
    this.floorY = ter && this.setup.substrato ? 84 : 93
    // Posições: toca no canto esquerdo, depois o potinho; roda à direita
    this.L = {
      toca: this.setup.toca ? 26 : null,
      bowl: this.setup.toca ? 50 : 28,
      wheel: this.setup.roda ? 100 : null,
      bottle: ter ? 127 : 118,
    }
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
    this.bottleY = fy - 29
    this.bottle = this.add.image(this.L.bottle, this.bottleY, 'bottle').setOrigin(0.5, 0).setDepth(3)
    this.water = this.add.rectangle(this.L.bottle, 0, 2, 0, 0x5dade2).setOrigin(0.5, 1).setDepth(3)

    this.poops = []
    this.hamster = this.add.sprite(70, fy, 'h_idle').setOrigin(0.5, 1).setDepth(4).setInteractive({ useHandCursor: true })
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
    // Roda: 2 quadros dos raios (+ e x) — gira sem borrar o pixel
    for (const [key, ang] of [['wheel_a', 0], ['wheel_b', Math.PI / 4]]) {
      if (this.textures.exists(key)) this.textures.remove(key)
      const g = this.make.graphics({ add: false })
      g.lineStyle(2, WOOD_D).strokeCircle(13, 13, 11)
      g.lineStyle(1, WOOD_L).strokeCircle(13, 13, 9)
      g.lineStyle(1, WOOD_D)
      for (let i = 0; i < 4; i++) {
        const a = ang + i * Math.PI / 2
        g.lineBetween(13, 13, 13 + Math.cos(a) * 10, 13 + Math.sin(a) * 10)
      }
      g.fillStyle(INK).fillRect(12, 12, 2, 2)
      g.generateTexture(key, 26, 26)
      g.destroy()
    }
  }

  drawRoom() {
    const g = this.add.graphics()
    // Parede com papel listrado
    g.fillStyle(0xf6e7cf).fillRect(0, 0, W, 78)
    g.fillStyle(0xefd9b6)
    for (let x = 0; x < W; x += 8) g.fillRect(x, 0, 4, 78)
    // Janela
    g.fillStyle(0x8a5a32).fillRect(96, 6, 38, 26)
    g.fillStyle(0xbfe3f5).fillRect(98, 8, 34, 22)
    g.fillStyle(0x8a5a32).fillRect(114, 8, 2, 22).fillRect(98, 18, 34, 2)
    // Mesa de madeira
    g.fillStyle(0xa5683a).fillRect(0, 78, W, 30)
    g.fillStyle(0x8c5530)
    for (let y = 82; y < H; y += 6) g.fillRect(0, y, W, 1)
    g.fillStyle(0x6e3f22).fillRect(0, 78, W, 2)
  }

  // ─── Gaiola de ferro ───────────────────────────────────────────────
  drawCageBack() {
    const g = this.add.graphics()
    const fy = this.floorY
    g.fillStyle(0x000000, 0.06).fillRect(8, 30, 128, 64)
    // Forro de jornal — substrato raso (o "jeito errado", de propósito)
    g.fillStyle(0xe8d9b0).fillRect(10, fy - 3, 124, 4)
    g.fillStyle(0xc9b88a)
    for (let x = 12; x < 132; x += 7) g.fillRect(x, fy - 2, 4, 1)
    g.fillStyle(0x9aa3b1, 0.55)
    for (let x = 10; x <= 134; x += 6) g.fillRect(x, 30, 1, fy - 32)
  }

  drawCageFront() {
    const g = this.add.graphics().setDepth(5)
    const fy = this.floorY
    // Grades da frente (por cima do hamster — ele fica "preso" atrás)
    g.fillStyle(0x7d8694, 0.85)
    for (let x = 13; x <= 131; x += 12) g.fillRect(x, 30, 1, fy - 30)
    g.fillStyle(0x7d8694)
    g.fillRect(8, 28, 128, 2).fillRect(8, 28, 2, fy - 26).fillRect(134, 28, 2, fy - 26)
    g.fillStyle(0xb8c0cc).fillRect(8, 28, 128, 1)
    g.fillStyle(0x2d6a9f).fillRect(6, fy + 1, 132, 8)
    g.fillStyle(0x3f85c2).fillRect(6, fy + 1, 132, 2)
    g.fillStyle(0x1e4b72).fillRect(6, fy + 8, 132, 1)
    g.lineStyle(1, 0x7d8694).strokeEllipse(72, 24, 22, 8)
  }

  // ─── Terrário CoisaPet (MDF amadeirado + frente de acrílico) ───────
  drawTerrariumBack() {
    const g = this.add.graphics()
    const base = 95
    // Fundo interno (madeira clarinha) e laterais
    g.fillStyle(0xf3dcb5).fillRect(8, 26, 128, base - 26)
    g.fillStyle(0xe9cc9c)
    for (let y = 30; y < base; y += 9) g.fillRect(8, y, 128, 1)
    // Substrato fundo com um túnel visível pelo acrílico
    if (this.setup.substrato) {
      const top = this.floorY - 1
      g.fillStyle(0xe8c98a).fillRect(8, top, 128, base - top)
      g.fillStyle(0xd1a960)
      for (let i = 0; i < 70; i++) g.fillRect(9 + ((i * 37) % 126), top + 1 + ((i * 13) % (base - top - 2)), 2, 1)
      g.fillStyle(0xf6dfaa)
      for (let i = 0; i < 40; i++) g.fillRect(9 + ((i * 53) % 126), top + ((i * 7) % (base - top - 1)), 1, 1)
      // túnel cavado
      g.fillStyle(0x8a6a3a).fillRect(60, top + 5, 26, 3).fillRect(84, top + 3, 3, 5).fillRect(58, top + 5, 3, 5)
      g.fillStyle(0x6e5230).fillRect(61, top + 6, 24, 1)
    } else {
      g.fillStyle(0xd9b98a).fillRect(8, this.floorY - 1, 128, 2) // fundo liso
    }
  }

  drawTerrariumFront() {
    const g = this.add.graphics().setDepth(6)
    const base = 95
    // Laterais e tampa de madeira (tampa com grade de ventilação)
    g.fillStyle(WOOD).fillRect(5, 22, 4, base - 22 + 9).fillRect(135, 22, 4, base - 22 + 9)
    g.fillStyle(WOOD_D).fillRect(8, 22, 1, base - 22 + 9).fillRect(135, 22, 1, base - 22 + 9)
    g.fillStyle(WOOD).fillRect(5, 20, 134, 6)
    g.fillStyle(WOOD_L).fillRect(5, 20, 134, 1)
    g.fillStyle(WOOD_D)
    for (let x = 14; x < 132; x += 4) g.fillRect(x, 22, 2, 2)
    // Base
    g.fillStyle(WOOD).fillRect(3, base, 138, 9)
    g.fillStyle(WOOD_L).fillRect(3, base, 138, 1)
    g.fillStyle(WOOD_D).fillRect(3, base + 8, 138, 1)
    // Acrílico da frente: leve brilho
    g.fillStyle(0xffffff, 0.06).fillRect(9, 26, 126, base - 26)
    g.fillStyle(0xffffff, 0.35)
    for (let i = 0; i < 10; i++) g.fillRect(14 + i, 34 - i, 1, 1)
    for (let i = 0; i < 16; i++) g.fillRect(20 + i, 40 - i, 1, 1)
    // Plaquinha da marca
    g.fillStyle(INK).fillRect(62, base + 3, 20, 4)
    g.fillStyle(WOOD_L).fillRect(64, base + 4, 2, 2).fillRect(68, base + 4, 2, 2).fillRect(72, base + 4, 2, 2).fillRect(76, base + 4, 4, 2)
  }

  // ─── Roda e toca ───────────────────────────────────────────────────
  drawWheel() {
    const x = this.L.wheel, fy = this.floorY
    const g = this.add.graphics().setDepth(2)
    g.fillStyle(WOOD_D).fillRect(x - 1, fy - 13, 2, 13)   // suporte
    g.fillStyle(WOOD).fillRect(x - 7, fy - 1, 14, 2)       // pé
    this.wheel = this.add.image(x, fy - 14, 'wheel_a').setDepth(2)
  }

  drawToca() {
    const x = this.L.toca, fy = this.floorY
    const g = this.add.graphics().setDepth(2)
    g.fillStyle(WOOD_D).fillRect(x - 11, fy - 12, 22, 12)   // fundo da toca
  }

  drawTocaFront() {
    const x = this.L.toca, fy = this.floorY
    const g = this.add.graphics().setDepth(5)
    // Paredes com porta em arco + telhado
    g.fillStyle(WOOD).fillRect(x - 11, fy - 12, 22, 12)
    g.fillStyle(WOOD_D).fillRect(x - 11, fy - 1, 22, 1)
    g.fillStyle(0x4a2e18).fillRect(x - 4, fy - 8, 8, 8).fillRect(x - 3, fy - 9, 6, 1)
    g.fillStyle(WOOD_L).fillTriangle(x - 14, fy - 12, x, fy - 22, x + 14, fy - 12)
    g.fillStyle(WOOD_D).fillTriangle(x - 14, fy - 12, x, fy - 22, x, fy - 12)
    g.fillStyle(INK).fillRect(x - 14, fy - 12, 28, 1)
    return g
  }

  applyState(s) {
    // (não usar sys.isActive(): durante o create() a cena ainda não está "ativa"
    // e o primeiro desenho — sujeira, água — era ignorado)
    if (this.dead || !this.bowl?.scene) return // cena já desmontada
    this.state = s
    const fy = this.floorY
    this.bowl.setTexture(s.fome >= 45 ? 'bowl_full' : 'bowl_empty')
    // Nível da água dentro do bebedouro (miolo de 10px)
    const lvl = Math.round((s.sede / 100) * 10)
    this.water.setPosition(this.L.bottle, this.bottleY + 11).setSize(2, lvl)
    this.night.setFillStyle(0x101a40, s.night ? 0.32 : 0)
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
    if (s.asleep && this.mode !== 'sleep') this.goSleep()
    if (!s.asleep && this.mode === 'sleep') this.wake()
  }

  setMode(m, ms = 0) { this.mode = m; this.modeUntil = this.time.now + ms }

  goSleep() {
    this.targetX = null
    this.setMode('sleep')
    this.hamster.y = this.floorY
    if (this.L.toca) {
      // Dorme escondido dentro da toca (só aparece o "Zzz")
      this.hamster.setPosition(this.L.toca, this.floorY).setVisible(false)
    } else {
      this.hamster.setPosition(Math.min(this.hamster.x, 40), this.floorY)
    }
  }

  wake() {
    this.hamster.setVisible(true)
    this.setMode('idle', 500)
  }

  playAnim(kind) {
    if (this.dead) return
    if (this.mode === 'wheel') this.leaveWheel()
    if (kind === 'eat') this.walkTo(this.L.bowl + 12, () => this.setMode('eat', 2200))
    else if (kind === 'drink') this.walkTo(this.L.bottle - 6, () => this.setMode('eat', 2000))
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
    this.setMode('idle', 800)
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
    const speed = (sad ? 9 : 18) * (delta / 1000)
    let frame = sad ? 'sad' : 'idle'

    if (this.wheel) this.wheel.setTexture(this.mode === 'wheel' && Math.floor(time / 90) % 2 ? 'wheel_b' : 'wheel_a')

    if (this.mode === 'sleep') {
      frame = 'sleep'
      const zx = this.L.toca ? this.L.toca + 6 : h.x + 4
      const zy = this.L.toca ? fy - 22 : h.y - 10
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
        h.y = fy - 4
        if (time > this.modeUntil) this.leaveWheel()
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
          this.walkTo(this.L.wheel, () => this.setMode('wheel', Phaser.Math.Between(4000, 9000)))
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
