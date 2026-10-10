import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Star, Loader2, RefreshCw, MessageSquareReply, Info, Search, X, Image as ImageIcon, CheckCircle2, MessageCircle, Send } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { StatTile, fmtInt } from '../dashboard/widgets'
import { Modal } from '../../components/ui/Modal'
import { PLAT, PlatBadge, Segmented, PlatformFilter, usePlatformFilter, norm, fetchAll } from './shared'

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
const fmtDT = iso => iso ? new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '—'
const TEMPLATES = [
  ['Agradecer (5★)', 'Ficamos muito felizes com a sua compra e sua avaliação! Obrigada por fazer parte do time Coisa Pet!🤎🐹'],
  ['Nota baixa', 'Poxa, sentimos muito pela sua experiência! 😔 Queremos muito resolver: chama a gente no chat da Shopee que a nossa equipe vai te ajudar o mais rápido possível. 🤎'],
  ['Sugestão / dúvida', 'Obrigada pelo seu retorno! Sua opinião ajuda muito a gente a melhorar. Qualquer dúvida, é só chamar no chat. 🤎🐹'],
]

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

  const load = useCallback(async () => {
    setList(null); setError(null)
    const since = new Date(Date.now() - Number(period) * 86400e3).toISOString()
    try {
      const [c, st, mlr, last] = await Promise.all([
        supabase.functions.invoke('shopee-extra', { body: { action: 'comments', since, max: 1000 } }),
        fetchAll(() => supabase.from('marketplace_stock').select('platform, item_id, variation_id, title, variation, thumbnail')),
        fetchAll(() => supabase.from('ml_reviews').select('id, item_id, rate, title, content, created_at_ml, raw').gte('created_at_ml', since).order('created_at_ml', { ascending: false })).catch(() => []),
        supabase.from('ml_review_items').select('synced_at').order('synced_at', { ascending: false }).limit(1),
      ])
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
      .filter(c => eff === 'all' || (eff === 'pending' ? c.replyable && !c.reply : eff === 'low' ? c.rating <= 3 : eff === 'text' ? (c.text.trim() || c.headline) : eff === 'media' ? c.media.images.length || c.media.videos : true))
      .filter(c => !q || norm(`${c.headline || ''} ${c.text} ${c.buyer || ''} ${itemOf(c)?.title || ''}`).includes(q))
      .sort((a, b) => (eff === 'pending' ? (a.rating - b.rating) : 0) || (b.at || '').localeCompare(a.at || ''))
  }, [all, eff, search, items]) // eslint-disable-line react-hooks/exhaustive-deps

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
              {!visible.length && <div className="card py-14 text-center text-slate-400"><CheckCircle2 size={26} className="mx-auto mb-2 text-emerald-400" />Nada aqui com esse filtro.</div>}
              {visible.slice(0, 150).map(c => {
                const it = itemOf(c)
                const imgs = c.platform === 'ml' ? c.media.images.map(id => [mlImg(id), mlImg(id, 'F')]) : c.media.images.map(u => [u, u])
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
                      {imgs.length > 0 && <div className="flex gap-1.5 mt-1">{imgs.slice(0, 5).map(([t, f]) => <a key={t} href={f} target="_blank" rel="noreferrer"><img src={t} alt="" className="w-14 h-14 rounded-lg object-cover bg-slate-100" loading="lazy" /></a>)}</div>}
                      {!c.replyable ? null : c.reply
                        ? <div className="mt-1 rounded-lg bg-violet-50 border border-violet-100 px-3 py-2 text-[13px] text-slate-700"><p className="text-[10px] font-bold text-violet-600 mb-0.5">Resposta da CoisaPet · {fmtDT(c.reply.at)}</p>{c.reply.text}</div>
                        : <button onClick={() => { setReplyFor(c); setText(c.rating >= 5 && !c.text ? TEMPLATES[0][1] : '') }} className="btn-primary py-1.5 text-xs self-start mt-1"><MessageSquareReply size={13} /> Responder</button>}
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
            <div className="flex gap-1.5 flex-wrap">{TEMPLATES.map(([l, t]) => <button key={l} onClick={() => setText(t)} className="text-[11px] font-semibold px-2.5 py-1 rounded-full border border-slate-200 hover:border-slate-400 bg-white">{l}</button>)}</div>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={5} maxLength={500} className="input text-sm resize-y" placeholder="Escreva a resposta…" />
            <p className="text-[11px] text-slate-400 text-right">{text.length}/500</p>
          </div>
        )}
      </Modal>
    </div>
  )
}
