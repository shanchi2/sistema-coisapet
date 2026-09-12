import { useEffect, useRef, useState } from 'react'
import { Search, X, ImageOff } from 'lucide-react'
import { supabase } from '../../../lib/supabase'

// Busca produto ativo (com foto) pra usar como referência visual na
// geração de imagem por IA. Testado ao vivo (11/09): a Higgsfield
// reproduz o objeto da foto com bastante fidelidade — só faz sentido
// escolher um produto da MESMA categoria/assunto do post (uma foto de
// rodinha não ajuda um post sobre terrário) — por isso é sempre
// opcional e escolhido na hora, nunca automático.
export function ProductReferencePicker({ value, onChange }) {
  const [query, setQuery] = useState('')
  const [products, setProducts] = useState(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [selectedThumb, setSelectedThumb] = useState(null)
  const boxRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!value?.photo_url) { setSelectedThumb(null); return }
    let cancelled = false
    supabase.storage.from('product-photos').createSignedUrl(value.photo_url, 3600).then(({ data }) => {
      if (!cancelled) setSelectedThumb(data?.signedUrl ?? null)
    })
    return () => { cancelled = true }
  }, [value?.photo_url])

  async function ensureLoaded() {
    if (products !== null || loading) return
    setLoading(true)
    const { data } = await supabase.from('products')
      .select('id, name, sku, photo_url')
      .eq('active', true).not('photo_url', 'is', null)
      .order('name')
    setLoading(false)
    setProducts(data || [])
  }

  const q = query.trim().toLowerCase()
  const filtered = !products ? [] : (!q ? products.slice(0, 8) : products.filter(p => p.name.toLowerCase().includes(q)).slice(0, 20))

  if (value) {
    return (
      <div className="flex items-center gap-2 p-1.5 border border-slate-200 rounded-lg bg-slate-50">
        {selectedThumb
          ? <img src={selectedThumb} alt="" className="w-8 h-8 object-cover rounded shrink-0" />
          : <div className="w-8 h-8 rounded bg-slate-200 flex items-center justify-center shrink-0"><ImageOff size={12} className="text-slate-400" /></div>}
        <span className="flex-1 min-w-0 text-xs text-slate-600 truncate">{value.name}</span>
        <button type="button" onClick={() => onChange(null)} className="p-1 text-slate-400 hover:text-rose-500 shrink-0"><X size={13} /></button>
      </div>
    )
  }

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className="input text-xs pl-7" placeholder="Buscar produto pra usar como referência..."
          value={query}
          onFocus={() => { setOpen(true); ensureLoaded() }}
          onChange={e => { setQuery(e.target.value); setOpen(true); ensureLoaded() }} />
      </div>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 max-h-52 overflow-y-auto">
          {loading ? (
            <p className="text-xs text-slate-400 text-center py-3">Carregando...</p>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-3">Nenhum produto com foto encontrado.</p>
          ) : (
            filtered.map(p => (
              <button key={p.id} type="button"
                onClick={() => { onChange(p); setQuery(''); setOpen(false) }}
                className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors truncate block">
                {p.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
