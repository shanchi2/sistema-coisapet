import { useEffect, useRef, useState } from 'react'
import { Loader2, Check, Wand2, AlertTriangle, RefreshCw, Images, Plus, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Modal } from '../../components/ui/Modal'
import { defaultPromptForSlot, AI_SLOT_NOTE } from './aiSlotPrompts'
import toast from 'react-hot-toast'

const SLOT_LABEL = { 1: 'Produto / Hero', 2: 'Ambientada + Pet', 7: 'Uso / Enriquecimento', 9: 'Comparativo / Educação' }

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// Gera imagem com IA (Gemini, edição em cima da foto real do slot 01) —
// diferente do gerador dos slots 03/04, aqui É IA de verdade, então
// SEMPRE mostra a prévia antes de qualquer coisa ser salva, e sempre
// deixa o prompt editável (nunca dispara sozinho com o padrão). Pedido
// do Raphael, 24/09: dá pra escolher imagem(ns) de referência (da
// biblioteca de exemplos do guia, ou anexo avulso) pra IA se inspirar
// no estilo/ambiente — nunca troca o produto, só contexto.
export function AiSlotImageModal({ open, onClose, product, slot, heroPhotoPath, examples, onUse }) {
  const [prompt, setPrompt] = useState('')
  const [status, setStatus] = useState('idle') // idle | generating | ready | error
  const [errorMsg, setErrorMsg] = useState('')
  const [result, setResult] = useState(null) // { image_base64, mime_type }
  const [saving, setSaving] = useState(false)
  const [selectedExampleIds, setSelectedExampleIds] = useState(new Set())
  const [adhocRefs, setAdhocRefs] = useState([]) // [{ data, mime_type, previewUrl, name }]
  const fileRef = useRef()

  useEffect(() => {
    if (!open) return
    setPrompt(defaultPromptForSlot(slot, product))
    setStatus('idle')
    setResult(null)
    setErrorMsg('')
    setSelectedExampleIds(new Set())
    setAdhocRefs([])
  }, [open, slot, product])

  function toggleExample(id) {
    setSelectedExampleIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleAddAdhoc(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) { toast.error(`${file.name}: máx 10 MB.`); continue }
      const data = await fileToBase64(file)
      setAdhocRefs(prev => [...prev, { data, mime_type: file.type || 'image/jpeg', previewUrl: URL.createObjectURL(file), name: file.name }])
    }
  }

  function removeAdhoc(idx) {
    setAdhocRefs(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleGenerate() {
    if (!heroPhotoPath) { toast.error('Envie a foto 01 (hero) primeiro — é ela que serve de base.'); return }
    setStatus('generating')
    setErrorMsg('')
    const refPhotoPaths = (examples || [])
      .filter(ex => selectedExampleIds.has(ex.id))
      .map(ex => ex.image_url)
    const { data, error } = await supabase.functions.invoke('product-image-ai', {
      body: {
        action: 'generate',
        base_photo_path: heroPhotoPath,
        prompt,
        ref_photo_paths: refPhotoPaths,
        ref_images_base64: adhocRefs.map(r => ({ data: r.data, mime_type: r.mime_type })),
      },
    })
    if (error || data?.error) {
      let msg = data?.error || error?.message || 'Erro ao gerar imagem.'
      try { const parsed = await error?.context?.json?.(); if (parsed?.error) msg = parsed.error } catch { /* mantém msg */ }
      setErrorMsg(msg)
      setStatus('error')
      return
    }
    setResult(data)
    setStatus('ready')
  }

  async function handleUse() {
    if (!result) return
    setSaving(true)
    try {
      const res = await fetch(`data:${result.mime_type};base64,${result.image_base64}`)
      const blob = await res.blob()
      const ext = result.mime_type === 'image/png' ? 'png' : result.mime_type === 'image/jpeg' ? 'jpg' : 'webp'
      const file = new File([blob], `slot-${slot}-ia.${ext}`, { type: result.mime_type })
      await onUse(file)
    } finally {
      setSaving(false)
    }
  }

  const previewSrc = result ? `data:${result.mime_type};base64,${result.image_base64}` : null

  return (
    <Modal open={open} onClose={onClose} size="lg"
      title={`Gerar com IA — ${SLOT_LABEL[slot] || ''}`}
      subtitle="Edita a foto real do slot 01 preservando o produto — sempre revise antes de usar."
      footer={
        <>
          <button onClick={onClose} className="btn-secondary" disabled={saving}>Fechar</button>
          {status === 'ready' && (
            <button onClick={handleUse} className="btn-primary" disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {saving ? 'Salvando...' : `Usar como foto ${String(slot).padStart(2, '0')}`}
            </button>
          )}
        </>
      }>
      <div className="flex flex-col gap-3">
        {AI_SLOT_NOTE[slot] && (
          <p className="flex items-start gap-1.5 text-[11px] text-orange-700 bg-orange-50 rounded-lg px-2.5 py-2">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {AI_SLOT_NOTE[slot]}
          </p>
        )}

        <div>
          <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Prompt (edite à vontade)</label>
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={4}
            className="input text-sm" disabled={status === 'generating'} />
        </div>

        <div>
          <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">
            Imagens de referência <span className="font-normal normal-case text-slate-400">(opcional — só inspiração de estilo/ambiente, nunca troca o produto)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {(examples || []).map(ex => {
              const selected = selectedExampleIds.has(ex.id)
              return (
                <button key={ex.id} type="button" onClick={() => toggleExample(ex.id)}
                  className={`relative w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors ${selected ? 'border-violet-500' : 'border-transparent hover:border-slate-200'}`}
                  title={ex.title}>
                  <img src={ex.src} alt={ex.title || ''} className="w-full h-full object-cover" />
                  {selected && (
                    <span className="absolute inset-0 bg-violet-500/30 flex items-center justify-center">
                      <Check size={18} className="text-white drop-shadow" />
                    </span>
                  )}
                </button>
              )
            })}
            {adhocRefs.map((r, i) => (
              <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border-2 border-violet-500">
                <img src={r.previewUrl} alt={r.name} className="w-full h-full object-cover" />
                <button type="button" onClick={() => removeAdhoc(i)}
                  className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 flex items-center justify-center text-white">
                  <X size={10} />
                </button>
              </div>
            ))}
            <button type="button" onClick={() => fileRef.current?.click()}
              className="w-16 h-16 rounded-lg border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-0.5 text-slate-300 hover:text-violet-400 hover:border-violet-200 transition-colors">
              <Plus size={16} />
              <span className="text-[9px] font-semibold">Anexar</span>
            </button>
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleAddAdhoc} />
          </div>
          {!(examples || []).length && !adhocRefs.length && (
            <p className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-1.5">
              <Images size={12} /> Sem exemplos salvos nesse slot ainda — anexa um avulso ou sobe um exemplo no carrossel ao lado do slot.
            </p>
          )}
        </div>

        <button onClick={handleGenerate} disabled={status === 'generating' || !prompt.trim()}
          className="btn-primary self-start flex items-center gap-1.5">
          {status === 'generating' ? <Loader2 size={14} className="animate-spin" /> : status === 'ready' ? <RefreshCw size={14} /> : <Wand2 size={14} />}
          {status === 'generating' ? 'Gerando...' : status === 'ready' ? 'Gerar de novo' : 'Gerar'}
        </button>

        {status === 'error' && (
          <p className="flex items-start gap-1.5 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {errorMsg}
          </p>
        )}

        {previewSrc && (
          <div className="w-full max-w-[380px] mx-auto rounded-xl overflow-hidden border border-slate-200">
            <img src={previewSrc} alt="Prévia gerada" className="w-full h-auto" />
          </div>
        )}
      </div>
    </Modal>
  )
}
