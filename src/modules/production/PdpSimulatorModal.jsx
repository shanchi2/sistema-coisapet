import { useEffect, useMemo, useState } from 'react'
import { X, Monitor, Smartphone, Play, Star, Truck, ShieldCheck, ChevronLeft, ChevronRight, ImageOff } from 'lucide-react'
import { MEDIA_CHECKLIST } from './mediaChecklist'
import { StorageImage } from '../../components/ui/StorageImage'

function fmtPreco(v) {
  const n = Number(v) || 0
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Simulador de PDP (25/09, pedido do Raphael) — página "de mentira" no
// layout de um anúncio de marketplace, com as 9 fotos NA ORDEM do guia +
// o vídeo, pra ver como o anúncio vai ficar antes de publicar. Só visual:
// nada aqui fala com o ML. Galeria em moldura QUADRADA de propósito
// (é assim que o marketplace mostra) — dá pra ver se o 4:5 fica bem.
export function PdpSimulatorModal({ open, onClose, product, checks, videoSrc, onVideoError }) {
  const [device, setDevice]         = useState('desktop') // desktop | mobile
  const [active, setActive]         = useState(0)
  const [showMissing, setShowMissing] = useState(true)

  // Mídias na ordem do anúncio: fotos 01..09 e o vídeo por último
  const media = useMemo(() => {
    const list = MEDIA_CHECKLIST.map(item => ({
      kind: 'photo', slot: item.slot, title: item.title, src: checks?.[item.slot]?.photo_url || null, // src = path no storage
    }))
    const filtered = showMissing ? list : list.filter(m => m.src)
    if (videoSrc) filtered.push({ kind: 'video', slot: 'video', title: 'Vídeo', src: videoSrc })
    return filtered
  }, [checks, videoSrc, showMissing])

  useEffect(() => { if (open) setActive(0) }, [open, showMissing])
  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setActive(i => Math.min(media.length - 1, i + 1))
      if (e.key === 'ArrowLeft')  setActive(i => Math.max(0, i - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, media.length])

  if (!open || !product) return null

  const current = media[active] || media[0]
  const filled = media.filter(m => m.kind === 'photo' && m.src).length
  const price = Number(product.price_ml) || Number(product.sale_price) || 0
  const installment = price ? price / 12 : 0

  // Chamadas como função (não como <Componente/>) pra não remontar o <video> a cada render
  function renderMain(className) {
    if (!current) return null
    if (current.kind === 'video') {
      return <video key="pdp-video" src={current.src} onError={onVideoError} controls autoPlay className={`${className} bg-black object-contain`} />
    }
    if (!current.src) {
      return (
        <div className={`${className} flex flex-col items-center justify-center gap-2 bg-slate-50 border-2 border-dashed border-slate-200 text-slate-400`}>
          <ImageOff size={32} strokeWidth={1.5} />
          <span className="text-sm font-semibold">Foto {String(current.slot).padStart(2, '0')} faltando</span>
          <span className="text-xs">{current.title}</span>
        </div>
      )
    }
    return <StorageImage bucket="product-photos" path={current.src} alt={current.title} className={`${className} object-contain bg-white`} />
  }

  function renderThumb(m, i, size) {
    const isActive = i === active
    return (
      <button type="button" onMouseEnter={() => device === 'desktop' && setActive(i)} onClick={() => setActive(i)}
        className={`${size} shrink-0 rounded-md overflow-hidden border-2 bg-white flex items-center justify-center relative ${isActive ? 'border-sky-500' : 'border-slate-200 hover:border-sky-300'}`}
        title={m.kind === 'video' ? 'Vídeo' : `${String(m.slot).padStart(2, '0')} · ${m.title}`}>
        {m.kind === 'video' ? (
          <span className="w-full h-full bg-slate-800 flex items-center justify-center"><Play size={16} className="text-white" fill="white" /></span>
        ) : m.src ? (
          <StorageImage bucket="product-photos" path={m.src} className="w-full h-full object-contain" />
        ) : (
          <span className="text-[10px] font-bold text-slate-300">{String(m.slot).padStart(2, '0')}</span>
        )}
      </button>
    )
  }

  const Info = (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-slate-400">Novo | +100 vendidos</p>
      <h1 className="text-[22px] leading-tight font-semibold text-slate-800">{product.name}</h1>
      <div className="flex items-center gap-1 text-sky-600 text-sm">
        <span className="font-semibold">4.9</span>
        {[1, 2, 3, 4, 5].map(i => <Star key={i} size={13} fill="currentColor" />)}
        <span className="text-slate-400">(128)</span>
      </div>
      <div>
        {price > 0 ? (
          <>
            <p className="text-[34px] font-light text-slate-800 leading-none">{fmtPreco(price)}</p>
            <p className="text-sm text-emerald-600 mt-1">em 12x {fmtPreco(installment)}</p>
          </>
        ) : (
          <p className="text-sm text-amber-600 font-semibold">Sem preço do ML no cadastro</p>
        )}
      </div>
      <p className="text-sm text-emerald-600 font-semibold flex items-center gap-1.5"><Truck size={15} /> Frete grátis <span className="font-normal text-slate-500">— chegará amanhã</span></p>
      <p className="text-sm text-slate-700 font-semibold">Estoque disponível {product.stock_qty != null && <span className="font-normal text-slate-400">({Number(product.stock_qty)} unidades)</span>}</p>
      <button type="button" className="w-full py-3 rounded-md bg-sky-600 text-white font-semibold cursor-default">Comprar agora</button>
      <button type="button" className="w-full py-3 rounded-md bg-sky-100 text-sky-700 font-semibold cursor-default">Adicionar ao carrinho</button>
      <p className="text-xs text-slate-500 flex items-center gap-1.5"><ShieldCheck size={14} className="text-slate-400" /> Compra Garantida — receba o produto que está esperando ou devolvemos o dinheiro.</p>
      {product.short_description && (
        <div className="border-t border-slate-100 pt-3">
          <p className="text-sm font-semibold text-slate-700 mb-1">O que você precisa saber sobre este produto</p>
          <p className="text-sm text-slate-500 leading-relaxed">{product.short_description}</p>
        </div>
      )}
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex flex-col" onClick={onClose}>
      {/* Barra de controle do simulador (não faz parte do "anúncio") */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-slate-900 text-white" onClick={e => e.stopPropagation()}>
        <div className="min-w-0">
          <p className="text-sm font-bold truncate">Simulação do anúncio — {product.name}</p>
          <p className="text-[11px] text-slate-400">{filled}/9 fotos{videoSrc ? ' + vídeo' : ''} · só pré-visualização, nada é publicado · passe o mouse nas miniaturas ou use ← →</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <label className="hidden sm:flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer select-none mr-2">
            <input type="checkbox" checked={showMissing} onChange={e => setShowMissing(e.target.checked)} className="accent-sky-500" />
            Mostrar fotos faltando
          </label>
          <div className="flex bg-slate-800 rounded-lg p-0.5">
            <button onClick={() => setDevice('desktop')} className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1 ${device === 'desktop' ? 'bg-white text-slate-800' : 'text-slate-300'}`}><Monitor size={13} /> Computador</button>
            <button onClick={() => setDevice('mobile')} className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1 ${device === 'mobile' ? 'bg-white text-slate-800' : 'text-slate-300'}`}><Smartphone size={13} /> Celular</button>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10"><X size={18} /></button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-[#EDEDED] py-6 px-3" onClick={e => e.stopPropagation()}>
        {device === 'desktop' ? (
          <div className="max-w-[1180px] mx-auto bg-white rounded-md shadow-sm p-6 grid grid-cols-[64px_1fr_340px] gap-5">
            <div className="flex flex-col gap-2">
              {media.map((m, i) => <div key={m.slot}>{renderThumb(m, i, "w-14 h-14")}</div>)}
            </div>
            <div className="flex items-start justify-center">
              {renderMain("w-full max-w-[560px] aspect-square rounded")}
            </div>
            <div className="border border-slate-200 rounded-lg p-5">{Info}</div>
          </div>
        ) : (
          <div className="mx-auto w-[390px] bg-white rounded-[28px] shadow-xl overflow-hidden border-8 border-slate-800">
            <div className="relative">
              {renderMain("w-full aspect-square")}
              <span className="absolute top-3 left-3 text-[11px] font-semibold bg-white/90 text-slate-600 px-2 py-0.5 rounded-full">{active + 1} / {media.length}</span>
              {active > 0 && (
                <button onClick={() => setActive(i => i - 1)} className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 flex items-center justify-center shadow"><ChevronLeft size={18} /></button>
              )}
              {active < media.length - 1 && (
                <button onClick={() => setActive(i => i + 1)} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 flex items-center justify-center shadow"><ChevronRight size={18} /></button>
              )}
            </div>
            <div className="flex justify-center gap-1 py-2">
              {media.map((_, i) => <span key={i} className={`w-1.5 h-1.5 rounded-full ${i === active ? 'bg-sky-500' : 'bg-slate-300'}`} />)}
            </div>
            <div className="px-4 pb-6">{Info}</div>
          </div>
        )}
      </div>
    </div>
  )
}
