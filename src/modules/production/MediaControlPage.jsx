import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Film, Search, Package, Layers, Video, CheckCircle2, Clock, Star, Target } from 'lucide-react'
import { useMediaProductsList } from './hooks/useProductMediaStatus'
import { useSignedUrl } from '../../lib/signedUrlCache'

const CHECK_COUNT = 9

function ProductThumb({ photoUrl }) {
  const url = useSignedUrl('product-photos', photoUrl)
  if (!url) return <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center shrink-0"><Package size={16} className="text-slate-300" /></div>
  return <img src={url} alt="" className="w-11 h-11 rounded-xl object-cover shrink-0 border border-slate-100" />
}

function ProgressBadge({ checksFilled, hasVideo }) {
  const complete = checksFilled === CHECK_COUNT && hasVideo
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg
      ${complete ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
      {complete ? <CheckCircle2 size={11} /> : <Clock size={11} />}
      {checksFilled}/{CHECK_COUNT} fotos
      <Video size={11} className={hasVideo ? 'text-emerald-600' : 'text-slate-300'} />
    </span>
  )
}

function ProductCard({ product, variations, isGroup, isPriority, onOpen, onTogglePriority }) {
  return (
    <div className="w-full flex items-center gap-3 p-3 bg-white border border-slate-100 rounded-2xl hover:border-violet-200 hover:shadow-sm transition-all">
      <button onClick={e => { e.stopPropagation(); onTogglePriority(product.id, !isPriority) }}
        title={isPriority ? 'Remover da prioridade' : 'Marcar como prioridade da semana'}
        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors
          ${isPriority ? 'bg-amber-100 text-amber-500 hover:bg-amber-200' : 'text-slate-200 hover:text-amber-400 hover:bg-amber-50'}`}>
        <Star size={15} fill={isPriority ? 'currentColor' : 'none'} strokeWidth={1.8} />
      </button>
      <button onClick={() => onOpen(product.id)} className="flex-1 min-w-0 flex items-center gap-3 text-left">
        <ProductThumb photoUrl={product.photo_url} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800 truncate">{product.name}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {product.sku && <span className="text-[10px] text-slate-400 font-mono">{product.sku}</span>}
            {isGroup && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-violet-500 bg-violet-50 px-1.5 py-0.5 rounded-md">
                <Layers size={9} /> {variations.length + 1} variações
              </span>
            )}
          </div>
        </div>
        <ProgressBadge checksFilled={product.checksFilled} hasVideo={product.hasVideo} />
      </button>
    </div>
  )
}

export function MediaControlPage() {
  const { groups, totals, loading, togglePriority } = useMediaProductsList()
  const [search, setSearch] = useState('')
  const navigate = useNavigate()

  const filtered = useMemo(() => {
    if (!search.trim()) return groups
    const q = search.toLowerCase()
    return groups.filter(g =>
      g.master.name.toLowerCase().includes(q) || g.master.sku?.toLowerCase().includes(q) ||
      g.variations.some(v => v.name.toLowerCase().includes(q) || v.sku?.toLowerCase().includes(q))
    )
  }, [groups, search])

  const priorityGroups = useMemo(() =>
    filtered.filter(g => g.master.isPriority)
      .sort((a, b) => new Date(b.master.prioritizedAt || 0) - new Date(a.master.prioritizedAt || 0))
  , [filtered])

  const regularGroups = useMemo(() => filtered.filter(g => !g.master.isPriority), [filtered])

  function openProduct(id) { navigate(`/producao/midia/${id}`) }

  return (
    <div className="p-6 max-w-[1100px] mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3.5 mb-6">
        <div className="w-11 h-11 bg-gradient-to-br from-violet-500 to-violet-600 rounded-2xl flex items-center justify-center shrink-0 shadow-sm shadow-violet-200">
          <Film size={22} strokeWidth={1.5} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Atualização de Mídia</h1>
          <p className="text-sm text-slate-500">9 fotos + 1 vídeo por produto, seguindo o guia padrão</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <p className="text-[11px] text-slate-400 font-semibold uppercase">Produtos ativos</p>
          <p className="text-2xl font-black text-slate-800">{totals.total}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <p className="text-[11px] text-slate-400 font-semibold uppercase">Completos (9 fotos + vídeo)</p>
          <p className="text-2xl font-black text-emerald-600">{totals.completos}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <p className="text-[11px] text-slate-400 font-semibold uppercase">Com pendência</p>
          <p className="text-2xl font-black text-amber-600">{totals.pendentes}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <p className="text-[11px] text-slate-400 font-semibold uppercase">Com feedback</p>
          <p className="text-2xl font-black text-slate-800">{totals.feedback}</p>
        </div>
      </div>

      {/* Busca */}
      <div className="relative mb-4 max-w-md">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className="input pl-8" placeholder="Buscar por produto ou SKU..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col gap-6">

          {/* Priorizados da semana */}
          <div className="p-4 bg-amber-50/60 border-2 border-amber-100 rounded-2xl">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-1">
              <div className="flex items-center gap-2">
                <Target size={16} className="text-amber-500" />
                <h2 className="text-sm font-black text-amber-700 uppercase tracking-wide">Priorizados esta semana</h2>
                <span className="text-[11px] font-black w-5 h-5 rounded-full bg-amber-400 text-white flex items-center justify-center">
                  {priorityGroups.length}
                </span>
              </div>
              <span className="text-[11px] text-amber-600/80 font-semibold">Ideal: 3 a 5 por vez</span>
            </div>
            {priorityGroups.length === 0 ? (
              <div className="border-2 border-dashed border-amber-200 rounded-xl p-6 text-center text-xs text-amber-600/70 font-semibold">
                Nenhum produto priorizado ainda — clica na estrela de um produto aí embaixo pra marcar.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {priorityGroups.map(g => (
                  <ProductCard key={g.key} product={g.master} variations={g.variations} isGroup={g.isGroup}
                    isPriority onOpen={openProduct} onTogglePriority={togglePriority} />
                ))}
              </div>
            )}
          </div>

          {/* Todos os demais produtos */}
          <div>
            <h2 className="text-xs font-black text-slate-400 uppercase tracking-wide mb-2 px-1">
              A priorizar ({regularGroups.length})
            </h2>
            <div className="flex flex-col gap-2">
              {regularGroups.length === 0 ? (
                <div className="border-2 border-dashed border-slate-100 rounded-2xl p-10 text-center text-sm text-slate-300 font-semibold">
                  Nenhum produto encontrado
                </div>
              ) : regularGroups.map(g => (
                <ProductCard key={g.key} product={g.master} variations={g.variations} isGroup={g.isGroup}
                  isPriority={false} onOpen={openProduct} onTogglePriority={togglePriority} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
