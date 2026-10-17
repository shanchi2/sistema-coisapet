import { setServerNow } from './clock'

// Conversa com a Edge Function `game-api` (login por código no e-mail + save
// na nuvem). O endereço é público — a segurança está no token da sessão, que
// só este aparelho tem (o servidor guarda apenas o hash dele).
const API = 'https://lcybmdiqxmbqeuyeuhdj.supabase.co/functions/v1/game-api'
const AUTH_KEY = 'minhacoisapet_auth'

export async function api(action, payload = {}, { keepalive = false } = {}) {
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
    keepalive,
  })
  const j = await r.json().catch(() => ({}))
  if (j.now) setServerNow(j.now)
  if (!r.ok) { const e = new Error(j.error || 'Não deu certo, tente de novo'); e.status = r.status; throw e }
  return j
}

export function getAuth() {
  try { const a = JSON.parse(localStorage.getItem(AUTH_KEY)); return a?.token ? a : null } catch { return null }
}
export function setAuth(a) { try { localStorage.setItem(AUTH_KEY, JSON.stringify(a)) } catch { /* sem storage */ } }
export function clearAuth() { try { localStorage.removeItem(AUTH_KEY) } catch { /* sem storage */ } }
