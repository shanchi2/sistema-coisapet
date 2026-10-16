import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, CheckCircle2, ClipboardList, Copy, ExternalLink, Loader2, Plus, Printer, RefreshCw, RotateCcw, Search, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

// Pré-listas de envio pro Full (16/10, pedido do Raphael). ML e Shopee não
// deixam criar envio pro Full por API, então a lista é montada aqui e, na hora
// de criar o envio no painel deles, quem monta vai copiando o código/SKU de
// cada item, colando na busca de lá e marcando "já adicionei".
// Só quantidades — sem R$ (a produção também usa).

export const PRELIST_PLAT = {
  ml:     { label: 'Mercado Livre', short: 'ML', code: 'Código MLB', badge: 'bg-[#FFE600] text-[#2D3277] border-[#F5C400]' },
  shopee: { label: 'Shopee', short: 'Shopee', code: 'ID do anúncio', badge: 'bg-[#EE4D2D] text-white border-[#EE4D2D]' },
}

const fmtInt = n => Math.round(n || 0).toLocaleString('pt-BR')
const fmtDate = d => d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''
const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
const today = () => new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

// Cria a lista com os itens (usado também pela Reposição inteligente)
export async function createPrelist({ platform, name, items = [], createdBy }) {
  const { data: list, error } = await supabase.from('full_prelists')
    .insert({ platform, name: name || `Envio ${PRELIST_PLAT[platform].short} ${today()}`, created_by: createdBy || null })
    .select().single()
  if (error) throw error
  if (items.length) {
    const rows = items.map((r, i) => ({
      prelist_id: list.id, item_id: r.item_id ?? null, variation_id: r.variation_id ?? null,
      title: r.title || '(sem título)', variation: r.variation || null, sku: r.sku || null,
      thumbnail: r.thumbnail || null, permalink: r.permalink || null,
      qty: Math.max(0, Math.round(r.qty ?? 1)), suggested: r.suggested ?? null, position: i,
    }))
    const { error: e2 } = await supabase.from('full_prelist_items').insert(rows)
    if (e2) throw e2
  }
  return list
}

function copy(text, label) {
  if (!text) return
  navigator.clipboard?.writeText(String(text)).then(() => toast.success(`${label} copiado`), () => toast.error('Não consegui copiar'))
}

function CopyChip({ value, label, mono = true }) {
  if (!value) return null
  return (
    <button onClick={() => copy(value, label)} title={`Copiar ${label.toLowerCase()}`}
      className={`inline-flex items-center gap-1 text-[11px] border border-slate-200 bg-white hover:border-emerald-400 hover:text-emerald-700 rounded-md px-1.5 py-0.5 text-slate-600 transition-colors ${mono ? 'font-mono' : ''}`}>
      <span className="text-slate-400 font-sans">{label}:</span> {value} <Copy size={10} />
    </button>
  )
}

function Progress({ done, total }) {
  const pct = total ? Math.round((done / total) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden min-w-[80px]">
        <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : 'bg-sky-500'}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-slate-600 tabular-nums whitespace-nowrap">{done} de {total}</span>
    </div>
  )
}

// ─── Lista de pré-listas ──────────────────────────────────────────────
export function FullPrelistsPanel({ openId, onOpen }) {
  const { user } = useAuth()
  const [lists, setLists] = useState(null)
  const [error, setError] = useState(null)
  const [show, setShow] = useState('aberta')
  const [creating, setCreating] = useState(false)

  async function load() {
    setError(null)
    const { data, error } = await supabase.from('full_prelists')
      .select('*, items:full_prelist_items(qty, added)').order('created_at', { ascending: false })
    if (error) { setError(error.message); return }
    setLists(data || [])
  }
  useEffect(() => { if (!openId) load() }, [openId])

  async function newList(platform) {
    setCreating(true)
    try {
      const l = await createPrelist({ platform, createdBy: user?.name })
      onOpen(l.id)
    } catch (e) { toast.error(e.message) } finally { setCreating(false) }
  }

  if (openId) return <PrelistDetail id={openId} onBack={() => onOpen(null)} />

  if (error) return <p className="text-sm text-rose-600">{error}</p>
  if (!lists) return <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-slate-400" /></div>

  const shown = lists.filter(l => l.status === show)
  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-start gap-3 flex-wrap">
        <ClipboardList size={18} className="text-emerald-500 mt-0.5" />
        <div className="flex-1 min-w-[260px] text-sm text-slate-600">
          <p className="font-bold text-slate-800">Pré-listas de envio pro Full</p>
          <p className="text-xs mt-0.5">O ML e a Shopee não deixam montar o envio por fora do painel deles. Então a lista fica pronta aqui e, na hora de criar o envio lá, é só copiar o código de cada item, colar na busca e marcar <strong>"já adicionei"</strong>. Dica: na aba <strong>Reposição inteligente</strong>, o botão <strong>"Montar pré-lista"</strong> já traz as quantidades sugeridas.</p>
        </div>
        <div className="flex items-center gap-2">
          {Object.entries(PRELIST_PLAT).map(([k, p]) => (
            <button key={k} disabled={creating} onClick={() => newList(k)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-600 disabled:opacity-50">
              <Plus size={13} /> Lista vazia {p.short}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="inline-flex rounded-lg bg-white border border-slate-200 p-0.5 text-xs">
          {[['aberta', 'Em aberto'], ['concluida', 'Concluídas']].map(([k, l]) => (
            <button key={k} onClick={() => setShow(k)} className={`px-3 py-1.5 rounded-md font-semibold ${show === k ? 'bg-emerald-600 text-white' : 'text-slate-500'}`}>
              {l} ({lists.filter(x => x.status === k).length})
            </button>
          ))}
        </span>
        <button onClick={load} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-600">
          <RefreshCw size={13} /> Atualizar
        </button>
      </div>

      {shown.length === 0 && <p className="text-center text-sm text-slate-400 py-12">{show === 'aberta' ? 'Nenhuma pré-lista em aberto.' : 'Nenhuma pré-lista concluída ainda.'}</p>}
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {shown.map(l => {
          const items = l.items || []
          const units = items.reduce((t, i) => t + (i.qty || 0), 0)
          const done = items.filter(i => i.added).length
          return (
            <button key={l.id} onClick={() => onOpen(l.id)}
              className="text-left bg-white border border-slate-200 hover:border-emerald-300 hover:shadow-sm rounded-2xl p-4 space-y-3 transition-all">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold border rounded px-1.5 py-px ${PRELIST_PLAT[l.platform].badge}`}>{PRELIST_PLAT[l.platform].short}</span>
                <p className="font-bold text-slate-800 truncate flex-1">{l.name}</p>
                {l.status === 'concluida' && <CheckCircle2 size={16} className="text-emerald-500" />}
              </div>
              <p className="text-xs text-slate-500">{items.length} produto{items.length === 1 ? '' : 's'} · <strong className="text-slate-700">{fmtInt(units)} unidades</strong></p>
              <Progress done={done} total={items.length} />
              <p className="text-[11px] text-slate-400">Criada {fmtDate(l.created_at)}{l.created_by ? ` por ${l.created_by}` : ''}</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Uma pré-lista (montando o envio) ─────────────────────────────────
function PrelistDetail({ id, onBack }) {
  const { user } = useAuth()
  const [list, setList] = useState(null)
  const [items, setItems] = useState(null)
  const [error, setError] = useState(null)
  const [name, setName] = useState('')
  const [adding, setAdding] = useState(false)

  async function load() {
    const [{ data: l, error: e1 }, { data: its, error: e2 }] = await Promise.all([
      supabase.from('full_prelists').select('*').eq('id', id).single(),
      supabase.from('full_prelist_items').select('*').eq('prelist_id', id).order('position').order('id'),
    ])
    if (e1 || e2) { setError((e1 || e2).message); return }
    setList(l); setName(l.name); setItems(its || [])
  }
  useEffect(() => { load() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function patchList(p) {
    setList(l => ({ ...l, ...p }))
    const { error } = await supabase.from('full_prelists').update({ ...p, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) toast.error(error.message)
  }
  async function patchItem(itemId, p) {
    setItems(its => its.map(i => i.id === itemId ? { ...i, ...p } : i))
    const { error } = await supabase.from('full_prelist_items').update(p).eq('id', itemId)
    if (error) { toast.error(error.message); load() }
  }
  async function removeItem(itemId) {
    setItems(its => its.filter(i => i.id !== itemId))
    const { error } = await supabase.from('full_prelist_items').delete().eq('id', itemId)
    if (error) { toast.error(error.message); load() }
  }
  async function addItem(r) {
    if (items.some(i => i.item_id === r.item_id && (i.variation_id || '') === (r.variation_id || ''))) return toast('Esse item já está na lista')
    const row = {
      prelist_id: id, item_id: r.item_id, variation_id: r.variation_id || null, title: r.title, variation: r.variation || null,
      sku: r.sku || null, thumbnail: r.thumbnail || null, permalink: r.permalink || null, qty: 1,
      position: Math.max(-1, ...items.map(i => i.position)) + 1,
    }
    const { data, error } = await supabase.from('full_prelist_items').insert(row).select().single()
    if (error) return toast.error(error.message)
    setItems(its => [...its, data])
    toast.success('Adicionado')
  }
  async function removeList() {
    if (!window.confirm(`Excluir a pré-lista "${list.name}"? Não dá pra desfazer.`)) return
    const { error } = await supabase.from('full_prelists').delete().eq('id', id)
    if (error) return toast.error(error.message)
    onBack()
  }
  function toggleAdded(i) {
    const added = !i.added
    patchItem(i.id, { added, added_by: added ? user?.name || null : null, added_at: added ? new Date().toISOString() : null })
  }

  const sorted = useMemo(() => (items || []).slice().sort((a, b) => (a.added - b.added) || (a.position - b.position) || (a.id - b.id)), [items])

  if (error) return <p className="text-sm text-rose-600">{error}</p>
  if (!list || !items) return <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-slate-400" /></div>

  const P = PRELIST_PLAT[list.platform]
  const units = items.reduce((t, i) => t + (i.qty || 0), 0)
  const done = items.filter(i => i.added).length
  const closed = list.status === 'concluida'

  function print() {
    const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
    const rows = items.slice().sort((a, b) => a.position - b.position).map(i =>
      `<tr><td class="ck">☐</td><td>${esc(i.title)}${i.variation ? ` <b>· ${esc(i.variation)}</b>` : ''}</td><td class="m">${esc(i.sku || '')}</td><td class="m">${esc(i.item_id || '')}</td><td class="q">${i.qty}</td></tr>`).join('')
    const w = window.open('', '_blank')
    if (!w) return toast.error('O navegador bloqueou a janela de impressão')
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(list.name)}</title><style>
      body{font-family:Arial,sans-serif;font-size:12px;margin:24px;color:#111}h1{font-size:18px;margin:0 0 4px}p{margin:0 0 12px;color:#555}
      table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f2f2f2;font-size:11px;text-transform:uppercase}
      .m{font-family:monospace}.q{text-align:center;font-weight:bold;font-size:14px;width:50px}.ck{width:22px;text-align:center;font-size:16px}</style></head><body>
      <h1>${esc(list.name)} — Full ${esc(P.label)}</h1><p>${items.length} produtos · ${units} unidades · impresso em ${new Date().toLocaleString('pt-BR')}</p>
      <table><thead><tr><th></th><th>Produto</th><th>SKU</th><th>${esc(P.code)}</th><th>Qtd</th></tr></thead><tbody>${rows}</tbody></table>
      <script>window.onload=()=>window.print()<\/script></body></html>`)
    w.document.close()
  }

  return (
    <div className="space-y-4">
      {/* Cabeçalho da lista */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={onBack} className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 mr-1"><ArrowLeft size={14} /> Pré-listas</button>
          <span className={`text-[10px] font-bold border rounded px-1.5 py-px ${P.badge}`}>{P.label}</span>
          <input value={name} onChange={e => setName(e.target.value)} onBlur={() => name.trim() && name !== list.name && patchList({ name: name.trim() })}
            onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
            className="flex-1 min-w-[180px] text-lg font-bold text-slate-800 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-emerald-400 focus:outline-none px-1" />
          <button onClick={print} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-600"><Printer size={13} /> Imprimir</button>
          {closed
            ? <button onClick={() => patchList({ status: 'aberta' })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-600"><RotateCcw size={13} /> Reabrir</button>
            : <button onClick={() => patchList({ status: 'concluida' })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold text-white"><Check size={13} /> Envio criado — concluir</button>}
          <button onClick={removeList} title="Excluir pré-lista" className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"><Trash2 size={15} /></button>
        </div>
        <div className="flex items-center gap-4 flex-wrap text-xs text-slate-500">
          <span><strong className="text-slate-800 text-sm">{items.length}</strong> produtos</span>
          <span><strong className="text-slate-800 text-sm">{fmtInt(units)}</strong> unidades</span>
          <div className="flex-1 min-w-[200px]"><Progress done={done} total={items.length} /></div>
          <span className="text-slate-400">Criada {fmtDate(list.created_at)}{list.created_by ? ` por ${list.created_by}` : ''}</span>
        </div>
      </div>

      {/* Itens */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <p className="text-sm font-bold text-slate-800 flex-1">Itens do envio</p>
          {!closed && (
            <button onClick={() => setAdding(a => !a)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-xs font-semibold text-emerald-700">
              {adding ? <X size={13} /> : <Plus size={13} />} {adding ? 'Fechar busca' : 'Adicionar produto'}
            </button>
          )}
        </div>
        {adding && <AddSearch platform={list.platform} onPick={addItem} />}

        {sorted.length === 0 && <p className="text-center text-sm text-slate-400 py-10">Lista vazia — use "Adicionar produto".</p>}
        <ul className="divide-y divide-slate-100">
          {sorted.map(i => (
            <li key={i.id} className={`flex items-center gap-3 py-2.5 ${i.added ? 'opacity-55' : ''}`}>
              <button onClick={() => toggleAdded(i)} title={i.added ? 'Desmarcar' : `Marcar como já adicionado no ${P.short}`}
                className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center shrink-0 transition-colors ${i.added ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 hover:border-emerald-400'}`}>
                {i.added && <Check size={16} strokeWidth={3} />}
              </button>
              {i.thumbnail ? <img src={i.thumbnail} alt="" className="w-10 h-10 rounded-md object-cover bg-slate-100 shrink-0" loading="lazy" /> : <div className="w-10 h-10 rounded-md bg-slate-100 shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className={`text-[13px] text-slate-700 leading-snug ${i.added ? 'line-through' : ''}`}>{i.title}{i.variation ? <span className="font-semibold"> · {i.variation}</span> : ''}</p>
                <div className="flex items-center gap-1.5 flex-wrap mt-1">
                  <CopyChip value={i.item_id} label={P.short === 'ML' ? 'MLB' : 'ID'} />
                  <CopyChip value={i.sku} label="SKU" />
                  <button onClick={() => copy(i.title, 'Título')} className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-emerald-700"><Copy size={10} /> título</button>
                  {i.permalink && <a href={i.permalink} target="_blank" rel="noreferrer" className="text-slate-300 hover:text-sky-500"><ExternalLink size={12} /></a>}
                  {i.added && i.added_by && <span className="text-[10px] text-emerald-700">adicionado por {i.added_by}</span>}
                </div>
              </div>
              <QtyInput value={i.qty} disabled={closed} onSave={q => patchItem(i.id, { qty: q })} />
              {i.suggested != null && i.suggested !== i.qty && <span className="hidden md:inline text-[10px] text-slate-400 w-16" title="Quantidade sugerida pela Reposição inteligente">sugerido {i.suggested}</span>}
              {!closed && <button onClick={() => removeItem(i.id)} title="Tirar da lista" className="p-1 text-slate-300 hover:text-rose-500"><X size={15} /></button>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function QtyInput({ value, onSave, disabled }) {
  const [v, setV] = useState(String(value))
  useEffect(() => setV(String(value)), [value])
  const commit = () => {
    const n = Math.max(0, parseInt(v, 10) || 0)
    setV(String(n))
    if (n !== value) onSave(n)
  }
  return (
    <div className="flex items-center gap-1 shrink-0">
      <input type="number" min="0" value={v} disabled={disabled} onChange={e => setV(e.target.value)} onBlur={commit} onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
        className="w-16 text-center text-sm font-bold text-violet-700 border border-violet-200 bg-violet-50 rounded-md px-1 py-1 focus:outline-none focus:border-violet-400 disabled:opacity-60" />
      <span className="text-[11px] text-slate-400">un.</span>
    </div>
  )
}

// Busca nos anúncios da plataforma pra incluir na lista
function AddSearch({ platform, onPick }) {
  const [stock, setStock] = useState(null)
  const [q, setQ] = useState('')
  useEffect(() => {
    (async () => {
      const all = []
      for (let page = 0; page < 20; page++) {
        const { data, error } = await supabase.from('marketplace_stock')
          .select('item_id, variation_id, title, variation, sku, thumbnail, permalink, is_full')
          .eq('platform', platform).order('id').range(page * 1000, page * 1000 + 999)
        if (error) { toast.error(error.message); break }
        all.push(...(data || []))
        if (!data || data.length < 1000) break
      }
      setStock(all.filter(r => r.variation !== '(variações não lidas)'))
    })()
  }, [platform])
  const results = useMemo(() => {
    const t = norm(q)
    if (!stock || t.length < 2) return []
    const words = t.split(/\s+/)
    return stock.filter(r => {
      const hay = norm(`${r.title} ${r.variation} ${r.sku} ${r.item_id}`)
      return words.every(w => hay.includes(w))
    }).sort((a, b) => (b.is_full - a.is_full)).slice(0, 12)
  }, [stock, q])

  return (
    <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 space-y-2">
      <div className="flex items-center gap-2 border border-slate-200 bg-white rounded-lg px-3 py-1.5">
        <Search size={14} className="text-slate-400" />
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar anúncio por nome, cor, SKU ou código..." className="bg-transparent outline-none text-sm w-full" />
        {!stock && <Loader2 size={14} className="animate-spin text-slate-400" />}
      </div>
      {q.trim().length >= 2 && stock && results.length === 0 && <p className="text-xs text-slate-400 px-1">Nada encontrado.</p>}
      <ul className="space-y-1">
        {results.map(r => (
          <li key={`${r.item_id}|${r.variation_id || ''}`}>
            <button onClick={() => onPick(r)} className="w-full flex items-center gap-2.5 text-left bg-white hover:bg-emerald-50 border border-slate-100 rounded-lg px-2 py-1.5">
              {r.thumbnail ? <img src={r.thumbnail} alt="" className="w-8 h-8 rounded object-cover bg-slate-100" loading="lazy" /> : <div className="w-8 h-8 rounded bg-slate-100" />}
              <span className="flex-1 min-w-0 text-[13px] text-slate-700 truncate">{r.title}{r.variation ? <b> · {r.variation}</b> : ''}</span>
              {r.is_full && <span className="text-[10px] font-bold bg-emerald-600 text-white rounded px-1.5 py-px">NO FULL</span>}
              {r.sku && <span className="text-[10px] font-mono text-slate-400">{r.sku}</span>}
              <Plus size={14} className="text-emerald-600" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
