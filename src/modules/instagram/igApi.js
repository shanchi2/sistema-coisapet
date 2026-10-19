import { supabase } from '../../lib/supabase'
import { sessionToken } from '../../lib/sessionToken'

// Tudo que ESCREVE no Instagram passa pela Edge Function `instagram-api`,
// que confere o token da sessão (fase106) + módulo `instagram`. O front só
// lê as tabelas ig_* direto.
export async function igCall(action, payload = {}) {
  const { data, error } = await supabase.functions.invoke('instagram-api', {
    body: { action, p_token: sessionToken(), ...payload },
  })
  if (error) {
    let msg = error.message
    try { const p = await error?.context?.json?.(); if (p?.error) msg = p.error } catch { /* mantém */ }
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

export const BUCKET = 'instagram-media'

// Foto → JPEG (a Meta só aceita JPEG no feed). Lado maior até 1440 px e,
// se pedido, encaixa numa proporção aceita (1:1, 4:5 ou 9:16) com fundo.
export async function toJpeg(file, { ratio = null, bg = '#ffffff', max = 1440 } = {}) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url })
    return await drawToJpeg(img, img.naturalWidth, img.naturalHeight, { ratio, bg, max })
  } finally { URL.revokeObjectURL(url) }
}

export async function drawToJpeg(src, w, h, { ratio = null, bg = '#ffffff', max = 1440 } = {}) {
  let cw = w, ch = h
  if (ratio) {
    // encaixa a imagem inteira (sem cortar) na proporção pedida
    if (w / h > ratio) ch = Math.round(w / ratio); else cw = Math.round(h * ratio)
  }
  const scale = Math.min(1, max / Math.max(cw, ch))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(cw * scale); canvas.height = Math.round(ch * scale)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(src, Math.round((cw - w) / 2 * scale), Math.round((ch - h) / 2 * scale), Math.round(w * scale), Math.round(h * scale))
  const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.9))
  return { blob, width: canvas.width, height: canvas.height }
}

export async function uploadMedia(blob, ext) {
  const path = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: ext === 'mp4' ? 'video/mp4' : ext === 'mov' ? 'video/quicktime' : 'image/jpeg', upsert: false,
  })
  if (error) throw error
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { url: data.publicUrl, path }
}

// Proporções aceitas pelo feed: de 4:5 (0,8) a 1,91:1
export const feedRatioOk = r => r >= 0.799 && r <= 1.911

export const KIND = {
  IMAGE:    { label: 'Foto',      emoji: '🖼️', chip: 'bg-sky-100 text-sky-700' },
  CAROUSEL: { label: 'Carrossel', emoji: '🗂️', chip: 'bg-violet-100 text-violet-700' },
  REELS:    { label: 'Reels',     emoji: '🎬', chip: 'bg-pink-100 text-pink-700' },
  STORIES:  { label: 'Story',     emoji: '⭕', chip: 'bg-amber-100 text-amber-700' },
}
export const STATUS = {
  rascunho:   { label: 'Rascunho',   chip: 'bg-slate-100 text-slate-600',     dot: 'bg-slate-400' },
  agendado:   { label: 'Agendado',   chip: 'bg-indigo-100 text-indigo-700',   dot: 'bg-indigo-500' },
  publicando: { label: 'Publicando', chip: 'bg-amber-100 text-amber-700',     dot: 'bg-amber-500' },
  publicado:  { label: 'Publicado',  chip: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  erro:       { label: 'Erro',       chip: 'bg-red-100 text-red-700',         dot: 'bg-red-500' },
}
export const PRODUCT_LABEL = { FEED: 'Feed', REELS: 'Reels', STORY: 'Story' }

export const fmtInt = n => n == null ? '—' : Math.round(n).toLocaleString('pt-BR')
export const fmtPct = n => n == null || !isFinite(n) ? '—' : `${(n * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
export const fmtDateTime = iso => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
export const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '—'
export const timeAgo = iso => {
  if (!iso) return ''
  const m = Math.round((Date.now() - new Date(iso)) / 60000)
  if (m < 1) return 'agora'
  if (m < 60) return `${m} min`
  if (m < 1440) return `${Math.round(m / 60)} h`
  return `${Math.round(m / 1440)} d`
}

// datetime-local ↔ ISO (hora de Brasília = hora do navegador)
export const toLocalInput = iso => {
  if (!iso) return ''
  const d = new Date(iso); const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
export const fromLocalInput = v => v ? new Date(v).toISOString() : null

// Melhores horários (a partir de online_followers, média por hora). A Meta
// entrega as horas no fuso do Pacífico (Califórnia) — convertemos pro local.
function pacificOffset() {
  const now = new Date()
  const la = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
  const here = new Date(now.toLocaleString('en-US'))
  return Math.round((here - la) / 3600e3)
}
export function bestHours(online, n = 3) {
  if (!online) return []
  const offset = pacificOffset()
  return Object.entries(online)
    .map(([h, v]) => ({ hour: (Number(h) + offset + 24) % 24, v: Number(v) }))
    .sort((a, b) => b.v - a.v).slice(0, n)
}
export function hourlyLocal(online) {
  const offset = pacificOffset()
  const arr = Array.from({ length: 24 }, (_, h) => ({ hour: h, v: 0 }))
  for (const [h, v] of Object.entries(online || {})) arr[(Number(h) + offset + 24) % 24].v = Number(v)
  return arr
}

export const engagement = (m, followers) => {
  const inter = m?.insights?.total_interactions ?? ((m?.like_count || 0) + (m?.comments_count || 0))
  const base = m?.insights?.reach || followers
  return base ? inter / base : null
}
