import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Instagram, RefreshCw, Loader2, LayoutDashboard, CalendarDays, MessageCircle, Send, Settings, Plus, AlertTriangle, UserPlus } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { igCall, fmtInt, timeAgo } from './igApi'
import { IgDashboard } from './IgDashboard'
import { IgCalendar } from './IgCalendar'
import { IgComments } from './IgComments'
import { IgDirects } from './IgDirects'
import { IgConnect } from './IgConnect'
import { IgFollowers } from './IgFollowers'
import { IgComposer } from './IgComposer'

// Instagram dentro do sistema (19/10, pedido do Raphael): painel de métricas,
// calendário com agendamento (o cron publica sozinho), comentários e directs.
// Acesso: Diretoria + Atendimento + Marketing (módulo `instagram`).

const TABS = [
  { key: 'painel',      label: 'Painel',      icon: LayoutDashboard },
  { key: 'seguidores',  label: 'Seguidores',  icon: UserPlus },
  { key: 'calendario',  label: 'Calendário',  icon: CalendarDays },
  { key: 'comentarios', label: 'Comentários', icon: MessageCircle },
  { key: 'directs',     label: 'Directs',     icon: Send },
  { key: 'conta',       label: 'Conta',       icon: Settings },
]

export function InstagramPage() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const tab = TABS.some(t => t.key === params.get('aba')) ? params.get('aba') : 'painel'
  const setTab = k => setParams(p => { const n = new URLSearchParams(p); n.set('aba', k); return n }, { replace: true })

  const [account, setAccount] = useState(null)
  const [daily, setDaily] = useState([])
  const [media, setMedia] = useState([])
  const [posts, setPosts] = useState([])
  const [pendingComments, setPendingComments] = useState(0)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [composer, setComposer] = useState(null)   // null | { post?, date? }

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 120 * 86400e3).toISOString().slice(0, 10)
    const [a, d, m, p, c] = await Promise.all([
      supabase.from('ig_account').select('*').eq('id', 1).maybeSingle(),
      supabase.from('ig_account_daily').select('*').gte('day', since).order('day'),
      supabase.from('ig_media').select('*').order('posted_at', { ascending: false }).limit(200),
      supabase.from('ig_posts').select('*').order('scheduled_at', { ascending: true, nullsFirst: false }).limit(500),
      supabase.from('ig_comments').select('id', { count: 'exact', head: true }).eq('from_self', false).eq('answered', false).eq('done', false).eq('hidden', false).is('parent_id', null),
    ])
    setAccount(a.data || null); setDaily(d.data || []); setMedia(m.data || []); setPosts(p.data || [])
    setPendingComments(c.count || 0)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  // posts "publicando" mudam sozinhos (cron) — recarrega de vez em quando
  useEffect(() => {
    const busy = posts.some(p => p.status === 'publicando')
    const id = setInterval(load, busy ? 8000 : 60000)
    return () => clearInterval(id)
  }, [posts, load])

  async function sync() {
    setSyncing(true)
    try {
      const r = await igCall('sync')
      toast.success(`Atualizado: ${r.media} posts`)
      await load()
    } catch (e) { toast.error(e.message) } finally { setSyncing(false) }
  }

  const connected = !!account?.connected_at || !!account?.last_sync_at && !account?.last_sync_error
  const isAdmin = user?.role === 'admin'

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-400 via-pink-500 to-violet-600 flex items-center justify-center shrink-0 overflow-hidden">
          {account?.profile_picture_url
            ? <img src={account.profile_picture_url} alt="" className="w-full h-full object-cover" />
            : <Instagram size={22} className="text-white" />}
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-800 leading-tight">Instagram {account?.username && <span className="text-slate-400 font-semibold">@{account.username}</span>}</h1>
          <p className="text-xs text-slate-500">
            {account?.followers_count != null ? <>{fmtInt(account.followers_count)} seguidores · {fmtInt(account.media_count)} posts · </> : null}
            {account?.last_sync_at ? `atualizado há ${timeAgo(account.last_sync_at)}` : 'ainda não sincronizado'}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={sync} disabled={syncing || !connected}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            {syncing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Atualizar
          </button>
          <button onClick={() => setComposer({})} disabled={!connected}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-pink-500 to-violet-600 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
            <Plus size={16} /> Novo post
          </button>
        </div>
      </div>

      {account?.last_sync_error && (
        <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-3 py-2 text-sm">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>Última atualização falhou: {account.last_sync_error}{isAdmin && ' — se o token expirou, reconecte na aba Conta.'}</span>
        </div>
      )}

      {/* Abas */}
      <div className="flex gap-1 mb-5 overflow-x-auto border-b border-slate-200">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors ${tab === t.key ? 'border-pink-500 text-pink-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            <t.icon size={15} /> {t.label}
            {t.key === 'comentarios' && pendingComments > 0 && <span className="ml-0.5 text-[10px] font-bold bg-pink-500 text-white rounded-full px-1.5 py-0.5">{pendingComments}</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-slate-400" /></div>
      ) : !connected && tab !== 'conta' ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center max-w-lg mx-auto">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-amber-400 via-pink-500 to-violet-600 flex items-center justify-center mb-3"><Instagram className="text-white" /></div>
          <p className="font-bold text-slate-800">Instagram ainda não conectado</p>
          <p className="text-sm text-slate-500 mt-1">{isAdmin ? 'Conecte a conta @coisapet na aba Conta (leva uns 10 minutos, com o passo a passo).' : 'Peça pra Diretoria conectar a conta @coisapet.'}</p>
          {isAdmin && <button onClick={() => setTab('conta')} className="mt-4 px-4 py-2 rounded-xl bg-pink-500 text-white text-sm font-semibold">Ir pra Conta</button>}
        </div>
      ) : tab === 'painel' ? (
        <IgDashboard account={account} daily={daily} media={media} posts={posts} onOpenPost={p => setComposer({ post: p })} />
      ) : tab === 'seguidores' ? (
        <IgFollowers account={account} media={media} />
      ) : tab === 'calendario' ? (
        <IgCalendar posts={posts} media={media} account={account} onNew={date => setComposer({ date })} onOpen={p => setComposer({ post: p })} />
      ) : tab === 'comentarios' ? (
        <IgComments media={media} account={account} onChanged={load} />
      ) : tab === 'directs' ? (
        <IgDirects account={account} />
      ) : (
        <IgConnect account={account} isAdmin={isAdmin} onChanged={load} />
      )}

      {composer && (
        <IgComposer
          initial={composer.post} initialDate={composer.date} account={account}
          onClose={() => setComposer(null)}
          onSaved={() => { setComposer(null); load() }}
        />
      )}
    </div>
  )
}
