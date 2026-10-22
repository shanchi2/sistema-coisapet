import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Boxes, Check, CheckCircle2, ClipboardCheck, Factory, Loader2, Minus, Package, Plus,
  Printer, RefreshCw, RotateCcw, Tablet, Tag, Truck, Warehouse,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

// Feira do Full (22/10, pedido do Raphael). Envio pro Full não tem picklist
// (não tem cliente: são vários produtos iguais que vão pra estante do Full
// esperar o caminhão), só a "feira" do envio inteiro. Cada envio do ML (lido
// pela extensão) ou pré-lista vira uma feira: conta cada produto, etiqueta,
// põe na estante e, antes da coleta, outra pessoa reconta (conferência final)
// e registra os volumes. Erro de quantidade no Full vira multa do ML — por
// isso a tela grita quando falta ou sobra. Só quantidades, sem R$.
// Abas ML / Shopee: o Full da Shopee começa daqui a algumas semanas; até lá
// a aba Shopee trabalha com as pré-listas da Shopee.

const TERMINAL = ['closed_ok', 'closed_with_changes', 'cancelled', 'expired']
const TZ = 'America/Sao_Paulo'
const PLAT = {
  ml:     { label: 'Mercado Livre', short: 'ML', badge: 'bg-[#FFE600] text-[#2D3277]' },
  shopee: { label: 'Shopee', short: 'Shopee', badge: 'bg-[#EE4D2D] text-white' },
}
const fmtInt = n => Math.round(n || 0).toLocaleString('pt-BR')
const fmtColeta = iso => iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'sem data'
const dayISO = iso => new Date(iso || Date.now()).toLocaleDateString('en-CA', { timeZone: TZ })
function untilLabel(iso) {
  if (!iso) return null
  const h = (new Date(iso).getTime() - Date.now()) / 3600e3
  if (h < 0) return { text: 'coleta passou', cls: 'text-slate-400' }
  if (h < 24) return { text: `faltam ${Math.max(1, Math.round(h))}h`, cls: 'text-rose-600' }
  const d = Math.round(h / 24)
  return { text: `faltam ${d} dia${d > 1 ? 's' : ''}`, cls: d <= 2 ? 'text-amber-600' : 'text-slate-500' }
}

// Situação de um produto na separação
function itemState(it) {
  if (it.qty_target === 0) return 'removido'
  if (it.qty_counted < it.qty_target) return 'faltando'
  if (it.qty_counted > it.qty_target) return 'sobrando'
  if (it.labeled && it.on_shelf) return 'pronto'
  return 'certo'
}
const STATE = {
  faltando: { label: 'Faltando', ring: 'border-rose-300 bg-rose-50/40', chip: 'bg-rose-100 text-rose-700' },
  sobrando: { label: 'Sobrando', ring: 'border-sky-300 bg-sky-50/40', chip: 'bg-sky-100 text-sky-700' },
  certo:    { label: 'Contagem certa', ring: 'border-emerald-300 bg-white', chip: 'bg-emerald-100 text-emerald-700' },
  pronto:   { label: 'Na estante', ring: 'border-emerald-400 bg-emerald-50/60', chip: 'bg-emerald-600 text-white' },
  removido: { label: 'Saiu do envio', ring: 'border-slate-200 bg-slate-50 opacity-60', chip: 'bg-slate-200 text-slate-600' },
}

// ── Fontes: envios do ML e pré-listas ──────────────────────────────────────
async function loadSources(platform) {
  const reqs = [
    supabase.from('full_prelists').select('id, platform, name, status, updated_at, items:full_prelist_items(item_id, title, variation, sku, thumbnail, qty, position)')
      .eq('platform', platform).neq('status', 'concluida').order('updated_at', { ascending: false }),
  ]
  if (platform === 'ml') {
    reqs.push(supabase.from('ml_full_inbound_shipments')
      .select('id, name, status, shipment_type, appointment_date, items:ml_full_inbound_items(ml_code, title, variation, declared_qty, raw)')
      .not('status', 'in', `(${TERMINAL.join(',')})`).order('appointment_date', { ascending: true, nullsFirst: false }))
  }
  const [pre, ship] = await Promise.all(reqs)
  if (pre.error) throw pre.error
  if (ship?.error) throw ship.error
  const out = []
  ;(ship?.data || []).forEach(s => out.push({
    origin: 'ml_envio', ref_id: String(s.id), platform: 'ml', name: `Envio #${s.id}`, coleta_at: s.appointment_date,
    sub: s.shipment_type === 'pickup' ? 'Coleta' : 'Entrega no centro',
    items: (s.items || []).map(i => ({
      item_key: `${i.ml_code || i.title}|${i.variation || ''}`, title: i.title, variation: i.variation || null,
      sku: i.raw?.sku || null, photo: i.raw?.pictures?.[0]?.secureUrl || null, qty_target: i.declared_qty || 0,
    })),
  }))
  ;(pre.data || []).forEach(p => out.push({
    origin: 'prelista', ref_id: String(p.id), platform: p.platform, name: p.name, coleta_at: null, sub: 'Pré-lista',
    items: (p.items || []).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map(i => ({
      item_key: `${i.item_id || i.sku || i.title}|${i.variation || ''}`, title: i.title, variation: i.variation || null,
      sku: i.sku || null, photo: i.thumbnail || null, qty_target: i.qty || 0,
    })),
  }))
  // Mesmo produto repetido na fonte: soma
  out.forEach(s => {
    const m = new Map()
    s.items.forEach(i => { const x = m.get(i.item_key); if (x) x.qty_target += i.qty_target; else m.set(i.item_key, { ...i }) })
    s.items = [...m.values()]
  })
  return out
}

async function startFeira(src, who) {
  const { data: f, error } = await supabase.from('full_feiras').insert({
    platform: src.platform, origin: src.origin, ref_id: src.ref_id, name: src.name, coleta_at: src.coleta_at, created_by: who,
  }).select('id').single()
  if (error) {
    if (error.code === '23505') { // alguém já abriu essa feira
      const { data } = await supabase.from('full_feiras').select('id').eq('origin', src.origin).eq('ref_id', src.ref_id).single()
      return data.id
    }
    throw error
  }
  if (src.items.length) {
    const { error: e2 } = await supabase.from('full_feira_items').insert(src.items.map((i, k) => ({ ...i, feira_id: f.id, position: k })))
    if (e2) throw e2
  }
  return f.id
}

// Modo tablet (23/10): mesma tela, mas aberta FORA do sistema (sem menu
// lateral nem cabeçalho), igual ao picklist da Expedição — o Vini usa no
// tablet da Carol. Rota própria `/feira-full`, aberta em outra aba pelo
// botão "Abrir no tablet".
const BASE = import.meta.env.PROD ? '/sistema' : ''
const tabletUrl = qs => `${BASE}/feira-full${qs ? `?${qs}` : ''}`
const openTablet = qs => window.open(tabletUrl(qs), '_blank')

// ═══ Página ════════════════════════════════════════════════════════════════
export function FeiraFullPage({ tablet = false }) {
  const [params, setParams] = useSearchParams()
  const platform = params.get('plat') === 'shopee' ? 'shopee' : 'ml'
  const feiraId = params.get('feira')
  const go = patch => setParams(p => { Object.entries(patch).forEach(([k, v]) => v == null ? p.delete(k) : p.set(k, v)); return p })
  const back = useCallback(() => go({ feira: null }), []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`min-h-screen bg-slate-50 ${tablet ? 'p-3 sm:p-5' : 'p-4 sm:p-6 lg:p-8'}`}>
      <div className={`${tablet ? 'max-w-[1500px]' : 'max-w-[1100px]'} mx-auto space-y-5`}>
        {feiraId
          ? <FeiraView id={Number(feiraId)} tablet={tablet} onBack={back} />
          : <FeiraList platform={platform} tablet={tablet} onPlatform={p => go({ plat: p === 'ml' ? null : p })} onOpen={id => go({ feira: String(id) })} />}
      </div>
    </div>
  )
}

// Quem está usando o tablet (23/10): o tablet fica logado numa conta
// compartilhada, então a pessoa escolhe o nome dela — é esse nome que fica em
// "separado/reconferido por" (a conferência final precisa saber QUEM contou).
const OPERATOR_KEY = 'coisapet_feira_operador'
function readOperator() { try { return sessionStorage.getItem(OPERATOR_KEY) || '' } catch { return '' } }
function saveOperator(v) { try { sessionStorage.setItem(OPERATOR_KEY, v) } catch { /* sem storage */ } }

function OperatorPicker({ value, onChange }) {
  const [open, setOpen] = useState(!value)
  const [names, setNames] = useState([])
  useEffect(() => {
    if (!open || names.length) return
    supabase.from('system_users').select('name').eq('active', true).order('name')
      .then(({ data }) => setNames((data || []).map(u => u.name).filter(n => !/coisapet|atendimento|advoca/i.test(n))))
  }, [open, names.length])
  return (
    <>
      <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600">
        👤 {value ? value.split(' ')[0] : 'Quem está usando?'} <span className="text-slate-400">· trocar</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-lg space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Quem está usando o tablet?</h2>
              <p className="text-sm text-slate-500">Seu nome fica registrado em cada contagem e na conferência.</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[55vh] overflow-y-auto">
              {names.map(n => (
                <button key={n} onClick={() => { onChange(n); setOpen(false) }}
                  className={`px-3 py-3 rounded-xl border-2 text-sm font-semibold text-left ${n === value ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-700 hover:border-slate-300'}`}>
                  {n.split(' ').slice(0, 2).join(' ')}
                </button>
              ))}
              {!names.length && <Loader2 className="animate-spin text-slate-400" />}
            </div>
            {value && <button onClick={() => setOpen(false)} className="text-sm font-semibold text-slate-500">Fechar</button>}
          </div>
        </div>
      )}
    </>
  )
}

function TabletButton({ qs }) {
  return (
    <button onClick={() => openTablet(qs)} title="Abre a feira em tela cheia, fora do sistema (pro tablet do barracão)"
      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white">
      <Tablet size={13} />Abrir no tablet
    </button>
  )
}

function Header({ children, right }) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3.5 min-w-0">
        <div className="w-11 h-11 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl flex items-center justify-center shrink-0"><Warehouse size={21} className="text-white" /></div>
        <div className="min-w-0">{children}</div>
      </div>
      {right}
    </div>
  )
}

function Progress({ value, total, cls = 'bg-emerald-500' }) {
  const pct = total ? Math.min(100, Math.round((value / total) * 100)) : 0
  return <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full ${cls} transition-all`} style={{ width: `${pct}%` }} /></div>
}

// ── Lista: feiras em andamento + envios que ainda não começaram ─────────────
function FeiraList({ platform, tablet, onPlatform, onOpen }) {
  const { user } = useAuth()
  const [sources, setSources] = useState(null)
  const [feiras, setFeiras] = useState([])
  const [busy, setBusy] = useState(null)

  const load = useCallback(async () => {
    try {
      const [src, f] = await Promise.all([
        loadSources(platform),
        supabase.from('full_feiras').select('*, items:full_feira_items(qty_target, qty_counted, labeled, on_shelf)')
          .eq('platform', platform).order('created_at', { ascending: false }).limit(40),
      ])
      if (f.error) throw f.error
      setSources(src); setFeiras(f.data || [])
    } catch (e) { toast.error('Erro ao carregar: ' + e.message); setSources([]) }
  }, [platform])
  useEffect(() => { setSources(null); load() }, [load])

  const started = new Set(feiras.map(f => `${f.origin}|${f.ref_id}`))
  const pending = (sources || []).filter(s => !started.has(`${s.origin}|${s.ref_id}`) && s.items.length)
  const active = feiras.filter(f => f.status !== 'enviada')
  const sent = feiras.filter(f => f.status === 'enviada').slice(0, 8)

  async function begin(src) {
    setBusy(`${src.origin}|${src.ref_id}`)
    try { onOpen(await startFeira(src, user?.name || null)) }
    catch (e) { toast.error('Erro ao começar a feira: ' + e.message) }
    finally { setBusy(null) }
  }

  return (
    <>
      <Header right={!tablet && <TabletButton qs={platform === 'shopee' ? 'plat=shopee' : ''} />}>
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Feira do Full</h1>
        <p className="text-sm text-slate-500">Separação dos envios pro Full: contar, etiquetar e pôr na estante até o caminhão buscar.</p>
      </Header>

      <div className="flex gap-1 bg-white border border-slate-200 p-1 rounded-xl w-fit">
        {Object.entries(PLAT).map(([k, p]) => (
          <button key={k} onClick={() => onPlatform(k)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${platform === k ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-800'}`}>{p.label}</button>
        ))}
      </div>

      {sources === null ? <div className="flex justify-center py-16"><Loader2 className="animate-spin text-slate-400" /></div> : (
        <>
          <section className="space-y-3">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wide">Em andamento</h2>
            {active.length === 0 && <p className="text-sm text-slate-400 bg-white border border-dashed border-slate-200 rounded-2xl p-5 text-center">Nenhuma feira aberta. Comece uma pelos envios abaixo.</p>}
            <div className="grid sm:grid-cols-2 gap-3">
              {active.map(f => <FeiraCard key={f.id} f={f} onOpen={() => onOpen(f.id)} />)}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wide">{platform === 'ml' ? 'Envios e pré-listas sem feira' : 'Pré-listas sem feira'}</h2>
            {pending.length === 0 && (
              <p className="text-sm text-slate-400 bg-white border border-dashed border-slate-200 rounded-2xl p-5 text-center">
                {platform === 'ml'
                  ? 'Nenhum envio novo. Os envios do ML aparecem aqui quando a extensão lê o painel do Full; as pré-listas abertas também.'
                  : 'O Full da Shopee ainda não começou. Quando tiver uma pré-lista da Shopee aberta (Gestão de Envios Full → Pré-listas), ela aparece aqui.'}
              </p>
            )}
            <div className="grid sm:grid-cols-2 gap-3">
              {pending.map(s => {
                const units = s.items.reduce((t, i) => t + i.qty_target, 0)
                const until = untilLabel(s.coleta_at)
                const key = `${s.origin}|${s.ref_id}`
                return (
                  <div key={key} className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">{s.origin === 'ml_envio' ? <Truck size={18} className="text-slate-500" /> : <ClipboardCheck size={18} className="text-slate-500" />}</div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-800 truncate">{s.name}</p>
                        <p className="text-xs text-slate-500">{s.sub}{s.coleta_at && <> · {fmtColeta(s.coleta_at)}</>}{until && <span className={`font-semibold ${until.cls}`}> · {until.text}</span>}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{s.items.length} produto{s.items.length > 1 ? 's' : ''} · {fmtInt(units)} unidades</p>
                      </div>
                    </div>
                    <button onClick={() => begin(s)} disabled={!!busy} className="btn-primary text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                      {busy === key ? <Loader2 size={15} className="animate-spin" /> : <Package size={15} />} Começar a feira
                    </button>
                  </div>
                )
              })}
            </div>
          </section>

          {sent.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wide">Enviadas (últimas)</h2>
              <div className="grid sm:grid-cols-2 gap-3">{sent.map(f => <FeiraCard key={f.id} f={f} onOpen={() => onOpen(f.id)} />)}</div>
            </section>
          )}
        </>
      )}
    </>
  )
}

function feiraTotals(items) {
  const live = items.filter(i => i.qty_target > 0)
  const target = live.reduce((t, i) => t + i.qty_target, 0)
  return {
    products: live.length, target,
    counted: live.reduce((t, i) => t + Math.min(i.qty_counted, i.qty_target), 0),
    ok: live.filter(i => i.qty_counted === i.qty_target).length,
    labeled: live.filter(i => i.labeled).length,
    shelf: live.filter(i => i.on_shelf).length,
    missing: live.reduce((t, i) => t + Math.max(0, i.qty_target - i.qty_counted), 0),
  }
}

function StatusBadge({ status }) {
  const m = { separando: ['Separando', 'bg-amber-100 text-amber-700'], pronta: ['Pronta pra coleta', 'bg-emerald-100 text-emerald-700'], enviada: ['Enviada', 'bg-slate-100 text-slate-500'] }[status]
  return <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${m[1]}`}>{m[0]}</span>
}

function FeiraCard({ f, onOpen }) {
  const t = feiraTotals(f.items || [])
  const until = f.status === 'separando' ? untilLabel(f.coleta_at) : null
  return (
    <button onClick={onOpen} className="text-left bg-white border border-slate-200 hover:border-slate-300 rounded-2xl p-4 flex flex-col gap-2.5 transition-colors">
      <div className="flex items-start gap-2">
        <p className="text-sm font-bold text-slate-800 flex-1 truncate">{f.name}</p>
        <StatusBadge status={f.status} />
      </div>
      <p className="text-xs text-slate-500">{f.coleta_at ? fmtColeta(f.coleta_at) : f.origin === 'prelista' ? 'Pré-lista' : 'sem data'}{until && <span className={`font-semibold ${until.cls}`}> · {until.text}</span>}</p>
      <div className="space-y-1">
        <div className="flex justify-between text-[11px] text-slate-500"><span>Separado</span><span className="font-semibold">{fmtInt(t.counted)} / {fmtInt(t.target)} un.</span></div>
        <Progress value={t.counted} total={t.target} cls="bg-amber-500" />
        <div className="flex justify-between text-[11px] text-slate-500"><span>Na estante</span><span className="font-semibold">{t.shelf} / {t.products} produtos</span></div>
        <Progress value={t.shelf} total={t.products} />
      </div>
    </button>
  )
}

// ── Feira aberta ───────────────────────────────────────────────────────────
function FeiraView({ id, tablet, onBack }) {
  const { user } = useAuth()
  const [operator, setOperator] = useState(readOperator)
  const who = (tablet && operator) || user?.name || null
  const [feira, setFeira] = useState(null)
  const [items, setItems] = useState([])
  const [mode, setMode] = useState('separar')
  const [filter, setFilter] = useState('todos')
  const [boxes, setBoxes] = useState('')
  const [working, setWorking] = useState(false)
  const pendingSaves = useRef(0)
  const timers = useRef({})

  const load = useCallback(async (quiet) => {
    if (quiet && pendingSaves.current > 0) return // não atropela o que a pessoa está digitando
    const [f, it] = await Promise.all([
      supabase.from('full_feiras').select('*').eq('id', id).maybeSingle(),
      supabase.from('full_feira_items').select('*').eq('feira_id', id).order('position').order('id'),
    ])
    if (f.error || it.error) { if (!quiet) toast.error('Erro ao carregar a feira.'); return }
    if (!f.data) { toast.error('Feira não encontrada.'); onBack(); return }
    setFeira(f.data); setItems(it.data || [])
    setBoxes(b => b === '' && f.data.boxes ? String(f.data.boxes) : b)
  }, [id, onBack])
  useEffect(() => { load(false); const t = setInterval(() => load(true), 15000); return () => clearInterval(t) }, [load])

  // Salva um item (otimista); contagem digitada espera 600 ms
  function patchItem(itemId, patch, delay = 0) {
    setItems(list => list.map(i => i.id === itemId ? { ...i, ...patch } : i))
    clearTimeout(timers.current[itemId])
    const run = async () => {
      pendingSaves.current++
      const { error } = await supabase.from('full_feira_items').update({ ...patch, updated_by: who, updated_at: new Date().toISOString() }).eq('id', itemId)
      pendingSaves.current--
      if (error) { toast.error('Não salvou: ' + error.message); load(false) }
    }
    if (delay) timers.current[itemId] = setTimeout(run, delay); else run()
  }
  async function patchFeira(patch) {
    const { error } = await supabase.from('full_feiras').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) { toast.error('Erro: ' + error.message); return false }
    setFeira(f => ({ ...f, ...patch }))
    return true
  }

  const t = useMemo(() => feiraTotals(items), [items])
  const shown = useMemo(() => {
    const order = { faltando: 0, sobrando: 1, certo: 2, pronto: 3, removido: 4 }
    return items
      .filter(i => filter === 'todos' || (filter === 'faltando' && ['faltando', 'sobrando'].includes(itemState(i))) || (filter === 'estante' && i.on_shelf) || (filter === 'pendente' && !i.on_shelf && i.qty_target > 0))
      .sort((a, b) => order[itemState(a)] - order[itemState(b)] || a.position - b.position)
  }, [items, filter])

  // Atualiza do envio/pré-lista (o ML pode mudar a quantidade declarada)
  async function refreshFromSource() {
    setWorking(true)
    try {
      const src = (await loadSources(feira.platform)).find(s => s.origin === feira.origin && s.ref_id === feira.ref_id)
      if (!src) { toast('O envio/pré-lista não está mais aberto — nada pra atualizar.'); return }
      const byKey = new Map(items.map(i => [i.item_key, i]))
      let changed = 0
      for (const s of src.items) {
        const cur = byKey.get(s.item_key)
        if (!cur) { await supabase.from('full_feira_items').insert({ ...s, feira_id: id, position: items.length + changed }); changed++ }
        else if (cur.qty_target !== s.qty_target) { await supabase.from('full_feira_items').update({ qty_target: s.qty_target }).eq('id', cur.id); changed++ }
        byKey.delete(s.item_key)
      }
      for (const gone of byKey.values()) if (gone.qty_target > 0) { await supabase.from('full_feira_items').update({ qty_target: 0 }).eq('id', gone.id); changed++ }
      if (src.coleta_at && src.coleta_at !== feira.coleta_at) await patchFeira({ coleta_at: src.coleta_at })
      toast.success(changed ? `${changed} produto${changed > 1 ? 's' : ''} atualizado${changed > 1 ? 's' : ''} do envio.` : 'Já está igual ao envio.')
      load(false)
    } catch (e) { toast.error('Erro: ' + e.message) }
    finally { setWorking(false) }
  }

  // Manda pra aba "Itens faltando" da Produção o que ainda não foi pedido
  async function askProduction() {
    const missing = items.map(i => ({ i, n: Math.max(0, i.qty_target - i.qty_counted) - i.short_sent })).filter(x => x.n > 0)
    if (!missing.length) { toast('Nada novo pra pedir — o que falta já foi pedido pra Produção.'); return }
    if (!confirm(`Pedir pra Produção ${missing.reduce((s, x) => s + x.n, 0)} unidades de ${missing.length} produto(s)?`)) return
    setWorking(true)
    const { error } = await supabase.from('picklist_shortage_reports').insert(missing.map(({ i, n }) => ({
      batch_id: null, source: 'full', target_date: dayISO(feira.coleta_at),
      item_key: `full:${feira.id}:${i.item_key}`, titulo: `[Full] ${i.title}`, sku: i.sku, variacao: i.variation,
      missing_qty: n, reported_by: user?.id || null,
    })))
    if (error) { toast.error('Erro: ' + error.message); setWorking(false); return }
    await Promise.all(missing.map(({ i, n }) => supabase.from('full_feira_items').update({ short_sent: i.short_sent + n }).eq('id', i.id)))
    setWorking(false)
    toast.success('Pedido enviado pra Produção (aba Itens faltando).')
    load(false)
  }

  async function markReady() {
    const live = items.filter(i => i.qty_target > 0)
    const problems = []
    live.forEach(i => {
      if (i.qty_counted !== i.qty_target) problems.push(`${i.title}${i.variation ? ` (${i.variation})` : ''}: contado ${i.qty_counted} de ${i.qty_target}`)
      else if (i.recount != null && i.recount !== i.qty_target) problems.push(`${i.title}${i.variation ? ` (${i.variation})` : ''}: recontagem deu ${i.recount}`)
    })
    const notChecked = live.filter(i => i.recount == null).length
    const notLabeled = live.filter(i => !i.labeled).length
    const notShelf = live.filter(i => !i.on_shelf).length
    if (notChecked) problems.push(`${notChecked} produto(s) sem recontagem`)
    if (notLabeled) problems.push(`${notLabeled} produto(s) sem etiqueta marcada`)
    if (notShelf) problems.push(`${notShelf} produto(s) fora da estante`)
    if (!boxes || Number(boxes) <= 0) { toast.error('Informe quantos volumes/caixas vão na coleta.'); return }
    let note = null
    if (problems.length) {
      note = prompt(`Ainda tem diferença — o ML pode multar:\n\n• ${problems.slice(0, 8).join('\n• ')}${problems.length > 8 ? `\n• … +${problems.length - 8}` : ''}\n\nSe for mandar assim mesmo, escreva o motivo:`)
      if (!note?.trim()) return
    }
    if (await patchFeira({ status: 'pronta', boxes: Number(boxes), ready_by: who, ready_at: new Date().toISOString(), ready_note: note?.trim() || null })) toast.success('Feira pronta pra coleta! 🚚')
  }

  function print() {
    const rows = items.filter(i => i.qty_target > 0).map(i => `<tr><td>${esc(i.title)}${i.variation ? `<br><b>${esc(i.variation)}</b>` : ''}</td><td class="m">${esc(i.sku || '')}</td><td class="n">${i.qty_target}</td><td class="b">____</td><td class="c">☐</td><td class="c">☐</td><td class="b">____</td></tr>`).join('')
    const w = window.open('', '_blank')
    if (!w) { toast.error('Libere pop-ups pra imprimir.'); return }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Feira do Full — ${esc(feira.name)}</title><style>
      body{font-family:Arial,sans-serif;font-size:12px;margin:18px;color:#111} h1{font-size:17px;margin:0} p{margin:3px 0 10px;color:#555}
      table{width:100%;border-collapse:collapse} th,td{border:1px solid #bbb;padding:6px;vertical-align:top} th{background:#f2f2f2;font-size:10px;text-transform:uppercase}
      .n{text-align:center;font-size:16px;font-weight:bold} .c{text-align:center;font-size:16px} .b{width:56px} .m{font-family:monospace;font-size:11px}
    </style></head><body><h1>Feira do Full — ${esc(feira.name)}</h1><p>${PLAT[feira.platform].label} · coleta ${esc(fmtColeta(feira.coleta_at))} · ${t.products} produtos · ${fmtInt(t.target)} unidades</p>
    <table><thead><tr><th>Produto</th><th>SKU</th><th>Pedido</th><th>Contei</th><th>Etiq.</th><th>Estante</th><th>Reconferi</th></tr></thead><tbody>${rows}</tbody></table>
    <p style="margin-top:14px">Volumes: ______ &nbsp;&nbsp; Separado por: ________________ &nbsp;&nbsp; Conferido por: ________________</p></body></html>`)
    w.document.close(); w.focus(); w.print()
  }

  if (!feira) return <div className="flex justify-center py-24"><Loader2 className="animate-spin text-slate-400" /></div>
  const until = feira.status === 'separando' ? untilLabel(feira.coleta_at) : null
  const locked = feira.status !== 'separando'

  return (
    <>
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800"><ArrowLeft size={15} />Feiras</button>
      <Header right={
        <div className="flex flex-wrap gap-2">
          {!tablet && <TabletButton qs={`feira=${id}`} />}
          {tablet && <OperatorPicker value={operator} onChange={v => { saveOperator(v); setOperator(v) }} />}
          <button onClick={print} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-600"><Printer size={13} />Imprimir</button>
          {!locked && <>
            <button onClick={refreshFromSource} disabled={working} title="Puxa de novo as quantidades do envio/pré-lista" className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-600 disabled:opacity-50"><RefreshCw size={13} className={working ? 'animate-spin' : ''} />Atualizar do envio</button>
            <button onClick={askProduction} disabled={working || t.missing === 0} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-xs font-semibold text-amber-800 disabled:opacity-40"><Factory size={13} />Pedir o que falta pra Produção</button>
          </>}
        </div>
      }>
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight">{feira.name}</h1>
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${PLAT[feira.platform].badge}`}>{PLAT[feira.platform].short}</span>
          <StatusBadge status={feira.status} />
        </div>
        <p className="text-sm text-slate-500">Coleta: {fmtColeta(feira.coleta_at)}{until && <span className={`font-semibold ${until.cls}`}> · {until.text}</span>}</p>
      </Header>

      {/* Resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ['Separado', `${fmtInt(t.counted)} / ${fmtInt(t.target)}`, 'unidades', t.counted, t.target, 'bg-amber-500'],
          ['Contagem certa', `${t.ok} / ${t.products}`, 'produtos', t.ok, t.products, 'bg-emerald-500'],
          ['Etiquetados', `${t.labeled} / ${t.products}`, 'produtos', t.labeled, t.products, 'bg-violet-500'],
          ['Na estante', `${t.shelf} / ${t.products}`, 'produtos', t.shelf, t.products, 'bg-emerald-600'],
        ].map(([l, v, u, a, b, c]) => (
          <div key={l} className="bg-white border border-slate-200 rounded-2xl p-3.5 space-y-2">
            <p className="text-[11px] font-bold text-slate-400 uppercase">{l}</p>
            <p className="text-lg font-black text-slate-800 leading-none">{v} <span className="text-xs font-semibold text-slate-400">{u}</span></p>
            <Progress value={a} total={b} cls={c} />
          </div>
        ))}
      </div>

      {feira.status !== 'separando' && (
        <div className={`rounded-2xl border p-4 flex flex-wrap items-center gap-3 ${feira.status === 'pronta' ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-100 border-slate-200'}`}>
          <CheckCircle2 className={feira.status === 'pronta' ? 'text-emerald-600' : 'text-slate-400'} />
          <div className="flex-1 min-w-0 text-sm">
            <p className="font-bold text-slate-800">{feira.status === 'pronta' ? 'Pronta pra coleta' : 'Enviada'} · {feira.boxes} volume{feira.boxes > 1 ? 's' : ''}</p>
            <p className="text-xs text-slate-500">por {feira.ready_by || '—'}{feira.ready_at && ` em ${new Date(feira.ready_at).toLocaleString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`}{feira.ready_note && <> · <b>com diferença:</b> {feira.ready_note}</>}</p>
          </div>
          {feira.status === 'pronta' && <button onClick={() => patchFeira({ status: 'enviada' }).then(ok => ok && toast.success('Marcada como enviada.'))} className="btn-primary text-xs flex items-center gap-1.5"><Truck size={13} />Caminhão levou</button>}
          <button onClick={() => patchFeira({ status: 'separando' })} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-600"><RotateCcw size={13} />Reabrir</button>
        </div>
      )}

      {/* Modo + filtro */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex gap-1 bg-white border border-slate-200 p-1 rounded-xl">
          {[['separar', Package, 'Separação'], ['conferir', ClipboardCheck, 'Conferência final']].map(([k, Icon, l]) => (
            <button key={k} onClick={() => setMode(k)} className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold ${mode === k ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-800'}`}><Icon size={14} />{l}</button>
          ))}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {[['todos', 'Todos'], ['faltando', 'Com diferença'], ['pendente', 'Fora da estante'], ['estante', 'Na estante']].map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${filter === k ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>{l}</button>
          ))}
        </div>
      </div>

      {mode === 'conferir' && !locked && (
        <p className="text-xs text-slate-600 bg-sky-50 border border-sky-200 rounded-xl px-4 py-3">
          <b>Conferência final:</b> de preferência <b>outra pessoa</b> reconta cada produto na estante e digita o que contou. Se bater com o pedido fica verde.
          No fim, informe os volumes e marque <b>Pronta pra coleta</b>.
        </p>
      )}

      <div className={`grid md:grid-cols-2 ${tablet ? 'xl:grid-cols-3' : ''} gap-3`}>
        {shown.map(i => <ItemCard key={i.id} it={i} mode={mode} locked={locked} who={who} onPatch={patchItem} />)}
        {shown.length === 0 && <p className="md:col-span-2 text-sm text-slate-400 text-center py-10">Nada nesse filtro.</p>}
      </div>

      {mode === 'conferir' && !locked && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold text-slate-600">Volumes / caixas
            <div className="flex items-center gap-2 mt-1"><Boxes size={16} className="text-slate-400" />
              <input type="number" min="1" inputMode="numeric" value={boxes} onChange={e => setBoxes(e.target.value)} className="w-24 text-lg font-bold border border-slate-200 rounded-lg px-3 py-1.5" />
            </div>
          </label>
          <div className="flex-1" />
          <button onClick={markReady} className="btn-primary flex items-center gap-2 px-5 py-2.5"><CheckCircle2 size={16} />Pronta pra coleta</button>
        </div>
      )}
    </>
  )
}

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

function Photo({ src }) {
  const [bad, setBad] = useState(false)
  if (!src || bad) return <div className="w-16 h-16 rounded-xl bg-slate-100 flex items-center justify-center shrink-0"><Package size={22} className="text-slate-300" /></div>
  return <img src={src} alt="" onError={() => setBad(true)} className="w-16 h-16 rounded-xl object-cover border border-slate-100 shrink-0 bg-white" />
}

function Counter({ value, onChange, disabled, big }) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => { setDraft(String(value)) }, [value])
  const set = v => { const n = Math.max(0, Math.min(9999, Math.round(Number(v) || 0))); setDraft(String(n)); onChange(n) }
  return (
    <div className="flex items-center gap-1">
      <button type="button" disabled={disabled || value <= 0} onClick={() => set(value - 1)} className="w-10 h-10 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-slate-600 active:bg-slate-100 disabled:opacity-30"><Minus size={16} /></button>
      <input type="number" inputMode="numeric" disabled={disabled} value={draft} onFocus={e => e.target.select()}
        onChange={e => { setDraft(e.target.value); if (e.target.value !== '') onChange(Math.max(0, Math.round(Number(e.target.value) || 0)), true) }}
        onBlur={() => set(draft)}
        className={`${big ? 'w-20 text-2xl' : 'w-16 text-xl'} h-10 text-center font-black border border-slate-200 rounded-xl disabled:bg-slate-50`} />
      <button type="button" disabled={disabled} onClick={() => set(value + 1)} className="w-10 h-10 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-slate-600 active:bg-slate-100 disabled:opacity-30"><Plus size={16} /></button>
    </div>
  )
}

function Toggle({ on, onClick, disabled, icon: Icon, label }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border-2 text-xs font-bold transition-colors disabled:opacity-40 ${on ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}>
      {on ? <Check size={14} /> : <Icon size={14} />}{label}
    </button>
  )
}

function ItemCard({ it, mode, locked, who, onPatch }) {
  const st = itemState(it)
  const S = STATE[st]
  const diff = it.qty_counted - it.qty_target
  const recountOk = it.recount != null && it.recount === it.qty_target
  return (
    <div className={`rounded-2xl border-2 p-3.5 flex flex-col gap-3 ${S.ring}`}>
      <div className="flex gap-3">
        <Photo src={it.photo} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800 leading-snug line-clamp-2">{it.title}</p>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            {it.variation && <span className="text-[11px] font-bold text-violet-700 bg-violet-100 px-2 py-0.5 rounded-lg">{it.variation}</span>}
            {it.sku && <span className="text-[11px] font-mono text-slate-400">{it.sku}</span>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] font-bold text-slate-400 uppercase">Pedido</p>
          <p className="text-3xl font-black text-slate-800 leading-none">{it.qty_target}</p>
        </div>
      </div>

      {mode === 'separar' ? (
        <>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Counter value={it.qty_counted} disabled={locked || it.qty_target === 0} big onChange={(n, typing) => onPatch(it.id, { qty_counted: n }, typing ? 600 : 0)} />
            <div className="text-right">
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${S.chip}`}>{S.label}</span>
              {st === 'faltando' && <p className="text-xs font-bold text-rose-600 mt-1">faltam {-diff}</p>}
              {st === 'sobrando' && <p className="text-xs font-bold text-sky-600 mt-1">{diff} a mais — não mandar</p>}
              {it.short_sent > 0 && st === 'faltando' && <p className="text-[11px] text-amber-700 mt-0.5">{it.short_sent} pedido{it.short_sent > 1 ? 's' : ''} pra Produção</p>}
            </div>
          </div>
          {!locked && it.qty_target > 0 && it.qty_counted !== it.qty_target && (
            <button onClick={() => onPatch(it.id, { qty_counted: it.qty_target })} className="text-xs font-semibold text-slate-500 hover:text-slate-800 self-start">Separei tudo ({it.qty_target})</button>
          )}
          <div className="flex gap-2">
            <Toggle on={it.labeled} icon={Tag} label="Etiquetado" disabled={locked || it.qty_counted === 0} onClick={() => onPatch(it.id, { labeled: !it.labeled })} />
            <Toggle on={it.on_shelf} icon={Warehouse} label="Na estante" disabled={locked || it.qty_counted === 0} onClick={() => onPatch(it.id, { on_shelf: !it.on_shelf })} />
          </div>
        </>
      ) : (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Recontei</p>
            <Counter value={it.recount ?? 0} disabled={locked || it.qty_target === 0} onChange={(n, typing) => onPatch(it.id, { recount: n, recount_by: who }, typing ? 600 : 0)} />
            {!locked && it.qty_target > 0 && it.recount !== it.qty_target && (
              <button onClick={() => onPatch(it.id, { recount: it.qty_target, recount_by: who })} className="text-xs font-semibold text-slate-500 hover:text-slate-800 mt-1.5">Contei {it.qty_target}, bate</button>
            )}
          </div>
          <div className="text-right text-xs">
            {it.recount == null
              ? <span className="text-slate-400">não reconferido<br />(separado: {it.qty_counted})</span>
              : recountOk
                ? <span className="font-bold text-emerald-600 flex items-center gap-1 justify-end"><CheckCircle2 size={14} />bate</span>
                : <span className="font-bold text-rose-600">não bate ({it.recount} de {it.qty_target})</span>}
            {it.recount_by && <p className="text-[11px] text-slate-400 mt-0.5">por {it.recount_by}</p>}
            {!it.labeled && <p className="text-[11px] text-amber-600 mt-0.5">sem etiqueta marcada</p>}
          </div>
        </div>
      )}
    </div>
  )
}
