import { useCallback, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import toast from 'react-hot-toast'

function getSession() {
  try { return JSON.parse(localStorage.getItem('coisapet_session') || '{}') }
  catch { return {} }
}

export function useBlogBanners() {
  const [loading, setLoading] = useState(false)

  const fetchSettings = useCallback(async () => {
    const { data, error } = await supabase.from('blog_banner_settings').select('*').eq('id', 'default').maybeSingle()
    if (error) { toast.error('Erro ao carregar configuração dos banners.'); throw error }
    return data
  }, [])

  const fetchCategories = useCallback(async () => {
    const { data, error } = await supabase.from('product_categories').select('id, name').order('name')
    if (error) throw error
    return data || []
  }, [])

  const updateSettings = useCallback(async (patch) => {
    setLoading(true)
    try {
      const me = getSession()
      const { error } = await supabase.from('blog_banner_settings')
        .update({ ...patch, updated_at: new Date().toISOString(), updated_by: me?.id || null })
        .eq('id', 'default')
      if (error) throw error
      toast.success('Configuração salva.')
    } catch (err) {
      toast.error('Erro ao salvar: ' + err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  // Estatística: total de impressões/cliques no período, quebra por
  // produto e por plataforma. Cliques só aparecem de verdade quando o
  // site público reportar de volta (POST action:'click') — enquanto
  // isso não estiver implementado do lado deles, fica sempre 0, e a
  // tela avisa isso.
  const fetchStats = useCallback(async (days = 30) => {
    setLoading(true)
    try {
      const since = new Date(Date.now() - days * 86400000).toISOString()
      const { data, error } = await supabase
        .from('blog_banner_events')
        .select('event_type, product_id, product_name, platform, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
      if (error) throw error

      const events = data || []
      const impressions = events.filter(e => e.event_type === 'impression')
      const clicks      = events.filter(e => e.event_type === 'click')

      const byProduct = new Map()
      impressions.forEach(e => {
        const key = e.product_name || 'Sem nome'
        const entry = byProduct.get(key) || { name: key, impressions: 0, clicks: 0 }
        entry.impressions++
        byProduct.set(key, entry)
      })
      clicks.forEach(e => {
        const key = e.product_name || 'Sem nome'
        const entry = byProduct.get(key) || { name: key, impressions: 0, clicks: 0 }
        entry.clicks++
        byProduct.set(key, entry)
      })

      const byPlatform = new Map()
      impressions.forEach(e => {
        const key = e.platform || '—'
        byPlatform.set(key, (byPlatform.get(key) || 0) + 1)
      })

      return {
        total_impressions: impressions.length,
        total_clicks: clicks.length,
        ctr: impressions.length ? (clicks.length / impressions.length) * 100 : 0,
        by_product: [...byProduct.values()].sort((a, b) => b.impressions - a.impressions).slice(0, 15),
        by_platform: [...byPlatform.entries()].map(([label, count]) => ({ label, count })),
        recent: events.slice(0, 20),
      }
    } finally {
      setLoading(false)
    }
  }, [])

  return { loading, fetchSettings, fetchCategories, updateSettings, fetchStats }
}
