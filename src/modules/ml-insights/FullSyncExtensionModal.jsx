import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Download, KeyRound, Copy, Check, Trash2, Loader2, Monitor } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

// Extensão do Chrome "CoisaPet — Sincronizar Envios Full" (07/10, fase99).
// Sincroniza a Gestão de Envios Full sozinha quando alguém abre a Central
// de Vendedores do ML. Cada computador usa um código próprio, gerado aqui
// por um diretor — só o hash vai pro banco, o código aparece uma vez só.

const ZIP_URL = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/extensao-full-coisapet.zip`

function fmtAgo(iso) {
  if (!iso) return 'nunca sincronizou'
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 60) return `há ${Math.max(1, min)} min`
  const h = Math.round(min / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.round(h / 24)
  return `há ${d} dia${d > 1 ? 's' : ''}`
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}
function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return 'cpf-' + [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
}

function Step({ n, children }) {
  return (
    <li className="flex gap-3">
      <span className="w-6 h-6 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold flex items-center justify-center shrink-0">{n}</span>
      <div className="text-sm text-slate-600 leading-relaxed pt-0.5">{children}</div>
    </li>
  )
}

export function FullSyncExtensionModal({ open, onClose }) {
  const { user } = useAuth()
  const isDirector = user?.role === 'admin'
  const [devices, setDevices] = useState(null)
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState(null) // { label, code }
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('ml_full_sync_tokens')
      .select('id, label, created_by_name, created_at, last_used_at, last_result')
      .is('revoked_at', null).order('created_at')
    if (error) { toast.error('Erro ao carregar os computadores: ' + error.message); return }
    setDevices(data || [])
  }, [])

  useEffect(() => { if (open) { load(); setCreated(null); setCopied(false) } }, [open, load])

  async function generate() {
    const name = label.trim()
    if (!name) { toast.error('Dê um nome pro computador (ex: PC do escritório).'); return }
    setBusy(true)
    try {
      const code = newCode()
      const { error } = await supabase.from('ml_full_sync_tokens').insert({
        label: name, token_hash: await sha256Hex(code),
        created_by: user?.id || null, created_by_name: user?.name || null,
      })
      if (error) throw error
      setCreated({ label: name, code })
      setLabel('')
      load()
    } catch (e) {
      toast.error('Erro ao gerar o código: ' + e.message)
    } finally {
      setBusy(false)
    }
  }

  async function revoke(d) {
    if (!confirm(`Revogar o código de "${d.label}"? A extensão desse computador para de sincronizar até receber um código novo.`)) return
    const { error } = await supabase.from('ml_full_sync_tokens').update({ revoked_at: new Date().toISOString() }).eq('id', d.id)
    if (error) { toast.error('Erro ao revogar: ' + error.message); return }
    toast.success('Código revogado.')
    load()
  }

  async function copy() {
    try { await navigator.clipboard.writeText(created.code); setCopied(true); setTimeout(() => setCopied(false), 2000) }
    catch { toast.error('Não consegui copiar — selecione e copie manualmente.') }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Extensão do Chrome — Envios Full automático"
      subtitle="Com ela instalada, toda vez que alguém abrir a Central de Vendedores do ML a tela daqui se atualiza sozinha (no máximo a cada 2 horas).">
      <div className="flex flex-col gap-6">
        {/* Computadores */}
        <section>
          <h3 className="text-xs font-bold text-slate-500 uppercase mb-2">Computadores com a extensão</h3>
          {devices === null ? (
            <p className="text-xs text-slate-400 py-2"><Loader2 size={13} className="inline animate-spin mr-1" />Carregando…</p>
          ) : devices.length === 0 ? (
            <p className="text-sm text-slate-400 py-2">Nenhum ainda.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {devices.map(d => (
                <li key={d.id} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5">
                  <Monitor size={16} className="text-slate-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-700 truncate">{d.label}</p>
                    <p className="text-[11px] text-slate-400">
                      {d.last_used_at ? `Última sincronização ${fmtAgo(d.last_used_at)} · ${d.last_result || ''}` : 'Ainda não sincronizou'}
                    </p>
                  </div>
                  {isDirector && (
                    <button onClick={() => revoke(d)} title="Revogar código" className="text-slate-300 hover:text-rose-500 p-1.5 rounded-lg hover:bg-rose-50">
                      <Trash2 size={14} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Gerar código */}
        {isDirector ? (
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-1"><KeyRound size={15} className="text-emerald-600" />Gerar código pra um computador</h3>
            <p className="text-xs text-slate-500 mb-3">Um código por computador. Se um PC sair de uso, é só revogar o código dele aqui.</p>
            {created ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-slate-600">Código de <b>{created.label}</b> — copie agora, ele <b>não aparece de novo</b>:</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 font-mono text-sm bg-white border border-emerald-300 rounded-lg px-3 py-2 select-all break-all">{created.code}</code>
                  <button onClick={copy} className="btn-primary text-xs flex items-center gap-1.5 shrink-0">
                    {copied ? <><Check size={13} />Copiado</> : <><Copy size={13} />Copiar</>}
                  </button>
                </div>
                <button onClick={() => setCreated(null)} className="text-xs text-emerald-700 font-semibold self-start mt-1">Gerar outro</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input value={label} onChange={e => setLabel(e.target.value)} onKeyDown={e => e.key === 'Enter' && generate()}
                  placeholder="Nome do computador (ex: PC do escritório)" maxLength={40}
                  className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                <button onClick={generate} disabled={busy} className="btn-primary text-xs flex items-center gap-1.5 shrink-0 disabled:opacity-60">
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />} Gerar código
                </button>
              </div>
            )}
          </section>
        ) : (
          <p className="text-xs text-slate-500 rounded-xl bg-slate-50 px-3 py-2.5">O código de cada computador é gerado por um diretor, aqui nesta mesma tela.</p>
        )}

        {/* Como instalar */}
        <section>
          <h3 className="text-xs font-bold text-slate-500 uppercase mb-3">Como instalar (uma vez em cada computador, ~2 min)</h3>
          <ol className="flex flex-col gap-3">
            <Step n={1}>
              <a href={ZIP_URL} download className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 hover:underline"><Download size={14} />Baixe a extensão (.zip)</a>{' '}
              e descompacte numa pasta que <b>não vai ser apagada</b> (ex: <code className="text-xs bg-slate-100 px-1 rounded">Documentos\CoisaPet</code>). Vai aparecer a pasta <code className="text-xs bg-slate-100 px-1 rounded">extensao-full</code>.
            </Step>
            <Step n={2}>
              No Chrome, digite na barra de endereço <code className="text-xs bg-slate-100 px-1 rounded">chrome://extensions</code> e ligue o <b>Modo do desenvolvedor</b> (canto superior direito).
              <span className="block text-xs text-slate-400">No Edge é <code>edge://extensions</code>, mesmo esquema.</span>
            </Step>
            <Step n={3}>Clique em <b>Carregar sem compactação</b> e escolha a pasta <code className="text-xs bg-slate-100 px-1 rounded">extensao-full</code>.</Step>
            <Step n={4}>Abre sozinha uma tela pedindo o <b>código do computador</b> — cole o código gerado acima e clique em Salvar.</Step>
            <Step n={5}>
              Pronto. Ao abrir a Central de Vendedores do ML (logado como CoisaPet), aparece no canto da tela <i>"CoisaPet · Envios Full sincronizados ✓"</i>.
              Pra forçar na hora, clique no ícone do caminhãozinho verde na barra de extensões (vale fixar ele com o alfinete).
            </Step>
          </ol>
        </section>
      </div>
    </Modal>
  )
}
