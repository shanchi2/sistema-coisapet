import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import {
  Link2, Plus, Pencil, Trash2, X, Check, GripVertical,
  Eye, EyeOff, Search, ExternalLink, Save, Loader2,
  BarChart2, MousePointerClick, TrendingUp, Calendar,
} from 'lucide-react'
import toast from 'react-hot-toast'

const CATEGORIES = [
  { value: 'lojas',   label: '🛍️ Lojas'         },
  { value: 'contato', label: '💬 Contato'        },
  { value: 'redes',   label: '📱 Redes Sociais'  },
  { value: 'geral',   label: '🔗 Geral'          },
]

const EMPTY = {
  title: '', subtitle: '', url: '', icon_slug: '',
  icon_color: '#ffffff', category: 'geral', sort_order: 0, active: true,
}

// ── Preview do ícone Simple Icons ──────────────────────────────
function IconPreview({ slug, color, size = 20 }) {
  if (!slug) return (
    <div className="flex items-center justify-center w-full h-full text-slate-400">
      <Link2 size={size} strokeWidth={1.5} />
    </div>
  )
  return (
    <img
      src={`https://cdn.simpleicons.org/${slug}/${(color || 'ffffff').replace('#', '')}`}
      alt={slug}
      style={{ width: size, height: size, objectFit: 'contain' }}
      onError={e => { e.target.style.display = 'none' }}
    />
  )
}

// ── Modal de criar/editar ──────────────────────────────────────
function LinkModal({ initial, onSave, onClose, saving }) {
  const [form, setForm]         = useState(initial || EMPTY)
  const [iconSearch, setIconSearch] = useState(initial?.icon_slug || '')
  const [iconPreviewOk, setIconPreviewOk] = useState(!!initial?.icon_slug)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Quando o usuário digita no campo de ícone, testa se existe
  function handleIconChange(val) {
    const slug = val.toLowerCase().replace(/[^a-z0-9-]/g, '')
    setIconSearch(slug)
    set('icon_slug', slug)
    setIconPreviewOk(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <Link2 size={18} strokeWidth={1.5} className="text-slate-600" />
            <h3 className="font-semibold text-slate-800">
              {initial?.id ? 'Editar link' : 'Novo link'}
            </h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">

          {/* Preview do card */}
          <div
            className="flex items-center gap-3 p-3 rounded-xl border border-slate-200"
            style={{ background: form.icon_color ? form.icon_color + '10' : '#f8fafc' }}
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: form.icon_color ? form.icon_color + '20' : '#f1f5f9' }}
            >
              <IconPreview slug={form.icon_slug} color={form.icon_color} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-800 truncate">{form.title || 'Título do link'}</p>
              <p className="text-xs text-slate-400 truncate">{form.subtitle || 'Subtítulo'}</p>
            </div>
            <span className="text-slate-300 text-sm">→</span>
          </div>

          {/* Título */}
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">
              Título <span className="text-red-400">*</span>
            </label>
            <input
              autoFocus
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="Ex: Instagram"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400 transition-colors"
            />
          </div>

          {/* Subtítulo */}
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Subtítulo</label>
            <input
              value={form.subtitle}
              onChange={e => set('subtitle', e.target.value)}
              placeholder="Ex: @coisapet"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400 transition-colors"
            />
          </div>

          {/* URL */}
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">
              URL <span className="text-red-400">*</span>
            </label>
            <input
              value={form.url}
              onChange={e => set('url', e.target.value)}
              placeholder="https://..."
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400 transition-colors"
            />
          </div>

          {/* Ícone + Cor */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">
                Ícone
                <a
                  href="https://simpleicons.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-1.5 text-blue-400 hover:text-blue-600 font-normal normal-case"
                >
                  simpleicons.org ↗
                </a>
              </label>
              <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2">
                <div className="w-6 h-6 shrink-0">
                  {form.icon_slug && iconPreviewOk
                    ? <IconPreview slug={form.icon_slug} color={form.icon_color} size={18} />
                    : <Link2 size={16} className="text-slate-300" />
                  }
                </div>
                <input
                  value={iconSearch}
                  onChange={e => handleIconChange(e.target.value)}
                  placeholder="ex: instagram"
                  className="flex-1 text-sm bg-transparent border-0 outline-none placeholder:text-slate-300"
                />
              </div>
              {form.icon_slug && (
                <p className="text-[10px] text-slate-400 mt-1">
                  Prévia: cdn.simpleicons.org/<strong>{form.icon_slug}</strong>
                </p>
              )}
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Cor do ícone</label>
              <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2">
                <input
                  type="color"
                  value={form.icon_color || '#ffffff'}
                  onChange={e => set('icon_color', e.target.value)}
                  className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent p-0"
                />
                <span className="text-sm font-mono text-slate-600">
                  {(form.icon_color || '#ffffff').toUpperCase()}
                </span>
              </div>
            </div>
          </div>

          {/* Testador de ícone */}
          {form.icon_slug && (
            <div className="bg-slate-50 rounded-lg p-3 flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: (form.icon_color || '#ffffff') + '20' }}
              >
                <img
                  src={`https://cdn.simpleicons.org/${form.icon_slug}/${(form.icon_color || 'ffffff').replace('#', '')}`}
                  alt={form.icon_slug}
                  style={{ width: 22, height: 22 }}
                  onLoad={() => setIconPreviewOk(true)}
                  onError={() => setIconPreviewOk(false)}
                />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-600">
                  {iconPreviewOk ? '✅ Ícone encontrado!' : '❌ Ícone não encontrado — verifique o slug'}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Busque o nome exato em{' '}
                  <a href="https://simpleicons.org" target="_blank" className="text-blue-400 underline">simpleicons.org</a>
                </p>
              </div>
            </div>
          )}

          {/* Categoria + Ordem */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Categoria</label>
              <select
                value={form.category}
                onChange={e => set('category', e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
              >
                {CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Ordem</label>
              <input
                type="number"
                value={form.sort_order}
                onChange={e => set('sort_order', Number(e.target.value))}
                min={0}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
              />
            </div>
          </div>

          {/* Ativo */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => set('active', !form.active)}
              className={`w-11 h-6 rounded-full transition-colors relative ${form.active ? 'bg-emerald-500' : 'bg-slate-200'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.active ? 'translate-x-5' : ''}`} />
            </button>
            <span className="text-sm text-slate-600">
              {form.active ? 'Visível na página' : 'Oculto na página'}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={!form.title.trim() || !form.url.trim() || saving}
            className="flex-1 py-2.5 text-sm font-medium text-white bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {saving
              ? <Loader2 size={14} className="animate-spin" />
              : <Save size={14} />
            }
            {initial?.id ? 'Salvar' : 'Adicionar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────
export function BioLinksPage() {
  const [links,    setLinks]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [modal,    setModal]    = useState(false)
  const [editing,  setEditing]  = useState(null)
  const [saving,   setSaving]   = useState(false)
  const [delId,    setDelId]    = useState(null)
  const [tab,      setTab]      = useState('links')
  const [clicks,   setClicks]   = useState([])
  const [loadingC, setLoadingC] = useState(false)
  const [period,   setPeriod]   = useState(7)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('bio_links').select('*').order('sort_order')
    setLinks(data || [])
    setLoading(false)
  }

  async function loadClicks(p) {
    setLoadingC(true)
    const from = new Date()
    from.setDate(from.getDate() - (p || period))
    const { data } = await supabase
      .from('bio_link_clicks')
      .select('*')
      .gte('clicked_at', from.toISOString())
      .order('clicked_at', { ascending: false })
    setClicks(data || [])
    setLoadingC(false)
  }

  useEffect(() => { load() }, [])
  useEffect(() => { if (tab === 'analytics') loadClicks() }, [tab, period])

  async function handleSave(form) {
    setSaving(true)
    if (form.id) {
      const { id, created_at, ...payload } = form
      await supabase.from('bio_links').update(payload).eq('id', id)
    } else {
      await supabase.from('bio_links').insert(form)
    }
    setSaving(false)
    setModal(false)
    setEditing(null)
    toast.success(form.id ? 'Link atualizado!' : 'Link adicionado!')
    load()
  }

  async function toggleActive(link) {
    await supabase.from('bio_links').update({ active: !link.active }).eq('id', link.id)
    load()
  }

  async function handleDelete() {
    if (!delId) return
    await supabase.from('bio_links').delete().eq('id', delId)
    setDelId(null)
    toast.success('Link removido.')
    load()
  }

  // Agrupa por categoria
  const grouped = CATEGORIES.map(cat => ({
    ...cat,
    items: links.filter(l => l.category === cat.value),
  })).filter(g => g.items.length > 0)

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center shrink-0">
              <Link2 size={20} strokeWidth={1.5} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-800">Links da Bio</h1>
              <p className="text-sm text-slate-500">
                Gerencie os links de{' '}
                <a href="https://coisapet.com.br/links" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                  coisapet.com.br/links ↗
                </a>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href="https://coisapet.com.br/links" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-3 py-2 transition-colors">
              <ExternalLink size={14} strokeWidth={1.5} />
              Ver página
            </a>
            {tab === 'links' && (
              <button onClick={() => { setEditing(null); setModal(true) }}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors">
                <Plus size={16} strokeWidth={1.5} />
                Novo link
              </button>
            )}
          </div>
        </div>

        {/* Abas */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
          {[
            { key: 'links',     label: 'Links',     icon: Link2     },
            { key: 'analytics', label: 'Analytics', icon: BarChart2 },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              <t.icon size={14} strokeWidth={1.5} />
              {t.label}
            </button>
          ))}
        </div>

        {/* ── ABA LINKS ── */}
        {tab === 'links' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Total de links', value: links.length },
                { label: 'Visíveis',       value: links.filter(l => l.active).length,  color: 'text-emerald-600' },
                { label: 'Ocultos',        value: links.filter(l => !l.active).length, color: 'text-slate-400'   },
              ].map(s => (
                <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4 text-center">
                  <p className={`text-2xl font-bold ${s.color || 'text-slate-800'}`}>{s.value}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16 bg-white rounded-xl border border-slate-200">
                <Loader2 size={24} className="animate-spin text-slate-400" />
              </div>
            ) : links.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
                <Link2 size={36} strokeWidth={1} className="mx-auto mb-3 text-slate-200" />
                <p className="text-slate-500">Nenhum link cadastrado ainda</p>
              </div>
            ) : (
              <div className="space-y-4">
                {grouped.map(group => (
                  <div key={group.value}>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 px-1">{group.label}</p>
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-50">
                      {group.items.map(link => (
                        <div key={link.id} className={`flex items-center gap-3 px-4 py-3 transition-colors ${!link.active ? 'opacity-40' : ''}`}>
                          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                            style={{ background: (link.icon_color || '#94a3b8') + '20' }}>
                            {link.icon_slug
                              ? <img src={`https://cdn.simpleicons.org/${link.icon_slug}/${(link.icon_color || 'ffffff').replace('#', '')}`} alt={link.title} style={{ width: 20, height: 20 }}/>
                              : <Link2 size={16} className="text-slate-400" />
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-800">{link.title}</p>
                            <p className="text-xs text-slate-400 truncate">{link.subtitle || link.url}</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <a href={link.url} target="_blank" rel="noopener noreferrer"
                              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                              <ExternalLink size={13} strokeWidth={1.5} />
                            </a>
                            <button onClick={() => toggleActive(link)} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                              {link.active
                                ? <Eye size={13} strokeWidth={1.5} className="text-emerald-500" />
                                : <EyeOff size={13} strokeWidth={1.5} className="text-slate-400" />
                              }
                            </button>
                            <button onClick={() => { setEditing(link); setModal(true) }}
                              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                              <Pencil size={13} strokeWidth={1.5} />
                            </button>
                            <button onClick={() => setDelId(link.id)}
                              className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors">
                              <Trash2 size={13} strokeWidth={1.5} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── ABA ANALYTICS ── */}
        {tab === 'analytics' && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 flex-wrap">
              <Calendar size={14} className="text-slate-400" />
              <span className="text-sm text-slate-500">Período:</span>
              {[{label:'Hoje',value:1},{label:'7 dias',value:7},{label:'30 dias',value:30},{label:'90 dias',value:90}].map(p => (
                <button key={p.value} onClick={() => { setPeriod(p.value); loadClicks(p.value) }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${period === p.value ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-400'}`}>
                  {p.label}
                </button>
              ))}
            </div>

            {(() => {
              const total   = clicks.length
              const byLink  = clicks.reduce((acc, cl) => { acc[cl.link_title] = (acc[cl.link_title]||0)+1; return acc }, {})
              const topLink = Object.entries(byLink).sort((a,b)=>b[1]-a[1])[0]
              const today   = clicks.filter(cl => cl.clicked_at?.startsWith(new Date().toISOString().split('T')[0])).length
              return (
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Total de cliques',  value: total,               color: 'text-violet-600' },
                    { label: 'Cliques hoje',       value: today,               color: 'text-emerald-600' },
                    { label: 'Link mais clicado',  value: topLink?.[0] || '—', color: 'text-slate-800', small: true },
                  ].map(s => (
                    <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4 text-center">
                      <p className={`font-bold ${s.small ? 'text-sm' : 'text-2xl'} ${s.color}`}>{s.value}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>
              )
            })()}

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100">
                <TrendingUp size={15} strokeWidth={1.5} className="text-violet-500" />
                <h3 className="font-semibold text-slate-800 text-sm">Cliques por link</h3>
                <span className="ml-auto text-xs text-slate-400">{clicks.length} cliques no período</span>
              </div>
              {loadingC ? (
                <div className="flex items-center justify-center py-10"><Loader2 size={20} className="animate-spin text-slate-400"/></div>
              ) : clicks.length === 0 ? (
                <div className="text-center py-10">
                  <MousePointerClick size={28} strokeWidth={1} className="mx-auto mb-2 text-slate-200"/>
                  <p className="text-sm text-slate-400">Nenhum clique neste período</p>
                </div>
              ) : (() => {
                const byLink = clicks.reduce((acc, cl) => { acc[cl.link_title] = (acc[cl.link_title]||0)+1; return acc }, {})
                const sorted = Object.entries(byLink).sort((a,b) => b[1]-a[1])
                const max    = sorted[0]?.[1] || 1
                return (
                  <div className="divide-y divide-slate-50">
                    {sorted.map(([title, count], i) => {
                      const link = links.find(l => l.title === title)
                      return (
                        <div key={title} className="flex items-center gap-4 px-5 py-3.5">
                          <span className="text-xs font-bold text-slate-400 w-5 text-right">{i+1}</span>
                          {link?.icon_slug && (
                            <img src={`https://cdn.simpleicons.org/${link.icon_slug}/${(link.icon_color||'94a3b8').replace('#','')}`} alt={title} style={{width:18,height:18}}/>
                          )}
                          <span className="flex-1 text-sm font-medium text-slate-700">{title}</span>
                          <div className="flex items-center gap-3">
                            <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-violet-400 rounded-full" style={{width:`${(count/max)*100}%`}}/>
                            </div>
                            <span className="text-sm font-bold text-slate-800 w-8 text-right">{count}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100">
                <MousePointerClick size={15} strokeWidth={1.5} className="text-slate-500"/>
                <h3 className="font-semibold text-slate-800 text-sm">Cliques recentes</h3>
              </div>
              <div className="divide-y divide-slate-50 max-h-64 overflow-y-auto">
                {clicks.slice(0,50).map(click => (
                  <div key={click.id} className="flex items-center justify-between px-5 py-2.5">
                    <span className="text-sm text-slate-700">{click.link_title}</span>
                    <span className="text-xs text-slate-400">
                      {new Date(click.clicked_at).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Modal criar/editar */}
        {modal && (
          <LinkModal initial={editing} onSave={handleSave}
            onClose={() => { setModal(false); setEditing(null) }} saving={saving}/>
        )}

        {/* Confirmar exclusão */}
        {delId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 bg-red-100 rounded-xl flex items-center justify-center shrink-0">
                  <Trash2 size={16} strokeWidth={1.5} className="text-red-500" />
                </div>
                <div>
                  <p className="font-semibold text-slate-800">Remover link?</p>
                  <p className="text-sm text-slate-500 mt-0.5">Esta ação não pode ser desfeita.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setDelId(null)}
                  className="flex-1 py-2.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
                  Cancelar
                </button>
                <button onClick={handleDelete}
                  className="flex-1 py-2.5 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors">
                  Remover
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
