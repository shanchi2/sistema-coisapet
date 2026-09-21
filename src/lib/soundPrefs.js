// Preferência de "som dos pedidos" (ML/Shopee) — por aparelho, não por
// usuário: pedido do Raphael, 21/09, pro pessoal da fábrica poder
// desligar o som num computador compartilhado sem afetar outros
// logins. Fica em localStorage de propósito (não no banco).
const KEY = 'coisapet_sale_sound_muted'
const EVENT = 'coisapet-sale-sound-pref-changed'

export function isSaleSoundMuted() {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}

export function setSaleSoundMuted(muted) {
  try { localStorage.setItem(KEY, muted ? '1' : '0') } catch { /* localStorage bloqueado — segue sem persistir */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { muted } }))
}

export function onSaleSoundPrefChange(handler) {
  const listener = (e) => handler(e.detail.muted)
  window.addEventListener(EVENT, listener)
  return () => window.removeEventListener(EVENT, listener)
}
