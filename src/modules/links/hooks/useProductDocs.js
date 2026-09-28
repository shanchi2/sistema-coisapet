import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import toast from 'react-hot-toast'

// Manuais/instruções/vídeo por produto — página pública em
// coisapet.com.br/doc/<products.slug>. Um produto pode ter vários
// recursos (manual, instruções, vídeo...), cada um "link" (URL externa,
// ex: YouTube) ou "file" (upload de .html/.pdf, bucket product-docs).
export function useProductDocs() {
  const [groups,  setGroups]  = useState([]) // [{ product, resources: [] }]
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('product_doc_resources')
      .select('id, label, kind, url, file_path, sort_order, product_id, product:products(id, name, doc_title, sku, slug, photo_url)')
      .order('sort_order')

    if (error) {
      toast.error('Erro ao carregar manuais.')
      console.error(error)
      setLoading(false)
      return
    }

    const map = new Map()
    ;(data ?? []).forEach(row => {
      if (!row.product) return // produto pode ter sido desativado/removido
      if (!map.has(row.product_id)) map.set(row.product_id, { product: row.product, resources: [] })
      map.get(row.product_id).resources.push(row)
    })
    setGroups(Array.from(map.values()).sort((a, b) => a.product.name.localeCompare(b.product.name)))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function searchProducts(query) {
    if (!query.trim()) return []
    const { data } = await supabase
      .from('products')
      .select('id, name, doc_title, sku, slug, photo_url')
      .eq('active', true)
      .ilike('name', `%${query}%`)
      .order('name')
      .limit(15)
    return data ?? []
  }

  async function addResource(productId, { label, kind, url, file }) {
    try {
      let filePath = null
      if (kind === 'file') {
        if (!file) throw new Error('Selecione um arquivo.')
        if (file.size > 10 * 1024 * 1024) throw new Error('Máx 10 MB.')
        const ext  = file.name.split('.').pop().toLowerCase()
        const path = `docs/${productId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        // O navegador às vezes manda `file.type` vazio pra .html (o supabase-js
        // cai pra 'text/plain' nesse caso — o arquivo abre como texto cru em
        // vez de renderizar a página). Fixamos pela extensão pra não depender disso.
        const contentType = ext === 'pdf' ? 'application/pdf' : 'text/html'
        const { error: upErr } = await supabase.storage.from('product-docs').upload(path, file, { contentType })
        if (upErr) throw upErr
        filePath = path
      }

      const existing = groups.find(g => g.product.id === productId)
      const sortOrder = existing?.resources.length || 0

      const { error } = await supabase.from('product_doc_resources').insert({
        product_id: productId, label: label.trim(), kind,
        url: kind === 'link' ? url.trim() : null,
        file_path: filePath, sort_order: sortOrder,
      })
      if (error) throw error

      toast.success('Recurso adicionado!')
      await load()
    } catch (err) {
      toast.error('Erro: ' + err.message)
      console.error(err)
    }
  }

  // Editar um recurso já salvo (28/09): título do link, URL (se for link) e,
  // pra manual em arquivo, o HTML novo (ex: nome do produto trocado). O
  // HTML vai pra um caminho NOVO no bucket (evita o cache do storage/CDN
  // continuar servindo a versão antiga) e o arquivo antigo é apagado.
  async function updateResource(resource, { label, url, html }) {
    try {
      const patch = { label: label.trim() }
      if (resource.kind === 'link' && url != null) patch.url = url.trim()
      let oldPath = null
      if (html != null && resource.file_path) {
        const path = `docs/${resource.product_id}/${Date.now()}-${Math.random().toString(36).slice(2)}.html`
        const file = new File([html], 'manual.html', { type: 'text/html' })
        const { error: upErr } = await supabase.storage.from('product-docs').upload(path, file, { contentType: 'text/html' })
        if (upErr) throw upErr
        patch.file_path = path
        oldPath = resource.file_path
      }
      const { error } = await supabase.from('product_doc_resources').update(patch).eq('id', resource.id)
      if (error) throw error
      if (oldPath) await supabase.storage.from('product-docs').remove([oldPath])
      toast.success('Manual atualizado!')
      await load()
    } catch (err) {
      toast.error('Erro ao salvar: ' + err.message)
      console.error(err)
      throw err
    }
  }

  // Nome do produto nas páginas de manuais (fase80) — vazio = nome do cadastro
  async function setDocTitle(productId, title) {
    const { error } = await supabase.from('products').update({ doc_title: title?.trim() || null }).eq('id', productId)
    if (error) { toast.error('Erro ao salvar o nome: ' + error.message); throw error }
    toast.success('Nome dos manuais atualizado!')
    await load()
  }

  async function removeResource(id) {
    const resource = groups.flatMap(g => g.resources).find(r => r.id === id)
    if (!resource) return
    try {
      if (resource.file_path) await supabase.storage.from('product-docs').remove([resource.file_path])
      const { error } = await supabase.from('product_doc_resources').delete().eq('id', id)
      if (error) throw error
      toast.success('Recurso removido.')
      await load()
    } catch (err) {
      toast.error('Erro ao remover: ' + err.message)
      console.error(err)
    }
  }

  return { groups, loading, searchProducts, addResource, updateResource, removeResource, setDocTitle }
}
