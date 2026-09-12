// Checklist de SEO estilo Yoast — tudo calculado localmente por regra
// heurística (nunca "nota" inventada por IA), pra dar um retorno rápido
// e confiável do tipo "semáforo" (verde/âmbar/vermelho) enquanto edita.

export function stripHtml(html) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

export function countWords(text) {
  return text ? text.split(/\s+/).filter(Boolean).length : 0
}

function keywordOccurrences(text, keyword) {
  if (!keyword?.trim()) return 0
  const escaped = keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`\\b${escaped}\\b`, 'gi')
  return (text.match(re) || []).length
}

// status: 'good' | 'ok' | 'bad'
export function computeSeoChecks({ title, slug, metaTitle, metaDescription, focusKeyword, contentHtml }) {
  const text = stripHtml(contentHtml)
  const words = countWords(text)
  const kw = focusKeyword?.trim().toLowerCase() || ''
  const checks = []

  if (!kw) {
    checks.push({ status: 'bad', label: 'Defina uma palavra-chave foco pra liberar as outras checagens de SEO.' })
    return checks
  }

  checks.push({
    status: title?.toLowerCase().includes(kw) ? 'good' : 'bad',
    label: title?.toLowerCase().includes(kw) ? 'A palavra-chave aparece no título.' : 'A palavra-chave não aparece no título.',
  })

  checks.push({
    status: slug?.toLowerCase().includes(kw.replace(/\s+/g, '-')) ? 'good' : 'ok',
    label: slug?.toLowerCase().includes(kw.replace(/\s+/g, '-')) ? 'A palavra-chave aparece no slug.' : 'A palavra-chave não aparece no slug (opcional, mas ajuda).',
  })

  const mtLen = metaTitle?.length || 0
  checks.push({
    status: mtLen >= 40 && mtLen <= 60 ? 'good' : mtLen === 0 ? 'bad' : 'ok',
    label: mtLen === 0 ? 'Título SEO vazio.' : `Título SEO com ${mtLen} caracteres (ideal: 40-60).`,
  })

  const mdLen = metaDescription?.length || 0
  checks.push({
    status: mdLen >= 120 && mdLen <= 156 ? 'good' : mdLen === 0 ? 'bad' : 'ok',
    label: mdLen === 0 ? 'Meta descrição vazia.' : `Meta descrição com ${mdLen} caracteres (ideal: 120-156).`,
  })

  const occ = keywordOccurrences(text, kw)
  const density = words > 0 ? (occ / words) * 100 : 0
  checks.push({
    status: density >= 0.4 && density <= 3 ? 'good' : occ === 0 ? 'bad' : 'ok',
    label: occ === 0
      ? 'A palavra-chave não aparece no corpo do texto.'
      : `Densidade da palavra-chave: ${density.toFixed(1)}% (${occ}x em ${words} palavras — ideal 0,5%-2,5%).`,
  })

  checks.push({
    status: words >= 300 ? 'good' : words >= 150 ? 'ok' : 'bad',
    label: `${words} palavras no conteúdo${words < 300 ? ' (ideal: pelo menos 300)' : ''}.`,
  })

  const hasSubheadingWithKw = /<h[23][^>]*>([^<]*)<\/h[23]>/gi
  let subOk = false, hasSubheadings = false
  let m
  while ((m = hasSubheadingWithKw.exec(contentHtml || ''))) {
    hasSubheadings = true
    if (m[1].toLowerCase().includes(kw)) subOk = true
  }
  checks.push({
    status: subOk ? 'good' : hasSubheadings ? 'ok' : 'bad',
    label: subOk
      ? 'A palavra-chave aparece em pelo menos um subtítulo (H2/H3).'
      : hasSubheadings
        ? 'Tem subtítulos, mas nenhum com a palavra-chave.'
        : 'Nenhum subtítulo (H2/H3) no texto — ajuda a organizar e no SEO.',
  })

  return checks
}
