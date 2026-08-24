import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Link2, Unlink } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'

// Link de autorização não precisa de Edge Function — client_id não é
// secreto, só o client_secret (fica só no backend, nunca aqui).
function buildAuthorizeUrl() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const clientId     = import.meta.env.VITE_ML_CLIENT_ID
  const redirectUri  = `${supabaseUrl}/functions/v1/ml-oauth-callback`
  const params = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri })
  return `https://auth.mercadolivre.com.br/authorization?${params}`
}

function fmtTime(d) {
  if (!d) return null
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function MercadoLivreConnect() {
  const [status, setStatus]   = useState(null) // { connected, ml_nickname, last_sync_at }
  const [loading, setLoading] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()

  async function loadStatus() {
    const { data, error } = await supabase.rpc('ml_connection_status')
    if (!error && data?.[0]) setStatus(data[0])
  }

  useEffect(() => { loadStatus() }, [])

  // Feedback do redirect de volta do ml-oauth-callback (?ml=conectado|erro)
  useEffect(() => {
    const ml = searchParams.get('ml')
    if (!ml) return
    if (ml === 'conectado') { toast.success('Mercado Livre conectado!'); loadStatus() }
    else if (ml === 'erro')  toast.error('Erro ao conectar com o Mercado Livre. Tente novamente.')
    setSearchParams(prev => { const p = new URLSearchParams(prev); p.delete('ml'); p.delete('ml_detail'); return p }, { replace: true })
  }, [searchParams])

  async function disconnect() {
    if (!confirm('Desconectar o Mercado Livre? A sincronização automática de pedidos vai parar — a importação manual do .xlsx continua funcionando.')) return
    setLoading(true)
    try {
      const { error } = await supabase.rpc('ml_disconnect')
      if (error) throw error
      toast.success('Mercado Livre desconectado.')
      setStatus({ connected: false })
    } catch (err) {
      toast.error('Erro ao desconectar: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!status) return null

  if (status.connected) {
    return (
      <div className="flex items-center gap-2 text-xs font-semibold bg-emerald-50 text-emerald-700 px-3 py-2 rounded-xl">
        <Link2 size={13} />
        <span>ML conectado{status.ml_nickname ? `: ${status.ml_nickname}` : ''}{status.last_sync_at ? ` · sync ${fmtTime(status.last_sync_at)}` : ''}</span>
        <button onClick={disconnect} disabled={loading} title="Desconectar" className="text-emerald-600 hover:text-rose-600 transition-colors">
          <Unlink size={13} />
        </button>
      </div>
    )
  }

  return (
    <a href={buildAuthorizeUrl()} className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 px-3 py-2 rounded-xl transition-colors">
      <Link2 size={13} /> Conectar Mercado Livre
    </a>
  )
}
