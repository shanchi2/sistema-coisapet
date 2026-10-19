import { useMemo, useRef, useState } from 'react'
import { X, Upload, Loader2, Sparkles, ChevronLeft, ChevronRight, Trash2, Send, CalendarClock, Save, ExternalLink, Newspaper, AlertTriangle, Hash, Heart, MessageCircle, Bookmark } from 'lucide-react'
import toast from 'react-hot-toast'
import { igCall, toJpeg, uploadMedia, feedRatioOk, KIND, STATUS, bestHours, toLocalInput, fromLocalInput, fmtDateTime } from './igApi'
import { IgBlogCarousel } from './IgBlogCarousel'

const FITS = {
  original: { label: 'Original', ratio: null },
  '4:5':    { label: '4:5 (retrato)', ratio: 4 / 5 },
  '1:1':    { label: '1:1 (quadrado)', ratio: 1 },
  '9:16':   { label: '9:16 (tela cheia)', ratio: 9 / 16 },
}
const HASHTAG_SETS = [
  { label: 'Hamster', tags: '#hamster #hamstersofinstagram #hamsterlove #hamsterbrasil #roedores #coisapet' },
  { label: 'Pets pequenos', tags: '#petspequenos #roedores #porquinhodaindia #gerbil #coelho #coisapet' },
  { label: 'Terrário', tags: '#terrariohamster #gaiolahamster #enriquecimentoambiental #bemestaranimal #coisapet' },
  { label: 'Feito à mão', tags: '#feitoamao #artesanal #madeira #produtonacional #pequenosnegocios #coisapet' },
]
const TONES = ['carinhoso e informativo', 'divertido e leve', 'educativo (dica prática)', 'vendas (destaque do produto)']

// Criar/editar post. Upload vai pro bucket público `instagram-media` (a Meta
// baixa de lá na hora de publicar); salvar/agendar/publicar vai pela função.
export function IgComposer({ initial, initialDate, account, onClose, onSaved }) {
  const readOnly = initial && (initial.status === 'publicado' || initial.status === 'publicando')
  const [kind, setKind] = useState(initial?.kind || 'IMAGE')
  const [items, setItems] = useState(() => (initial?.media || []).map(m => ({ ...m })))
  const [caption, setCaption] = useState(initial?.caption || '')
  const [when, setWhen] = useState(toLocalInput(initial?.scheduled_at || initialDate || null))
  const [shareToFeed, setShareToFeed] = useState(initial?.share_to_feed !== false)
  const [notes, setNotes] = useState(initial?.notes || '')
  const [fit, setFit] = useState('4:5')
  const [blogPostId, setBlogPostId] = useState(initial?.blog_post_id || null)
  const [busy, setBusy] = useState(null)        // 'upload' | 'save' | 'schedule' | 'publish' | 'delete' | 'ai'
  const [preview, setPreview] = useState(0)
  const [ai, setAi] = useState(null)            // { brief, tone, options }
  const [blogOpen, setBlogOpen] = useState(false)
  const fileRef = useRef(null)

  const hashtags = (caption.match(/#[\p{L}\p{N}_]+/gu) || []).length
  const best = bestHours(account?.online_followers, 3)
  const maxItems = kind === 'CAROUSEL' ? 10 : 1
  const accept = kind === 'IMAGE' ? 'image/*' : kind === 'REELS' ? 'video/mp4,video/quicktime' : 'image/*,video/mp4,video/quicktime'

  const problems = useMemo(() => {
    const p = []
    if (!items.length) p.push('Adicione a foto/vídeo.')
    if (kind === 'CAROUSEL' && items.length && items.length < 2) p.push('Carrossel precisa de pelo menos 2 mídias.')
    if (kind === 'REELS' && items[0] && items[0].type !== 'VIDEO') p.push('Reels precisa ser vídeo.')
    if (kind === 'IMAGE' && items[0]?.type === 'VIDEO') p.push('Pra vídeo, escolha Reels.')
    if (kind !== 'STORIES' && kind !== 'REELS') for (const it of items) if (it.type === 'IMAGE' && it.w && !feedRatioOk(it.w / it.h)) { p.push('Alguma foto está fora da proporção do feed (4:5 a 1,91:1) — reenvie usando "Encaixar em 4:5".'); break }
    if (caption.length > 2200) p.push('Legenda passou de 2.200 caracteres.')
    if (hashtags > 30) p.push('Máximo de 30 hashtags.')
    if (items.some(i => i.uploading)) p.push('Espere o envio terminar.')
    return p
  }, [items, kind, caption, hashtags])

  async function addFiles(files) {
    const list = [...files].slice(0, maxItems - items.length)
    if (!list.length) return toast.error(kind === 'CAROUSEL' ? 'Máximo de 10 mídias' : 'Remova a mídia atual pra trocar')
    setBusy('upload')
    for (const f of list) {
      const tmp = { key: crypto.randomUUID(), uploading: true, type: f.type.startsWith('video') ? 'VIDEO' : 'IMAGE', localUrl: URL.createObjectURL(f) }
      setItems(it => [...it, tmp])
      try {
        let res
        if (tmp.type === 'VIDEO') {
          if (f.size > 100 * 1024 * 1024) throw new Error('Vídeo maior que 100 MB')
          const ext = /quicktime/.test(f.type) ? 'mov' : 'mp4'
          res = { ...(await uploadMedia(f, ext)), type: 'VIDEO' }
        } else {
          const ratio = kind === 'STORIES' ? 9 / 16 : FITS[fit].ratio
          const j = await toJpeg(f, { ratio })
          res = { ...(await uploadMedia(j.blob, 'jpg')), type: 'IMAGE', w: j.width, h: j.height }
        }
        setItems(it => it.map(x => x.key === tmp.key ? { ...res, key: tmp.key, localUrl: tmp.localUrl } : x))
      } catch (e) {
        toast.error(`Falha no envio: ${e.message}`)
        setItems(it => it.filter(x => x.key !== tmp.key))
      }
    }
    setBusy(null)
  }

  const move = (i, d) => setItems(it => { const n = [...it]; const j = i + d; if (j < 0 || j >= n.length) return n; [n[i], n[j]] = [n[j], n[i]]; return n })
  const payload = status => ({
    id: initial?.id, kind, caption, status, scheduled_at: fromLocalInput(when),
    media: items.filter(i => i.url).map(({ url, path, type }) => ({ url, path, type })),
    share_to_feed: shareToFeed, notes: notes || null, blog_post_id: blogPostId,
  })

  async function save(status) {
    if (status === 'agendado') {
      if (problems.length) return toast.error(problems[0])
      if (!when) return toast.error('Escolha data e hora')
      if (new Date(when) < new Date(Date.now() - 60e3)) return toast.error('Esse horário já passou — use "Publicar agora"')
    }
    setBusy(status === 'agendado' ? 'schedule' : 'save')
    try {
      await igCall('save_post', { post: payload(status) })
      toast.success(status === 'agendado' ? `Agendado pra ${fmtDateTime(fromLocalInput(when))}` : 'Rascunho salvo')
      onSaved()
    } catch (e) { toast.error(e.message) } finally { setBusy(null) }
  }

  async function publishNow() {
    if (problems.length) return toast.error(problems[0])
    if (!confirm('Publicar agora no Instagram da CoisaPet?')) return
    setBusy('publish')
    try {
      const { post } = await igCall('save_post', { post: { ...payload('rascunho'), scheduled_at: new Date().toISOString() } })
      const r = await igCall('publish_now', { id: post.id })
      if (r.status === 'publicado') toast.success('Publicado no Instagram! 🎉')
      else if (r.status === 'publicando') toast('A Meta ainda está processando o vídeo — sai sozinho em alguns minutos.', { icon: '⏳' })
      else toast.error(r.error || 'Não publicou')
      onSaved()
    } catch (e) { toast.error(e.message) } finally { setBusy(null) }
  }

  async function remove() {
    if (!confirm(initial.status === 'publicado' ? 'Tirar do calendário? (o post continua no Instagram)' : 'Excluir este post?')) return
    setBusy('delete')
    try { await igCall('delete_post', { id: initial.id }); toast.success('Excluído'); onSaved() }
    catch (e) { toast.error(e.message) } finally { setBusy(null) }
  }

  async function runAi() {
    if (!ai?.brief?.trim()) return toast.error('Conte pra IA do que é o post')
    setBusy('ai')
    try {
      const r = await igCall('ai_caption', { brief: ai.brief, tone: ai.tone, kind })
      setAi(a => ({ ...a, options: r.options }))
    } catch (e) { toast.error(e.message) } finally { setBusy(null) }
  }

  const cur = items[Math.min(preview, Math.max(0, items.length - 1))]

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-start md:items-center justify-center p-2 md:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-5xl shadow-2xl">
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100">
          <p className="font-bold text-slate-800">{initial ? 'Post' : 'Novo post'}</p>
          {initial && <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${STATUS[initial.status].chip}`}>{STATUS[initial.status].label}</span>}
          {initial?.created_by_name && <span className="text-[11px] text-slate-400">criado por {initial.created_by_name}{initial.updated_by_name && initial.updated_by_name !== initial.created_by_name ? ` · editado por ${initial.updated_by_name}` : ''}</span>}
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>

        {initial?.status === 'erro' && initial.error && (
          <div className="mx-5 mt-4 flex gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-3 py-2 text-sm"><AlertTriangle size={16} className="shrink-0 mt-0.5" /> {initial.error}</div>
        )}
        {readOnly && (
          <div className="mx-5 mt-4 flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-3 py-2 text-sm">
            {initial.status === 'publicado' ? <>Publicado em {fmtDateTime(initial.published_at)}.</> : <><Loader2 size={14} className="animate-spin" /> Publicando — a Meta está processando.</>}
            {initial.permalink && <a href={initial.permalink} target="_blank" rel="noreferrer" className="ml-auto flex items-center gap-1 font-semibold underline">Ver no Instagram <ExternalLink size={13} /></a>}
          </div>
        )}

        <div className="grid md:grid-cols-[1fr_320px] gap-5 p-5">
          <div className="flex flex-col gap-4 min-w-0">
            {/* Formato */}
            <div className="flex flex-wrap gap-2">
              {Object.entries(KIND).map(([k, v]) => (
                <button key={k} disabled={readOnly || (items.length > 0 && k !== kind && (k === 'REELS' || kind === 'REELS'))}
                  onClick={() => { setKind(k); if (k !== 'CAROUSEL') setItems(it => it.slice(0, 1)) }}
                  className={`px-3 py-1.5 rounded-xl text-sm font-semibold border transition-colors disabled:opacity-40 ${kind === k ? 'border-pink-400 bg-pink-50 text-pink-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                  {v.emoji} {v.label}
                </button>
              ))}
              {!readOnly && (
                <button onClick={() => setBlogOpen(true)} className="ml-auto px-3 py-1.5 rounded-xl text-sm font-semibold border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 flex items-center gap-1.5">
                  <Newspaper size={14} /> Carrossel a partir do blog
                </button>
              )}
            </div>

            {/* Mídias */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-500 uppercase">{kind === 'CAROUSEL' ? `Mídias (${items.length}/10)` : kind === 'REELS' ? 'Vídeo' : 'Mídia'}</p>
                {!readOnly && kind !== 'STORIES' && kind !== 'REELS' && (
                  <label className="text-xs text-slate-500 flex items-center gap-1.5">Encaixar em
                    <select value={fit} onChange={e => setFit(e.target.value)} className="border border-slate-200 rounded-lg px-1.5 py-1 bg-white">
                      {['4:5', '1:1', 'original'].map(k => <option key={k} value={k}>{FITS[k].label}</option>)}
                    </select>
                  </label>
                )}
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {items.map((it, i) => (
                  <div key={it.key || it.url} className={`relative w-24 h-28 rounded-xl overflow-hidden bg-slate-100 shrink-0 border-2 ${preview === i ? 'border-pink-400' : 'border-transparent'}`} onClick={() => setPreview(i)}>
                    {it.type === 'VIDEO'
                      ? <video src={it.localUrl || it.url} className="w-full h-full object-cover" muted />
                      : <img src={it.localUrl || it.url} alt="" className="w-full h-full object-cover" />}
                    {it.uploading && <div className="absolute inset-0 bg-white/70 flex items-center justify-center"><Loader2 size={18} className="animate-spin text-pink-500" /></div>}
                    <span className="absolute top-1 left-1 text-[10px] font-bold bg-black/50 text-white rounded px-1">{i + 1}</span>
                    {!readOnly && !it.uploading && (
                      <div className="absolute bottom-0 inset-x-0 flex justify-between bg-black/40 text-white">
                        <button onClick={e => { e.stopPropagation(); move(i, -1) }} className="p-1 hover:bg-black/30"><ChevronLeft size={13} /></button>
                        <button onClick={e => { e.stopPropagation(); setItems(x => x.filter((_, j) => j !== i)) }} className="p-1 hover:bg-black/30"><Trash2 size={13} /></button>
                        <button onClick={e => { e.stopPropagation(); move(i, 1) }} className="p-1 hover:bg-black/30"><ChevronRight size={13} /></button>
                      </div>
                    )}
                  </div>
                ))}
                {!readOnly && items.length < maxItems && (
                  <button onClick={() => fileRef.current?.click()} disabled={busy === 'upload'}
                    className="w-24 h-28 rounded-xl border-2 border-dashed border-slate-300 text-slate-400 hover:border-pink-400 hover:text-pink-500 flex flex-col items-center justify-center gap-1 shrink-0">
                    {busy === 'upload' ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                    <span className="text-[11px] font-semibold">{kind === 'REELS' ? 'Vídeo' : 'Adicionar'}</span>
                  </button>
                )}
                <input ref={fileRef} type="file" accept={accept} multiple={kind === 'CAROUSEL'} className="hidden"
                  onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {kind === 'REELS' ? 'MP4/MOV vertical 9:16, de 3 s a 15 min, até 100 MB.' : kind === 'STORIES' ? 'Foto vira 9:16 automaticamente. Vídeo até 60 s.' : 'Fotos viram JPEG automaticamente. No carrossel, todas ficam no mesmo formato da primeira.'}
              </p>
            </div>

            {kind === 'REELS' && (
              <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={shareToFeed} disabled={readOnly} onChange={e => setShareToFeed(e.target.checked)} /> Mostrar também no feed</label>
            )}

            {/* Legenda */}
            {kind !== 'STORIES' && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase">Legenda</p>
                  {!readOnly && <button onClick={() => setAi(a => a ? null : { brief: '', tone: TONES[0] })} className="text-xs font-semibold text-violet-600 flex items-center gap-1 hover:underline"><Sparkles size={13} /> Escrever com IA</button>}
                </div>
                {ai && (
                  <div className="mb-2 bg-violet-50 border border-violet-100 rounded-xl p-3 flex flex-col gap-2">
                    <textarea value={ai.brief} onChange={e => setAi(a => ({ ...a, brief: e.target.value }))} rows={2}
                      placeholder="Do que é o post? Ex: terrário novo de 80 cm com toca de madeira, foto do Pipoca explorando"
                      className="w-full text-sm border border-violet-200 rounded-lg px-2.5 py-1.5 bg-white" />
                    <div className="flex flex-wrap gap-2 items-center">
                      <select value={ai.tone} onChange={e => setAi(a => ({ ...a, tone: e.target.value }))} className="text-xs border border-violet-200 rounded-lg px-2 py-1.5 bg-white">
                        {TONES.map(t => <option key={t}>{t}</option>)}
                      </select>
                      <button onClick={runAi} disabled={busy === 'ai'} className="ml-auto px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-60">
                        {busy === 'ai' ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Gerar 3 opções
                      </button>
                    </div>
                    {ai.options?.map((o, i) => (
                      <button key={i} onClick={() => { setCaption(o.caption); setAi(null) }} className="text-left bg-white border border-violet-100 rounded-lg p-2.5 hover:border-violet-400">
                        <p className="text-[11px] font-bold text-violet-600 mb-0.5">{o.title || `Opção ${i + 1}`} · usar esta</p>
                        <p className="text-xs text-slate-600 whitespace-pre-line line-clamp-6">{o.caption}</p>
                      </button>
                    ))}
                  </div>
                )}
                <textarea value={caption} onChange={e => setCaption(e.target.value)} readOnly={readOnly} rows={8}
                  placeholder="Escreva a legenda… (a 1ª linha é o que aparece antes do “mais”)"
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-200" />
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  {!readOnly && HASHTAG_SETS.map(s => (
                    <button key={s.label} onClick={() => setCaption(c => `${c.trimEnd()}\n\n${s.tags}`.trim())} title={s.tags}
                      className="text-[11px] flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 hover:bg-pink-100 hover:text-pink-700"><Hash size={10} />{s.label}</button>
                  ))}
                  <span className={`ml-auto text-[11px] ${caption.length > 2200 || hashtags > 30 ? 'text-red-600 font-bold' : 'text-slate-400'}`}>{caption.length}/2.200 · {hashtags}/30 hashtags</span>
                </div>
              </div>
            )}

            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Observação interna (não vai pro Instagram)</p>
              <input value={notes} onChange={e => setNotes(e.target.value)} readOnly={readOnly} placeholder="Ex: post do lançamento, aprovar com o Gabriel"
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2" />
            </div>
          </div>

          {/* Pré-visualização + agendamento */}
          <div className="flex flex-col gap-4">
            <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
              <div className="flex items-center gap-2 px-3 py-2">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 via-pink-500 to-violet-600 p-[2px]">
                  {account?.profile_picture_url ? <img src={account.profile_picture_url} alt="" className="w-full h-full rounded-full object-cover border border-white" /> : <div className="w-full h-full rounded-full bg-white" />}
                </div>
                <p className="text-xs font-bold">{account?.username || 'coisapet'}</p>
              </div>
              <div className={`bg-slate-100 relative ${kind === 'STORIES' || kind === 'REELS' ? 'aspect-[9/16] max-h-[420px] mx-auto' : cur?.w ? '' : 'aspect-[4/5]'}`}
                style={cur?.w && kind !== 'STORIES' && kind !== 'REELS' ? { aspectRatio: `${cur.w} / ${cur.h}` } : undefined}>
                {cur ? (cur.type === 'VIDEO'
                  ? <video src={cur.localUrl || cur.url} className="w-full h-full object-cover" controls muted />
                  : <img src={cur.localUrl || cur.url} alt="" className="w-full h-full object-cover" />)
                  : <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">pré-visualização</div>}
                {items.length > 1 && <span className="absolute top-2 right-2 text-[10px] font-bold bg-black/60 text-white rounded-full px-2 py-0.5">{Math.min(preview, items.length - 1) + 1}/{items.length}</span>}
              </div>
              {kind !== 'STORIES' && (
                <div className="px-3 py-2">
                  <div className="flex gap-3 mb-1.5 text-slate-700"><Heart size={18} /><MessageCircle size={18} /><Send size={18} /><Bookmark size={18} className="ml-auto" /></div>
                  <p className="text-xs text-slate-700 whitespace-pre-line line-clamp-4"><b>{account?.username || 'coisapet'}</b> {caption}</p>
                </div>
              )}
            </div>

            {!readOnly && (
              <div className="bg-slate-50 rounded-2xl p-3 flex flex-col gap-2">
                <p className="text-xs font-semibold text-slate-500 uppercase">Quando publicar</p>
                <input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white" />
                {best.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[11px] text-slate-400">Seguidores mais online:</span>
                    {best.map(b => (
                      <button key={b.hour} onClick={() => {
                        const base = when ? new Date(when) : new Date(); base.setHours(b.hour, 0, 0, 0)
                        if (base < new Date()) base.setDate(base.getDate() + 1)
                        setWhen(toLocalInput(base.toISOString()))
                      }} className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 hover:bg-pink-200">{String(b.hour).padStart(2, '0')}h</button>
                    ))}
                  </div>
                )}
                {problems.length > 0 && <p className="text-[11px] text-amber-700">⚠️ {problems[0]}</p>}
                <button onClick={() => save('agendado')} disabled={!!busy}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-gradient-to-r from-pink-500 to-violet-600 text-white text-sm font-semibold disabled:opacity-50">
                  {busy === 'schedule' ? <Loader2 size={15} className="animate-spin" /> : <CalendarClock size={15} />} Agendar
                </button>
                <div className="flex gap-2">
                  <button onClick={() => save('rascunho')} disabled={!!busy}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-600 disabled:opacity-50">
                    {busy === 'save' ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Rascunho
                  </button>
                  <button onClick={publishNow} disabled={!!busy}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-pink-200 bg-white text-sm font-semibold text-pink-600 disabled:opacity-50">
                    {busy === 'publish' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Publicar já
                  </button>
                </div>
              </div>
            )}
            {initial && initial.status !== 'publicando' && (
              <button onClick={remove} disabled={!!busy} className="text-xs text-red-500 hover:underline flex items-center gap-1 self-start">
                {busy === 'delete' ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} {initial.status === 'publicado' ? 'Tirar do calendário' : 'Excluir post'}
              </button>
            )}
          </div>
        </div>
      </div>

      {blogOpen && (
        <IgBlogCarousel onClose={() => setBlogOpen(false)} onDone={r => {
          setKind('CAROUSEL'); setItems(r.items); setCaption(r.caption); setBlogPostId(r.blogPostId); setPreview(0); setBlogOpen(false)
        }} />
      )}
    </div>
  )
}
