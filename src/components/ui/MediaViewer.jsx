import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronLeft, ChevronRight, ExternalLink, Download, PlayCircle } from 'lucide-react'

// Visualizador de fotos e vídeos em tela cheia, sem abrir aba nova (05/10,
// pedido do Raphael — antes cada foto/vídeo do comprador abria em outra aba).
// Reaproveitável em qualquer tela: passe `items` e o índice inicial.
//   items: [{ url, type?: 'image' | 'video', label? }]
//   type é deduzido pela extensão quando não vier.
// Atalhos: ← → navega, Esc fecha, clique fora fecha.
export function mediaType(item) {
  if (item?.type) return item.type
  return /\.(mp4|mov|webm|m4v|qt)(\?|$)/i.test(item?.url || '') ? 'video' : 'image'
}

export function MediaViewer({ items, index = 0, onClose }) {
  const [i, setI] = useState(index)
  useEffect(() => { setI(index) }, [index])
  const n = items?.length || 0
  const prev = useCallback(() => setI(v => (v - 1 + n) % n), [n])
  const next = useCallback(() => setI(v => (v + 1) % n), [n])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow }
  }, [onClose, prev, next])

  if (!n) return null
  const cur = items[Math.min(i, n - 1)]
  const isVideo = mediaType(cur) === 'video'

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col" onClick={onClose}>
      {/* Barra de cima */}
      <div className="flex items-center justify-between px-4 py-3 text-white/90 text-sm shrink-0" onClick={e => e.stopPropagation()}>
        <span className="font-semibold">{i + 1} / {n}{cur.label ? <span className="font-normal text-white/60"> · {cur.label}</span> : null}</span>
        <div className="flex items-center gap-1">
          <a href={cur.url} download target="_blank" rel="noreferrer" title="Baixar"
            className="p-2 rounded-lg hover:bg-white/10"><Download size={18}/></a>
          <a href={cur.url} target="_blank" rel="noreferrer" title="Abrir o original em outra aba"
            className="p-2 rounded-lg hover:bg-white/10"><ExternalLink size={18}/></a>
          <button onClick={onClose} title="Fechar (Esc)" className="p-2 rounded-lg hover:bg-white/10"><X size={20}/></button>
        </div>
      </div>

      {/* Mídia */}
      <div className="flex-1 min-h-0 flex items-center justify-center relative px-14">
        {n > 1 && (
          <button onClick={e => { e.stopPropagation(); prev() }} title="Anterior (←)"
            className="absolute left-3 p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white"><ChevronLeft size={24}/></button>
        )}
        {isVideo ? (
          <video key={cur.url} src={cur.url} controls autoPlay playsInline onClick={e => e.stopPropagation()}
            className="max-w-full max-h-full rounded-lg bg-black"/>
        ) : (
          <img key={cur.url} src={cur.url} alt="" onClick={e => e.stopPropagation()}
            className="max-w-full max-h-full object-contain rounded-lg select-none"/>
        )}
        {n > 1 && (
          <button onClick={e => { e.stopPropagation(); next() }} title="Próxima (→)"
            className="absolute right-3 p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white"><ChevronRight size={24}/></button>
        )}
      </div>

      {/* Miniaturas */}
      {n > 1 && (
        <div className="flex gap-2 justify-center px-4 py-3 overflow-x-auto shrink-0" onClick={e => e.stopPropagation()}>
          {items.map((it, k) => (
            <button key={k} onClick={() => setI(k)}
              className={`relative w-14 h-14 rounded-md overflow-hidden shrink-0 border-2 ${k === i ? 'border-white' : 'border-transparent opacity-50 hover:opacity-90'}`}>
              {mediaType(it) === 'video'
                ? <span className="w-full h-full bg-slate-700 flex items-center justify-center text-white"><PlayCircle size={20}/></span>
                : <img src={it.url} alt="" className="w-full h-full object-cover"/>}
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  )
}

// Miniatura clicável padrão (foto ou vídeo) — abre o MediaViewer.
export function MediaThumb({ item, onClick, size = 'w-20 h-20', className = '', children }) {
  const video = mediaType(item) === 'video'
  return (
    <button type="button" onClick={onClick}
      className={`relative ${size} rounded-lg overflow-hidden border border-slate-200 hover:ring-2 hover:ring-orange-300 shrink-0 ${className}`}>
      {video ? (
        <span className="w-full h-full bg-slate-800 text-white text-xs flex flex-col items-center justify-center gap-0.5"><PlayCircle size={20}/>vídeo</span>
      ) : (
        <img src={item.url} alt="" className="w-full h-full object-cover" loading="lazy"/>
      )}
      {children}
    </button>
  )
}
