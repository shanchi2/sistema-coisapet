import { useEffect, useRef, useState } from 'react'
import { Loader2, Wand2, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Modal } from '../../components/ui/Modal'
import { drawSlotCanvas, SLOT_IMAGE_SIZE } from './generateSlotImage'
import toast from 'react-hot-toast'

const SLOT_LABEL = { 3: 'O que acompanha', 4: 'Dimensões' }

// Gera as imagens dos slots 3/4 sem nenhuma IA — desenha em cima da foto
// real (slot 01, já aprovada) usando só os dados reais do cadastro do
// produto (medidas, acessórios inclusos). O canvas é ao mesmo tempo a
// prévia (tela) e o arquivo exportado (canvas.toBlob) — nada de captura
// de DOM, então não tem risco de CORS/qualidade perdida na conversão.
export function GeneratedSlotImageModal({ open, onClose, product, slot, heroPhotoPath, onUse }) {
  const canvasRef = useRef(null)
  const [status, setStatus] = useState('idle') // idle | loading | ready | error
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !slot) return
    let cancelled = false
    setStatus('loading')

    async function run() {
      const { data: blob, error } = await supabase.storage.from('product-photos').download(heroPhotoPath)
      if (cancelled) return
      if (error || !blob) { setStatus('error'); return }

      const objectUrl = URL.createObjectURL(blob)
      const img = new Image()
      img.onload = () => {
        if (cancelled) return
        const canvas = canvasRef.current
        if (!canvas) return
        canvas.width = SLOT_IMAGE_SIZE.width
        canvas.height = SLOT_IMAGE_SIZE.height
        drawSlotCanvas(canvas, { slot, product, heroImg: img })
        URL.revokeObjectURL(objectUrl)
        setStatus('ready')
      }
      img.onerror = () => { if (!cancelled) setStatus('error') }
      img.src = objectUrl
    }
    run()
    return () => { cancelled = true }
  }, [open, slot, heroPhotoPath, product])

  async function handleUse() {
    const canvas = canvasRef.current
    if (!canvas) return
    setSaving(true)
    canvas.toBlob(async (blob) => {
      if (!blob) { toast.error('Erro ao gerar a imagem.'); setSaving(false); return }
      const file = new File([blob], `slot-${slot}-gerado.png`, { type: 'image/png' })
      await onUse(file)
      setSaving(false)
    }, 'image/png', 0.95)
  }

  return (
    <Modal open={open} onClose={onClose} size="md"
      title={`Gerar imagem — ${SLOT_LABEL[slot] || ''}`}
      subtitle="Montado a partir da foto real (slot 01) + dados do cadastro — sem IA, sem inventar nada."
      footer={
        <>
          <button onClick={onClose} className="btn-secondary" disabled={saving}>Cancelar</button>
          <button onClick={handleUse} className="btn-primary" disabled={status !== 'ready' || saving}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {saving ? 'Salvando...' : `Usar como foto ${String(slot).padStart(2, '0')}`}
          </button>
        </>
      }>
      <div className="flex flex-col items-center gap-3">
        <div className="relative w-[340px] h-[425px] rounded-xl overflow-hidden border border-slate-200 bg-slate-50 shrink-0">
          <canvas ref={canvasRef} className="w-full h-full" style={{ display: status === 'ready' ? 'block' : 'none' }} />
          {status === 'loading' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400">
              <Loader2 size={22} className="animate-spin" />
              <span className="text-xs font-semibold">Montando imagem...</span>
            </div>
          )}
          {status === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-rose-400 px-6 text-center">
              <Wand2 size={22} />
              <span className="text-xs font-semibold">Não consegui carregar a foto base (slot 01). Tenta de novo.</span>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
