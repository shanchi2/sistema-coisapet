import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Trash2, Images } from 'lucide-react'
import { StorageImage } from '../../components/ui/StorageImage'

// Mini carrossel de referência ao lado do box de upload de cada check —
// mostra 1 imagem de exemplo por vez (até 5, uma por guia pronto de
// produto diferente: Kit, Substrato, Banheirinha, Rodinha, Terrário).
// Isa pagina pra ver a inspiração daquele tipo de foto.
export function GuideExampleCarousel({ examples, onAdd, onRemove }) {
  const [idx, setIdx] = useState(0)
  const inputRef = useRef()
  const list = examples || []
  const current = list[Math.min(idx, list.length - 1)]

  function handleFiles(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (files.length) onAdd(files)
  }

  return (
    <div className="relative shrink-0 group">
      {/* Preview ampliado — some no hover, sem precisar clicar */}
      {current?.image_url && (
        <div className="hidden group-hover:block absolute z-50 bottom-full right-0 mb-2 w-48 sm:w-56 aspect-[4/5] rounded-xl overflow-hidden shadow-2xl border-2 border-white pointer-events-none">
          <StorageImage bucket="product-photos" path={current.image_url} className="w-full h-full object-cover" />
        </div>
      )}

      <div className="w-24 sm:w-28 aspect-[4/5] rounded-xl bg-slate-50 border border-dashed border-slate-200 relative overflow-hidden">
        {current ? (
          <>
            <StorageImage bucket="product-photos" path={current.image_url} className="w-full h-full object-cover" />
            {list.length > 1 && (
              <>
                <button onClick={() => setIdx(i => (i - 1 + list.length) % list.length)}
                  className="absolute left-0.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white/85 backdrop-blur flex items-center justify-center text-slate-500 hover:text-violet-600 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ChevronLeft size={12} />
                </button>
                <button onClick={() => setIdx(i => (i + 1) % list.length)}
                  className="absolute right-0.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white/85 backdrop-blur flex items-center justify-center text-slate-500 hover:text-violet-600 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ChevronRight size={12} />
                </button>
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] font-bold text-white bg-black/50 px-1.5 py-0.5 rounded-full">
                  {idx + 1}/{list.length}
                </span>
              </>
            )}
            <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => inputRef.current?.click()}
                className="w-5 h-5 rounded-md bg-white/85 backdrop-blur flex items-center justify-center text-slate-500 hover:text-violet-600">
                <Plus size={11} />
              </button>
              <button onClick={() => onRemove(current.id)}
                className="w-5 h-5 rounded-md bg-white/85 backdrop-blur flex items-center justify-center text-slate-500 hover:text-rose-500">
                <Trash2 size={10} />
              </button>
            </div>
          </>
        ) : (
          <button onClick={() => inputRef.current?.click()}
            className="w-full h-full flex flex-col items-center justify-center gap-1 text-slate-300 hover:text-violet-400 transition-colors">
            <Images size={16} strokeWidth={1.5} />
            <span className="text-[9px] font-semibold text-center px-1 leading-tight">Referência</span>
          </button>
        )}
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
      </div>
    </div>
  )
}
