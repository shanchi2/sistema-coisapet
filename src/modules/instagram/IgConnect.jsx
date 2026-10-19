import { useState } from 'react'
import { Loader2, CheckCircle2, KeyRound, ExternalLink, Unplug, ShieldCheck, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { igCall, fmtDateTime, fmtInt } from './igApi'

const STEPS = [
  <>Entre em <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer" className="font-semibold text-pink-600 underline">developers.facebook.com/apps</a> com o seu Facebook e clique em <b>Criar app</b>.</>,
  <>Em “Casos de uso”, escolha <b>Gerenciar mensagens e conteúdo no Instagram</b> (Instagram API). Nome do app: <i>CoisaPet Sistema</i>. Tipo: <b>Empresa</b>.</>,
  <>No painel do app, abra <b>Casos de uso → Instagram → Configuração da API com login do Instagram</b>.</>,
  <>Na etapa <b>“Gerar tokens de acesso”</b>, clique em <b>Adicionar conta</b>, entre com a <b>@coisapet</b> e autorize <u>todas</u> as permissões (perfil, publicar conteúdo, comentários e mensagens).</>,
  <>Ainda nessa tela, clique em <b>Gerar token</b> ao lado da @coisapet e copie o token inteiro (começa com <code className="bg-slate-100 px-1 rounded">IG</code> e é bem comprido).</>,
  <>Cole aqui embaixo e clique em <b>Conectar</b>. Pronto — o sistema renova o token sozinho todo dia, ele não vence.</>,
]

export function IgConnect({ account, isAdmin, onChanged }) {
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(null)
  const connected = !!account?.connected_at

  async function connect() {
    setBusy('connect')
    try {
      const r = await igCall('connect', { access_token: token.trim() })
      setToken('')
      toast.success(`Conectado como @${r.username}!`)
      if (r.sync?.error) toast.error(`Conectou, mas a 1ª atualização falhou: ${r.sync.error}`)
      onChanged()
    } catch (e) { toast.error(e.message) } finally { setBusy(null) }
  }
  async function disconnect() {
    if (!confirm('Desconectar o Instagram do sistema? Posts agendados param de sair até reconectar.')) return
    setBusy('disconnect')
    try { await igCall('disconnect'); toast.success('Desconectado'); onChanged() }
    catch (e) { toast.error(e.message) } finally { setBusy(null) }
  }

  return (
    <div className="grid lg:grid-cols-2 gap-4 items-start">
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <p className="font-bold text-slate-800 flex items-center gap-2 mb-3">
          {connected ? <CheckCircle2 className="text-emerald-500" size={20} /> : <Unplug className="text-slate-400" size={20} />}
          {connected ? `Conectado: @${account.username}` : 'Conta não conectada'}
        </p>
        {connected && (
          <dl className="grid grid-cols-2 gap-y-2 text-sm mb-4">
            <dt className="text-slate-500">Conectado por</dt><dd className="text-slate-700">{account.connected_by || '—'} · {fmtDateTime(account.connected_at)}</dd>
            <dt className="text-slate-500">Última atualização</dt><dd className="text-slate-700">{fmtDateTime(account.last_sync_at)}</dd>
            <dt className="text-slate-500">Token válido até</dt><dd className="text-slate-700">{account.token_expires_at ? `${fmtDateTime(account.token_expires_at)} (renova sozinho)` : '—'}</dd>
            <dt className="text-slate-500">Posts pela API (24h)</dt><dd className="text-slate-700">{account.publish_quota ? `${fmtInt(account.publish_quota.used)} de ${fmtInt(account.publish_quota.total)}` : '—'}</dd>
          </dl>
        )}
        {account?.last_sync_error && <p className="text-sm text-red-600 flex gap-1.5 mb-3"><AlertTriangle size={15} className="shrink-0 mt-0.5" /> {account.last_sync_error}</p>}

        {isAdmin ? (
          <>
            <label className="text-xs font-semibold text-slate-500 uppercase">{connected ? 'Trocar token' : 'Token de acesso do Instagram'}</label>
            <div className="flex gap-2 mt-1">
              <input type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} placeholder="IGAA…"
                className="flex-1 text-sm border border-slate-200 rounded-xl px-3 py-2 font-mono" />
              <button onClick={connect} disabled={token.trim().length < 50 || !!busy}
                className="px-4 rounded-xl bg-gradient-to-r from-pink-500 to-violet-600 text-white text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50">
                {busy === 'connect' ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />} Conectar
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-2 flex gap-1.5"><ShieldCheck size={13} className="shrink-0 text-emerald-500" /> O token vai direto pro servidor e fica guardado num cofre que nem o sistema lê — nunca aparece em tela, arquivo ou navegador de ninguém.</p>
            {connected && (
              <button onClick={disconnect} disabled={!!busy} className="mt-4 text-xs text-red-500 hover:underline flex items-center gap-1">
                {busy === 'disconnect' ? <Loader2 size={12} className="animate-spin" /> : <Unplug size={12} />} Desconectar
              </button>
            )}
          </>
        ) : <p className="text-sm text-slate-500">Só a Diretoria conecta ou troca a conta.</p>}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <p className="font-bold text-slate-800 mb-3">Como conectar (uma vez só, ~10 min)</p>
        <ol className="flex flex-col gap-3">
          {STEPS.map((s, i) => (
            <li key={i} className="flex gap-3 text-sm text-slate-600">
              <span className="w-6 h-6 rounded-full bg-pink-100 text-pink-700 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
        <div className="mt-4 bg-slate-50 rounded-xl p-3 text-xs text-slate-500 flex flex-col gap-1.5">
          <p><b>Se pedir “testador”:</b> no app da Meta vá em <b>Funções do app → Funções → Testadores do Instagram</b>, adicione <i>coisapet</i> e aceite o convite no Instagram (Configurações → Apps e sites → Convites de testador).</p>
          <p><b>Directs:</b> no Instagram do celular, ative <b>Configurações → Mensagens e respostas → Ferramentas conectadas → Permitir acesso às mensagens</b>.</p>
          <p>Não precisa publicar o app nem passar por revisão da Meta: ele fica em “desenvolvimento” e funciona pra própria conta da CoisaPet.</p>
          <a href="https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login" target="_blank" rel="noreferrer" className="text-pink-600 font-semibold flex items-center gap-1">Documentação oficial <ExternalLink size={11} /></a>
        </div>
      </div>
    </div>
  )
}
