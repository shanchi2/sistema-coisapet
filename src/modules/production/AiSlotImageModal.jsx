import { useEffect, useRef, useState } from 'react'
import {
  Loader2, Check, Wand2, AlertTriangle, RefreshCw, Images, Plus, X, RotateCcw,
  Palette, LayoutTemplate, Star, PencilLine, ImagePlus, Lock, Unlock,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Modal } from '../../components/ui/Modal'
import { presetsForSlot, AI_SLOT_NOTE } from './aiSlotPrompts'
import { MEDIA_CHECKLIST } from './mediaChecklist'
import toast from 'react-hot-toast'

// Reduz a imagem no navegador antes de mandar (máx 2048px, JPEG) — foto
// de celular de 10MB estouraria o corpo da requisição da edge function,
// e a IA não ganha nada com resolução maior que isso.
async function fileToImage(file, maxSide = 2048) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = reject
      el.src = url
    })
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#FFFFFF' // PNG transparente vira fundo branco, não preto
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
    return { data: dataUrl.split(',')[1], mime_type: 'image/jpeg', previewUrl: dataUrl, name: file.name }
  } finally {
    URL.revokeObjectURL(url)
  }
}

// Gera imagem com IA (Gemini, image-to-image) — SEMPRE mostra a prévia
// antes de salvar e o prompt é sempre editável.
//
// 26/09 (Raphael):
// - Fotos base: VÁRIAS fotos reais do produto (foto 01, foto do slot,
//   quantas enviar), marcando quais a IA deve ver. A 1ª marcada é a
//   principal; as outras são "fonte da verdade" de detalhe (canto, logo
//   gravado, encaixe) — a IA não tem como adivinhar isso sem foto real.
// - Versões + "Ajustar": corrige a imagem gerada (ex: tirar um atributo
//   repetido) SEM refazer tudo — manda a própria imagem gerada como base
//   com instrução de edição pontual.
// - Referências: só estilo ou composição, nunca trocam o produto.
export function AiSlotImageModal({ open, onClose, product, slot, heroPhotoPath, heroSrc, slotPhotoPath, slotSrc, examples, onUse }) {
  const [prompt, setPrompt] = useState('')
  const [presetId, setPresetId] = useState(null)
  const [status, setStatus] = useState('idle') // idle | generating | error
  const [errorMsg, setErrorMsg] = useState('')
  const [versions, setVersions] = useState([]) // [{ image_base64, mime_type, label }]
  const [current, setCurrent] = useState(-1)
  const [fixText, setFixText] = useState('')
  const [saving, setSaving] = useState(false)
  // Fotos base: lista ordenada + quais estão marcadas
  const [bases, setBases] = useState([])       // [{ key, label, src, path? , data?, mime_type? }]
  const [baseSel, setBaseSel] = useState(new Set())
  const [refMode, setRefMode] = useState('style') // style | composition
  const [lockContent, setLockContent] = useState(false) // true = IA não tira/põe/move nada, só tom/luz
  const [selectedExampleIds, setSelectedExampleIds] = useState(new Set())
  const [adhocRefs, setAdhocRefs] = useState([]) // [{ data, mime_type, previewUrl, name }]
  const fileRef = useRef()
  const baseFileRef = useRef()

  const presets = presetsForSlot(slot)
  const slotInfo = MEDIA_CHECKLIST.find(i => i.slot === slot)

  useEffect(() => {
    if (!open) return
    const first = presetsForSlot(slot)[0]
    setPrompt(first.build(product))
    setPresetId(first.id)
    setStatus('idle')
    setErrorMsg('')
    setVersions([])
    setCurrent(-1)
    setFixText('')
    setSelectedExampleIds(new Set())
    setAdhocRefs([])
    setRefMode('style')
    setLockContent(false)
    const initial = []
    if (heroPhotoPath) initial.push({ key: 'hero', label: 'Foto 01 (hero)', src: heroSrc, path: heroPhotoPath })
    if (slotPhotoPath && slot !== 1) initial.push({ key: 'slot', label: `Foto atual do ${String(slot).padStart(2, '0')}`, src: slotSrc, path: slotPhotoPath })
    setBases(initial)
    setBaseSel(new Set(initial.slice(0, 1).map(b => b.key)))
  }, [open, slot, product, heroPhotoPath, heroSrc, slotPhotoPath, slotSrc])

  const selectedBases = bases.filter(b => baseSel.has(b.key)) // na ordem da lista → 1ª = principal
  const refCount = selectedExampleIds.size + adhocRefs.length
  const busy = status === 'generating'
  const currentVersion = versions[current] || null

  function applyPreset(p) {
    setPrompt(p.build(product))
    setPresetId(p.id)
  }

  function toggleBase(key) {
    setBaseSel(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }
  function makePrimary(key) {
    setBases(prev => [prev.find(b => b.key === key), ...prev.filter(b => b.key !== key)])
    setBaseSel(prev => new Set(prev).add(key))
  }
  function removeBase(key) {
    setBases(prev => prev.filter(b => b.key !== key))
    setBaseSel(prev => { const next = new Set(prev); next.delete(key); return next })
  }

  async function handleBaseUpload(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    for (const file of files) {
      try {
        const img = await fileToImage(file)
        const key = `up-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        setBases(prev => [...prev, { key, label: file.name, src: img.previewUrl, data: img.data, mime_type: img.mime_type }])
        setBaseSel(prev => new Set(prev).add(key)) // enviou → já entra marcada
      } catch {
        toast.error(`Não consegui ler ${file.name}.`)
      }
    }
  }

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
      try { const img = await fileToImage(file); setAdhocRefs(prev => [...prev, img]) }
      catch { toast.error(`Não consegui ler ${file.name}.`) }
    }
  }
  function removeAdhoc(idx) {
    setAdhocRefs(prev => prev.filter((_, i) => i !== idx))
  }

  async function callAi(extraBody) {
    setStatus('generating')
    setErrorMsg('')
    const { data, error } = await supabase.functions.invoke('product-image-ai', {
      body: {
        action: 'generate',
        base_images: selectedBases.map(b => b.path ? { path: b.path } : { data: b.data, mime_type: b.mime_type }),
        ref_mode: refMode,
        lock_content: lockContent,
        ref_photo_paths: (examples || []).filter(ex => selectedExampleIds.has(ex.id)).map(ex => ex.image_url),
        ref_images_base64: adhocRefs.map(r => ({ data: r.data, mime_type: r.mime_type })),
        ...extraBody,
      },
    })
    if (error || data?.error) {
      let msg = data?.error || error?.message || 'Erro ao gerar imagem.'
      try { const parsed = await error?.context?.json?.(); if (parsed?.error) msg = parsed.error } catch { /* mantém msg */ }
      setErrorMsg(msg)
      setStatus('error')
      return null
    }
    setStatus('idle')
    return data
  }

  function pushVersion(data, label) {
    setVersions(prev => {
      const next = [...prev, { image_base64: data.image_base64, mime_type: data.mime_type, label }]
      setCurrent(next.length - 1)
      return next
    })
  }

  async function handleGenerate() {
    if (!selectedBases.length) { toast.error('Marque pelo menos uma foto base (ou envie uma).'); return }
    const data = await callAi({ prompt })
    if (data) pushVersion(data, 'Nova')
  }

  // Ajuste pontual em cima da versão atual — não refaz a imagem
  async function handleFix() {
    if (!currentVersion || !fixText.trim()) return
    const data = await callAi({
      prompt: fixText,
      edit_image_base64: { data: currentVersion.image_base64, mime_type: currentVersion.mime_type },
      // No ajuste, referências de estilo/composição não entram — só a imagem + fotos reais pra conferência
      ref_photo_paths: [],
      ref_images_base64: [],
    })
    if (data) { pushVersion(data, 'Ajuste'); setFixText('') }
  }

  async function handleUse() {
    if (!currentVersion) return
    setSaving(true)
    try {
      const res = await fetch(`data:${currentVersion.mime_type};base64,${currentVersion.image_base64}`)
      const blob = await res.blob()
      const ext = currentVersion.mime_type === 'image/png' ? 'png' : currentVersion.mime_type === 'image/jpeg' ? 'jpg' : 'webp'
      const file = new File([blob], `slot-${slot}-ia.${ext}`, { type: currentVersion.mime_type })
      await onUse(file)
    } finally {
      setSaving(false)
    }
  }

  const previewSrc = currentVersion ? `data:${currentVersion.mime_type};base64,${currentVersion.image_base64}` : null

  return (
    <Modal open={open} onClose={onClose} size="wide"
      title={`Gerar com IA — ${String(slot || '').padStart(2, '0')} ${slotInfo?.title || ''}`}
      subtitle="A IA usa as fotos reais marcadas como base e preserva o produto — sempre revise a prévia antes de usar."
      footer={
        <>
          <button onClick={onClose} className="btn-secondary" disabled={saving}>Fechar</button>
          {currentVersion && (
            <button onClick={handleUse} className="btn-primary" disabled={saving || busy}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {saving ? 'Salvando...' : `Usar esta versão como foto ${String(slot).padStart(2, '0')}`}
            </button>
          )}
        </>
      }>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">
        <div className="flex flex-col gap-4 min-w-0">
          {AI_SLOT_NOTE[slot] && (
            <p className="flex items-start gap-1.5 text-[11px] text-orange-700 bg-orange-50 rounded-lg px-2.5 py-2">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {AI_SLOT_NOTE[slot]}
            </p>
          )}

          {/* 1. Fotos base (reais) */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-0.5">1. Fotos reais do produto</label>
            <p className="text-[11px] text-slate-400 mb-2">
              Marque as fotos que a IA deve ver. A <b className="text-violet-600">principal</b> é a base editada; as outras ensinam os detalhes reais
              (canto, encaixe, logo gravado, acabamento) — a IA não inventa o que não está numa foto.
            </p>
            <div className="flex flex-wrap gap-2">
              {bases.map(b => {
                const selected = baseSel.has(b.key)
                const isPrimary = selectedBases[0]?.key === b.key
                return (
                  <div key={b.key} className={`relative w-[92px] rounded-xl border-2 p-1 transition ${selected ? 'border-violet-500 bg-violet-50' : 'border-slate-100 opacity-60 hover:opacity-100'}`}>
                    <button type="button" onClick={() => toggleBase(b.key)} disabled={busy} className="block w-full">
                      <span className="block w-full aspect-[4/5] rounded-lg overflow-hidden bg-slate-100">
                        {b.src ? <img src={b.src} alt="" className="w-full h-full object-cover" /> : null}
                      </span>
                      <span className="block text-[10px] font-semibold text-slate-600 truncate mt-1 px-0.5" title={b.label}>{b.label}</span>
                    </button>
                    <span className={`absolute top-2 left-2 w-5 h-5 rounded-md border-2 flex items-center justify-center pointer-events-none ${selected ? 'bg-violet-500 border-violet-500' : 'bg-white/90 border-slate-300'}`}>
                      {selected && <Check size={12} className="text-white" strokeWidth={3} />}
                    </span>
                    {isPrimary ? (
                      <span className="absolute bottom-7 left-2 right-2 text-center text-[9px] font-black uppercase bg-violet-600 text-white rounded px-1 py-0.5">Principal</span>
                    ) : selected && (
                      <button type="button" onClick={() => makePrimary(b.key)} title="Usar como principal"
                        className="absolute bottom-7 left-2 right-2 flex items-center justify-center gap-0.5 text-[9px] font-bold bg-white/90 text-violet-600 rounded px-1 py-0.5 hover:bg-white">
                        <Star size={9} /> Principal
                      </button>
                    )}
                    {b.data && (
                      <button type="button" onClick={() => removeBase(b.key)} disabled={busy}
                        className="absolute top-2 right-2 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center text-white">
                        <X size={11} />
                      </button>
                    )}
                  </div>
                )
              })}
              <button type="button" onClick={() => baseFileRef.current?.click()} disabled={busy}
                className="w-[92px] aspect-[92/135] rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-violet-500 hover:border-violet-300 transition-colors">
                <ImagePlus size={20} />
                <span className="text-[10px] font-semibold text-center leading-tight px-1">Adicionar fotos</span>
              </button>
              <input ref={baseFileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleBaseUpload} />
            </div>
            <p className="text-[11px] mt-1.5 text-slate-500">
              {selectedBases.length === 0
                ? <span className="text-amber-600 font-semibold">Nenhuma foto marcada — marque ou envie pelo menos uma.</span>
                : `${selectedBases.length} foto${selectedBases.length > 1 ? 's' : ''} marcada${selectedBases.length > 1 ? 's' : ''}.`}
            </p>
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
            <textarea value={prompt} onChange={e => { setPrompt(e.target.value); setPresetId(null) }} rows={6}
              className="input text-sm" disabled={busy} placeholder="Descreva o que a IA deve fazer..." />
            <div className="flex items-center justify-between mt-1">
              <p className="text-[11px] text-slate-400">Edite à vontade — o modelo é só o ponto de partida.</p>
              {presetId === null && presets.length > 0 && (
                <button type="button" onClick={() => applyPreset(presets[0])} className="text-[11px] font-semibold text-slate-400 hover:text-violet-600 flex items-center gap-1">
                  <RotateCcw size={10} /> Voltar ao modelo
                </button>
              )}
            </div>
          </div>

          {/* Chave de conteúdo travado — muda a instrução que vai pra IA (ver edge function) */}
          <button type="button" onClick={() => setLockContent(v => !v)} disabled={busy}
            className={`flex items-start gap-3 text-left rounded-xl border-2 px-3 py-2.5 transition ${lockContent ? 'border-amber-400 bg-amber-50' : 'border-slate-100 bg-white hover:border-slate-200'}`}>
            <span className={`mt-0.5 w-9 h-5 rounded-full relative shrink-0 transition ${lockContent ? 'bg-amber-500' : 'bg-slate-300'}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${lockContent ? 'left-[18px]' : 'left-0.5'}`} />
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
                {lockContent ? <Lock size={13} className="text-amber-600" /> : <Unlock size={13} className="text-slate-400" />}
                {lockContent ? 'Não mexer no conteúdo da imagem' : 'IA pode melhorar o conteúdo da cena'}
              </span>
              <span className="block text-[11px] text-slate-500 leading-snug mt-0.5">
                {lockContent
                  ? 'Não remove, não adiciona, não move e não altera nada — só cor, tom, saturação, luz e nitidez.'
                  : 'Pode reposicionar, remover distrações e adicionar/trocar elementos do cenário pra imagem ficar melhor. O produto nunca é alterado.'}
              </span>
            </span>
          </button>

          {/* 3. Referências */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">
              3. Imagens de referência <span className="font-normal normal-case text-slate-400">(opcional — de outros produtos/anúncios, nunca trocam o nosso produto)</span>
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

        {/* Prévia + versões + ajuste */}
        <div className="flex flex-col gap-3">
          <button onClick={handleGenerate} disabled={busy || !prompt.trim() || !selectedBases.length}
            className="btn-primary w-full justify-center flex items-center gap-1.5">
            {busy ? <Loader2 size={14} className="animate-spin" /> : versions.length ? <RefreshCw size={14} /> : <Wand2 size={14} />}
            {busy ? 'Gerando... (até ~30s)' : versions.length ? 'Gerar do zero de novo' : 'Gerar imagem'}
          </button>
          {refCount > 0 && (
            <p className="text-[11px] text-slate-400 text-center -mt-1">{refCount} referência{refCount > 1 ? 's' : ''} · {refMode === 'style' ? 'estilo' : 'composição'}</p>
          )}

          {status === 'error' && (
            <p className="flex items-start gap-1.5 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {errorMsg}
            </p>
          )}

          <div className="relative w-full aspect-[4/5] rounded-xl overflow-hidden border border-slate-200 bg-slate-50 flex items-center justify-center">
            {previewSrc ? (
              <img src={previewSrc} alt="Prévia gerada" className="w-full h-full object-contain" />
            ) : !busy && (
              <p className="text-xs text-slate-400 text-center px-6">A prévia aparece aqui. Nada é salvo até você clicar em "Usar esta versão".</p>
            )}
            {busy && (
              <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                <Loader2 size={28} className="animate-spin text-violet-400" />
              </div>
            )}
          </div>

          {versions.length > 1 && (
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Versões — clique pra voltar numa anterior</p>
              <div className="flex gap-1.5 flex-wrap">
                {versions.map((v, i) => (
                  <button key={i} type="button" onClick={() => setCurrent(i)} disabled={busy}
                    className={`relative w-12 aspect-[4/5] rounded-md overflow-hidden border-2 ${i === current ? 'border-violet-500' : 'border-transparent opacity-70 hover:opacity-100'}`}
                    title={`${i + 1}. ${v.label}`}>
                    <img src={`data:${v.mime_type};base64,${v.image_base64}`} alt="" className="w-full h-full object-cover" />
                    <span className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[8px] font-bold text-center">{i + 1}{v.label === 'Ajuste' ? ' ✎' : ''}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {currentVersion && (
            <div className="border border-violet-100 bg-violet-50/50 rounded-xl p-3 flex flex-col gap-2">
              <label className="text-xs font-bold text-violet-700 flex items-center gap-1.5">
                <PencilLine size={13} /> Ajustar esta versão <span className="font-normal text-violet-500">(sem refazer o resto)</span>
              </label>
              <textarea value={fixText} onChange={e => setFixText(e.target.value)} rows={2} disabled={busy}
                className="input text-sm bg-white"
                placeholder='Ex: "remova o segundo selo repetido de Fácil de montar" ou "deixe o fundo um pouco mais claro"'
                onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleFix() }} />
              <button onClick={handleFix} disabled={busy || !fixText.trim()}
                className="btn-primary justify-center flex items-center gap-1.5 py-1.5 text-sm">
                {busy ? <Loader2 size={13} className="animate-spin" /> : <PencilLine size={13} />} Aplicar ajuste
              </button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
