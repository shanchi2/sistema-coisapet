import { useEffect, useState } from 'react'
import { Loader2, Check, Wand2, AlertTriangle, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Modal } from '../../components/ui/Modal'
import { defaultPromptForSlot, AI_SLOT_NOTE } from './aiSlotPrompts'
import toast from 'react-hot-toast'

const SLOT_LABEL = { 1: 'Produto / Hero', 2: 'Ambientada + Pet', 7: 'Uso / Enriquecimento', 9: 'Comparativo / Educação' }

// Gera imagem com IA (Gemini, edição em cima da foto real do slot 01) —
// diferente do gerador dos slots 03/04, aqui É IA de verdade, então
// SEMPRE mostra a prévia antes de qualquer coisa ser salva, e sempre
// deixa o prompt editável (nunca dispara sozinho com o padrão).
export function AiSlotImageModal({ open, onClose, product, slot, heroPhotoPath, onUse }) {
  const [prompt, setPrompt] = useState('')
  const [status, setStatus] = useState('idle') // idle | generating | ready | error
  const [errorMsg, setErrorMsg] = useState('')
  const [result, setResult] = useState(null) // { image_base64, mime_type }
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setPrompt(defaultPromptForSlot(slot, product))
    setStatus('idle')
    setResult(null)
    setErrorMsg('')
  }, [open, slot, product])

  async function handleGenerate() {
    if (!heroPhotoPath) { toast.error('Envie a foto 01 (hero) primeiro — é ela que serve de base.'); return }
    setStatus('generating')
    setErrorMsg('')
    const { data, error } = await supabase.functions.invoke('product-image-ai', {
      body: { action: 'generate', base_photo_path: heroPhotoPath, prompt },
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
