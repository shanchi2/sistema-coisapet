import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Loader2, ExternalLink, Pencil, Trash2, Eye, Heart, UserPlus, Image as ImageIcon, Info, Tag, Upload, X, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Modal } from '../../components/ui/Modal'
import { MediaViewer, MediaThumb } from '../../components/ui/MediaViewer'
import { fmtInt, toJpeg, uploadMedia } from './igApi'

// Parcerias com influencers (20/10, pedido do Raphael). Post em collab é da
// conta da influencer: a Meta só entrega as métricas pra ela, e na nossa
// conexão (login do Instagram) não dá pra listar collabs nem ver números de
// outras contas — testado na API. Então:
//   * cadastro das influencers e de cada post (link + números dos prints que
//     ela manda: alcance, visualizações, curtidas, cliques, cupom…);
//   * efeito nos NOSSOS seguidores: saldo do dia do post + 2 dias seguintes
//     comparado com a média dos 14 dias antes (dados da aba Seguidores);
//   * marcações na foto (@coisapet marcada) entram sozinhas (ig_tagged_media).

const FORMATS = { REELS: '🎬 Reels', CAROUSEL: '🗂️ Carrossel', IMAGE: '🖼️ Foto', STORIES: '⭕ Stories' }
const KINDS = { collab: 'Collab', marcacao: 'Marcação na foto', mencao: '@ na legenda', stories: 'Stories' }
const METRICS = [
  ['views', 'Visualizações'], ['reach', 'Alcance'], ['likes', 'Curtidas'], ['comments', 'Comentários'],
  ['shares', 'Compartilh.'], ['saves', 'Salvamentos'], ['link_clicks', 'Cliques no link'], ['coupon_uses', 'Usos do cupom'],
]
const cleanUser = u => String(u || '').trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/.*$/, '').toLowerCase()
const isoDay = d => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` }
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDay(d) }
const toLocal = iso => { if (!iso) return ''; const d = new Date(iso); return `${isoDay(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }

export function IgPartners() {
  const { user } = useAuth()
  const [infl, setInfl] = useState(null)
  const [posts, setPosts] = useState([])
  const [tagged, setTagged] = useState([])
  const [daily, setDaily] = useState([])
  const [sel, setSel] = useState('all')
  const [q, setQ] = useState('')
  const [editInfl, setEditInfl] = useState(null)
  const [editPost, setEditPost] = useState(null)
  const [viewer, setViewer] = useState(null)

  const load = useCallback(async () => {
    const [a, b, c, d] = await Promise.all([
      supabase.from('ig_influencers').select('*').order('username'),
      supabase.from('ig_influencer_posts').select('*').order('posted_at', { ascending: false }),
      supabase.from('ig_tagged_media').select('*').order('posted_at', { ascending: false }).limit(100),
      supabase.from('ig_account_daily').select('day, new_follows, unfollows').order('day'),
    ])
    setInfl(a.data || []); setPosts(b.data || []); setTagged(c.data || []); setDaily(d.data || [])
  }, [])
  useEffect(() => { load() }, [load])

  // Efeito nos nossos seguidores: saldo (dia do post + 2) − 3 × média diária dos 14 dias antes
  const netByDay = useMemo(() => Object.fromEntries(daily.filter(r => r.new_follows != null).map(r => [r.day, r.new_follows - (r.unfollows || 0)])), [daily])
  const lift = useCallback(p => {
    const d0 = isoDay(p.posted_at)
    const win = [0, 1, 2].map(i => netByDay[addDays(d0, i)])
    if (win.some(v => v == null)) return null
    const base = Array.from({ length: 14 }, (_, i) => netByDay[addDays(d0, -1 - i)]).filter(v => v != null)
    const avg = base.length >= 5 ? base.reduce((s, v) => s + v, 0) / base.length : 0
    return { total: win.reduce((s, v) => s + v, 0), extra: Math.round(win.reduce((s, v) => s + v, 0) - avg * 3) }
  }, [netByDay])

  const inflById = useMemo(() => Object.fromEntries((infl || []).map(i => [i.id, i])), [infl])
  const stats = useMemo(() => {
    const g = {}
    for (const p of posts) {
      const s = g[p.influencer_id] ||= { n: 0, views: 0, reach: 0, likes: 0, extra: 0, hasLift: 0, last: null }
      s.n++; s.views += p.views || 0; s.reach += p.reach || 0; s.likes += p.likes || 0
      const l = lift(p); if (l) { s.extra += l.extra; s.hasLift++ }
      if (!s.last || p.posted_at > s.last) s.last = p.posted_at
    }
    return g
  }, [posts, lift])

  const shown = posts.filter(p => sel === 'all' || p.influencer_id === sel)
    .filter(p => !q.trim() || `${inflById[p.influencer_id]?.username} ${p.notes || ''}`.toLowerCase().includes(q.trim().toLowerCase()))
  const tot = shown.reduce((t, p) => ({ views: t.views + (p.views || 0), reach: t.reach + (p.reach || 0), likes: t.likes + (p.likes || 0) }), { views: 0, reach: 0, likes: 0 })
  const lifts = shown.map(lift).filter(Boolean)
  const knownTags = new Set(posts.map(p => p.tagged_media_id).filter(Boolean))
  const newTags = tagged.filter(t => !knownTags.has(t.id))

  async function delPost(p) {
    if (!confirm('Excluir este post da lista de parcerias?')) return
    await supabase.from('ig_influencer_posts').delete().eq('id', p.id)
    toast.success('Excluído'); load()
  }

  if (!infl) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-slate-400" /></div>

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setEditPost({})} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-pink-500 to-violet-600 text-white text-sm font-semibold"><Plus size={15} /> Registrar post de parceria</button>
        <button onClick={() => setEditInfl({})} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-50"><UserPlus size={15} /> Nova influencer</button>
        <div className="relative ml-auto">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar @ ou anotação" className="pl-7 pr-2 py-2 text-sm border border-slate-200 rounded-xl w-52" />
        </div>
      </div>

      {/* Influencers */}
      <div className="flex gap-3 overflow-x-auto pb-1">
        <button onClick={() => setSel('all')} className={`shrink-0 rounded-2xl border px-4 py-3 text-left min-w-[140px] ${sel === 'all' ? 'border-pink-400 bg-pink-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
          <p className="text-sm font-bold text-slate-700">Todas</p>
          <p className="text-[11px] text-slate-400">{infl.length} influencer{infl.length === 1 ? '' : 's'} · {posts.length} posts</p>
        </button>
        {infl.map(i => {
          const s = stats[i.id] || {}
          return (
            <div key={i.id} onClick={() => setSel(i.id)} role="button"
              className={`shrink-0 rounded-2xl border px-4 py-3 min-w-[190px] cursor-pointer ${sel === i.id ? 'border-pink-400 bg-pink-50' : 'border-slate-200 bg-white hover:border-slate-300'} ${i.active ? '' : 'opacity-60'}`}>
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-slate-700 truncate">@{i.username}</p>
                <button onClick={e => { e.stopPropagation(); setEditInfl(i) }} className="ml-auto p-1 rounded text-slate-400 hover:bg-white"><Pencil size={12} /></button>
              </div>
              <p className="text-[11px] text-slate-500 truncate">{[i.name, i.city].filter(Boolean).join(' · ') || '—'}</p>
              <p className="text-[11px] text-slate-400 mt-1">{s.n || 0} post{s.n === 1 ? '' : 's'}{s.views ? ` · ${fmtInt(s.views)} visualiz.` : ''}{s.hasLift ? ` · ${s.extra >= 0 ? '+' : ''}${s.extra} seg.` : ''}</p>
              {i.coupon && <p className="text-[10px] font-bold text-violet-600 mt-0.5">cupom {i.coupon}</p>}
            </div>
          )
        })}
      </div>

      {/* Números do recorte */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={ImageIcon} label="Posts de parceria" value={fmtInt(shown.length)} />
        <Kpi icon={Eye} label="Visualizações (informadas)" value={fmtInt(tot.views)} detail={tot.reach ? `${fmtInt(tot.reach)} de alcance` : 'pelos prints das influencers'} />
        <Kpi icon={Heart} label="Curtidas (informadas)" value={fmtInt(tot.likes)} />
        <Kpi icon={UserPlus} label="Seguidores a mais na @coisapet" value={lifts.length ? `${lifts.reduce((s, l) => s + l.extra, 0) >= 0 ? '+' : ''}${fmtInt(lifts.reduce((s, l) => s + l.extra, 0))}` : '—'}
          detail={lifts.length ? `acima do normal no dia do post + 2 dias (${lifts.length} post${lifts.length === 1 ? '' : 's'})` : 'aparece quando houver dados de seguidores do período'} tone="text-violet-700" />
      </div>

      {/* Posts */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <p className="text-sm font-bold text-slate-700 px-4 py-3 border-b border-slate-100">Posts de parceria</p>
        {shown.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold">Influencer / post</th>
                  <th className="text-right px-2 py-2 font-semibold">Visualiz.</th>
                  <th className="text-right px-2 py-2 font-semibold">Alcance</th>
                  <th className="text-right px-2 py-2 font-semibold">Curtidas</th>
                  <th className="text-right px-2 py-2 font-semibold">Coment.</th>
                  <th className="text-right px-2 py-2 font-semibold">Cliques</th>
                  <th className="text-right px-2 py-2 font-semibold" title="Seguidores da @coisapet acima do normal no dia do post + 2 dias">Efeito seg.</th>
                  <th className="px-2 py-2 font-semibold">Prints</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map(p => {
                  const i = inflById[p.influencer_id], l = lift(p)
                  const prints = (p.prints || []).map(u => ({ url: u, type: 'image', label: `@${i?.username || ''}` }))
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-2">
                        <p className="font-semibold text-slate-700">@{i?.username || '—'} <span className="text-xs font-normal text-slate-400">{FORMATS[p.format]} · {KINDS[p.kind]}</span></p>
                        <p className="text-[11px] text-slate-400">{new Date(p.posted_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}{p.notes ? ` · ${p.notes}` : ''}</p>
                      </td>
                      {['views', 'reach', 'likes', 'comments', 'link_clicks'].map(k => <td key={k} className="px-2 py-2 text-right tabular-nums">{p[k] != null ? fmtInt(p[k]) : <span className="text-slate-300">—</span>}</td>)}
                      <td className={`px-2 py-2 text-right tabular-nums font-bold ${l ? (l.extra > 0 ? 'text-violet-700' : 'text-slate-500') : ''}`} title={l ? `Saldo nos 3 dias: ${l.total}` : 'Sem dados de seguidores desses dias'}>{l ? `${l.extra > 0 ? '+' : ''}${l.extra}` : <span className="text-slate-300">—</span>}</td>
                      <td className="px-2 py-2">
                        <div className="flex gap-1">{prints.slice(0, 3).map((m, k) => <MediaThumb key={m.url} item={m} size="w-8 h-8" onClick={() => setViewer({ items: prints, index: k })} />)}</div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-right">
                        {p.permalink && <a href={p.permalink} target="_blank" rel="noreferrer" title="Abrir no Instagram" className="inline-block p-1.5 text-slate-400 hover:text-pink-500"><ExternalLink size={14} /></a>}
                        <button onClick={() => setEditPost(p)} className="p-1.5 text-slate-400 hover:text-slate-700"><Pencil size={14} /></button>
                        <button onClick={() => delPost(p)} className="p-1.5 text-slate-400 hover:text-red-600"><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-slate-500">
            Nenhum post de parceria ainda. Cadastre as influencers e registre cada post com o link (e os números dos prints, se ela mandar).
          </div>
        )}
      </div>

      {/* Marcações automáticas */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4">
        <p className="text-sm font-bold text-slate-700 flex items-center gap-1.5"><Tag size={14} className="text-slate-400" /> Marcações automáticas</p>
        <p className="text-[11px] text-slate-400 mb-3">Posts de outras contas que marcaram a @coisapet NA FOTO (marcação de pessoa). Entram sozinhos a cada hora — clique em "Registrar" pra ligar a uma influencer.</p>
        {newTags.length ? (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {newTags.map(t => (
              <div key={t.id} className="w-44 shrink-0 rounded-xl border border-slate-200 overflow-hidden">
                <div className="aspect-square bg-slate-100">{t.media_url && t.media_type !== 'VIDEO' && <img src={t.media_url} alt="" className="w-full h-full object-cover" loading="lazy" />}</div>
                <div className="p-2">
                  <p className="text-xs font-bold text-slate-700 truncate">@{t.username}</p>
                  <p className="text-[10px] text-slate-400">{t.posted_at ? new Date(t.posted_at).toLocaleDateString('pt-BR') : ''} · ❤ {fmtInt(t.like_count)} · 💬 {fmtInt(t.comments_count)}</p>
                  <button onClick={() => setEditPost({ _tag: t })} className="mt-1.5 w-full text-[11px] font-semibold py-1 rounded-lg bg-pink-50 text-pink-700 hover:bg-pink-100">Registrar</button>
                </div>
              </div>
            ))}
          </div>
        ) : <p className="text-xs text-slate-400">Nenhuma marcação nova. Dica: peça pras influencers marcarem a @coisapet na foto (além do collab) — aí o sistema puxa sozinho.</p>}
      </div>

      <p className="text-[11px] text-slate-400 flex gap-1.5 px-1"><Info size={12} className="shrink-0 mt-0.5" />
        Post em collab é da conta da influencer: a Meta só mostra alcance/visualizações pra ela, por isso os números vêm dos prints. "Efeito seg." = seguidores que a @coisapet ganhou a mais que o normal no dia do post e nos 2 dias seguintes (comparado com a média dos 14 dias anteriores) — se duas parcerias saírem no mesmo dia, o efeito se mistura.
      </p>

      {editInfl && <InfluencerModal infl={editInfl} user={user} onClose={() => setEditInfl(null)} onSaved={() => { setEditInfl(null); load() }} />}
      {editPost && <PostModal post={editPost} influencers={infl} user={user} onClose={() => setEditPost(null)} onSaved={() => { setEditPost(null); load() }} />}
      {viewer && <MediaViewer items={viewer.items} index={viewer.index} onClose={() => setViewer(null)} />}
    </div>
  )
}

function Kpi({ icon: Icon, label, value, detail, tone = 'text-slate-800' }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-1"><Icon size={14} className="text-slate-400" /><p className="text-xs font-semibold text-slate-500 uppercase">{label}</p></div>
      <p className={`text-2xl font-bold ${tone}`}>{value}</p>
      {detail && <p className="text-[11px] text-slate-400 mt-0.5">{detail}</p>}
    </div>
  )
}

function InfluencerModal({ infl, user, onClose, onSaved }) {
  const [f, setF] = useState({ username: infl.username || '', name: infl.name || '', contact: infl.contact || '', city: infl.city || '', coupon: infl.coupon || '', notes: infl.notes || '', active: infl.active !== false })
  const [busy, setBusy] = useState(false)
  async function save() {
    const username = cleanUser(f.username)
    if (!username) return toast.error('Informe o @ da influencer')
    setBusy(true)
    const row = { ...f, username, updated_at: new Date().toISOString() }
    const { error } = infl.id
      ? await supabase.from('ig_influencers').update(row).eq('id', infl.id)
      : await supabase.from('ig_influencers').insert({ ...row, created_by: user?.name || null })
    setBusy(false)
    if (error) return toast.error(error.code === '23505' ? 'Essa influencer já está cadastrada' : error.message)
    toast.success('Salvo'); onSaved()
  }
  async function remove() {
    if (!confirm(`Excluir @${infl.username} e todos os posts dela da lista?`)) return
    await supabase.from('ig_influencers').delete().eq('id', infl.id)
    onSaved()
  }
  const field = (k, label, ph) => (
    <label className="text-xs font-semibold text-slate-500">{label}
      <input value={f[k]} onChange={e => setF(x => ({ ...x, [k]: e.target.value }))} placeholder={ph} className="mt-1 w-full text-sm font-normal border border-slate-200 rounded-xl px-3 py-2 text-slate-700" />
    </label>
  )
  return (
    <Modal open onClose={() => !busy && onClose()} title={infl.id ? `@${infl.username}` : 'Nova influencer'}
      footer={<div className="flex items-center gap-2">
        {infl.id && <button onClick={remove} className="text-xs text-red-500 hover:underline mr-auto">Excluir</button>}
        <button onClick={onClose} className="btn-secondary ml-auto">Cancelar</button>
        <button onClick={save} disabled={busy} className="btn-primary">{busy ? <Loader2 size={14} className="animate-spin" /> : null} Salvar</button>
      </div>}>
      <div className="grid sm:grid-cols-2 gap-3">
        {field('username', 'Instagram (@)', '@fulana.pets')}
        {field('name', 'Nome', 'Fulana')}
        {field('contact', 'Contato', 'WhatsApp / e-mail')}
        {field('city', 'Cidade', 'São Paulo')}
        {field('coupon', 'Cupom dela', 'FULANA10')}
        <label className="text-xs font-semibold text-slate-500 flex items-end gap-2 pb-2"><input type="checkbox" checked={f.active} onChange={e => setF(x => ({ ...x, active: e.target.checked }))} /> Parceria ativa</label>
        <label className="text-xs font-semibold text-slate-500 sm:col-span-2">Observações
          <textarea value={f.notes} onChange={e => setF(x => ({ ...x, notes: e.target.value }))} rows={2} placeholder="O que foi combinado, produtos enviados…" className="mt-1 w-full text-sm font-normal border border-slate-200 rounded-xl px-3 py-2 text-slate-700" />
        </label>
      </div>
    </Modal>
  )
}

function PostModal({ post, influencers, user, onClose, onSaved }) {
  const tag = post._tag
  const guess = tag ? influencers.find(i => i.username === cleanUser(tag.username)) : null
  const [f, setF] = useState({
    influencer_id: post.influencer_id || guess?.id || '', newUser: tag && !guess ? cleanUser(tag.username) : '',
    permalink: post.permalink || tag?.permalink || '', posted_at: toLocal(post.posted_at || tag?.posted_at || new Date().toISOString()),
    format: post.format || (tag ? (tag.media_product_type === 'REELS' ? 'REELS' : tag.media_type === 'CAROUSEL_ALBUM' ? 'CAROUSEL' : 'IMAGE') : 'REELS'),
    kind: post.kind || (tag ? 'marcacao' : 'collab'), notes: post.notes || '', prints: post.prints || [],
    ...Object.fromEntries(METRICS.map(([k]) => [k, post[k] ?? (k === 'likes' ? tag?.like_count : k === 'comments' ? tag?.comments_count : null) ?? ''])),
  })
  const [busy, setBusy] = useState(null)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))

  async function addPrints(files) {
    setBusy('upload')
    try {
      for (const file of [...files].slice(0, 10)) {
        const j = await toJpeg(file, { max: 1600 })
        const up = await uploadMedia(j.blob, 'jpg')
        setF(x => ({ ...x, prints: [...x.prints, up.url] }))
      }
    } catch (e) { toast.error('Falha no envio: ' + e.message) } finally { setBusy(null) }
  }

  async function save() {
    let influencer_id = f.influencer_id
    if (influencer_id === '__new' || (!influencer_id && f.newUser)) {
      const username = cleanUser(f.newUser)
      if (!username) return toast.error('Informe o @ da nova influencer')
      const { data, error } = await supabase.from('ig_influencers').upsert({ username, created_by: user?.name || null }, { onConflict: 'username' }).select('id').single()
      if (error) return toast.error(error.message)
      influencer_id = data.id
    }
    if (!influencer_id) return toast.error('Escolha a influencer')
    if (!f.posted_at) return toast.error('Informe a data do post')
    setBusy('save')
    const row = {
      influencer_id, permalink: f.permalink.trim() || null, posted_at: new Date(f.posted_at).toISOString(), format: f.format, kind: f.kind,
      notes: f.notes.trim() || null, prints: f.prints, tagged_media_id: post.tagged_media_id || tag?.id || null,
      ...Object.fromEntries(METRICS.map(([k]) => [k, f[k] === '' || f[k] == null ? null : Math.max(0, Math.round(Number(String(f[k]).replace(/\./g, '').replace(',', '.'))) || 0)])),
      updated_at: new Date().toISOString(),
    }
    const { error } = post.id
      ? await supabase.from('ig_influencer_posts').update(row).eq('id', post.id)
      : await supabase.from('ig_influencer_posts').insert({ ...row, created_by: user?.name || null })
    setBusy(null)
    if (error) return toast.error(error.message)
    toast.success('Post registrado'); onSaved()
  }

  return (
    <Modal open onClose={() => !busy && onClose()} title={post.id ? 'Editar post de parceria' : 'Registrar post de parceria'} subtitle="Os números são opcionais — preencha com o que a influencer mandar nos prints"
      footer={<div className="flex justify-end gap-2">
        <button onClick={onClose} className="btn-secondary">Cancelar</button>
        <button onClick={save} disabled={!!busy} className="btn-primary">{busy === 'save' ? <Loader2 size={14} className="animate-spin" /> : null} Salvar</button>
      </div>}>
      <div className="flex flex-col gap-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-xs font-semibold text-slate-500">Influencer
            <select value={f.influencer_id || (f.newUser ? '__new' : '')} onChange={e => set('influencer_id', e.target.value)} className="mt-1 w-full text-sm font-normal border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-700">
              <option value="">Escolha…</option>
              {influencers.map(i => <option key={i.id} value={i.id}>@{i.username}{i.name ? ` · ${i.name}` : ''}</option>)}
              <option value="__new">+ Nova influencer</option>
            </select>
          </label>
          {(f.influencer_id === '__new' || (!f.influencer_id && f.newUser)) ? (
            <label className="text-xs font-semibold text-slate-500">@ da nova influencer
              <input value={f.newUser} onChange={e => set('newUser', e.target.value)} placeholder="@fulana.pets" className="mt-1 w-full text-sm font-normal border border-slate-200 rounded-xl px-3 py-2" />
            </label>
          ) : (
            <label className="text-xs font-semibold text-slate-500">Data e hora do post
              <input type="datetime-local" value={f.posted_at} onChange={e => set('posted_at', e.target.value)} className="mt-1 w-full text-sm font-normal border border-slate-200 rounded-xl px-3 py-2" />
            </label>
          )}
          {(f.influencer_id === '__new' || (!f.influencer_id && f.newUser)) && (
            <label className="text-xs font-semibold text-slate-500">Data e hora do post
              <input type="datetime-local" value={f.posted_at} onChange={e => set('posted_at', e.target.value)} className="mt-1 w-full text-sm font-normal border border-slate-200 rounded-xl px-3 py-2" />
            </label>
          )}
          <label className="text-xs font-semibold text-slate-500 sm:col-span-2">Link do post
            <input value={f.permalink} onChange={e => set('permalink', e.target.value)} placeholder="https://www.instagram.com/reel/…" className="mt-1 w-full text-sm font-normal border border-slate-200 rounded-xl px-3 py-2" />
          </label>
          <label className="text-xs font-semibold text-slate-500">Formato
            <select value={f.format} onChange={e => set('format', e.target.value)} className="mt-1 w-full text-sm font-normal border border-slate-200 rounded-xl px-3 py-2 bg-white">
              {Object.entries(FORMATS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-500">Tipo
            <select value={f.kind} onChange={e => set('kind', e.target.value)} className="mt-1 w-full text-sm font-normal border border-slate-200 rounded-xl px-3 py-2 bg-white">
              {Object.entries(KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-500 mb-1">Números (dos prints da influencer)</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {METRICS.map(([k, l]) => (
              <label key={k} className="text-[11px] text-slate-500">{l}
                <input inputMode="numeric" value={f[k]} onChange={e => set(k, e.target.value)} className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 tabular-nums" />
              </label>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-500 mb-1">Prints dos resultados</p>
          <div className="flex gap-2 flex-wrap items-center">
            {f.prints.map(u => (
              <div key={u} className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-200">
                <img src={u} alt="" className="w-full h-full object-cover" />
                <button onClick={() => set('prints', f.prints.filter(x => x !== u))} className="absolute top-0.5 right-0.5 p-0.5 rounded bg-black/50 text-white"><X size={10} /></button>
              </div>
            ))}
            <label className="w-16 h-16 rounded-lg border-2 border-dashed border-slate-300 text-slate-400 hover:border-pink-400 hover:text-pink-500 flex flex-col items-center justify-center cursor-pointer text-[10px]">
              {busy === 'upload' ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} prints
              <input type="file" accept="image/*" multiple className="hidden" onChange={e => { addPrints(e.target.files); e.target.value = '' }} />
            </label>
          </div>
        </div>
        <label className="text-xs font-semibold text-slate-500">Anotação
          <input value={f.notes} onChange={e => set('notes', e.target.value)} placeholder="Ex: unboxing do terrário 80cm, enviamos o kit X" className="mt-1 w-full text-sm font-normal border border-slate-200 rounded-xl px-3 py-2" />
        </label>
      </div>
    </Modal>
  )
}
