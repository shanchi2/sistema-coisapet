import { useEffect, useRef, useState } from 'react'
import { Loader2, Check, Wand2, AlertTriangle, RefreshCw, Images, Plus, X, Upload, RotateCcw, Palette, LayoutTemplate } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Modal } from '../../components/ui/Modal'
import { presetsForSlot, AI_SLOT_NOTE } from './aiSlotPrompts'
import { MEDIA_CHECKLIST } from './mediaChecklist'
import toast from 'react-hot-toast'

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// Gera imagem com IA (Gemini, image-to-image) — SEMPRE mostra a prévia
// antes de salvar e o prompt é sempre editável. Pedido do Raphael, 26/09:
// liberado em todos os 9 slots, com modelos de prompt prontos por slot e
// a opção de subir uma imagem pra usar como BASE (melhoria de uma foto
// real) ou como REFERÊNCIA de composição/estilo.
//
// Imagem base = a foto que a IA edita preservando o produto (foto 01,
// a foto atual do slot, ou uma enviada na hora). Referências = só
// inspiração (estilo) ou layout a seguir (composição) — nunca trocam o produto.
export function AiSlotImageModal({ open, onClose, product, slot, heroPhotoPath, heroSrc, slotPhotoPath, slotSrc, examples, onUse }) {
  const [prompt, setPrompt] = useState('')
  const [presetId, setPresetId] = useState(null)
  const [status, setStatus] = useState('idle') // idle | generating | ready | error
  const [errorMsg, setErrorMsg] = useState('')
  const [result, setResult] = useState(null) // { image_base64, mime_type }
  const [saving, setSaving] = useState(false)
  const [baseSource, setBaseSource] = useState('hero') // hero | slot | upload
  const [baseUpload, setBaseUpload] = useState(null)   // { data, mime_type, previewUrl, name }
  const [refMode, setRefMode] = useState('style')      // style | composition
  const [selectedExampleIds, setSelectedExampleIds] = useState(new Set())
  const [adhocRefs, setAdhocRefs] = useState([]) // [{ data, mime_type, previewUrl, name }]
  const fileRef = useRef()
  const baseFileRef = useRef()

  const presets = presetsForSlot(slot)
  const slotInfo = MEDIA_CHECKLIST.find(i => i.slot === slot)
  // No slot 01 a "foto atual" já é a hero — não repete a opção
  const hasSlotPhoto = !!slotPhotoPath && slot !== 1

  useEffect(() => {
    if (!open) return
    const first = presetsForSlot(slot)[0]
    setPrompt(first.build(product))
    setPresetId(first.id)
    setStatus('idle')
    setResult(null)
    setErrorMsg('')
    setSelectedExampleIds(new Set())
    setAdhocRefs([])
    setBaseUpload(null)
    setRefMode('style')
    setBaseSource(heroPhotoPath ? 'hero' : (slotPhotoPath && slot !== 1) ? 'slot' : 'upload')
  }, [open, slot, product, heroPhotoPath, slotPhotoPath])

  function applyPreset(p) {
    setPrompt(p.build(product))
    setPresetId(p.id)
    // "Melhorar esta foto" quase sempre é em cima de uma foto enviada/atual
    if (p.id === 'melhorar' && baseSource === 'hero' && hasSlotPhoto) setBaseSource('slot')
  }

  function toggleExample(id) {
    setSelectedExampleIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function readImage(file) {
    if (file.size > 10 * 1024 * 1024) { toast.error(`${file.name}: máx 10 MB.`); return null }
    const data = await fileToBase64(file)
    return { data, mime_type: file.type || 'image/jpeg', previewUrl: URL.createObjectURL(file), name: file.name }
  }

  async function handleAddAdhoc(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    for (const file of files) {
      const img = await readImage(file)
      if (img) setAdhocRefs(prev => [...prev, img])
    }
  }

  async function handleBaseUpload(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const img = await readImage(file)
    if (img) { setBaseUpload(img); setBaseSource('upload') }
  }

  function removeAdhoc(idx) {
    setAdhocRefs(prev => prev.filter((_, i) => i !== idx))
  }

  const baseReady = (baseSource === 'hero' && heroPhotoPath) || (baseSource === 'slot' && hasSlotPhoto) || (baseSource === 'upload' && baseUpload)
  const refCount = selectedExampleIds.size + adhocRefs.length

  async function handleGenerate() {
    if (!baseReady) { toast.error('Escolha a imagem base (foto 01, foto atual ou envie uma).'); return }
    setStatus('generating')
    setErrorMsg('')
    const refPhotoPaths = (examples || [])
      .filter(ex => selectedExampleIds.has(ex.id))
      .map(ex => ex.image_url)
    const { data, error } = await supabase.functions.invoke('product-image-ai', {
      body: {
        action: 'generate',
        base_photo_path:   baseSource === 'hero' ? heroPhotoPath : baseSource === 'slot' ? slotPhotoPath : null,
        base_image_base64: baseSource === 'upload' ? { data: baseUpload.data, mime_type: baseUpload.mime_type } : null,
        prompt,
        ref_mode: refMode,
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
  const busy = status === 'generating'

  const BaseOption = ({ id, label, src, disabled, onClick }) => (
    <button type="button" disabled={disabled || busy} onClick={onClick || (() => setBaseSource(id))}
      className={`flex flex-col items-center gap-1 p-1.5 rounded-xl border-2 transition w-[92px] ${baseSource === id ? 'border-violet-500 bg-violet-50' : 'border-slate-100 hover:border-slate-200'} disabled:opacity-40`}>
      <span className="w-full aspect-[4/5] rounded-lg overflow-hidden bg-slate-100 flex items-center justify-center">
        {src ? <img src={src} alt="" className="w-full h-full object-cover" /> : <Upload size={18} className="text-slate-300" />}
      </span>
      <span className="text-[10px] font-semibold text-slate-600 text-center leading-tight">{label}</span>
    </button>
  )

  return (
    <Modal open={open} onClose={onClose} size="2xl"
      title={`Gerar com IA — ${String(slot || '').padStart(2, '0')} ${slotInfo?.title || ''}`}
      subtitle="A IA edita a imagem base preservando o produto — sempre revise a prévia antes de usar."
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
      <div className="grid grid-cols-1 md:grid-cols-[1fr_300px] gap-5">
        <div className="flex flex-col gap-4 min-w-0">
          {AI_SLOT_NOTE[slot] && (
            <p className="flex items-start gap-1.5 text-[11px] text-orange-700 bg-orange-50 rounded-lg px-2.5 py-2">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {AI_SLOT_NOTE[slot]}
            </p>
          )}

          {/* 1. Imagem base */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">
              1. Imagem base <span className="font-normal normal-case text-slate-400">(a foto que a IA vai editar — o produto dela é preservado)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              <BaseOption id="hero" label="Foto 01 (hero)" src={heroSrc} disabled={!heroPhotoPath} />
              {hasSlotPhoto && <BaseOption id="slot" label={`Foto atual do ${String(slot).padStart(2, '0')}`} src={slotSrc} />}
              <BaseOption id="upload" label={baseUpload ? 'Imagem enviada' : 'Enviar imagem'} src={baseUpload?.previewUrl}
                onClick={() => baseUpload ? setBaseSource('upload') : baseFileRef.current?.click()} />
              {baseUpload && (
                <button type="button" onClick={() => baseFileRef.current?.click()} disabled={busy}
                  className="self-center text-[11px] font-semibold text-violet-600 hover:text-violet-700">Trocar imagem</button>
              )}
              <input ref={baseFileRef} type="file" accept="image/*" className="hidden" onChange={handleBaseUpload} />
            </div>
            {!heroPhotoPath && !baseUpload && (
              <p className="text-[11px] text-slate-400 mt-1.5">Sem foto 01 ainda — envie uma foto do produto pra servir de base.</p>
            )}
          </div>

          {/* 2. Modelo de prompt */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">2. Modelo de prompt</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {presets.map(p => (
                <button key={p.id} type="button" onClick={() => applyPreset(p)} disabled={busy}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${presetId === p.id ? 'bg-violet-500 border-violet-500 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-violet-300'}`}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="relative">
              <textarea value={prompt} onChange={e => { setPrompt(e.target.value); setPresetId(null) }} rows={6}
                className="input text-sm" disabled={busy} placeholder="Descreva o que a IA deve fazer..." />
            </div>
            <div className="flex items-center justify-between mt-1">
              <p className="text-[11px] text-slate-400">Edite à vontade — o modelo é só o ponto de partida.</p>
              {presetId === null && presets.length > 0 && (
                <button type="button" onClick={() => applyPreset(presets[0])} className="text-[11px] font-semibold text-slate-400 hover:text-violet-600 flex items-center gap-1">
                  <RotateCcw size={10} /> Voltar ao modelo
                </button>
              )}
            </div>
          </div>

          {/* 3. Referências */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">
              3. Imagens de referência <span className="font-normal normal-case text-slate-400">(opcional — nunca trocam o produto)</span>
            </label>
            <div className="flex bg-slate-100 rounded-lg p-0.5 mb-2 w-fit">
              <button type="button" onClick={() => setRefMode('style')}
                className={`px-3 py-1 text-[11px] font-semibold rounded-md flex items-center gap-1 ${refMode === 'style' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>
                <Palette size={11} /> Inspiração de estilo
              </button>
              <button type="button" onClick={() => setRefMode('composition')}
                className={`px-3 py-1 text-[11px] font-semibold rounded-md flex items-center gap-1 ${refMode === 'composition' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>
                <LayoutTemplate size={11} /> Seguir composição
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mb-2">
              {refMode === 'style'
                ? 'A IA usa a referência só pra pegar o clima, cores, luz e tipo de ambiente.'
                : 'A IA copia o layout da referência (enquadramento, posição, disposição dos elementos e textos), com o NOSSO produto no lugar.'}
            </p>
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
                <Images size={12} /> Sem exemplos salvos nesse slot — anexa um avulso ou sobe um exemplo no carrossel ao lado do slot.
              </p>
            )}
          </div>
        </div>

        {/* Prévia */}
        <div className="flex flex-col gap-3">
          <button onClick={handleGenerate} disabled={busy || !prompt.trim() || !baseReady}
            className="btn-primary w-full justify-center flex items-center gap-1.5">
            {busy ? <Loader2 size={14} className="animate-spin" /> : status === 'ready' ? <RefreshCw size={14} /> : <Wand2 size={14} />}
            {busy ? 'Gerando... (até ~30s)' : status === 'ready' ? 'Gerar de novo' : 'Gerar imagem'}
          </button>
          {refCount > 0 && (
            <p className="text-[11px] text-slate-400 text-center -mt-1">{refCount} referência{refCount > 1 ? 's' : ''} · {refMode === 'style' ? 'estilo' : 'composição'}</p>
          )}

          {status === 'error' && (
            <p className="flex items-start gap-1.5 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {errorMsg}
            </p>
          )}

          <div className="w-full aspect-[4/5] rounded-xl overflow-hidden border border-slate-200 bg-slate-50 flex items-center justify-center">
            {previewSrc ? (
              <img src={previewSrc} alt="Prévia gerada" className="w-full h-full object-contain" />
            ) : busy ? (
              <Loader2 size={28} className="animate-spin text-violet-300" />
            ) : (
              <p className="text-xs text-slate-400 text-center px-6">A prévia aparece aqui. Nada é salvo até você clicar em "Usar como foto".</p>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
