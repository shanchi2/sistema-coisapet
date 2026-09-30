import { useEffect, useMemo, useState } from 'react'
import { Search, Check, X, Megaphone, Loader2 } from 'lucide-react'
import { supabase } from '../../../lib/supabase'

// Banners deste post (01/10, fase90) — cada post escolhe: sorteio geral
// (como antes), produtos escolhidos (ticados aqui) ou sem banner; e se
// divulga o cupom ou é só banner. O tipo de bicho só FILTRA a lista de
// produtos — busca pelo nome do produto, que já traz o bicho ("...para
// Hamster Gerbil Topolino..."), porque o campo de espécies do cadastro
// está vazio em todos os produtos.
export const SPECIES = [
  { v: 'hamster',   label: 'Hamster',            words: ['hamster'] },
  { v: 'porquinho', label: 'Porquinho-da-índia', words: ['porquinho', 'porquinhos', 'india', 'cobaia'] },
  { v: 'coelho',    label: 'Coelho',             words: ['coelho'] },
  { v: 'gerbil',    label: 'Gerbil',             words: ['gerbil'] },
  { v: 'topolino',  label: 'Topolino',           words: ['topolino'] },
  { v: 'twister',   label: 'Twister',            words: ['twister'] },
  { v: 'chinchila', label: 'Chinchila',          words: ['chinchila'] },
  { v: 'repteis',   label: 'Répteis',            words: ['reptil', 'repteis', 'reptei', 'lagarto', 'gecko', 'serpente'] },
  { v: 'aves',      label: 'Aves',               words: ['ave ', 'aves', 'passaro', 'calopsita', 'periquito'] },
]
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const matchesSpecies = (name, v) => { const sp = SPECIES.find(s => s.v === v); const n = norm(name) + ' '; return !!sp && sp.words.some(w => n.includes(w)) }
const photoUrl = p => p ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/product-photos/${p}` : null

export function PostBannerCard({ mode, setMode, coupon, setCoupon, species, setSpecies, productIds, setProductIds, postText, globalSettings }) {
  const [products, setProducts] = useState(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    if (mode !== 'escolhidos' || products) return
    // Só produto que dá pra banner: ativo, vendável, com foto e com link de loja
    supabase.from('products').select('id, name, sku, photo_url, url_ml, url_shopee')
      .eq('active', true).eq('is_sellable', true).not('photo_url', 'is', null).order('name').limit(2000)
      .then(({ data }) => setProducts((data || []).filter(p => p.url_ml || p.url_shopee)))
  }, [mode, products])

  // Sugestão de bicho pelo título/palavra-chave do post
  const suggested = useMemo(() => SPECIES.filter(s => !species.includes(s.v) && s.words.some(w => (norm(postText) + ' ').includes(w))), [postText, species])

  const selected = useMemo(() => (products || []).filter(p => productIds.includes(p.id)), [products, productIds])
  const list = useMemo(() => {
    const t = norm(q).split(/\s+/).filter(Boolean)
    return (products || [])
      .filter(p => !species.length || species.some(v => matchesSpecies(p.name, v)))
      .filter(p => !t.length || t.every(x => norm(p.name + ' ' + p.sku).includes(x)))
      .slice(0, 80)
  }, [products, species, q])

  function toggleProduct(id) { setProductIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]) }
  function toggleSpecies(v) { setSpecies(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]) }

  const couponOn = coupon === 'sim' || (coupon === 'padrao' && globalSettings?.show_coupon !== false)
  const btn = on => `text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors ${on ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`

  return (
    <div className="space-y-3">
      <div>
        <label className="text-[11px] font-semibold text-slate-500 mb-1 block">O que mostrar</label>
        <div className="grid grid-cols-3 gap-1.5">
          {[['padrao', 'Sorteio geral'], ['escolhidos', 'Produtos escolhidos'], ['nenhum', 'Sem banner']].map(([v, l]) => (
            <button key={v} type="button" onClick={() => setMode(v)} className={btn(mode === v)}>{l}</button>
          ))}
        </div>
        <p className="text-[11px] text-slate-400 mt-1">
          {mode === 'padrao' && `Produto sorteado das categorias configuradas em Diretoria → Banners do Blog${globalSettings && !globalSettings.active ? ' (hoje DESLIGADO lá — não aparece nada)' : ''}.`}
          {mode === 'escolhidos' && 'Aparece sempre (mesmo com o sorteio geral desligado): 1 banner no meio do texto e, se tiver 2+ produtos, outro no fim.'}
          {mode === 'nenhum' && 'Este post não mostra banner nenhum.'}
        </p>
      </div>

      {mode !== 'nenhum' && (
        <div>
          <label className="text-[11px] font-semibold text-slate-500 mb-1 block">Cupom</label>
          <div className="grid grid-cols-3 gap-1.5">
            {[['padrao', 'Padrão do blog'], ['sim', 'Divulgar cupom'], ['nao', 'Só banner']].map(([v, l]) => (
              <button key={v} type="button" onClick={() => setCoupon(v)} className={btn(coupon === v)}>{l}</button>
            ))}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {couponOn && globalSettings?.coupon_code
              ? <>Vai aparecer: “use o cupom <b>{globalSettings.coupon_code}</b> e ganhe <b>{globalSettings.discount_label}</b>”.</>
              : 'Banner só com o produto e os links das lojas, sem cupom.'}
          </p>
        </div>
      )}

      {mode === 'escolhidos' && (
        <>
          <div>
            <label className="text-[11px] font-semibold text-slate-500 mb-1 block">Tipo de bicho do post <span className="font-normal text-slate-400">(filtra a lista)</span></label>
            <div className="flex flex-wrap gap-1.5">
              {SPECIES.map(s => (
                <button key={s.v} type="button" onClick={() => toggleSpecies(s.v)}
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${species.includes(s.v) ? 'bg-indigo-500 border-indigo-500 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                  {s.label}
                </button>
              ))}
            </div>
            {suggested.length > 0 && (
              <p className="text-[11px] text-indigo-600 mt-1">
                O post fala de {suggested.map(s => s.label).join(', ')} —{' '}
                <button type="button" onClick={() => setSpecies(prev => [...prev, ...suggested.map(s => s.v)])} className="font-bold underline">filtrar por isso</button>
              </p>
            )}
          </div>

          {selected.length > 0 && (
            <div>
              <label className="text-[11px] font-semibold text-slate-500 mb-1 block">Escolhidos ({selected.length})</label>
              <div className="flex flex-col gap-1">
                {selected.map(p => (
                  <div key={p.id} className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-lg px-2 py-1.5">
                    <img src={photoUrl(p.photo_url)} alt="" className="w-7 h-7 rounded object-cover shrink-0" />
                    <span className="flex-1 min-w-0"><span className="text-[11px] text-slate-700 leading-tight line-clamp-2">{p.name}</span>{p.sku && <span className="block text-[9px] font-mono text-indigo-400">{p.sku}</span>}</span>
                    <button type="button" onClick={() => toggleProduct(p.id)} className="p-0.5 text-slate-400 hover:text-rose-500 shrink-0"><X size={13} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="relative mb-1.5">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar produto…" className="input pl-8 py-1.5 text-xs" />
            </div>
            {!products ? (
              <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-slate-300" /></div>
            ) : (
              <div className="max-h-72 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-50">
                {list.length === 0 && <p className="text-[11px] text-slate-400 text-center py-4">Nenhum produto com esse filtro.</p>}
                {list.map(p => {
                  const on = productIds.includes(p.id)
                  return (
                    <button key={p.id} type="button" onClick={() => toggleProduct(p.id)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 text-left ${on ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}>
                      <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? 'bg-indigo-500 border-indigo-500' : 'border-slate-300'}`}>{on && <Check size={11} className="text-white" strokeWidth={3} />}</span>
                      <img src={photoUrl(p.photo_url)} alt="" loading="lazy" className="w-8 h-8 rounded object-cover shrink-0" />
                      <span className="flex-1 min-w-0"><span className="text-[11px] text-slate-700 leading-tight line-clamp-2">{p.name}</span>{p.sku && <span className="block text-[9px] font-mono text-slate-400">{p.sku}</span>}</span>
                      <span className="text-[9px] font-bold text-slate-400 shrink-0">{[p.url_shopee && 'SHP', p.url_ml && 'ML'].filter(Boolean).join('·')}</span>
                    </button>
                  )
                })}
              </div>
            )}
            <p className="text-[10px] text-slate-400 mt-1">Só aparecem produtos com foto e link da Shopee/ML (sem isso o banner não tem pra onde mandar).</p>
          </div>
        </>
      )}
    </div>
  )
}

export { Megaphone as BannerIcon }
