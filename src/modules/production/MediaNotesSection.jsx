import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { StickyNote, Paperclip, Send, Loader2, CheckCircle2, RotateCcw, Trash2, X, PlayCircle } from 'lucide-react'
import { MediaViewer, MediaThumb } from '../../components/ui/MediaViewer'
import { useMediaNotes, notePublicUrl } from './hooks/useMediaNotes'

// Observações do produto com fotos/vídeos (06/10, fase98). Fica na tela
// do produto em Atualização de Mídia — atendimento relata, produção (Vini,
// login producao@) vê, revisa e marca "Resolvido".

const fmtWhen = iso => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
const MAX_FILES = 10

export function MediaNotesSection({ productId }) {
  const { notes, loading, addNote, setStatus, removeNote } = useMediaNotes(productId)
  const [body, setBody] = useState('')
  const [files, setFiles] = useState([])
  const [sending, setSending] = useState(null) // "2/3" enquanto envia
  const [viewer, setViewer] = useState(null)   // { items, index }
  const inputRef = useRef()
  const openCount = notes.filter(n => n.status === 'aberto').length

  function pickFiles(e) {
    const picked = [...(e.target.files || [])]
    e.target.value = ''
    const ok = picked.filter(f => /^(image|video)\//.test(f.type) || /\.(heic|heif|mov)$/i.test(f.name))
    if (ok.length < picked.length) toast.error('Só fotos e vídeos.')
    const big = ok.filter(f => f.size > 100 * 1024 * 1024)
    if (big.length) toast.error('Vídeo acima de 100 MB não sobe — corte ou grave em qualidade menor.')
    setFiles(prev => [...prev, ...ok.filter(f => f.size <= 100 * 1024 * 1024)].slice(0, MAX_FILES))
  }

  async function submit() {
    if (!body.trim() && !files.length) { toast.error('Escreva a observação ou anexe uma foto/vídeo.'); return }
    try {
      setSending('…')
      await addNote(body, files, (i, n) => setSending(`${i}/${n}`))
      setBody(''); setFiles([])
      toast.success('Observação registrada!')
    } catch (e) {
      toast.error(e.message || 'Erro ao salvar a observação.')
    } finally {
      setSending(null)
    }
  }

  async function act(fn, ok) {
    try { await fn(); if (ok) toast.success(ok) } catch (e) { toast.error(e.message || 'Erro.') }
  }

  return (
    <section className="bg-white border border-slate-100 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center shrink-0"><StickyNote size={16} className="text-slate-400" /></div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-700">Observações</p>
          <p className="text-[11px] text-slate-400">Problemas no produto/projeto, com fotos e vídeos — a produção vê e marca como resolvido.</p>
        </div>
        {openCount > 0 && <span className="ml-auto text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full shrink-0">{openCount} em aberto</span>}
      </div>

      {/* Nova observação */}
      <div className="rounded-xl border border-slate-200 p-2.5 mb-4">
        <textarea value={body} onChange={e => setBody(e.target.value)} rows={3} className="w-full text-sm bg-transparent outline-none resize-y placeholder:text-slate-400"
          placeholder="Ex: Isa relatou que ficou um vão entre a plataforma e as escadas — projeto precisa ser revisado (aproximar as peças)." />
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {files.map((f, i) => (
              <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
                {f.type.startsWith('video/')
                  ? <span className="w-full h-full flex items-center justify-center text-slate-500"><PlayCircle size={20} /></span>
                  : <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />}
                <button onClick={() => setFiles(fs => fs.filter((_, k) => k !== i))} className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5"><X size={10} /></button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between gap-2 mt-2">
          <button type="button" onClick={() => inputRef.current?.click()} disabled={files.length >= MAX_FILES || !!sending}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-violet-600 px-2 py-1.5 rounded-lg hover:bg-violet-50 disabled:opacity-40">
            <Paperclip size={14} /> Anexar fotos/vídeos {files.length > 0 && `(${files.length})`}
          </button>
          <input ref={inputRef} type="file" multiple accept="image/*,video/*" className="hidden" onChange={pickFiles} />
          <button onClick={submit} disabled={!!sending} className="btn-primary text-xs flex items-center gap-1.5 disabled:opacity-60">
            {sending ? <><Loader2 size={13} className="animate-spin" /> Enviando {sending}</> : <><Send size={13} /> Registrar</>}
          </button>
        </div>
      </div>

      {/* Histórico */}
      {loading ? (
        <p className="text-xs text-slate-400 text-center py-4">Carregando…</p>
      ) : notes.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-4">Nenhuma observação ainda.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {notes.map(n => {
            const items = (n.media || []).map(m => ({ url: notePublicUrl(m.path), type: m.type, label: m.name }))
            const resolved = n.status === 'resolvido'
            return (
              <li key={n.id} className={`rounded-xl border p-3 ${resolved ? 'border-slate-100 bg-slate-50/60' : 'border-amber-200 bg-amber-50/40'}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[11px] text-slate-400">
                    <b className="text-slate-600">{n.created_by_name || 'Alguém'}</b> · {fmtWhen(n.created_at)}
                  </p>
                  {resolved
                    ? <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full shrink-0"><CheckCircle2 size={11} />Resolvido</span>
                    : <span className="text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full shrink-0">Em aberto</span>}
                </div>
                {n.body && <p className={`text-sm mt-1 whitespace-pre-wrap ${resolved ? 'text-slate-500' : 'text-slate-700'}`}>{n.body}</p>}
                {items.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {items.map((it, i) => <MediaThumb key={i} item={it} size="w-20 h-20" onClick={() => setViewer({ items, index: i })} />)}
                  </div>
                )}
                <div className="flex items-center gap-1 mt-2 -ml-1.5">
                  {resolved ? (
                    <>
                      <span className="text-[11px] text-slate-400 px-1.5">Resolvido por {n.resolved_by_name || '—'} em {fmtWhen(n.resolved_at)}</span>
                      <button onClick={() => act(() => setStatus(n, 'aberto'))} className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 flex items-center gap-1 px-1.5 py-1 rounded-md hover:bg-slate-100"><RotateCcw size={11} />Reabrir</button>
                    </>
                  ) : (
                    <button onClick={() => act(() => setStatus(n, 'resolvido'), 'Marcado como resolvido')} className="text-[11px] font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 px-1.5 py-1 rounded-md hover:bg-emerald-50"><CheckCircle2 size={12} />Marcar resolvido</button>
                  )}
                  <button onClick={() => { if (confirm('Apagar esta observação e as mídias dela?')) act(() => removeNote(n), 'Observação apagada') }}
                    className="ml-auto text-[11px] text-slate-300 hover:text-rose-500 flex items-center gap-1 px-1.5 py-1 rounded-md hover:bg-rose-50"><Trash2 size={11} />Apagar</button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {viewer && <MediaViewer items={viewer.items} index={viewer.index} onClose={() => setViewer(null)} />}
    </section>
  )
}
