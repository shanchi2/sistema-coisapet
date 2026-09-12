import { stripHtml } from './seoChecks'

// Faixa Unicode dos acentos "soltos" (combining diacritical marks) que
// sobram depois do normalize('NFD') — montada via fromCharCode de
// propósito, pra nunca ter um caractere combinante literal dentro do
// arquivo fonte (mesmo cuidado de ChapasPage.jsx).
const DIACRITICS_RE = new RegExp('[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']', 'g')
function slugify(str) {
  return (str || '').toLowerCase()
    .normalize('NFD').replace(DIACRITICS_RE, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim().replace(/\s+/g, '-')
}

function text(el, tag) {
  return el.getElementsByTagName(tag)[0]?.textContent?.trim() || ''
}

// Bloco de comentário do editor Gutenberg (`<!-- wp:paragraph -->`) —
// sobra em qualquer export de WordPress moderno, não é conteúdo de
// verdade, só "sujeira" que apareceria literalmente pro leitor.
function cleanContent(html) {
  return (html || '').replace(/<!--\s*\/?wp:[\s\S]*?-->/g, '').trim()
}

function mapStatus(wpStatus) {
  return wpStatus === 'publish' ? 'published' : 'draft'
}

function parseDate(wpDateGmt) {
  if (!wpDateGmt || wpDateGmt.startsWith('0000')) return null
  const d = new Date(wpDateGmt.replace(' ', 'T') + 'Z')
  return isNaN(d.getTime()) ? null : d.toISOString()
}

// Lê um arquivo de exportação do WordPress (Ferramentas → Exportar →
// Posts, formato WXR/.xml) e devolve os posts prontos pra pré-visualizar
// e importar pra `blog_posts`. Roda inteiro no navegador (DOMParser),
// sem precisar subir o arquivo pra lugar nenhum antes de decidir o que
// importar.
export function parseWordPressExport(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml')
  if (doc.querySelector('parsererror')) {
    throw new Error('Arquivo XML inválido — confirme que é o export do WordPress (Ferramentas → Exportar).')
  }

  const items = Array.from(doc.getElementsByTagName('item'))

  // 1ª passada: mapeia anexos (imagens) por post_id, pra resolver a
  // imagem destacada (_thumbnail_id) de cada post na 2ª passada.
  const attachmentUrlById = new Map()
  for (const item of items) {
    if (text(item, 'wp:post_type') !== 'attachment') continue
    const id = text(item, 'wp:post_id')
    const url = text(item, 'wp:attachment_url')
    if (id && url) attachmentUrlById.set(id, url)
  }

  const posts = []
  let skippedOther = 0

  for (const item of items) {
    const postType = text(item, 'wp:post_type')
    if (postType !== 'post') { if (postType && postType !== 'attachment') skippedOther++; continue }

    const wpStatus = text(item, 'wp:status')
    if (wpStatus === 'trash' || wpStatus === 'auto-draft') { skippedOther++; continue }

    const title = text(item, 'title') || '(sem título)'
    const wpId = text(item, 'wp:post_id')
    const slug = slugify(text(item, 'wp:post_name') || title)
    const contentHtml = cleanContent(text(item, 'content:encoded'))
    let excerpt = text(item, 'excerpt:encoded')
    if (!excerpt) excerpt = stripHtml(contentHtml).slice(0, 160)

    const thumbId = Array.from(item.getElementsByTagName('wp:postmeta'))
      .find(meta => text(meta, 'wp:meta_key') === '_thumbnail_id')
    const coverUrl = thumbId ? attachmentUrlById.get(text(thumbId, 'wp:meta_value')) || null : null

    // WordPress mistura "categoria" (domain="category") e "tag"
    // (domain="post_tag") no mesmo elemento <category> — separados
    // aqui porque viram coisas diferentes no nosso schema: categoria é
    // 1 por post (blog_categories, pra filtrar a listagem), tag
    // continua livre/múltipla (blog_posts.tags).
    const categoryEls = Array.from(item.getElementsByTagName('category'))
    const categoryName = categoryEls.find(c => (c.getAttribute('domain') || 'category') === 'category')?.textContent?.trim() || null
    const tags = categoryEls
      .filter(c => c.getAttribute('domain') === 'post_tag')
      .map(c => c.textContent?.trim())
      .filter(Boolean)
      .filter((v, i, arr) => arr.indexOf(v) === i)

    const status = mapStatus(wpStatus)
    const publishedAt = status === 'published' ? parseDate(text(item, 'wp:post_date_gmt') || text(item, 'wp:post_date')) : null

    posts.push({
      wpId,
      wpStatus,
      title,
      slug,
      excerpt: excerpt.slice(0, 300),
      content_html: contentHtml,
      cover_image_url: coverUrl,
      categoryName,
      tags,
      status,
      published_at: publishedAt,
      meta_title: title.slice(0, 60),
      meta_description: excerpt.slice(0, 156),
      focus_keyword: null,
      ai_generated: false,
      selected: true,
    })
  }

  return { posts, skippedOther }
}
