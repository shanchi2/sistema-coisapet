import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Package, Upload, Trash2, Video as VideoIcon,
  MessageSquare, StickyNote, Loader2, Check, Lightbulb, AlertTriangle,
  Sparkles, Target, Wand2,
} from 'lucide-react'
import { useProductMediaDetail } from './hooks/useProductMediaStatus'
import { useGuideExamples } from './hooks/useGuideExamples'
import { useSignedUrl } from '../../lib/signedUrlCache'
import { Modal } from '../../components/ui/Modal'
import { MEDIA_CHECKLIST, CATEGORIES } from './mediaChecklist'
import { GuideExampleCarousel } from './GuideExampleCarousel'
import { GeneratedSlotImageModal } from './GeneratedSlotImageModal'
import { canGenerateSlot } from './generateSlotImage'
import { AiSlotImageModal } from './AiSlotImageModal'
import { AI_SLOTS } from './aiSlotPrompts'

// Só os slots 3 (o que acompanha) e 4 (dimensões) têm dado real o
// suficiente no cadastro do produto pra gerar sozinho, sem IA.
const GENERATABLE_SLOTS = [3, 4]

function ProductThumb({ photoUrl }) {
  const url = useSignedUrl('product-photos', photoUrl)
  if (!url) return <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center shrink-0"><Package size={18} className="text-slate-300" /></div>
  return <img src={url} alt="" className="w-12 h-12 rounded-xl object-cover shrink-0 border border-slate-100" />
}

// Cada linha reproduz o box do guia (categoria, descrição, tags,
// objetivo/pergunta do cliente e o "cuidado" quando existe) ao lado do
// slot de upload — pra Isa nunca precisar sair da tela pra lembrar o que
// aquela foto precisa comunicar.
function CheckCard({ item, data, onUpload, onRemove, hint, examples, onAddExample, onRemoveExample, product, heroPhotoPath, onGenerate, onGenerateAi }) {
  const inputRef = useRef()
  const [busy, setBusy] = useState(false)
  const Icon = item.icon
  const cat = CATEGORIES[item.category]
  const canGenerate = GENERATABLE_SLOTS.includes(item.slot) && canGenerateSlot(item.slot, product, heroPhotoPath)
  // IA liberada em todos os slots (26/09) — sem foto 01, o modal pede pra enviar uma imagem base
  const canGenerateAi = AI_SLOTS.includes(item.slot)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    await onUpload(item.slot, file)
    setBusy(false)
  }

  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-3 flex gap-3">
      {/* Slot de foto — proporção 4:5 (1080×1350px), igual ao padrão do guia */}
      <div className="w-24 sm:w-28 aspect-[4/5] rounded-xl bg-slate-50 relative shrink-0 overflow-hidden">
        {data?.src ? (
          <img src={data.src} alt={item.title} className="w-full h-full object-cover" />
        ) : (
          <button onClick={() => inputRef.current?.click()} disabled={busy}
            className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-slate-300 hover:text-violet-400 hover:bg-violet-50/40 transition-colors">
            {busy ? <Loader2 size={20} className="animate-spin" /> : <Upload size={20} strokeWidth={1.5} />}
            <span className="text-[10px] font-semibold text-center px-1">{busy ? 'Enviando...' : 'Enviar foto'}</span>
          </button>
        )}
        <span className="absolute top-1.5 left-1.5 w-6 h-6 rounded-lg bg-white/90 backdrop-blur text-[11px] font-black text-violet-600 flex items-center justify-center border border-violet-100">
          {String(item.slot).padStart(2, '0')}
        </span>
        {data?.src && (
          <div className="absolute top-1.5 right-1.5 flex gap-1">
            <button onClick={() => inputRef.current?.click()} disabled={busy}
              className="w-6 h-6 rounded-lg bg-white/90 backdrop-blur flex items-center justify-center text-slate-500 hover:text-violet-600 border border-slate-100">
              {busy ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
            </button>
            <button onClick={() => onRemove(item.slot)}
              className="w-6 h-6 rounded-lg bg-white/90 backdrop-blur flex items-center justify-center text-slate-500 hover:text-rose-500 border border-slate-100">
              <Trash2 size={11} />
            </button>
          </div>
        )}
        {(canGenerate || canGenerateAi) && (
          <div className="absolute bottom-1.5 left-1.5 right-1.5 flex gap-1">
            {canGenerate && (
              <button onClick={() => onGenerate(item.slot)} disabled={busy} title="Gerar com os dados do cadastro (sem IA)"
                className="flex-1 flex items-center justify-center gap-1 py-1 rounded-lg bg-rose-500 text-white text-[10px] font-bold hover:bg-rose-600 transition-colors">
                <Wand2 size={11} /> Gerar
              </button>
            )}
            {canGenerateAi && (
              <button onClick={() => onGenerateAi(item.slot)} disabled={busy} title="Gerar ou melhorar com IA (Gemini)"
                className="flex-1 flex items-center justify-center gap-1 py-1 rounded-lg bg-violet-500 text-white text-[10px] font-bold hover:bg-violet-600 transition-colors">
                <Sparkles size={11} /> IA
              </button>
            )}
          </div>
        )}
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </div>

      {/* Guia daquele check */}
      <div className="flex-1 min-w-0 flex flex-col gap-1.5 py-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-md ${cat.tone}`}>{cat.label}</span>
          <Icon size={13} className="text-slate-300 shrink-0" strokeWidth={2} />
          <p className="text-sm font-bold text-slate-800 leading-tight">{item.title}</p>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">{item.description}</p>
        <div className="flex flex-wrap gap-1">
          {item.tags.map(t => (
            <span key={t} className="text-[10px] font-medium text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded-md">{t}</span>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] mt-0.5">
          <Target size={11} className="text-violet-400 shrink-0" />
          <span className="font-semibold text-slate-600">{item.objective}</span>
          <span className="text-slate-300">—</span>
          <span className="italic text-violet-500">&ldquo;{item.quote}&rdquo;</span>
        </div>
        {hint && (
          <p className="flex items-start gap-1.5 text-[11px] text-violet-600 bg-violet-50 rounded-lg px-2 py-1.5 mt-0.5">
            <Lightbulb size={12} className="shrink-0 mt-0.5" /> <span><strong>Dica pra este produto:</strong> {hint}</span>
          </p>
        )}
        {item.warning && (
          <p className="flex items-start gap-1.5 text-[11px] text-orange-700 bg-orange-50 rounded-lg px-2 py-1.5">
            <AlertTriangle size={12} className="shrink-0 mt-0.5" /> {item.warning}
          </p>
        )}
      </div>

      {/* Referência visual daquele check (guias prontos separados pelo Raphael) */}
      <GuideExampleCarousel examples={examples}
        onAdd={files => onAddExample(item.slot, files)}
        onRemove={onRemoveExample} />
    </div>
  )
}

function VideoCard({ media, onUpload, onRemove }) {
  const inputRef = useRef()
  const [busy, setBusy] = useState(false)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    await onUpload(file)
    setBusy(false)
  }

  return (
    <div className="bg-white border-2 border-violet-100 rounded-2xl overflow-hidden flex items-center gap-4 p-4">
      <div className="w-16 h-16 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
        <VideoIcon size={24} className="text-violet-500" strokeWidth={1.5} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-800">Vídeo do produto (10s)</p>
        <p className="text-xs text-slate-400">Produto em uso, giro rápido ou apresentação — até 80MB.</p>
      </div>
      {media?.videoSrc ? (
        <div className="flex items-center gap-2 shrink-0">
          <video src={media.videoSrc} controls className="w-28 h-16 rounded-lg bg-black object-cover" />
          <button onClick={() => inputRef.current?.click()} disabled={busy}
            className="p-2 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          </button>
          <button onClick={onRemove} className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50">
            <Trash2 size={14} />
          </button>
        </div>
      ) : (
        <button onClick={() => inputRef.current?.click()} disabled={busy}
          className="btn-primary shrink-0 flex items-center gap-1.5">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          Enviar vídeo
        </button>
      )}
      <input ref={inputRef} type="file" accept="video/mp4,video/quicktime,video/webm" className="hidden" onChange={handleFile} />
    </div>
  )
}

function FeedbackModal({ open, onClose, media, onSave }) {
  const [value, setValue] = useState(null)
  const [details, setDetails] = useState('')
  useEffect(() => {
    if (!open) return
    setValue(media?.feedback_montagem ?? null)
    setDetails(media?.feedback_details || '')
  }, [open, media])

  return (
    <Modal open={open} onClose={onClose} size="sm" title="Feedback de montagem"
      footer={<>
        <button onClick={onClose} className="btn-secondary">Cancelar</button>
        <button onClick={() => onSave(value, details)} className="btn-primary"><Check size={14} /> Salvar</button>
      </>}>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Teve feedback de montagem?</label>
          <div className="flex gap-1.5">
            {[[true, 'Sim'], [false, 'Não'], [null, 'Sem info']].map(([v, l]) => (
              <button key={String(v)} type="button" onClick={() => setValue(v)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${value === v ? 'bg-violet-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Detalhes</label>
          <textarea value={details} onChange={e => setDetails(e.target.value)} rows={4}
            className="input" placeholder="O que foi observado na montagem..." />
        </div>
      </div>
    </Modal>
  )
}

function NoteModal({ open, onClose, media, onSave }) {
  const [value, setValue] = useState('')
  useEffect(() => { if (open) setValue(media?.observations || '') }, [open, media])

  return (
    <Modal open={open} onClose={onClose} size="sm" title="Observações"
      footer={<>
        <button onClick={onClose} className="btn-secondary">Cancelar</button>
        <button onClick={() => onSave(value)} className="btn-primary"><Check size={14} /> Salvar</button>
      </>}>
      <textarea value={value} onChange={e => setValue(e.target.value)} rows={5}
        className="input" placeholder="Escreva aqui..." autoFocus />
    </Modal>
  )
}

export function MediaChecklistPage() {
  const { productId } = useParams()
  const navigate = useNavigate()
  const {
    product, siblings, checks, media, loading,
    uploadCheckPhoto, removeCheckPhoto, uploadVideo, removeVideo, saveFeedback, saveNotes,
  } = useProductMediaDetail(productId)
  const { bySlot: examplesBySlot, uploadToSlot: uploadExample, removeExample } = useGuideExamples()

  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [genSlot, setGenSlot] = useState(null) // 3 | 4 | null — slot sendo gerado agora
  const [aiGenSlot, setAiGenSlot] = useState(null) // 1 | 2 | 7 | 9 | null — slot sendo gerado com IA agora

  if (loading || !product) {
    return (
      <div className="flex justify-center py-24">
        <div className="w-8 h-8 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const filledCount = Object.keys(checks).length

  return (
    <div className="p-6 max-w-[1000px] mx-auto">

      {/* Header */}
      <button onClick={() => navigate('/producao/midia')}
        className="flex items-center gap-1.5 text-sm font-semibold text-slate-400 hover:text-slate-600 mb-4">
        <ArrowLeft size={16} /> Voltar
      </button>

      <div className="flex items-center gap-3.5 mb-2">
        <ProductThumb photoUrl={product.photo_url} />
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-800 tracking-tight truncate">{product.name}</h1>
          <div className="flex items-center gap-2">
            {product.sku && <span className="text-xs text-slate-400 font-mono">{product.sku}</span>}
            <span className="text-xs font-bold text-violet-600">{filledCount}/9 fotos {media?.videoSrc ? '+ vídeo ✓' : ''}</span>
          </div>
        </div>
      </div>

      {/* Seletor de variação */}
      {siblings.length > 1 && (
        <div className="flex items-center gap-1.5 flex-wrap mb-4">
          {siblings.map(s => (
            <button key={s.id} onClick={() => s.id !== product.id && navigate(`/producao/midia/${s.id}`)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors
                ${s.id === product.id ? 'bg-violet-500 border-violet-500 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-violet-300'}`}>
              {s.name}
            </button>
          ))}
        </div>
      )}

      {/* Regra de ouro do guia */}
      <div className="flex items-start gap-2 p-3 bg-violet-50 rounded-2xl mb-6">
        <Sparkles size={14} className="text-violet-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-violet-700 leading-relaxed">
          <strong>Regra de ouro:</strong> se uma imagem não responde nenhuma pergunta do comprador e só
          repete o produto em outro ângulo, provavelmente é uma posição desperdiçada no anúncio.
          Formato: <strong>1080×1350px, proporção 4:5</strong>, estilo clean &amp; natural.
        </p>
      </div>

      {/* Lista dos 9 checks */}
      <div className="flex flex-col gap-2.5 mb-4">
        {MEDIA_CHECKLIST.map(item => (
          <CheckCard key={item.slot} item={item} data={checks[item.slot]}
            hint={item.hint?.(product)}
            onUpload={uploadCheckPhoto} onRemove={removeCheckPhoto}
            examples={examplesBySlot[item.slot]}
            onAddExample={uploadExample} onRemoveExample={removeExample}
            product={product} heroPhotoPath={checks[1]?.photo_url} onGenerate={setGenSlot} onGenerateAi={setAiGenSlot} />
        ))}
      </div>

      {/* Vídeo */}
      <div className="mb-6">
        <VideoCard media={media} onUpload={uploadVideo} onRemove={removeVideo} />
      </div>

      {/* Feedback + Observações */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => setFeedbackOpen(true)}
          className="flex items-center gap-3 p-4 bg-white border border-slate-100 rounded-2xl hover:border-violet-200 transition-colors text-left">
          <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
            <MessageSquare size={16} className="text-slate-400" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-700">Feedback de montagem</p>
            <p className="text-[11px] text-slate-400 truncate">
              {media?.feedback_montagem === true ? 'Sim' : media?.feedback_montagem === false ? 'Não' : 'Sem informação ainda'}
            </p>
          </div>
        </button>
        <button onClick={() => setNoteOpen(true)}
          className="flex items-center gap-3 p-4 bg-white border border-slate-100 rounded-2xl hover:border-violet-200 transition-colors text-left">
          <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
            <StickyNote size={16} className="text-slate-400" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-700">Observações</p>
            <p className="text-[11px] text-slate-400 truncate">{media?.observations?.trim() || 'Nenhuma observação'}</p>
          </div>
        </button>
      </div>

      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} media={media}
        onSave={(v, d) => { saveFeedback(v, d); setFeedbackOpen(false) }} />
      <NoteModal open={noteOpen} onClose={() => setNoteOpen(false)} media={media}
        onSave={v => { saveNotes(v); setNoteOpen(false) }} />
      <GeneratedSlotImageModal open={!!genSlot} slot={genSlot} product={product}
        heroPhotoPath={checks[1]?.photo_url} onClose={() => setGenSlot(null)}
        onUse={async file => { await uploadCheckPhoto(genSlot, file); setGenSlot(null) }} />
      <AiSlotImageModal open={!!aiGenSlot} slot={aiGenSlot} product={product}
        heroPhotoPath={checks[1]?.photo_url} heroSrc={checks[1]?.src}
        slotPhotoPath={checks[aiGenSlot]?.photo_url} slotSrc={checks[aiGenSlot]?.src}
        examples={examplesBySlot[aiGenSlot]} onClose={() => setAiGenSlot(null)}
        onUse={async file => { await uploadCheckPhoto(aiGenSlot, file); setAiGenSlot(null) }} />
    </div>
  )
}
