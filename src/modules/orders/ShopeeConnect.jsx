import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Link2, Unlink } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'

function fmtTime(d) {
  if (!d) return null
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function ShopeeConnect() {
  const [status, setStatus]   = useState(null) // { connected, shop_name, is_sandbox, last_sync_at }
  const [loading, setLoading] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()

  async function loadStatus() {
    const { data, error } = await supabase.rpc('shopee_connection_status')
    if (!error && data?.[0]) setStatus(data[0])
  }

  useEffect(() => { loadStatus() }, [])

  // Feedback do redirect de volta do shopee-oauth-callback (?shopee=conectado|erro)
  useEffect(() => {
    const shopee = searchParams.get('shopee')
    if (!shopee) return
    if (shopee === 'conectado') { toast.success('Shopee conectada!'); loadStatus() }
    else if (shopee === 'erro')  toast.error('Erro ao conectar com a Shopee. Tente novamente.')
    setSearchParams(prev => { const p = new URLSearchParams(prev); p.delete('shopee'); p.delete('shopee_detail'); return p }, { replace: true })
  }, [searchParams])

  async function disconnect() {
    if (!confirm('Desconectar a Shopee?')) return
    setLoading(true)
    try {
      const { error } = await supabase.rpc('shopee_disconnect')
      if (error) throw error
      toast.success('Shopee desconectada.')
      setStatus({ connected: false })
    } catch (err) {
      toast.error('Erro ao desconectar: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!status) return null

  const authorizeUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shopee-oauth-callback`

  if (status.connected) {
    return (
      <div className="flex items-center gap-2 text-xs font-semibold bg-orange-50 text-orange-700 px-3 py-2 rounded-xl">
        <Link2 size={13} />
        <span>
          Shopee conectada{status.is_sandbox ? ' (sandbox)' : ''}{status.shop_name ? `: ${status.shop_name}` : ''}
          {status.last_sync_at ? ` · última venda recebida ${fmtTime(status.last_sync_at)}` : ''}
        </span>
        <button onClick={disconnect} disabled={loading} title="Desconectar" className="text-orange-600 hover:text-rose-600 transition-colors">
          <Unlink size={13} />
        </button>
      </div>
    )
  }

  return (
    <a href={authorizeUrl} className="flex items-center gap-1.5 text-xs font-semibold text-orange-700 bg-orange-50 hover:bg-orange-100 px-3 py-2 rounded-xl transition-colors">
      <Link2 size={13} /> Conectar Shopee
    </a>
  )
}
