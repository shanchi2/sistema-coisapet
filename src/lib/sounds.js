import { isSaleSoundMuted } from './soundPrefs'

// Som de PEDIDO CANCELADO (01/10, pedido do Raphael: "um som triste, uma
// cornetada curta") — o clássico "trombone triste" (wah-wah-wah-waaah),
// gerado na hora (sem arquivo), descendo meio tom a cada nota e a última
// mais longa com vibrato. Se um dia quiserem um som gravado, é só pôr
// public/sounds/cancelado.mp3 — ele passa a valer no lugar do sintético.
// Respeita o autofalante do Header (mesma preferência do som de venda).
const CANCEL_SOUND_URL = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/sounds/cancelado.mp3`

export function playCancelSound() {
  if (isSaleSoundMuted()) return
  try {
    const audio = new Audio(CANCEL_SOUND_URL)
    audio.volume = 0.7
    audio.play().catch(() => playSadTrombone())
  } catch {
    playSadTrombone()
  }
}

export function playSadTrombone() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const master = ctx.createGain()
    master.gain.value = 0.22
    // Filtro passa-baixa deixa o "dente de serra" com cara de metal abafado
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'; filter.frequency.value = 1400; filter.Q.value = 2
    filter.connect(master); master.connect(ctx.destination)

    const notes = [
      { f: 392.0, d: 0.28 }, // sol
      { f: 370.0, d: 0.28 }, // fá#
      { f: 349.2, d: 0.28 }, // fá
      { f: 329.6, d: 0.95, vib: true }, // mi — longa, tremida
    ]
    let t = ctx.currentTime + 0.02
    for (const n of notes) {
      const osc = ctx.createOscillator(), gain = ctx.createGain()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(n.f, t)
      if (n.vib) {
        const lfo = ctx.createOscillator(), lfoGain = ctx.createGain()
        lfo.frequency.value = 6; lfoGain.gain.value = 7
        lfo.connect(lfoGain); lfoGain.connect(osc.frequency)
        lfo.start(t); lfo.stop(t + n.d)
        osc.frequency.linearRampToValueAtTime(n.f * 0.94, t + n.d) // cai no final
      }
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(1, t + 0.04)
      gain.gain.setValueAtTime(1, t + n.d - 0.08)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + n.d)
      osc.connect(gain); gain.connect(filter)
      osc.start(t); osc.stop(t + n.d + 0.02)
      t += n.d + 0.04
    }
    setTimeout(() => ctx.close().catch(() => {}), (t - ctx.currentTime + 0.3) * 1000)
  } catch { /* navegador bloqueou áudio — segue sem som */ }
}
