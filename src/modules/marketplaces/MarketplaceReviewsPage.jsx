import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Star, Loader2, RefreshCw, MessageSquareReply, Info, Search, X, Image as ImageIcon, CheckCircle2, MessageCircle, Send, Shuffle, Clock, Headset, Layers } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { StatTile, fmtInt } from '../dashboard/widgets'
import { Modal } from '../../components/ui/Modal'
import { MediaViewer, MediaThumb } from '../../components/ui/MediaViewer'
import { PLAT, PlatBadge, Segmented, PlatformFilter, usePlatformFilter, norm, fetchAll } from './shared'
import { TEMPLATE_GROUPS, groupFor, pickTemplate, editWindow, EDIT_DAYS } from './reviewTemplates'

// Avaliações dos marketplaces (Fase 3 da unificação, 10/10).
// Shopee: a API (`product.get_comment`) devolve as avaliações da loja toda
// com a resposta da CoisaPet — dá pra ver, filtrar e responder daqui
// (`product.reply_comment`, sempre com confirmação).
// ML: não tem endpoint de "avaliações da loja" (só por anúncio) — a edge
// function `ml-reviews` varre os anúncios no cron e guarda em `ml_reviews`
// (fase105). O ML não deixa o vendedor responder avaliação: só leitura.
// Nome/foto do produto vêm da foto `marketplace_stock`.

const PERIODS = [['7', '7 dias'], ['30', '30 dias'], ['90', '90 dias']]
const TZ = 'America/Sao_Paulo'
const mlImg = (id, size = 'C') => `https://http2.mlstatic.com/D_${size === 'F' ? 'NQ' : 'Q'}_NP_${id}-${size}.jpg`
const FU = {
  contatando:  { label: 'Em contato',  chip: 'bg-sky-100 text-sky-700' },
  resolvido:   { label: 'Resolvido',   chip: 'bg-emerald-100 text-emerald-700' },
  sem_retorno: { label: 'Sem retorno', chip: 'bg-slate-200 text-slate-600' },
}
// Subfiltros do "Sem resposta" (20/10) — como nas devoluções:
//   pos      4–5★: responder já (dá pra responder em lote com modelos variados)
//   contato  1–3★ com a edição ainda aberta: a equipe tenta falar com o
//            cliente antes de responder (ele ainda pode mudar a nota)
//   pronto   1–3★ com a edição fechada (30 dias ou já editou): hora de responder
const SUBS = [['all', 'Todas'], ['pos', 'Positivas 4–5★'], ['contato', 'Negativas · em contato'], ['pronto', 'Negativas · prazo encerrado']]
const subOf = c => c.rating >= 4 ? 'pos' : editWindow(c)?.open ? 'contato' : 'pronto'
const fmtDT = iso => iso ? new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '—'

function Stars({ n, size = 13 }) {
  return <span className="inline-flex">{[1, 2, 3, 4, 5].map(i => <Star key={i} size={size} className={i <= n ? 'text-amber-400 fill-amber-400' : 'text-slate-200 fill-slate-200'} />)}</span>
}

export function MarketplaceReviewsPage() {
  const { user } = useAuth()
  const [plat, setPlat] = usePlatformFilter()
  const [period, setPeriod] = useState('30')
  const [mlSync, setMlSync] = useState(null)
  const [list, setList] = useState(null)
  const [items, setItems] = useState({})
  const [chat, setChat] = useState(null)
  const [filter, setFilter] = useState('pending')
  const [search, setSearch] = useState('')
  const [replyFor, setReplyFor] = useState(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const [sub, setSub] = useState('all')
  const [followups, setFollowups] = useState({})   // `${platform}|${comment_id}` → linha
  const [bulk, setBulk] = useState(null)            // { list: [{ c, text }], sending, done }
  const [viewer, setViewer] = useState(null)   // { items, index } — fotos/vídeos sem abrir aba nova (20/10)

  const load = useCallback(async () => {
    setList(null); setError(null)
    const since = new Date(Date.now() - Number(period) * 86400e3).toISOString()
    try {
      const [c, st, mlr, last, fu] = await Promise.all([
        supabase.functions.invoke('shopee-extra', { body: { action: 'comments', since, max: 1000 } }),
        fetchAll(() => supabase.from('marketplace_stock').select('platform, item_id, variation_id, title, variation, thumbnail')),
        fetchAll(() => supabase.from('ml_reviews').select('id, item_id, rate, title, content, created_at_ml, raw').gte('created_at_ml', since).order('created_at_ml', { ascending: false })).catch(() => []),
        supabase.from('ml_review_items').select('synced_at').order('synced_at', { ascending: false }).limit(1),
        supabase.from('marketplace_review_followups').select('*'),
      ])
      setFollowups(Object.fromEntries((fu.data || []).map(r => [`${r.platform}|${r.comment_id}`, r])))
      const m = {}
      st.forEach(r => { const k = `${r.platform}|${r.item_id}`; m[k] ||= { title: r.title, thumb: r.thumbnail?.replace(/^http:\/\//, 'https://'), vars: {} }; if (r.variation_id) m[k].vars[r.variation_id] = r.variation })
      setItems(m)
      setMlSync(last.data?.[0]?.synced_at || null)
      // Formato único: Shopee (respondível) + ML (só leitura)
      const sh = c.error || c.data?.ok === false ? [] : (c.data.results || []).map(x => ({ ...x, key: `s${x.comment_id}`, platform: 'shopee', replyable: true }))
      const ml = mlr.map(r => ({
        key: `m${r.id}`, platform: 'ml', comment_id: String(r.id), item_id: r.item_id, model_id: null, rating: r.rate, buyer: null, at: r.created_at_ml,
        headline: r.title || null, text: r.content || '', reply: null, replyable: false,
        media: { images: (r.raw?.media || []).filter(x => x.type === 'photo').map(x => x.id), videos: (r.raw?.media || []).filter(x => x.type !== 'photo').length },
      }))
      if (c.error || c.data?.ok === false) setError(`Shopee: ${c.data?.error || c.error.message}`)
      setList([...sh, ...ml])
    } catch (e) { setError(e.message); setList([]) }
    supabase.functions.invoke('shopee-extra', { body: { action: 'chat_unread' } }).then(r => setChat(r.data?.ok ? r.data : null)).catch(() => {})
  }, [period])
  useEffect(() => { load() }, [load])

  const all = (list || []).filter(c => !plat || c.platform === plat)
  const pending = all.filter(c => c.replyable && !c.reply)
  const eff = plat === 'ml' && filter === 'pending' ? 'all' : filter
  const itemOf = c => items[`${c.platform}|${c.item_id}`]
  const low = all.filter(c => c.rating <= 3)
  const avg = all.length ? all.reduce((t, c) => t + c.rating, 0) / all.length : null
  const dist = [5, 4, 3, 2, 1].map(n => [n, all.filter(c => c.rating === n).length])

  const visible = useMemo(() => {
    const q = norm(search)
    return all
      .filter(c => eff !== 'pending' || sub === 'all' || subOf(c) === sub)
      .filter(c => eff === 'all' || (eff === 'pending' ? c.replyable && !c.reply : eff === 'low' ? c.rating <= 3 : eff === 'text' ? (c.text.trim() || c.headline) : eff === 'media' ? c.media.images.length || c.media.videos : true))
      .filter(c => !q || norm(`${c.headline || ''} ${c.text} ${c.buyer || ''} ${itemOf(c)?.title || ''}`).includes(q))
      .sort((a, b) => (eff === 'pending' ? (a.rating - b.rating) : 0) || (b.at || '').localeCompare(a.at || ''))
  }, [all, eff, sub, search, items]) // eslint-disable-line react-hooks/exhaustive-deps
  const subCount = k => pending.filter(c => k === 'all' || subOf(c) === k).length
  const posPending = pending.filter(c => subOf(c) === 'pos')

  async function setFollowup(c, patch) {
    const key = `${c.platform}|${c.comment_id}`
    const cur = followups[key]
    if (patch.status === null) {
      setFollowups(f => { const n = { ...f }; delete n[key]; return n })
      await supabase.from('marketplace_review_followups').delete().eq('platform', c.platform).eq('comment_id', c.comment_id)
      return
    }
    const row = { platform: c.platform, comment_id: c.comment_id, status: cur?.status || 'contatando', note: cur?.note || null, ...patch, updated_by: user?.name || null, updated_at: new Date().toISOString() }
    setFollowups(f => ({ ...f, [key]: row }))
    const { error } = await supabase.from('marketplace_review_followups').upsert(row)
    if (error) toast.error('Não salvou o acompanhamento: ' + error.message)
  }

  async function sendBulk() {
    setBulk(b => ({ ...b, sending: true, done: 0, failed: [] }))
    for (const [i, x] of bulk.list.entries()) {
      try {
        const { data, error } = await supabase.functions.invoke('shopee-extra', { body: { action: 'reply_comment', comment_id: x.c.comment_id, item_id: x.c.item_id, text: x.text, by: user?.name || null } })
        if (error || data?.ok === false || data?.error) throw new Error(data?.error || error?.message)
        setList(l => l.map(c => c.key === x.c.key ? { ...c, reply: { text: x.text, at: new Date().toISOString() } } : c))
      } catch (e) {
        setBulk(b => ({ ...b, failed: [...b.failed, `${x.c.buyer || x.c.comment_id}: ${e.message}`] }))
      }
      setBulk(b => ({ ...b, done: i + 1 }))
    }
    setBulk(b => ({ ...b, sending: false, finished: true }))
  }

  function openBulk() {
    let last = null
    setBulk({ list: posPending.slice(0, 50).map(c => { const text = pickTemplate('pos', last); last = text; return { c, text } }), done: 0, failed: [] })
  }

  // Produtos com mais notas baixas no período
  const worst = useMemo(() => {
    const m = {}
    low.forEach(c => { const k = `${c.platform}|${c.item_id}`; m[k] ||= { n: 0, k, platform: c.platform, item_id: c.item_id }; m[k].n++ })
    return Object.values(m).sort((a, b) => b.n - a.n).slice(0, 5)
  }, [low])

  async function send() {
    setSending(true)
    try {
      const { data, error } = await supabase.functions.invoke('shopee-extra', { body: { action: 'reply_comment', comment_id: replyFor.comment_id, item_id: replyFor.item_id, text, by: user?.name || null } })
      if (error || data?.ok === false || data?.error) throw new Error(data?.error || error?.message)
      toast.success('Resposta publicada na Shopee')
      setList(l => l.map(c => c.key === replyFor.key ? { ...c, reply: { text, at: new Date().toISOString() } } : c))
      setReplyFor(null); setText('')
    } catch (e) { toast.error('Não enviou: ' + e.message) } finally { setSending(false) }
  }

  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-300 to-[#EE4D2D] flex items-center justify-center shrink-0 shadow-sm"><Star size={20} className="text-white fill-white" /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Avaliações dos marketplaces</h1>
            <p className="text-sm text-slate-500">O que os compradores estão dizendo — ver, filtrar e responder sem sair do sistema</p>
          </div>
        </div>
        <button onClick={load} disabled={list === null} className="btn-secondary py-1.5 text-sm disabled:opacity-50">{list === null ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Atualizar</button>
      </div>

      <div className="card !p-3 flex items-center gap-3 flex-wrap">
        <PlatformFilter value={plat} onChange={setPlat} counts={list ? { ml: list.filter(c => c.platform === 'ml').length, shopee: list.filter(c => c.platform === 'shopee').length } : null} />
        <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 h-9 flex-1 min-w-[200px] max-w-sm bg-white focus-within:border-slate-400">
          <Search size={14} className="text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Texto, comprador ou produto…" className="bg-transparent outline-none text-sm w-full placeholder:text-slate-400" />
          {search && <button onClick={() => setSearch('')} className="text-slate-400"><X size={13} /></button>}
        </div>
        <div className="ml-auto"><Segmented value={period} onChange={setPeriod} options={PERIODS} /></div>
      </div>

      {error && <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5">{error}</div>}

      {list === null ? (
        <div className="card py-24 text-center"><Loader2 size={24} className="mx-auto animate-spin text-slate-300" /><p className="text-xs text-slate-400 mt-2">Buscando as avaliações…</p></div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile icon={Star} tone="warning" label="Nota média" value={avg ? avg.toFixed(2).replace('.', ',') : '—'} detail={`${fmtInt(all.length)} avaliações no período`}>
              {!plat && <div className="flex gap-3 text-[11px] -mt-1">{['ml', 'shopee'].map(p => { const l = (list || []).filter(c => c.platform === p); return l.length ? <span key={p} className="flex items-center gap-1 text-slate-500"><span className="w-2 h-2 rounded-sm" style={{ background: PLAT[p].color }} />{PLAT[p].short} {(l.reduce((t, c) => t + c.rating, 0) / l.length).toFixed(2).replace('.', ',')}</span> : null })}</div>}
            </StatTile>
            <StatTile icon={MessageSquareReply} tone={pending.length ? 'critical' : 'good'} label="Sem resposta" value={fmtInt(pending.length)} detail={plat === 'ml' ? 'o ML não deixa responder avaliação' : pending.length ? 'na Shopee — responder conta ponto' : 'todas respondidas 🎉'} />
            <StatTile icon={Star} tone={low.length ? 'rose' : 'good'} label="Nota 3 ou menos" value={fmtInt(low.length)} detail={all.length ? `${((low.length / all.length) * 100).toFixed(1).replace('.', ',')}% do total` : '—'} />
            <StatTile icon={MessageCircle} to="/marketplaces/chat" tone={chat?.messages ? 'sky' : 'neutral'} label="Chat da Shopee" value={chat ? fmtInt(chat.messages) : '…'} detail={chat ? `mensagens não lidas em ${chat.conversations} conversa${chat.conversations === 1 ? '' : 's'}` : 'verificando…'} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-4 items-start">
            <div className="flex flex-col gap-3">
              <Segmented value={eff} onChange={setFilter} options={[...(plat === 'ml' ? [] : [['pending', `Sem resposta (${pending.length})`]]), ['low', `Nota baixa (${low.length})`], ['text', 'Com comentário'], ['media', 'Com foto/vídeo'], ['all', 'Todas']]} />
              {eff === 'pending' && (
                <div className="flex items-center gap-2 flex-wrap -mt-1">
                  {SUBS.map(([k, l]) => (
                    <button key={k} onClick={() => setSub(k)}
                      className={`h-7 px-3 rounded-full text-[12px] font-semibold border transition ${sub === k ? (k === 'pos' ? 'bg-emerald-500 border-emerald-500 text-white' : k === 'contato' ? 'bg-sky-500 border-sky-500 text-white' : k === 'pronto' ? 'bg-rose-500 border-rose-500 text-white' : 'bg-slate-700 border-slate-700 text-white') : 'bg-white border-slate-200 text-slate-600 hover:border-slate-400'}`}>
                      {l} <span className="opacity-75">({subCount(k)})</span>
                    </button>
                  ))}
                  {sub === 'pos' && posPending.length > 1 && (
                    <button onClick={openBulk} className="ml-auto btn-primary py-1 text-xs"><Layers size={13} /> Responder {Math.min(posPending.length, 50)} de uma vez</button>
                  )}
                </div>
              )}
              {eff === 'pending' && sub === 'contato' && <p className="text-[11px] text-sky-700 bg-sky-50 border border-sky-100 rounded-lg px-3 py-1.5">Negativas com a edição ainda aberta: o cliente pode mudar a nota/comentário 1 vez em até {EDIT_DAYS} dias. Tentem o contato primeiro e marquem o andamento em cada uma.</p>}
              {eff === 'pending' && sub === 'pronto' && <p className="text-[11px] text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-1.5">O cliente não pode mais editar (passou de {EDIT_DAYS} dias ou já editou uma vez) — hora de deixar a resposta pública.</p>}
              {!visible.length && <div className="card py-14 text-center text-slate-400"><CheckCircle2 size={26} className="mx-auto mb-2 text-emerald-400" />Nada aqui com esse filtro.</div>}
              {visible.slice(0, 150).map(c => {
                const it = itemOf(c)
                // fotos (miniatura + tamanho grande) e vídeos, pro visualizador
                const media = [
                  ...(c.platform === 'ml' ? c.media.images.map(id => ({ thumb: mlImg(id), url: mlImg(id, 'F'), type: 'image' })) : c.media.images.map(u => ({ thumb: u, url: u, type: 'image' }))),
                  ...(c.media.video_urls || []).map(u => ({ url: u, type: 'video' })),
                ].map(m => ({ ...m, label: `${it?.title || 'Avaliação'} · ${c.buyer || PLAT[c.platform].short}` }))
                const hiddenVideos = Math.max(0, (c.media.videos || 0) - (c.media.video_urls || []).length)
                return (
                  <div key={c.key} className={`card !p-4 flex gap-3 ${c.rating <= 3 ? 'border-rose-200' : ''}`} style={{ boxShadow: `inset 4px 0 0 ${PLAT[c.platform].color}` }}>
                    {it?.thumb ? <img src={it.thumb} alt="" className="w-12 h-12 rounded-lg object-cover bg-slate-100 shrink-0" loading="lazy" /> : <span className="w-12 h-12 rounded-lg bg-slate-100 shrink-0" />}
                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                      <div className="flex items-center gap-2 flex-wrap text-[11px]">
                        <PlatBadge p={c.platform} /><Stars n={c.rating} />{c.buyer && <span className="text-slate-500">{c.buyer}</span>}<span className="text-slate-400">· {fmtDT(c.at)}</span>
                        {(c.media.images.length > 0 || c.media.videos > 0) && <span className="inline-flex items-center gap-0.5 text-sky-600 font-semibold"><ImageIcon size={11} />{c.media.images.length + c.media.videos} mídia</span>}
                      </div>
                      <p className="text-[12px] text-slate-500 truncate" title={it?.title}>{it?.title || `Anúncio ${c.item_id}`}{c.model_id && it?.vars?.[c.model_id] ? ` · ${it.vars[c.model_id]}` : ''}</p>
 {c.headline && <p className="text-sm font-semibold text-slate-800">{c.headline}</p>}
                      {c.text ? <p className="text-sm text-slate-800 whitespace-pre-line">{c.text}</p> : !c.headline && <p className="text-xs text-slate-400 italic">(só deu a nota, sem comentário)</p>}
                      {media.length > 0 && (
                        <div className="flex gap-1.5 mt-1 flex-wrap">
                          {media.slice(0, 6).map((m, k) => (
                            <MediaThumb key={m.url} item={{ ...m, url: m.thumb || m.url }} size="w-16 h-16" onClick={() => setViewer({ items: media, index: k })}>
                              {k === 5 && media.length > 6 && <span className="absolute inset-0 bg-black/55 text-white text-sm font-bold flex items-center justify-center">+{media.length - 6}</span>}
                            </MediaThumb>
                          ))}
                        </div>
                      )}
                      {c.platform === 'shopee' && !c.reply && c.rating <= 3 && (() => {
                        const w = editWindow(c), fu = followups[`${c.platform}|${c.comment_id}`]
                        return (
                          <div className="mt-1 flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                            <div className="flex items-center gap-2 flex-wrap text-[11px]">
                              <span className={`inline-flex items-center gap-1 font-semibold ${w?.open ? (w.left <= 5 ? 'text-amber-700' : 'text-sky-700') : 'text-rose-600'}`}><Clock size={11} />{w?.label}</span>
                              <span className="text-slate-300">·</span>
                              <span className="inline-flex items-center gap-1 text-slate-500"><Headset size={11} /> Contato:</span>
                              {Object.entries(FU).map(([k, v]) => (
                                <button key={k} onClick={() => setFollowup(c, { status: fu?.status === k ? null : k })}
                                  className={`px-2 py-0.5 rounded-full font-semibold ${fu?.status === k ? v.chip : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-400'}`}>{v.label}</button>
                              ))}
                              {fu && <span className="text-slate-400">{fu.updated_by} · {fmtDT(fu.updated_at)}</span>}
                            </div>
                            <input defaultValue={fu?.note || ''} key={fu?.updated_at || 'n'} placeholder="Anotação (ex: falei no chat, vamos mandar a peça)…"
                              onBlur={e => { const v = e.target.value.trim(); if (v !== (fu?.note || '')) setFollowup(c, { note: v || null }) }}
                              className="text-[12px] bg-white border border-slate-200 rounded-md px-2 py-1 outline-none focus:border-slate-400" />
                          </div>
                        )
                      })()}
                      {hiddenVideos > 0 && <p className="text-[11px] text-slate-400">{hiddenVideos} vídeo{hiddenVideos === 1 ? '' : 's'} — só dá pra assistir no app {PLAT[c.platform].short}</p>}
                      {!c.replyable ? null : c.reply
                        ? <div className="mt-1 rounded-lg bg-violet-50 border border-violet-100 px-3 py-2 text-[13px] text-slate-700"><p className="text-[10px] font-bold text-violet-600 mb-0.5">Resposta da CoisaPet · {fmtDT(c.reply.at)}</p>{c.reply.text}</div>
                        : <button onClick={() => { setReplyFor(c); setText(pickTemplate(groupFor(c))) }} className="btn-primary py-1.5 text-xs self-start mt-1"><MessageSquareReply size={13} /> Responder</button>}
                    </div>
                  </div>
                )
              })}
              {visible.length > 150 && <p className="text-xs text-slate-400 text-center">Mostrando 150 de {visible.length} — use os filtros ou a busca.</p>}
            </div>

            <div className="flex flex-col gap-4">
              <div className="card">
                <p className="font-bold text-slate-800 text-[15px] mb-3">Distribuição das notas</p>
                <div className="flex flex-col gap-1.5">
                  {dist.map(([n, k]) => (
                    <div key={n} className="flex items-center gap-2 text-xs">
                      <span className="w-6 text-slate-500 flex items-center gap-0.5">{n}<Star size={10} className="text-amber-400 fill-amber-400" /></span>
                      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full bg-amber-400" style={{ width: `${all.length ? (k / all.length) * 100 : 0}%` }} /></div>
                      <span className="w-8 text-right tabular-nums text-slate-600">{k}</span>
                    </div>
                  ))}
                </div>
              </div>
              {worst.length > 0 && (
                <div className="card">
                  <p className="font-bold text-slate-800 text-[15px] mb-3">Mais notas baixas</p>
                  <div className="flex flex-col gap-2.5">
                    {worst.map(w => (
                      <div key={w.k} className="flex items-center gap-2.5">
                        {items[w.k]?.thumb ? <img src={items[w.k].thumb} alt="" className="w-9 h-9 rounded-lg object-cover bg-slate-100 shrink-0" /> : <span className="w-9 h-9 rounded-lg bg-slate-100 shrink-0" />}
                        <PlatBadge p={w.platform} />
                        <p className="text-[12px] text-slate-700 flex-1 min-w-0 truncate" title={items[w.k]?.title}>{items[w.k]?.title || w.item_id}</p>
                        <span className="text-xs font-black text-rose-600 tabular-nums">{w.n}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <p className="text-[11px] text-slate-400 flex items-start gap-1.5"><Info size={12} className="shrink-0 mt-px" />
            <span>A Shopee só aceita UMA resposta por avaliação e ela fica pública no anúncio — confira antes de enviar. O ML não deixa o vendedor responder avaliação (só leitura); como a API do ML só entrega avaliação anúncio por anúncio, o sistema busca todas a cada 6 horas{mlSync ? ` — última busca ${fmtDT(mlSync)}` : ''}.</span>
          </p>
        </>
      )}

      <Modal open={!!bulk} onClose={() => !bulk?.sending && setBulk(null)} title="Responder avaliações positivas em lote"
        subtitle="Cada uma recebe um modelo sorteado (dá pra trocar ou editar antes). As respostas ficam públicas e não dá pra editar depois."
        footer={<div className="flex justify-end gap-2">
          <button onClick={() => setBulk(null)} disabled={bulk?.sending} className="btn-secondary">{bulk?.finished ? 'Fechar' : 'Cancelar'}</button>
          {!bulk?.finished && <button onClick={sendBulk} disabled={bulk?.sending || !bulk?.list.length} className="btn-primary disabled:opacity-60">{bulk?.sending ? <><Loader2 size={14} className="animate-spin" /> {bulk.done}/{bulk.list.length}</> : <><Send size={14} /> Publicar {bulk?.list.length} respostas</>}</button>}
        </div>}>
        {bulk && (
          <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto pr-1">
            {bulk.finished && <p className={`text-sm rounded-lg px-3 py-2 ${bulk.failed.length ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>{bulk.list.length - bulk.failed.length} respondida(s){bulk.failed.length ? ` · ${bulk.failed.length} falharam: ${bulk.failed.join(' | ')}` : ' 🎉'}</p>}
            {bulk.list.map((x, i) => (
              <div key={x.c.key} className={`rounded-xl border p-2.5 ${i < bulk.done ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200'}`}>
                <div className="flex items-center gap-2 text-[11px] mb-1">
                  <Stars n={x.c.rating} size={11} /><span className="text-slate-500">{x.c.buyer}</span>
                  <span className="text-slate-400 truncate flex-1">{x.c.text || '(sem comentário)'}</span>
                  {!bulk.sending && !bulk.finished && <>
                    <button title="Outro modelo" onClick={() => setBulk(b => ({ ...b, list: b.list.map((y, j) => j === i ? { ...y, text: pickTemplate('pos', y.text) } : y) }))} className="p-1 rounded hover:bg-slate-100 text-slate-500"><Shuffle size={12} /></button>
                    <button title="Tirar do lote" onClick={() => setBulk(b => ({ ...b, list: b.list.filter((_, j) => j !== i) }))} className="p-1 rounded hover:bg-slate-100 text-slate-400"><X size={12} /></button>
                  </>}
                  {i < bulk.done && <CheckCircle2 size={13} className="text-emerald-500" />}
                </div>
                <textarea value={x.text} disabled={bulk.sending || bulk.finished} rows={2} maxLength={500}
                  onChange={e => setBulk(b => ({ ...b, list: b.list.map((y, j) => j === i ? { ...y, text: e.target.value } : y) }))}
                  className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1 resize-y" />
              </div>
            ))}
          </div>
        )}
      </Modal>

      {viewer && <MediaViewer items={viewer.items} index={viewer.index} onClose={() => setViewer(null)} />}

      <Modal open={!!replyFor} onClose={() => !sending && setReplyFor(null)} title="Responder avaliação" subtitle="A resposta fica pública no anúncio da Shopee e não dá pra editar depois"
        footer={<div className="flex justify-end gap-2">
          <button onClick={() => setReplyFor(null)} disabled={sending} className="btn-secondary">Cancelar</button>
          <button onClick={send} disabled={sending || !text.trim()} className="btn-primary disabled:opacity-60">{sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Publicar resposta</button>
        </div>}>
        {replyFor && (
          <div className="flex flex-col gap-3">
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
              <p className="text-[11px] flex items-center gap-2"><Stars n={replyFor.rating} />{replyFor.buyer}</p>
              <p className="text-sm text-slate-700 mt-1">{replyFor.text || <span className="italic text-slate-400">(sem comentário)</span>}</p>
            </div>
            {replyFor.rating <= 3 && editWindow(replyFor)?.open && (
              <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">⏳ A edição desta avaliação ainda está aberta ({editWindow(replyFor).label}). Se ainda estão tentando falar com o cliente, talvez valha esperar.</p>
            )}
            {[groupFor(replyFor), ...Object.keys(TEMPLATE_GROUPS).filter(g => g !== groupFor(replyFor))].map((g, gi) => (
              <div key={g} className={gi ? 'opacity-80' : ''}>
                <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">{TEMPLATE_GROUPS[g].label}{gi === 0 && ' · sugeridos'}</p>
                <div className="flex gap-1.5 flex-wrap">
                  {TEMPLATE_GROUPS[g].items.map(([l, t]) => (
                    <button key={l} onClick={() => setText(t)} title={t}
                      className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-white ${text === t ? 'border-violet-400 text-violet-700' : 'border-slate-200 hover:border-slate-400'}`}>{l}</button>
                  ))}
                  {gi === 0 && <button onClick={() => setText(pickTemplate(g, text))} className="text-[11px] font-semibold px-2.5 py-1 rounded-full border border-slate-200 hover:border-slate-400 bg-white inline-flex items-center gap-1"><Shuffle size={11} /> outro</button>}
                </div>
              </div>
            ))}
            <textarea value={text} onChange={e => setText(e.target.value)} rows={5} maxLength={500} className="input text-sm resize-y" placeholder="Escreva a resposta…" />
            <p className="text-[11px] text-slate-400 text-right">{text.length}/500</p>
          </div>
        )}
      </Modal>
    </div>
  )
}
