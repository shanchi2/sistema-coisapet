import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Tv, ExternalLink, Save, ArrowUp, ArrowDown, Megaphone, Truck, KeyRound, Copy, Check, Trash2, Loader2, Monitor, LayoutPanelLeft, GalleryHorizontal, Plus, Sun, Moon, RefreshCw, Eye, Pencil, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { moduleByKey, normalizeModules } from './tvModules'
import { TvPreviewModal } from './TvPreviewModal'

// Configuração da TV da Produção (07/10, fase100) — só diretor.
// O que aparece, em que ordem, layout, avisos, coleta manual e os
// códigos de cada TV.

const TV_PATH = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/tv`
const fmtDT = iso => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
function fmtAgo(iso) {
  if (!iso) return 'nunca conectou'
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 2) return 'ligada agora'
  if (min < 60) return `visto há ${min} min`
  const h = Math.round(min / 60)
  return h < 24 ? `visto há ${h} h` : `visto há ${Math.round(h / 24)} dias`
}
async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}
const newCode = () => 'tv-' + [...crypto.getRandomValues(new Uint8Array(8))].map(b => b.toString(16).padStart(2, '0')).join('')

function Panel({ icon: Icon, title, desc, children, right }) {
  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center shrink-0"><Icon size={17} className="text-slate-500" /></div>
          <div><h2 className="text-sm font-bold text-slate-800">{title}</h2>{desc && <p className="text-xs text-slate-500 mt-0.5">{desc}</p>}</div>
        </div>
        {right}
      </div>
      {children}
    </section>
  )
}
function Switch({ on, onChange }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${on ? 'bg-emerald-500' : 'bg-slate-300'}`}>
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  )
}
const FONT_SCALES = [90, 100, 110, 120, 130, 140, 150]
const LEVELS = [
  { v: 'info', label: 'Informativo', cls: 'bg-emerald-50 text-emerald-700' },
  { v: 'atencao', label: 'Atenção', cls: 'bg-amber-50 text-amber-700' },
  { v: 'critico', label: 'Urgente (faixa vermelha)', cls: 'bg-rose-50 text-rose-700' },
]

export function TvConfigPage() {
  const { user } = useAuth()
  const [saved, setSaved] = useState(null)
  const [cfg, setCfg] = useState(null)
  const [saving, setSaving] = useState(false)
  const [alerts, setAlerts] = useState([])
  const [rhAvisos, setRhAvisos] = useState([])
  const [screens, setScreens] = useState(null)
  const [aviso, setAviso] = useState({ title: '', body: '', level: 'info', ends_at: '' })
  const [editingAviso, setEditingAviso] = useState(null) // id do aviso sendo editado (22/10)
  const [coleta, setColeta] = useState({ at: '', title: '', body: '' })
  const [screenLabel, setScreenLabel] = useState('')
  const [created, setCreated] = useState(null)
  const [copied, setCopied] = useState(null)
  const [preview, setPreview] = useState(null) // módulo aberto na pré-visualização

  const loadAll = useCallback(async () => {
    const nowIso = new Date().toISOString()
    const [s, a, rh, sc] = await Promise.all([
      supabase.from('tv_settings').select('*').eq('id', 'default').maybeSingle(),
      supabase.from('tv_alerts').select('*').eq('active', true).order('created_at', { ascending: false }),
      supabase.from('announcements').select('id, title, priority, expires_at, show_on_tv, created_at').is('employee_id', null)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`).order('created_at', { ascending: false }).limit(15),
      supabase.from('tv_screens').select('id, label, created_at, created_by_name, last_seen_at, font_scale').is('revoked_at', null).order('created_at'),
    ])
    const err = [s, a, rh, sc].find(r => r.error)
    if (err) { toast.error('Erro ao carregar: ' + err.error.message); return }
    const row = s.data || { mode: 'consultorio', slide_seconds: 10, full_warn_days: 2, modules: [] }
    const c = {
      mode: row.mode, slide_seconds: row.slide_seconds, full_warn_days: row.full_warn_days, modules: normalizeModules(row.modules),
      // Turno da noite (20/10): lista própria + horário da troca
      modules_night: normalizeModules(row.modules_night?.length ? row.modules_night : row.modules),
      night_start: row.night_start || '19:00', night_end: row.night_end || '06:00',
    }
    setSaved(c); setCfg(c)
    setAlerts(a.data || []); setRhAvisos(rh.data || []); setScreens(sc.data || [])
  }, [])
  useEffect(() => { loadAll() }, [loadAll])

  const dirty = useMemo(() => saved && cfg && JSON.stringify(saved) !== JSON.stringify(cfg), [saved, cfg])

  async function save() {
    setSaving(true)
    const { error } = await supabase.from('tv_settings').upsert({ id: 'default', ...cfg, updated_at: new Date().toISOString(), updated_by: user?.id || null })
    setSaving(false)
    if (error) { toast.error('Erro ao salvar: ' + error.message); return }
    setSaved(cfg)
    toast.success('Salvo — a TV pega a mudança em até 1 minuto.')
  }
  // Qual lista está sendo editada: turno do dia (`modules`) ou da noite (`modules_night`)
  const [shift, setShift] = useState('dia')
  const listKey = shift === 'noite' ? 'modules_night' : 'modules'
  const setMod = (i, patch) => setCfg(c => ({ ...c, [listKey]: c[listKey].map((m, k) => k === i ? { ...m, ...patch } : m) }))
  const move = (i, dir) => setCfg(c => {
    const list = [...c[listKey]]; const j = i + dir
    if (j < 0 || j >= list.length) return c
    ;[list[i], list[j]] = [list[j], list[i]]
    return { ...c, [listKey]: list }
  })

  async function addAviso() {
    if (!aviso.title.trim()) { toast.error('Escreva o título do aviso.'); return }
    const fields = {
      level: aviso.level, title: aviso.title.trim(), body: aviso.body.trim() || null,
      ends_at: aviso.ends_at ? new Date(aviso.ends_at + 'T23:59:59').toISOString() : null,
    }
    const { error } = editingAviso
      ? await supabase.from('tv_alerts').update(fields).eq('id', editingAviso)
      : await supabase.from('tv_alerts').insert({ kind: 'aviso', ...fields, created_by: user?.id || null, created_by_name: user?.name || null })
    if (error) { toast.error('Erro: ' + error.message); return }
    toast.success(editingAviso ? 'Aviso atualizado — a TV pega em até 1 minuto.' : 'Aviso no ar.')
    cancelEditAviso()
    loadAll()
  }
  // Editar aviso já no ar (22/10): carrega no formulário de cima
  function editAviso(a) {
    setEditingAviso(a.id)
    setAviso({
      title: a.title || '', body: a.body || '', level: a.level || 'info',
      ends_at: a.ends_at ? new Date(a.ends_at).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) : '',
    })
  }
  function cancelEditAviso() {
    setEditingAviso(null)
    setAviso({ title: '', body: '', level: 'info', ends_at: '' })
  }
  async function addColeta() {
    if (!coleta.at) { toast.error('Informe data e hora da coleta.'); return }
    const { error } = await supabase.from('tv_alerts').insert({
      kind: 'coleta', level: 'critico', title: coleta.title.trim() || 'Coleta do Full', body: coleta.body.trim() || null,
      event_at: new Date(coleta.at).toISOString(), created_by: user?.id || null, created_by_name: user?.name || null,
    })
    if (error) { toast.error('Erro: ' + error.message); return }
    setColeta({ at: '', title: '', body: '' })
    toast.success('Coleta lançada.')
    loadAll()
  }
  async function removeAlert(a) {
    const { error } = await supabase.from('tv_alerts').update({ active: false }).eq('id', a.id)
    if (error) { toast.error('Erro: ' + error.message); return }
    loadAll()
  }
  async function toggleRh(a, on) {
    const { error } = await supabase.from('announcements').update({ show_on_tv: on }).eq('id', a.id)
    if (error) { toast.error('Erro: ' + error.message); return }
    setRhAvisos(list => list.map(x => x.id === a.id ? { ...x, show_on_tv: on } : x))
  }
  async function genScreen() {
    const label = screenLabel.trim()
    if (!label) { toast.error('Dê um nome pra TV (ex: TV da produção).'); return }
    const code = newCode()
    const { error } = await supabase.from('tv_screens').insert({ label, token_hash: await sha256Hex(code), created_by: user?.id || null, created_by_name: user?.name || null })
    if (error) { toast.error('Erro: ' + error.message); return }
    setCreated({ label, code }); setScreenLabel('')
    loadAll()
  }
  // Tamanho do texto por TV (20/10): TV pequena (32") pede letra maior
  async function setScale(s, v) {
    setScreens(list => list.map(x => x.id === s.id ? { ...x, font_scale: v } : x))
    const { error } = await supabase.from('tv_screens').update({ font_scale: v }).eq('id', s.id)
    if (error) toast.error(error.message); else toast.success(`Texto em ${v}% na "${s.label}" — muda em até 1 minuto`)
  }

  // Código novo pra uma TV que já existe (21/10): o código só é guardado como
  // hash, então não dá pra "mostrar de novo" — troca por outro e mantém o
  // nome e o tamanho do texto. O código antigo para de funcionar.
  async function reissue(s) {
    if (!confirm(`Gerar um código novo pra "${s.label}"? O código atual dessa TV para de funcionar — você vai precisar abrir o endereço novo nela.`)) return
    const code = newCode()
    const { error } = await supabase.from('tv_screens').update({ token_hash: await sha256Hex(code) }).eq('id', s.id)
    if (error) { toast.error('Erro: ' + error.message); return }
    setCreated({ label: s.label, code })
  }

  async function revoke(s) {
    if (!confirm(`Revogar o código de "${s.label}"? Essa TV para de mostrar os dados até receber um código novo.`)) return
    const { error } = await supabase.from('tv_screens').update({ revoked_at: new Date().toISOString() }).eq('id', s.id)
    if (error) { toast.error('Erro: ' + error.message); return }
    loadAll()
  }
  async function copy(text, key) {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 2000) } catch { toast.error('Copie manualmente.') }
  }

  if (!cfg) return <div className="flex justify-center py-24"><Loader2 className="animate-spin text-slate-400" /></div>
  const avisosTv = alerts.filter(a => a.kind === 'aviso')
  const coletasTv = alerts.filter(a => a.kind === 'coleta' && new Date(a.event_at) > new Date(Date.now() - 12 * 3600e3))
  const installUrl = created ? `${window.location.origin}${TV_PATH}?code=${created.code}` : ''
  const tvUrl = `${window.location.origin}${TV_PATH}`

  return (
    <div className="min-h-screen bg-slate-50 p-6 lg:p-8">
      <div className="max-w-[1200px] mx-auto space-y-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 bg-gradient-to-br from-slate-700 to-slate-900 rounded-2xl flex items-center justify-center shrink-0"><Tv size={21} className="text-white" /></div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight">TV da Produção</h1>
              <p className="text-sm text-slate-500">O que aparece na TV do andar de cima. Nunca mostra valores em R$.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href={TV_PATH} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-600">
              <ExternalLink size={13} /> Abrir a TV
            </a>
            <button onClick={save} disabled={!dirty || saving} className="btn-primary text-xs flex items-center gap-1.5 disabled:opacity-40">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Salvar
            </button>
          </div>
        </div>

        <div className="grid lg:grid-cols-[1fr_380px] gap-5 items-start">
          <div className="space-y-5">
            {/* Layout */}
            <Panel icon={LayoutPanelLeft} title="Layout" desc="Como a TV organiza as informações.">
              <div className="grid sm:grid-cols-2 gap-3 mb-4">
                {[
                  { v: 'consultorio', icon: LayoutPanelLeft, t: 'Consultório', d: 'Um destaque grande que vai trocando + mini módulos na lateral.' },
                  { v: 'slides', icon: GalleryHorizontal, t: 'Slides', d: 'Um módulo por vez, em tela cheia.' },
                ].map(o => (
                  <button key={o.v} onClick={() => setCfg(c => ({ ...c, mode: o.v }))}
                    className={`text-left rounded-xl border-2 p-3.5 transition-colors ${cfg.mode === o.v ? 'border-emerald-500 bg-emerald-50/50' : 'border-slate-200 hover:border-slate-300'}`}>
                    <p className="text-sm font-bold text-slate-800 flex items-center gap-2"><o.icon size={15} />{o.t}</p>
                    <p className="text-xs text-slate-500 mt-1">{o.d}</p>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-6">
                <label className="text-xs font-semibold text-slate-600">Trocar de destaque a cada
                  <select value={cfg.slide_seconds} onChange={e => setCfg(c => ({ ...c, slide_seconds: +e.target.value }))} className="block mt-1 text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white">
                    {[5, 8, 10, 15, 20, 30].map(s => <option key={s} value={s}>{s} segundos</option>)}
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-600">Avisar a coleta do Full com
                  <select value={cfg.full_warn_days} onChange={e => setCfg(c => ({ ...c, full_warn_days: +e.target.value }))} className="block mt-1 text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white">
                    {[1, 2, 3, 5, 7].map(s => <option key={s} value={s}>{s} dia{s > 1 ? 's' : ''} de antecedência</option>)}
                  </select>
                </label>
              </div>
            </Panel>

            {/* Módulos */}
            <Panel icon={Tv} title="O que exibir" desc="Liga/desliga cada módulo e define a ordem, separado por turno — a TV troca de lista sozinha no horário. Módulo sem nada pra mostrar no momento é pulado sozinho.">
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
                  {[['dia', Sun, `Turno do dia (${cfg.night_end}–${cfg.night_start})`], ['noite', Moon, `Turno da noite (${cfg.night_start}–${cfg.night_end})`]].map(([k, Icon, l]) => (
                    <button key={k} onClick={() => setShift(k)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${shift === k ? (k === 'noite' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-slate-800 shadow-sm') : 'text-slate-500 hover:text-slate-700'}`}>
                      <Icon size={13} />{l}
                      <span className="opacity-70">· {cfg[k === 'noite' ? 'modules_night' : 'modules'].filter(m => m.enabled).length} ligados</span>
                    </button>
                  ))}
                </div>
                <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">Noite das
                  <input type="time" value={cfg.night_start} onChange={e => setCfg(c => ({ ...c, night_start: e.target.value || '19:00' }))} className="text-sm border border-slate-200 rounded-lg px-2 py-1 bg-white" />
                  às
                  <input type="time" value={cfg.night_end} onChange={e => setCfg(c => ({ ...c, night_end: e.target.value || '06:00' }))} className="text-sm border border-slate-200 rounded-lg px-2 py-1 bg-white" />
                </label>
              </div>
              <ul className="flex flex-col gap-2">
                {cfg[listKey].map((m, i) => {
                  const def = moduleByKey[m.key]
                  return (
                    <li key={m.key} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${m.enabled ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50'}`}>
                      <div className="flex flex-col">
                        <button onClick={() => move(i, -1)} disabled={i === 0} className="text-slate-400 hover:text-slate-700 disabled:opacity-20"><ArrowUp size={13} /></button>
                        <button onClick={() => move(i, 1)} disabled={i === cfg[listKey].length - 1} className="text-slate-400 hover:text-slate-700 disabled:opacity-20"><ArrowDown size={13} /></button>
                      </div>
                      <def.icon size={18} className={m.enabled ? 'text-slate-600' : 'text-slate-300'} />
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-semibold ${m.enabled ? 'text-slate-800' : 'text-slate-400'}`}>{def.label}</p>
                        <p className="text-[11px] text-slate-400 leading-snug">{def.desc}</p>
                      </div>
                      <button onClick={() => setPreview(m.key)} title="Ver como fica na TV"
                        className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-50 shrink-0">
                        <Eye size={13} /><span className="hidden sm:inline">Ver</span>
                      </button>
                      <Switch on={m.enabled} onChange={v => setMod(i, { enabled: v })} />
                    </li>
                  )
                })}
              </ul>
            </Panel>
          </div>

          <div className="space-y-5">
            {/* Avisos */}
            <Panel icon={Megaphone} title="Avisos na TV" desc="Recado da diretoria pra equipe. Urgente vira faixa vermelha no topo.">
              <div className="flex flex-col gap-2">
                {editingAviso && <p className="text-[11px] font-bold text-sky-700 uppercase tracking-wide flex items-center gap-1.5"><Pencil size={11} />Editando aviso</p>}
                <input value={aviso.title} onChange={e => setAviso(a => ({ ...a, title: e.target.value }))} maxLength={90} placeholder="Título (ex: Coleta do Full toda terça às 14h)"
                  className="text-sm border border-slate-200 rounded-lg px-3 py-2" />
                <textarea value={aviso.body} onChange={e => setAviso(a => ({ ...a, body: e.target.value }))} rows={2} placeholder="Detalhe (opcional)" className="text-sm border border-slate-200 rounded-lg px-3 py-2 resize-y" />
                <div className="flex gap-2">
                  <select value={aviso.level} onChange={e => setAviso(a => ({ ...a, level: e.target.value }))} className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-2 bg-white">
                    {LEVELS.map(l => <option key={l.v} value={l.v}>{l.label}</option>)}
                  </select>
                  <input type="date" value={aviso.ends_at} onChange={e => setAviso(a => ({ ...a, ends_at: e.target.value }))} title="Sai do ar depois deste dia (opcional)" className="text-xs border border-slate-200 rounded-lg px-2 py-2" />
                </div>
                {editingAviso ? (
                  <div className="flex gap-2">
                    <button onClick={cancelEditAviso} className="flex-1 text-xs font-semibold rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 flex items-center justify-center gap-1.5"><X size={13} />Cancelar</button>
                    <button onClick={addAviso} className="flex-1 btn-primary text-xs flex items-center justify-center gap-1.5"><Check size={13} />Salvar alteração</button>
                  </div>
                ) : (
                  <button onClick={addAviso} className="btn-primary text-xs flex items-center justify-center gap-1.5"><Plus size={13} />Colocar na TV</button>
                )}
              </div>
              {avisosTv.length > 0 && (
                <ul className="flex flex-col gap-1.5 mt-3">
                  {avisosTv.map(a => (
                    <li key={a.id} className={`flex items-start gap-2 rounded-lg px-3 py-2 ${editingAviso === a.id ? 'bg-sky-50 ring-1 ring-sky-300' : 'bg-slate-50'}`}>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${LEVELS.find(l => l.v === a.level)?.cls}`}>{LEVELS.find(l => l.v === a.level)?.label.split(' ')[0]}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-slate-700">{a.title}</p>
                        {a.body && <p className="text-[11px] text-slate-500 line-clamp-2 whitespace-pre-line">{a.body}</p>}
                        <p className="text-[11px] text-slate-400">{editingAviso === a.id ? 'editando…' : a.ends_at ? `até ${fmtDT(a.ends_at)}` : 'sem data pra sair'}</p>
                      </div>
                      <button onClick={() => editAviso(a)} title="Editar" className="text-slate-300 hover:text-sky-600"><Pencil size={13} /></button>
                      <button onClick={() => { if (editingAviso === a.id) cancelEditAviso(); removeAlert(a) }} title="Tirar da TV" className="text-slate-300 hover:text-rose-500"><Trash2 size={13} /></button>
                    </li>
                  ))}
                </ul>
              )}
              {rhAvisos.length > 0 && (
                <div className="mt-4 pt-3 border-t border-slate-100">
                  <p className="text-[11px] font-bold text-slate-500 uppercase mb-2">Avisos do RH (pra todos)</p>
                  <ul className="flex flex-col gap-1.5">
                    {rhAvisos.map(a => (
                      <li key={a.id} className="flex items-center gap-2">
                        <p className="text-xs text-slate-600 flex-1 truncate">{a.title}</p>
                        <span className="text-[10px] text-slate-400">TV</span>
                        <Switch on={a.show_on_tv} onChange={v => toggleRh(a, v)} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Panel>

            {/* Coleta manual */}
            <Panel icon={Truck} title="Coleta do Full (manual)" desc="As coletas do ML aparecem sozinhas (via extensão). Use aqui se precisar garantir uma ou lançar outra coleta.">
              <div className="flex flex-col gap-2">
                <input type="datetime-local" value={coleta.at} onChange={e => setColeta(c => ({ ...c, at: e.target.value }))} className="text-sm border border-slate-200 rounded-lg px-3 py-2" />
                <input value={coleta.title} onChange={e => setColeta(c => ({ ...c, title: e.target.value }))} placeholder="Título (padrão: Coleta do Full)" className="text-sm border border-slate-200 rounded-lg px-3 py-2" />
                <input value={coleta.body} onChange={e => setColeta(c => ({ ...c, body: e.target.value }))} placeholder="Observação (ex: separar 3 caixas grandes)" className="text-sm border border-slate-200 rounded-lg px-3 py-2" />
                <button onClick={addColeta} className="btn-primary text-xs flex items-center justify-center gap-1.5"><Plus size={13} />Lançar coleta</button>
              </div>
              {coletasTv.length > 0 && (
                <ul className="flex flex-col gap-1.5 mt-3">
                  {coletasTv.map(a => (
                    <li key={a.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
                      <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-slate-700">{fmtDT(a.event_at)} · {a.title}</p>{a.body && <p className="text-[11px] text-slate-400 truncate">{a.body}</p>}</div>
                      <button onClick={() => removeAlert(a)} title="Remover" className="text-slate-300 hover:text-rose-500"><Trash2 size={13} /></button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            {/* TVs */}
            <Panel icon={KeyRound} title="TVs conectadas" desc="Cada TV usa um código próprio. Revogue se trocar de aparelho. Em Aa você escolhe o tamanho do texto de cada TV.">
              {screens === null ? <Loader2 size={14} className="animate-spin text-slate-400" /> : (
                <ul className="flex flex-col gap-1.5 mb-3">
                  {screens.length === 0 && <p className="text-xs text-slate-400">Nenhuma TV ainda.</p>}
                  {screens.map(s => (
                    <li key={s.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
                      <Monitor size={14} className="text-slate-400" />
                      <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-slate-700">{s.label}</p><p className="text-[11px] text-slate-400">{fmtAgo(s.last_seen_at)}</p></div>
                      <select value={s.font_scale || 100} onChange={e => setScale(s, Number(e.target.value))} title="Tamanho do texto nesta TV (muda em até 1 minuto)"
                        className="text-[11px] font-semibold text-slate-600 border border-slate-200 rounded-md px-1 py-0.5 bg-white">
                        {FONT_SCALES.map(v => <option key={v} value={v}>Aa {v}%</option>)}
                      </select>
                      <button onClick={() => reissue(s)} title="Gerar código novo pra esta TV (o atual para de funcionar)" className="text-slate-300 hover:text-sky-600"><RefreshCw size={13} /></button>
                      <button onClick={() => revoke(s)} title="Revogar" className="text-slate-300 hover:text-rose-500"><Trash2 size={13} /></button>
                    </li>
                  ))}
                </ul>
              )}
              {created ? (
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 flex flex-col gap-2">
                  <p className="text-xs text-slate-700">Código de <b>{created.label}</b> (não aparece de novo):</p>
                  <div className="flex gap-2">
                    <code className="flex-1 font-mono text-sm bg-white border border-emerald-300 rounded-lg px-2.5 py-1.5 select-all">{created.code}</code>
                    <button onClick={() => copy(created.code, 'code')} className="btn-primary text-xs px-2.5">{copied === 'code' ? <Check size={13} /> : <Copy size={13} />}</button>
                  </div>
                  <p className="text-[11px] text-slate-500">Ou abra direto este endereço no navegador da TV (já entra com o código):</p>
                  <div className="flex gap-2">
                    <code className="flex-1 text-[11px] bg-white border border-emerald-300 rounded-lg px-2.5 py-1.5 break-all select-all">{installUrl}</code>
                    <button onClick={() => copy(installUrl, 'url')} className="btn-primary text-xs px-2.5">{copied === 'url' ? <Check size={13} /> : <Copy size={13} />}</button>
                  </div>
                  <button onClick={() => setCreated(null)} className="text-xs text-emerald-700 font-semibold self-start">OK, guardei</button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input value={screenLabel} onChange={e => setScreenLabel(e.target.value)} onKeyDown={e => e.key === 'Enter' && genScreen()} maxLength={40} placeholder="Nome (ex: TV da produção)"
                    className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2" />
                  <button onClick={genScreen} className="btn-primary text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0"><KeyRound size={13} />Gerar código</button>
                </div>
              )}
              {/* Endereço fixo da TV (21/10, pedido do Raphael: "não lembro mais qual é") */}
              <div className="mt-3 rounded-xl bg-slate-50 border border-slate-200 p-3 flex flex-col gap-1.5">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Endereço da TV</p>
                <div className="flex gap-2">
                  <code className="flex-1 min-w-0 text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 truncate select-all">{tvUrl}</code>
                  <button onClick={() => copy(tvUrl, 'tv')} title="Copiar" className="px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-600">{copied === 'tv' ? <Check size={13} /> : <Copy size={13} />}</button>
                  <a href={TV_PATH} target="_blank" rel="noreferrer" title="Abrir" className="px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 flex items-center"><ExternalLink size={13} /></a>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">A TV já guarda o código dela; é só abrir esse endereço. O código não fica salvo no sistema (só uma "impressão digital", por segurança) — se uma TV pedir o código de novo, use <RefreshCw size={10} className="inline -mt-0.5" /> nela pra gerar outro.</p>
              </div>
              <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">Na TV: abra o endereço no navegador e dê <b>dois cliques</b> na tela pra entrar em tela cheia. Ela se atualiza sozinha a cada minuto.</p>
            </Panel>
          </div>
        </div>
      </div>
      {preview && <TvPreviewModal moduleKey={preview} onClose={() => setPreview(null)} />}
    </div>
  )
}

