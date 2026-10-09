import { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

// Peças compartilhadas das telas unificadas ML + Shopee (Fase 1, 09/10).
// Cores combinadas com o Raphael: ML amarelo, Shopee laranja.

export const PLAT = {
  ml:     { key: 'ml', label: 'Mercado Livre', short: 'ML', color: '#F2C200', bar: '#F2C200', soft: '#FFF9D6', ink: '#7A5F00', chip: 'bg-[#FFE600] text-[#2D3277]' },
  shopee: { key: 'shopee', label: 'Shopee', short: 'Shopee', color: '#EE4D2D', bar: '#EE4D2D', soft: '#FFEDE8', ink: '#B5321A', chip: 'bg-[#EE4D2D] text-white' },
}
export const PLATFORMS = ['ml', 'shopee']

export const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
export const brl = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
export const brl2 = v => v == null ? '—' : (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const fmtN = v => (Number(v) || 0).toLocaleString('pt-BR')

// Mesmo critério da tela ML × Shopee da Diretoria
export function isCancelled(o) {
  if ((o.status_ml || '').toLowerCase().startsWith('cancel')) return true
  return ['CANCELLED', 'IN_CANCEL'].includes(o.marketplace_status)
}

const STORE_KEY = 'coisapet_mkt_plataforma'
// Filtro de plataforma: fica na URL (?p=ml|shopee) pra dar pra mandar o
// link, e lembra a última escolha no navegador. '' = as duas.
export function usePlatformFilter() {
  const [params, setParams] = useSearchParams()
  const fromUrl = params.get('p')
  const [stored] = useState(() => { try { return localStorage.getItem(STORE_KEY) || '' } catch { return '' } })
  const plat = PLATFORMS.includes(fromUrl) ? fromUrl : fromUrl === 'all' ? '' : PLATFORMS.includes(stored) ? stored : ''
  const setPlat = useCallback(p => {
    try { localStorage.setItem(STORE_KEY, p) } catch { /* sem storage */ }
    setParams(prev => { const n = new URLSearchParams(prev); n.set('p', p || 'all'); return n }, { replace: true })
  }, [setParams])
  return [plat, setPlat]
}

export function PlatformFilter({ value, onChange, counts }) {
  return (
    <div className="flex bg-slate-100 rounded-xl p-1 gap-0.5" role="tablist" aria-label="Plataforma">
      {[['', 'ML + Shopee'], ['ml', 'Mercado Livre'], ['shopee', 'Shopee']].map(([k, l]) => (
        <button key={k || 'all'} role="tab" aria-selected={value === k} onClick={() => onChange(k)}
          className={`h-8 px-3.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${value === k ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          {k ? <span className="w-2.5 h-2.5 rounded-sm" style={{ background: PLAT[k].color }} /> : <span className="flex"><span className="w-2.5 h-2.5 rounded-l-sm" style={{ background: PLAT.ml.color }} /><span className="w-2.5 h-2.5 rounded-r-sm" style={{ background: PLAT.shopee.color }} /></span>}
          {l}
          {counts && <span className="text-[11px] text-slate-400 tabular-nums">{fmtN(k ? counts[k] : counts.ml + counts.shopee)}</span>}
        </button>
      ))}
    </div>
  )
}

export function PlatBadge({ p, className = '' }) {
  return <span className={`inline-flex items-center px-1.5 py-px rounded text-[10px] font-black ${PLAT[p].chip} ${className}`}>{PLAT[p].short}</span>
}

export function Segmented({ value, onChange, options }) {
  return (
    <div className="flex bg-slate-100 rounded-xl p-1 gap-0.5">
      {options.map(([k, l]) => (
        <button key={k} onClick={() => onChange(k)}
          className={`h-8 px-3 rounded-lg text-xs font-semibold transition ${value === k ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{l}</button>
      ))}
    </div>
  )
}

export async function fetchAll(build, max = 30) {
  const all = []
  for (let page = 0; page < max; page++) {
    const { data, error } = await build().range(page * 1000, page * 1000 + 999)
    if (error) throw error
    all.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return all
}
