import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import toast from 'react-hot-toast'

export function useBlogCategories() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading]       = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('blog_categories')
      .select('*')
      .order('name')

    if (error) {
      toast.error('Erro ao carregar categorias do blog.')
      console.error(error)
    } else {
      setCategories(data ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  async function create(payload) {
    const { error } = await supabase.from('blog_categories').insert(payload)
    if (error) { toast.error('Erro ao criar categoria.'); throw error }
    toast.success('Categoria criada!')
    await fetch()
  }

  async function update(id, payload) {
    const { error } = await supabase.from('blog_categories').update(payload).eq('id', id)
    if (error) { toast.error('Erro ao atualizar categoria.'); throw error }
    toast.success('Categoria atualizada!')
    await fetch()
  }

  async function remove(id) {
    const { error } = await supabase.from('blog_categories').delete().eq('id', id)
    if (error) { toast.error('Erro ao excluir categoria.'); throw error }
    toast.success('Categoria removida.')
    await fetch()
  }

  return { categories, loading, refetch: fetch, create, update, remove }
}
