import Phaser from 'phaser'
import { HAMSTER_FRAMES, BOWL_FULL, BOWL_EMPTY, BOTTLE, POOP, paletteFor, spriteCanvas } from './art'

// Mundo em "pixels de jogo" (o Phaser amplia mantendo o pixel nítido)
export const W = 144
export const H = 108
const FLOOR_Y = 93          // onde as patinhas encostam
const X_MIN = 16, X_MAX = 128
const BOWL_X = 28, BOTTLE_X = 118
const BOTTLE_Y = 64 // bico do bebedouro na altura da cabeça do hamster

const HEART = ['.r.r.', 'rRrRr', 'rRRRr', '.rRr.', '..r..']
const ZZZ = ['kkk', '..k', '.k.', 'kkk']
const DROP = ['.c.', 'cCc', '.c.']

// Ponte React ⇄ Phaser
export const bridge = new Phaser.Events.EventEmitter()

export class CageScene extends Phaser.Scene {
  constructor() { super('cage') }

  init(data) {
    this.species = data.species
    this.state = data.state // { asleep, statusKey, fome, sede, poops, night }
  }

  create() {
    this.makeTextures()
    this.drawRoom()
    this.drawCage()

    this.bowl = this.add.image(BOWL_X, FLOOR_Y - 2, 'bowl_full').setOrigin(0.5, 1)
    this.bottle = this.add.image(BOTTLE_X, BOTTLE_Y, 'bottle').setOrigin(0.5, 0)
    this.water = this.add.rectangle(BOTTLE_X, 0, 2, 0, 0x5dade2).setOrigin(0.5, 1)
    this.drawFront() // grades da frente ficam por cima do potinho/bebedouro

    this.poops = []
    this.hamster = this.add.sprite(70, FLOOR_Y, 'h_idle').setOrigin(0.5, 1).setInteractive({ useHandCursor: true })
    this.hamster.on('pointerdown', () => bridge.emit('tap-pet'))
    this.facing = 1
    this.mode = 'idle'
    this.modeUntil = 0
    this.targetX = null
    this.busyUntil = 0

    this.zzz = this.add.image(0, 0, 'zzz').setOrigin(0, 1).setVisible(false)
    this.night = this.add.rectangle(0, 0, W, H, 0x101a40, 0).setOrigin(0).setDepth(50)

    this.applyState(this.state)
    bridge.on('state', this.applyState, this)
    bridge.on('anim', this.playAnim, this)
    this.events.once('shutdown', () => { bridge.off('state', this.applyState, this); bridge.off('anim', this.playAnim, this) })
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

  drawCage() {
    const g = this.add.graphics()
    // Fundo da gaiola (vê a parede pelas grades) e bandeja de plástico
    g.fillStyle(0x000000, 0.06).fillRect(8, 30, 128, 64)
    // Forro de jornal — substrato raso (o "jeito errado", de propósito)
    g.fillStyle(0xe8d9b0).fillRect(10, FLOOR_Y - 3, 124, 4)
    g.fillStyle(0xc9b88a)
    for (let x = 12; x < 132; x += 7) g.fillRect(x, FLOOR_Y - 2, 4, 1)
    // Grades de trás (mais claras)
    g.fillStyle(0x9aa3b1, 0.55)
    for (let x = 10; x <= 134; x += 6) g.fillRect(x, 30, 1, FLOOR_Y - 32)
  }

  drawFront() {
    const g = this.add.graphics().setDepth(5)
    g.fillStyle(0x7d8694)
    g.fillRect(8, 28, 128, 2)          // aro de cima
    g.fillRect(8, 28, 2, FLOOR_Y - 26) // laterais
    g.fillRect(134, 28, 2, FLOOR_Y - 26)
    g.fillStyle(0xb8c0cc).fillRect(8, 28, 128, 1)
    // Bandeja
    g.fillStyle(0x2d6a9f).fillRect(6, FLOOR_Y + 1, 132, 8)
    g.fillStyle(0x3f85c2).fillRect(6, FLOOR_Y + 1, 132, 2)
    g.fillStyle(0x1e4b72).fillRect(6, FLOOR_Y + 8, 132, 1)
    // Alça
    g.lineStyle(1, 0x7d8694).strokeEllipse(72, 24, 22, 8)
  }

  applyState(s) {
    this.state = s
    this.bowl.setTexture(s.fome >= 45 ? 'bowl_full' : 'bowl_empty')
    // Nível da água dentro do bebedouro (miolo de 10px)
    const lvl = Math.round((s.sede / 100) * 10)
    this.water.setPosition(BOTTLE_X, BOTTLE_Y + 11).setSize(2, lvl)
    this.night.setFillStyle(0x101a40, s.night ? 0.32 : 0)
    // Cocôs: ajusta a quantidade (mantém os que já estão)
    while (this.poops.length > s.poops) this.poops.pop().destroy()
    while (this.poops.length < s.poops) {
      const x = Phaser.Math.Between(X_MIN, X_MAX)
      const p = this.add.image(x, FLOOR_Y - 1, 'poop').setOrigin(0.5, 1).setDepth(2).setInteractive({ useHandCursor: true })
      p.on('pointerdown', () => {
        this.poops = this.poops.filter(q => q !== p)
        this.sparkle(p.x, p.y - 2)
        p.destroy()
        bridge.emit('clean-one')
      })
      this.poops.push(p)
    }
    if (s.asleep && this.mode !== 'sleep') this.goSleep()
    if (!s.asleep && this.mode === 'sleep') this.setMode('idle', 500)
  }

  setMode(m, ms = 0) { this.mode = m; this.modeUntil = this.time.now + ms }

  goSleep() {
    this.targetX = null
    this.setMode('sleep')
    this.hamster.setPosition(Math.min(this.hamster.x, 40), FLOOR_Y)
  }

  playAnim(kind) {
    if (kind === 'eat') this.walkTo(BOWL_X + 12, () => this.setMode('eat', 2200))
    else if (kind === 'drink') this.walkTo(BOTTLE_X - 6, () => this.setMode('eat', 2000))
    else if (kind === 'happy') { this.setMode('happy', 900); this.hearts() }
    else if (kind === 'scared') { this.setMode('scared', 900) }
  }

  walkTo(x, done) {
    if (this.mode === 'sleep') return done?.()
    this.targetX = x
    this.onArrive = done
    this.setMode('walk')
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
    const sad = s.statusKey === 'triste' || s.statusKey === 'doente'
    const speed = (sad ? 9 : 18) * (delta / 1000)
    let frame = sad ? 'sad' : 'idle'

    if (this.mode === 'sleep') {
      frame = 'sleep'
      this.zzz.setVisible(true).setPosition(h.x + 4, h.y - 10 - Math.round(Math.sin(time / 500) * 2))
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
      } else if (this.mode === 'eat') {
        frame = Math.floor(time / 220) % 2 ? 'eat' : 'idle'
        if (time > this.modeUntil) this.setMode('idle', 1500)
      } else if (this.mode === 'happy') {
        frame = 'idle'
        h.y = FLOOR_Y - (Math.sin((this.modeUntil - time) / 900 * Math.PI) > 0 ? 3 : 0)
        if (time > this.modeUntil) { h.y = FLOOR_Y; this.setMode('idle', 1000) }
      } else if (this.mode === 'scared') {
        frame = 'sad'
        h.x += Math.sin(time / 30) * 0.6
        if (time > this.modeUntil) this.setMode('idle', 1000)
      } else if (time > this.modeUntil) {
        // Passeia pela gaiola (doente anda menos)
        if (!sad || Math.random() < 0.4) this.walkTo(Phaser.Math.Between(X_MIN + 6, X_MAX - 6))
        else this.setMode('idle', 3000)
      }
    }
    h.setTexture(`h_${frame}${this.facing < 0 ? '_l' : ''}`)
  }
}

export function createGame(parent, { species, state }) {
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
      postBoot: game => game.scene.add('cage', CageScene, true, { species, state }),
    },
  })
}
