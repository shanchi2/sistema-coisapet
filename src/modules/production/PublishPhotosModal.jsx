import { useEffect, useMemo, useState } from 'react'
import { Loader2, Check, X, Send, ExternalLink, AlertTriangle, RotateCcw, Search, Square, CheckCircle2, History } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { getSignedUrl } from '../../lib/signedUrlCache'
import { StorageImage } from '../../components/ui/StorageImage'
import { MEDIA_CHECKLIST } from './mediaChecklist'
import toast from 'react-hot-toast'

// Publicar as fotos da Atualização de Mídia nos anúncios do ML/Shopee
// (26/09). Acha os anúncios pelo SKU do produto, mostra antes × depois,
// pede confirmação explícita (regra de toda escrita em marketplace) e
// SUBSTITUI as fotos do anúncio. A lista anterior fica guardada em
// media_publish_log pra "Desfazer".

const PLATFORMS = {
  ml:     { label: 'Mercado Livre', fn: 'ml-insights',     max: 12, tone: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  shopee: { label: 'Shopee',        fn: 'shopee-insights', max: 9,  tone: 'bg-orange-100 text-orange-700 border-orange-300' },
}

function getSession() {
  try { return JSON.parse(localStorage.getItem('coisapet_session') || '{}') } catch { return {} }
}

async function invoke(fn, body) {
  const { data, error } = await supabase.functions.invoke(fn, { body })
  if (error || data?.error) {
    let msg = data?.error || error?.message || 'Erro na integração.'
    try { const p = await error?.context?.json?.(); if (p?.error) msg = p.error } catch { /* mantém */ }
    throw new Error(msg)
  }
  return data
}

// Foto do storage → JPEG base64. `square`: centraliza num quadrado branco
// (o marketplace mostra a galeria quadrada; 4:5 ficaria com faixa).
async function prepareImage(path, square) {
  const url = await getSignedUrl('product-photos', path)
  const blob = await (await fetch(url)).blob()
  const bmp = await createImageBitmap(blob)
  const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height))
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale)
  const cw = square ? Math.max(w, h) : w, ch = square ? Math.max(w, h) : h
  const canvas = document.createElement('canvas')
  canvas.width = cw; canvas.height = ch
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, cw, ch)
  ctx.drawImage(bmp, Math.round((cw - w) / 2), Math.round((ch - h) / 2), w, h)
  return canvas.toDataURL('image/jpeg', 0.92).split(',')[1]
}

function fmtDataHora(iso) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

export function PublishPhotosModal({ open, onClose, product, checks }) {
  const [platforms, setPlatforms] = useState({ ml: true, shopee: true })
  const [listings, setListings]   = useState({ ml: null, shopee: null }) // null = buscando
  const [errors, setErrors]       = useState({})
  const [selected, setSelected]   = useState(new Set()) // "ml:MLB123"
  const [slots, setSlots]         = useState(new Set())
  const [square, setSquare]       = useState(true)
  const [confirming, setConfirming] = useState(false)
  const [running, setRunning]     = useState(false)
  const [progress, setProgress]   = useState([]) // [{ key, label, status, msg }]
  const [history, setHistory]     = useState([])

  const filledSlots = useMemo(() => MEDIA_CHECKLIST.filter(i => checks?.[i.slot]?.photo_url).map(i => i.slot), [checks])

  async function loadHistory() {
    const { data } = await supabase.from('media_publish_log')
      .select('id, platform, listing_id, slots, previous_ids, created_at, restored_at, publisher:system_users!published_by(name)')
      .eq('product_id', product.id).order('created_at', { ascending: false }).limit(10)
    setHistory(data ?? [])
  }

  async function search(platform) {
    setListings(prev => ({ ...prev, [platform]: null }))
    setErrors(prev => ({ ...prev, [platform]: null }))
    try {
      if (!product.sku) throw new Error('Produto sem SKU no cadastro — sem SKU não dá pra achar o anúncio.')
      const { items } = await invoke(PLATFORMS[platform].fn, { action: 'find_items_by_sku', sku: product.sku })
      setListings(prev => ({ ...prev, [platform]: items }))
      // Achou → já marca e guarda o vínculo (próxima vez é instantâneo)
      setSelected(prev => { const n = new Set(prev); items.forEach(it => n.add(`${platform}:${it.item_id}`)); return n })
      if (items.length) {
        await supabase.from('media_listing_links').upsert(items.map(it => ({
          product_id: product.id, platform, listing_id: String(it.item_id), title: it.title,
        })), { onConflict: 'product_id,platform,listing_id', ignoreDuplicates: true })
      }
    } catch (e) {
      setListings(prev => ({ ...prev, [platform]: [] }))
      setErrors(prev => ({ ...prev, [platform]: e.message }))
    }
  }

  useEffect(() => {
    if (!open || !product) return
    setSlots(new Set(filledSlots)); setSelected(new Set()); setProgress([]); setConfirming(false); setSquare(true)
    setListings({ ml: null, shopee: null }); setErrors({})
    loadHistory()
    search('ml'); search('shopee')
  }, [open, product?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !product) return null

  const orderedSlots = filledSlots.filter(s => slots.has(s))
  const targets = Object.keys(PLATFORMS).filter(p => platforms[p]).flatMap(p =>
    (listings[p] || []).filter(it => selected.has(`${p}:${it.item_id}`)).map(it => ({ platform: p, item: it })))
  const tooMany = targets.some(t => orderedSlots.length > PLATFORMS[t.platform].max)
  const blocked = targets.filter(t => t.platform === 'ml' && t.item.variations_count > 0)
  const canPublish = !running && orderedSlots.length > 0 && targets.length > 0 && !tooMany && !blocked.length

  function toggle(setter, key) {
    setter(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }
  function setStep(key, patch) {
    setProgress(prev => prev.map(p => p.key === key ? { ...p, ...patch } : p))
  }

  async function publish() {
    setConfirming(false); setRunning(true)
    const session = getSession()
    const steps = [{ key: 'prep', label: `Preparando ${orderedSlots.length} foto(s)${square ? ' (quadrado 1:1)' : ''}`, status: 'run' },
      ...targets.map(t => ({ key: `${t.platform}:${t.item.item_id}`, label: `${PLATFORMS[t.platform].label} · ${t.item.title}`, status: 'wait' }))]
    setProgress(steps)
    try {
      const images = []
      for (const s of orderedSlots) images.push(await prepareImage(checks[s].photo_url, square))
      setStep('prep', { status: 'ok' })

      // Sobe as fotos 1x por plataforma e reaproveita os ids nos anúncios dela
      const uploaded = {}
      for (const t of targets) {
        const key = `${t.platform}:${t.item.item_id}`
        setStep(key, { status: 'run' })
        try {
          if (!uploaded[t.platform]) {
            const ids = []
            for (const [i, b64] of images.entries()) {
              if (t.platform === 'ml') {
                const r = await invoke('ml-insights', { action: 'upload_picture', file_base64: b64, file_name: `${product.sku}-${orderedSlots[i]}.jpg`, mime_type: 'image/jpeg' })
                ids.push(r.id)
              } else {
                const r = await invoke('shopee-insights', { action: 'upload_image', image_base64: b64 })
                ids.push(r.image_id)
              }
              setStep(key, { msg: `enviando foto ${i + 1}/${images.length}...` })
            }
            uploaded[t.platform] = ids
          }
          const ids = uploaded[t.platform]
          const source = { product_id: product.id, slots: orderedSlots }
          const res = t.platform === 'ml'
            ? await invoke('ml-insights', { action: 'replace_item_pictures', item_id: t.item.item_id, picture_ids: ids, source })
            : await invoke('shopee-insights', { action: 'replace_item_images', item_id: t.item.item_id, image_ids: ids, source })
          await supabase.from('media_publish_log').insert({
            product_id: product.id, platform: t.platform, listing_id: String(t.item.item_id), slots: orderedSlots,
            previous_ids: res.previous || [], new_ids: ids, square, published_by: session.id || null,
          })
          setStep(key, { status: 'ok', msg: `${ids.length} foto(s) no ar` })
        } catch (e) {
          setStep(key, { status: 'err', msg: e.message })
        }
      }
    } catch (e) {
      setStep('prep', { status: 'err', msg: e.message })
    } finally {
      setRunning(false)
      loadHistory()
      search('ml'); search('shopee')
    }
  }

  async function undo(entry) {
    if (!window.confirm(`Voltar as ${entry.previous_ids?.length || 0} fotos anteriores no anúncio ${entry.listing_id} (${PLATFORMS[entry.platform].label})?`)) return
    try {
      if (entry.platform === 'ml') await invoke('ml-insights', { action: 'restore_item_pictures', item_id: entry.listing_id, picture_ids: entry.previous_ids })
      else await invoke('shopee-insights', { action: 'restore_item_images', item_id: entry.listing_id, image_ids: entry.previous_ids })
      await supabase.from('media_publish_log').update({ restored_at: new Date().toISOString(), restored_by: getSession().id || null }).eq('id', entry.id)
      toast.success('Fotos anteriores restauradas.')
      loadHistory(); search(entry.platform)
    } catch (e) { toast.error(e.message) }
  }

  const done = progress.length > 0 && !running

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !running && onClose()}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-100">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-800">Publicar fotos nas plataformas</h2>
            <p className="text-sm text-slate-500 truncate">{product.name} · SKU <span className="font-mono">{product.sku || '—'}</span></p>
          </div>
          <button onClick={onClose} disabled={running} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
          {/* 1. Fotos */}
          <section>
            <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
              <p className="text-xs font-bold text-slate-500 uppercase">1. Fotos que vão pro anúncio (nesta ordem)</p>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 cursor-pointer select-none">
                <input type="checkbox" className="accent-violet-500" checked={square} onChange={e => setSquare(e.target.checked)} disabled={running} />
                <Square size={12} /> Ajustar pra quadrado 1:1 (fundo branco nas laterais)
              </label>
            </div>
            <div className="flex gap-2 flex-wrap">
              {MEDIA_CHECKLIST.map(item => {
                const path = checks?.[item.slot]?.photo_url
                const on = slots.has(item.slot)
                return (
                  <button key={item.slot} type="button" disabled={!path || running} onClick={() => toggle(setSlots, item.slot)}
                    className={`relative w-20 rounded-xl border-2 p-1 text-left transition ${!path ? 'opacity-40 border-dashed border-slate-200' : on ? 'border-violet-500 bg-violet-50' : 'border-slate-100 opacity-60'}`}
                    title={item.title}>
                    <span className={`block w-full ${square ? 'aspect-square' : 'aspect-[4/5]'} rounded-lg overflow-hidden bg-white border border-slate-100 flex items-center justify-center`}>
                      {path ? <StorageImage bucket="product-photos" path={path} className={`${square ? 'max-h-full max-w-full object-contain' : 'w-full h-full object-cover'}`} /> : <span className="text-[10px] text-slate-300">vazio</span>}
                    </span>
                    <span className="block text-[10px] font-bold text-slate-600 mt-0.5 truncate">{String(item.slot).padStart(2, '0')} {item.title}</span>
                    {path && <span className={`absolute top-2 left-2 w-4 h-4 rounded border flex items-center justify-center ${on ? 'bg-violet-500 border-violet-500' : 'bg-white border-slate-300'}`}>{on && <Check size={10} className="text-white" strokeWidth={3} />}</span>}
                  </button>
                )
              })}
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">{orderedSlots.length} foto(s) selecionada(s). A 1ª vira a capa do anúncio. O vídeo não é enviado por aqui (ainda).</p>
          </section>

          {/* 2. Anúncios */}
          <section>
            <p className="text-xs font-bold text-slate-500 uppercase mb-2">2. Plataformas e anúncios (achados pelo SKU {product.sku})</p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {Object.entries(PLATFORMS).map(([p, info]) => (
                <div key={p} className={`rounded-2xl border-2 p-3 ${platforms[p] ? 'border-slate-200' : 'border-slate-100 opacity-50'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input type="checkbox" className="accent-violet-500 w-4 h-4" checked={platforms[p]} onChange={e => setPlatforms(prev => ({ ...prev, [p]: e.target.checked }))} disabled={running} />
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${info.tone}`}>{info.label}</span>
                      <span className="text-[10px] text-slate-400">máx. {info.max} fotos</span>
                    </label>
                    <button onClick={() => search(p)} disabled={running || listings[p] === null} className="text-[11px] font-semibold text-slate-400 hover:text-violet-600 flex items-center gap-1"><Search size={11} /> Buscar de novo</button>
                  </div>
                  {listings[p] === null ? (
                    <p className="text-xs text-slate-400 flex items-center gap-1.5 py-3"><Loader2 size={13} className="animate-spin" /> Procurando anúncios com esse SKU...</p>
                  ) : errors[p] ? (
                    <p className="text-xs text-rose-600 py-2">{errors[p]}</p>
                  ) : listings[p].length === 0 ? (
                    <p className="text-xs text-slate-500 py-2">Nenhum anúncio com o SKU <b>{product.sku}</b> nessa plataforma. Confira se o SKU do anúncio é igual ao do cadastro.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {listings[p].map(it => {
                        const key = `${p}:${it.item_id}`
                        const on = selected.has(key)
                        const variation = p === 'ml' && it.variations_count > 0
                        return (
                          <div key={key} className={`rounded-xl border px-2.5 py-2 ${on ? 'border-violet-300 bg-violet-50/40' : 'border-slate-100'}`}>
                            <label className="flex items-start gap-2 cursor-pointer">
                              <input type="checkbox" className="accent-violet-500 mt-0.5" checked={on} onChange={() => toggle(setSelected, key)} disabled={running} />
                              <span className="min-w-0 flex-1">
                                <span className="block text-xs font-semibold text-slate-700 truncate">{it.title}</span>
                                <span className="text-[10px] text-slate-400 font-mono">{it.item_id}</span>
                                <span className={`ml-1.5 text-[10px] font-semibold ${it.status === 'active' ? 'text-emerald-600' : 'text-slate-400'}`}>{it.status === 'active' ? 'ativo' : it.status}</span>
                                {it.permalink && <a href={it.permalink} target="_blank" rel="noreferrer" className="ml-1.5 text-[10px] text-sky-600 inline-flex items-center gap-0.5" onClick={e => e.stopPropagation()}>abrir <ExternalLink size={9} /></a>}
                              </span>
                            </label>
                            {variation && <p className="text-[11px] text-amber-700 mt-1 flex items-start gap-1"><AlertTriangle size={11} className="mt-0.5 shrink-0" /> Anúncio com {it.variations_count} variações — troca automática ainda não suportada.</p>}
                            {on && (
                              <div className="mt-2 flex items-center gap-2">
                                <div className="flex gap-0.5 flex-wrap opacity-70">
                                  {it.pictures.slice(0, 9).map((pic, i) => <img key={i} src={pic.url} alt="" className="w-7 h-7 rounded object-cover border border-slate-200" />)}
                                </div>
                                <span className="text-[10px] text-slate-400 shrink-0">→</span>
                                <div className="flex gap-0.5 flex-wrap">
                                  {orderedSlots.map(s => <StorageImage key={s} bucket="product-photos" path={checks[s].photo_url} className="w-7 h-7 rounded object-cover border border-violet-300" />)}
                                </div>
                              </div>
                            )}
                            {on && <p className="text-[10px] text-slate-400 mt-1">Hoje: {it.pictures.length} foto(s) → vai ficar com {orderedSlots.length}{orderedSlots.length > PLATFORMS[p].max ? <b className="text-rose-600"> (passa do máximo de {PLATFORMS[p].max})</b> : ''}</p>}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Progresso */}
          {progress.length > 0 && (
            <section className="rounded-2xl border border-slate-200 p-3">
              <p className="text-xs font-bold text-slate-500 uppercase mb-2">Andamento</p>
              <div className="flex flex-col gap-1.5">
                {progress.map(p => (
                  <div key={p.key} className="flex items-start gap-2 text-sm">
                    {p.status === 'ok' ? <CheckCircle2 size={15} className="text-emerald-500 mt-0.5 shrink-0" />
                      : p.status === 'err' ? <AlertTriangle size={15} className="text-rose-500 mt-0.5 shrink-0" />
                      : p.status === 'run' ? <Loader2 size={15} className="animate-spin text-violet-500 mt-0.5 shrink-0" />
                      : <span className="w-[15px] h-[15px] rounded-full border-2 border-slate-200 mt-0.5 shrink-0" />}
                    <span className="min-w-0">
                      <span className="text-slate-700">{p.label}</span>
                      {p.msg && <span className={`block text-xs ${p.status === 'err' ? 'text-rose-600' : 'text-slate-400'}`}>{p.msg}</span>}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Histórico / desfazer */}
          {history.length > 0 && (
            <section>
              <p className="text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-1"><History size={12} /> Publicações deste produto</p>
              <div className="flex flex-col gap-1">
                {history.map(h => (
                  <div key={h.id} className="flex items-center gap-2 text-xs bg-slate-50 rounded-lg px-2.5 py-1.5">
                    <span className={`font-bold px-1.5 py-0.5 rounded border text-[10px] ${PLATFORMS[h.platform].tone}`}>{PLATFORMS[h.platform].label}</span>
                    <span className="font-mono text-slate-500">{h.listing_id}</span>
                    <span className="text-slate-500">{h.slots?.length || 0} foto(s) · {fmtDataHora(h.created_at)}{h.publisher?.name ? ` · ${h.publisher.name}` : ''}</span>
                    {h.restored_at
                      ? <span className="ml-auto text-slate-400">desfeito em {fmtDataHora(h.restored_at)}</span>
                      : h.previous_ids?.length > 0 && <button onClick={() => undo(h)} disabled={running} className="ml-auto text-[11px] font-semibold text-slate-500 hover:text-rose-600 flex items-center gap-1"><RotateCcw size={11} /> Desfazer</button>}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Rodapé + confirmação explícita */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-slate-500">
            {blocked.length ? <span className="text-amber-700">Desmarque os anúncios com variação pra continuar.</span>
              : tooMany ? <span className="text-rose-600">Tem mais fotos do que a plataforma aceita.</span>
              : targets.length ? <>Vai <b>substituir</b> as fotos de <b>{targets.length}</b> anúncio(s) por {orderedSlots.length} foto(s). Dá pra desfazer depois.</>
              : 'Marque pelo menos um anúncio.'}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={onClose} disabled={running} className="btn-secondary">{done ? 'Fechar' : 'Cancelar'}</button>
            {confirming ? (
              <>
                <span className="text-xs font-semibold text-rose-600">Confirma a troca no anúncio real?</span>
                <button onClick={() => setConfirming(false)} className="btn-secondary py-2">Não</button>
                <button onClick={publish} className="btn-primary py-2 bg-rose-600 hover:bg-rose-700"><Check size={14} /> Sim, substituir</button>
              </>
            ) : (
              <button onClick={() => setConfirming(true)} disabled={!canPublish} className="btn-primary">
                {running ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} {running ? 'Publicando...' : 'Publicar'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
