// Contas dos posts publicados (20/10): "desempenho vs. média" justo entre
// formatos (cada post é comparado com a mediana do PRÓPRIO formato — Reels
// alcança mais que foto por natureza) e agregações pros Aprendizados.

export const formatOf = m =>
  m.media_product_type === 'REELS' ? 'Reels'
  : m.media_product_type === 'STORY' ? 'Story'
  : m.media_type === 'CAROUSEL_ALBUM' ? 'Carrossel' : 'Foto'

export const likesOf = m => m.like_count ?? m.insights?.likes ?? null
export const interactionsOf = m => m.insights?.total_interactions ?? ((m.like_count || 0) + (m.comments_count || 0))
export const hashtagsOf = m => [...new Set((m.caption?.match(/#[\p{L}\p{N}_]+/gu) || []).map(h => h.toLowerCase()))]

export function median(arr) {
  const a = arr.filter(v => v != null && isFinite(v)).sort((x, y) => x - y)
  if (!a.length) return null
  const mid = Math.floor(a.length / 2)
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2
}

// Índice de desempenho: alcance ÷ mediana de alcance do formato (ou, sem
// métrica, curtidas ÷ mediana de curtidas). 1,0 = post típico.
export function buildScorer(media) {
  const by = {}
  for (const m of media) {
    const f = formatOf(m)
    by[f] = by[f] || { reach: [], likes: [] }
    if (m.insights?.reach != null) by[f].reach.push(m.insights.reach)
    if (likesOf(m) != null) by[f].likes.push(likesOf(m))
  }
  const med = Object.fromEntries(Object.entries(by).map(([f, v]) => [f, { reach: median(v.reach), likes: median(v.likes) }]))
  return m => {
    const md = med[formatOf(m)]
    if (!md) return null
    if (m.insights?.reach != null && md.reach) return m.insights.reach / md.reach
    if (likesOf(m) != null && md.likes) return likesOf(m) / md.likes
    return null
  }
}

export function avg(arr) {
  const a = arr.filter(v => v != null && isFinite(v))
  return a.length ? a.reduce((s, v) => s + v, 0) / a.length : null
}

export const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
export const SLOTS = [
  { k: 'madrugada', label: 'Madrugada', sub: '0h–6h', test: h => h < 6 },
  { k: 'manha', label: 'Manhã', sub: '6h–12h', test: h => h >= 6 && h < 12 },
  { k: 'tarde', label: 'Tarde', sub: '12h–18h', test: h => h >= 12 && h < 18 },
  { k: 'noite', label: 'Noite', sub: '18h–24h', test: h => h >= 18 },
]

export function toCsv(rows) {
  const esc = v => {
    const s = v == null ? '' : String(v)
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + rows.map(r => r.map(esc).join(';')).join('\n')
}
