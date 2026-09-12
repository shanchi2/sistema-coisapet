import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import toast from 'react-hot-toast'
import { callBlogAi } from '../blogAi'

function getSession() {
  try { return JSON.parse(localStorage.getItem('coisapet_session') || '{}') }
  catch { return {} }
}

// Mesmo slugify de BlogPostEditorPage.jsx/wpImport.js (duplicado de
// propósito — arquivo pequeno, não vale criar um util compartilhado só
// pra isso). Faixa dos acentos soltos montada via fromCharCode pra
// nunca ter caractere combinante literal no arquivo fonte.
const DIACRITICS_RE = new RegExp('[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']', 'g')
function slugify(str) {
  return (str || '').toLowerCase()
    .normalize('NFD').replace(DIACRITICS_RE, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim().replace(/\s+/g, '-')
}

async function auditLog(action, tableName, recordId, description) {
  try {
    const s = getSession()
    if (!s?.id) return
    await supabase.rpc('audit_log_with_user', {
      p_user_id:     s.id,
      p_action:      action,
      p_table_name:  tableName,
      p_record_id:   recordId,
      p_description: description,
    })
  } catch {}
}

// Lista de posts (sem trash, por padrão) — usada na tela de listagem.
export function useBlogPosts() {
  const [posts,   setPosts]   = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('blog_posts')
      .select('id, title, slug, excerpt, cover_image_url, status, focus_keyword, published_at, scheduled_at, updated_at, author_name, category_id, category:blog_categories(id, name, color)')
      .neq('status', 'trash')
      .order('updated_at', { ascending: false })

    if (error) {
      toast.error('Erro ao carregar posts.')
      console.error(error)
    } else {
      setPosts(data ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  async function moveToTrash(id, title) {
    const { error } = await supabase.from('blog_posts').update({ status: 'trash' }).eq('id', id)
    if (error) { toast.error('Erro ao remover post.'); throw error }
    await auditLog('delete', 'blog_posts', id, `Post "${title}" movido pra lixeira`)
    toast.success('Post removido.')
    await fetch()
  }

  // Resolve nome de categoria (vindo do WordPress) pra category_id —
  // reaproveita categoria existente por nome (sem diferenciar
  // maiúscula/acento) e cria só a que ainda não existe. Sem isso, cada
  // importação criaria categoria duplicada ("Hamsters" vs "hamsters").
  async function resolveCategoryIds(names) {
    const unique = [...new Set(names.filter(Boolean))]
    if (!unique.length) return new Map()

    const { data: existing } = await supabase.from('blog_categories').select('id, name')
    const norm = (s) => s.trim().toLowerCase()
    const byName = new Map((existing || []).map((c) => [norm(c.name), c.id]))

    const missing = unique.filter((n) => !byName.has(norm(n)))
    if (missing.length) {
      const { data: created, error } = await supabase
        .from('blog_categories')
        .insert(missing.map((name) => ({ name })))
        .select('id, name')
      if (!error) created.forEach((c) => byName.set(norm(c.name), c.id))
    }

    const result = new Map()
    unique.forEach((n) => result.set(n, byName.get(norm(n)) ?? null))
    return result
  }

  // Importação do WordPress (WXR) — insere um por um (em vez de um
  // insert em lote) pra um slug duplicado não derrubar a leva inteira;
  // cada linha já vem pronta de wpImport.js (com `categoryName`, ainda
  // sem id), só falta resolver a categoria e o autor (sempre quem está
  // importando agora, não o autor original do WordPress).
  async function bulkImport(rows, onProgress) {
    const s = getSession()
    const categoryIdByName = await resolveCategoryIds(rows.map((r) => r.categoryName))

    let imported = 0, skipped = 0, failed = 0
    for (let i = 0; i < rows.length; i++) {
      const { categoryName, ...row } = rows[i]
      const clean = {
        ...row,
        category_id: categoryName ? (categoryIdByName.get(categoryName) ?? null) : null,
        author_id:   s.id   ?? null,
        author_name: s.name ?? null,
      }
      const { error } = await supabase.from('blog_posts').insert(clean)
      if (error) { error.code === '23505' ? skipped++ : failed++ }
      else imported++
      onProgress?.(i + 1, rows.length)
    }
    if (imported > 0) {
      await auditLog('create', 'blog_posts', 'wp-import', `Importação do WordPress: ${imported} post(s) importado(s)`)
    }
    await fetch()
    return { imported, skipped, failed }
  }

  // Geração em massa via IA — um item por linha (palavra-chave + mini
  // prompt), chama a mesma action 'generate_content' já usada no editor
  // único, um de cada vez (sequencial, não em paralelo — mais fácil de
  // acompanhar progresso e não estoura limite de taxa da OpenAI). Cada
  // sucesso já vira um post `draft` de verdade; falha de um item não
  // derruba os outros. Slug duplicado (raro, mas possível com
  // palavras-chave parecidas) ganha sufixo numérico em vez de falhar.
  async function bulkGenerate(items, onProgress) {
    const s = getSession()
    const results = []

    for (let i = 0; i < items.length; i++) {
      const { keyword, context } = items[i]
      onProgress?.(i, items.length, { phase: 'generating', keyword })
      try {
        const data = await callBlogAi('generate_content', { keyword, context: context || '', target_words: 800 })

        const baseSlug = slugify(data.slug || data.title || keyword)
        const payload = {
          title: data.title || keyword,
          excerpt: data.excerpt || null,
          content_html: data.content_html || '',
          meta_title: data.meta_title || null,
          meta_description: data.meta_description || null,
          tags: Array.isArray(data.secondary_keywords) && data.secondary_keywords.length ? data.secondary_keywords : null,
          focus_keyword: keyword,
          ai_context: context || null,
          ai_target_words: 800,
          ai_generated: true,
          status: 'draft',
          author_id:   s.id   ?? null,
          author_name: s.name ?? null,
        }

        let attempt = 0
        let saved = null
        while (attempt < 5 && !saved) {
          const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`
          const { data: inserted, error: insErr } = await supabase
            .from('blog_posts').insert({ ...payload, slug }).select('id, title').single()
          if (!insErr) { saved = inserted; break }
          if (insErr.code !== '23505') throw insErr
          attempt++
        }
        if (!saved) throw new Error('Não foi possível gerar um slug único.')

        results.push({ keyword, ok: true, id: saved.id, title: saved.title })
      } catch (err) {
        results.push({ keyword, ok: false, error: err.message || String(err) })
      }
      onProgress?.(i + 1, items.length, { phase: 'done', keyword, ok: results[results.length - 1].ok })
    }

    const created = results.filter(r => r.ok).length
    if (created > 0) {
      await auditLog('create', 'blog_posts', 'bulk-generate', `Geração em massa: ${created} post(s) criado(s) como rascunho`)
    }
    await fetch()
    return results
  }

  return { posts, loading, refetch: fetch, moveToTrash, bulkImport, bulkGenerate }
}

// Um post só, com todos os campos — usado na tela de criar/editar.
export function useBlogPost(id) {
  const [post,    setPost]    = useState(null)
  const [loading, setLoading] = useState(!!id)

  const fetch = useCallback(async () => {
    if (!id) { setPost(null); setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase.from('blog_posts').select('*').eq('id', id).maybeSingle()
    if (error) { toast.error('Erro ao carregar post.'); console.error(error) }
    setPost(data ?? null)
    setLoading(false)
  }, [id])

  useEffect(() => { fetch() }, [fetch])

  // payload: todos os campos de blog_posts que fazem sentido editar
  async function save(payload, { silent = false } = {}) {
    const s = getSession()
    const clean = {
      ...payload,
      author_id:   payload.author_id   ?? s.id   ?? null,
      author_name: payload.author_name ?? s.name ?? null,
    }

    if (id) {
      const { error } = await supabase.from('blog_posts').update(clean).eq('id', id)
      if (error) throw error
      await auditLog('update', 'blog_posts', id, `Post "${clean.title}" atualizado`)
      if (!silent) toast.success('Post salvo!')
      await fetch()
      return id
    } else {
      const { data, error } = await supabase.from('blog_posts').insert(clean).select('id').single()
      if (error) throw error
      await auditLog('create', 'blog_posts', data.id, `Post "${clean.title}" criado`)
      if (!silent) toast.success('Post criado!')
      return data.id
    }
  }

  return { post, loading, refetch: fetch, save }
}
