import { useState, useEffect, useMemo } from 'react'
import { Shield, Check, X, Loader2, Lock, RefreshCw, AlertTriangle, Search, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'

// ── Módulos do sistema ────────────────────────────────────────
const MODULES = [
  { key: 'dashboard',    label: 'Dashboard',       section: 'Principal',     icon: '🏠' },
  { key: 'kanban',       label: 'Kanban',          section: 'Principal',     icon: '📋' },
  { key: 'kanban-op',    label: 'Kanban Operacional', section: 'Principal',  icon: '🗂️' },
  { key: 'pedidos',      label: 'Pedidos',         section: 'Principal',     icon: '🛒' },
  { key: 'orcamentos',   label: 'Orçamentos',      section: 'Principal',     icon: '🧾' },
  { key: 'reunioes',     label: 'Reuniões',        section: 'Principal',     icon: '🗓️' },
  { key: 'ml-insights',  label: 'Otimização ML',   section: 'Otimização ML', icon: '🩺' },
  { key: 'ml-historico', label: 'Histórico de Atualizações (ML)', section: 'Otimização ML', icon: '📜' },
  { key: 'shopee-insights', label: 'Shopee',        section: 'Shopee',        icon: '🛍️' },
  { key: 'blog',         label: 'Blog',            section: 'Blog',          icon: '📝' },
  { key: 'producao',     label: 'Produção',        section: 'Produção',      icon: '🏭' },
  { key: 'manutencao',   label: 'Manutenção',      section: 'Produção',      icon: '🔧' },
  { key: 'baixa-diaria', label: 'Baixa Diária',    section: 'Produção',      icon: '📦' },
  { key: 'manuais',      label: 'Manuais',         section: 'Produção',      icon: '📖' },
  { key: 'qrcode',       label: 'QR Code',         section: 'Produção',      icon: '📱' },
  { key: 'checklist',    label: 'Checklist Diário',section: 'Produção',      icon: '✅' },
  { key: 'producao-horistas', label: 'Lançamento de Produção (Horistas)', section: 'Produção', icon: '⏱️' },
  { key: 'compra-lousa', label: 'Compra da Lousa', section: 'Produção', icon: '🛍️' },
  { key: 'pedidos-materia-prima', label: 'Pedidos de Matéria-Prima', section: 'Gestão', icon: '🪵' },
  { key: 'conferencia-materia-prima', label: 'Conferência de Matéria-Prima', section: 'Produção', icon: '📋' },
  { key: 'controle-midia', label: 'Atualização de Mídia', section: 'Produção', icon: '🎬' },
  { key: 'produtos',     label: 'Produtos',        section: 'Catálogo',      icon: '🐾' },
  { key: 'materiais',    label: 'Matéria-Prima',   section: 'Catálogo',      icon: '🪵' },
  { key: 'packaging',    label: 'Embalagem',       section: 'Catálogo',      icon: '📦' },
  { key: 'fornecedores', label: 'Fornecedores',    section: 'Catálogo',      icon: '🚚' },
  { key: 'rh',           label: 'RH',              section: 'Gestão',        icon: '👥' },
  { key: 'financeiro',   label: 'Financeiro',      section: 'Gestão',        icon: '💰' },
  { key: 'relatorios',   label: 'Relatórios',      section: 'Gestão',        icon: '📊' },
  { key: 'timesheet',    label: 'Timesheet',       section: 'Gestão',        icon: '⏱️' },
  { key: 'drive',        label: 'Drive',           section: 'Gestão',        icon: '🗄️' },
  { key: 'coisadecor',   label: 'CoisaDecor',      section: 'Gestão',        icon: '🎨' },
  { key: 'bio-links',    label: 'Bio Links',       section: 'Gestão',        icon: '🔗' },
  { key: 'cotacoes',     label: 'Cotações',        section: 'Gestão',        icon: '📝' },
  { key: 'avaliacoes',   label: 'Avaliações',      section: 'Gestão',        icon: '⭐' },
  { key: 'usuarios',     label: 'Usuários',        section: 'Admin',         icon: '🔑', adminOnly: true },
  { key: 'acesso',       label: 'Controle de Acesso', section: 'Admin',     icon: '🛡️', adminOnly: true },
  { key: 'auditoria',    label: 'Auditoria',       section: 'Admin',         icon: '🔍', adminOnly: true },
  { key: 'historico',    label: 'Histórico',       section: 'Admin',         icon: '📜', adminOnly: true },
  { key: 'financeiro-dir', label: 'Financeiro Diretoria', section: 'Admin', icon: '🏦', adminOnly: true },
  { key: 'directors',    label: 'Fin./Compras Diretoria', section: 'Admin', icon: '👔', adminOnly: true },
  { key: 'cofre',        label: 'Cofre de Senhas', section: 'Admin',         icon: '🔐', adminOnly: true },
  { key: 'grupos-chat',  label: 'Grupos de Chat',  section: 'Admin',         icon: '💬', adminOnly: true },
  { key: 'mensagens',    label: 'Mensagens e Avisos', section: 'Admin',     icon: '💬', adminOnly: true },
]

// Perfis gerenciados aqui (admin/Diretoria vê tudo sempre; horista,
// equipe e escritório usam outros apps/listas fixas, não passam por aqui).
const ROLES = [
  { key: 'administrativo', label: 'Gerente',     emoji: '👔', text: 'text-violet-700',  soft: 'bg-violet-50',  ring: 'ring-violet-300',  bar: 'bg-violet-500',  on: 'bg-violet-500' },
  { key: 'atendimento',    label: 'Atendimento', emoji: '🎧', text: 'text-sky-700',     soft: 'bg-sky-50',     ring: 'ring-sky-300',     bar: 'bg-sky-500',     on: 'bg-sky-500' },
  { key: 'producao',       label: 'Produção',    emoji: '⚙️', text: 'text-amber-700',   soft: 'bg-amber-50',   ring: 'ring-amber-300',   bar: 'bg-amber-500',   on: 'bg-amber-500' },
  { key: 'marketplace',    label: 'Marketplace', emoji: '🛍️', text: 'text-emerald-700', soft: 'bg-emerald-50', ring: 'ring-emerald-300', bar: 'bg-emerald-500', on: 'bg-emerald-500' },
]

const EDITABLE = MODULES.filter(m => !m.adminOnly)
const ADMIN_ONLY = MODULES.filter(m => m.adminOnly)
const SECTIONS = [...new Set(EDITABLE.map(m => m.section))]

// Normaliza acento/caixa pra busca ("producao" acha "Produção")
function norm(s) { return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() }

// ── Switch compacto, na cor do perfil ──────────────────────────────────
function Switch({ on, busy, color, onClick, title }) {
  return (
    <button type="button" onClick={onClick} disabled={busy} title={title}
      className={`relative w-10 h-[22px] rounded-full transition-colors duration-200 shrink-0 ${on ? color : 'bg-slate-200 hover:bg-slate-300'} disabled:opacity-60`}>
      <span className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-200 flex items-center justify-center ${on ? 'left-[21px]' : 'left-[3px]'}`}>
        {busy ? <Loader2 size={9} className="animate-spin text-slate-400" /> : on ? <Check size={9} strokeWidth={3} className="text-slate-600" /> : null}
      </span>
    </button>
  )
}

// ── Painel lateral de um perfil (padrão Shopee Retornos) ───────────────
function RolePanel({ role, perms, users, onToggle, onBulk, saving, onClose }) {
  const enabled = EDITABLE.filter(m => perms[`${m.key}:${role.key}`] === true)
  const disabled = EDITABLE.filter(m => perms[`${m.key}:${role.key}`] !== true)
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-xl h-full bg-slate-50 overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-5 py-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className={`w-11 h-11 rounded-xl flex items-center justify-center text-2xl ${role.soft}`}>{role.emoji}</span>
            <div>
              <p className={`text-lg font-black ${role.text}`}>{role.label}</p>
              <p className="text-xs text-slate-400">{enabled.length} de {EDITABLE.length} módulos liberados · {users.length} usuário(s)</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <p className="text-sm font-bold text-slate-700 flex items-center gap-1.5 mb-2"><Users size={15} className="text-slate-400" /> Quem tem esse perfil</p>
            {users.length ? (
              <div className="flex flex-wrap gap-1.5">
                {users.map(u => <span key={u.id} className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">{u.name}</span>)}
              </div>
            ) : <p className="text-sm text-slate-400">Nenhum usuário ativo com esse perfil.</p>}
          </div>

          {SECTIONS.map(sec => {
            const mods = EDITABLE.filter(m => m.section === sec)
            const on = mods.filter(m => perms[`${m.key}:${role.key}`] === true).length
            return (
              <div key={sec} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50/70 border-b border-slate-100">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">{sec} <span className="font-semibold text-slate-400 normal-case">· {on}/{mods.length}</span></p>
                  <div className="flex gap-2 text-[11px] font-semibold">
                    <button onClick={() => onBulk(sec, role, true)} className="text-emerald-600 hover:text-emerald-700 disabled:opacity-40" disabled={on === mods.length}>Liberar tudo</button>
                    <button onClick={() => onBulk(sec, role, false)} className="text-slate-400 hover:text-rose-600 disabled:opacity-40" disabled={on === 0}>Bloquear tudo</button>
                  </div>
                </div>
                {mods.map(m => {
                  const k = `${m.key}:${role.key}`
                  return (
                    <div key={m.key} className="flex items-center gap-3 px-4 py-2 border-b border-slate-50 last:border-0">
                      <span className="text-base w-6 text-center">{m.icon}</span>
                      <span className="text-sm text-slate-700 flex-1">{m.label}</span>
                      <Switch on={perms[k] === true} busy={saving[k]} color={role.on} onClick={() => onToggle(m.key, role.key)} />
                    </div>
                  )
                })}
              </div>
            )
          })}
          {disabled.length === 0 && <p className="text-xs text-center text-slate-400">Esse perfil tem acesso a todos os módulos editáveis.</p>}
        </div>
      </div>
    </div>
  )
}

// ── Página ──────────────────────────────────────────────────────────────
export function AccessControlPage() {
  const { user } = useAuth()
  const [perms, setPerms]     = useState({}) // { 'module:role': boolean } — AUSENTE = bloqueado (igual ao canAccess)
  const [users, setUsers]     = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState({})
  const [section, setSection] = useState('Todos')
  const [q, setQ]             = useState('')
  const [panelRole, setPanelRole] = useState(null)
  const [focusRole, setFocusRole] = useState(null) // destaca uma coluna

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: p }, { data: u }] = await Promise.all([
      supabase.from('role_permissions').select('module,role,enabled'),
      supabase.from('system_users').select('id, name, role').eq('active', true).order('name'),
    ])
    const map = {}
    ;(p || []).forEach(r => { map[`${r.module}:${r.role}`] = r.enabled })
    setPerms(map)
    setUsers(u || [])
    setLoading(false)
  }

  // Ausente no banco = BLOQUEADO (é o que o canAccess faz de verdade). A
  // versão antiga mostrava ausente como ligado — tela dizia que o perfil
  // tinha acesso que ele não tinha (21 casos em 30/09).
  async function setPerm(moduleKey, roleKey, next, { quiet = false } = {}) {
    const k = `${moduleKey}:${roleKey}`
    const current = perms[k] === true
    setSaving(s => ({ ...s, [k]: true }))
    setPerms(p => ({ ...p, [k]: next }))
    const { error } = await supabase.rpc('admin_set_permission', { p_module: moduleKey, p_role: roleKey, p_enabled: next, p_user_id: user.id })
    if (error) {
      setPerms(p => ({ ...p, [k]: current }))
      toast.error('Erro ao salvar permissão')
    } else if (!quiet) {
      const mod = MODULES.find(m => m.key === moduleKey)?.label
      const role = ROLES.find(r => r.key === roleKey)?.label
      toast.success(`${role}: ${mod} ${next ? 'liberado' : 'bloqueado'}`)
    }
    setSaving(s => ({ ...s, [k]: false }))
    return !error
  }
  function toggle(moduleKey, roleKey) {
    return setPerm(moduleKey, roleKey, perms[`${moduleKey}:${roleKey}`] !== true)
  }
  async function bulk(sec, role, next) {
    const mods = EDITABLE.filter(m => m.section === sec && (perms[`${m.key}:${role.key}`] === true) !== next)
    if (!mods.length) return
    if (!window.confirm(`${next ? 'Liberar' : 'Bloquear'} ${mods.length} módulo(s) de "${sec}" para ${role.label}?`)) return
    const results = await Promise.all(mods.map(m => setPerm(m.key, role.key, next, { quiet: true })))
    const ok = results.filter(Boolean).length
    toast.success(`${role.label}: ${ok} módulo(s) de ${sec} ${next ? 'liberados' : 'bloqueados'}`)
  }

  const counts = useMemo(() => Object.fromEntries(ROLES.map(r => [r.key, EDITABLE.filter(m => perms[`${m.key}:${r.key}`] === true).length])), [perms])
  const usersByRole = useMemo(() => Object.fromEntries(ROLES.map(r => [r.key, users.filter(u => u.role === r.key)])), [users])
  const directors = users.filter(u => u.role === 'admin')

  const visible = useMemo(() => {
    const s = norm(q.trim())
    return EDITABLE.filter(m => (section === 'Todos' || m.section === section) && (!s || norm(`${m.label} ${m.section} ${m.key}`).includes(s)))
  }, [section, q])
  const visibleSections = SECTIONS.filter(sec => visible.some(m => m.section === sec))

  // Checagem depois de todos os hooks (regra do React: hooks sempre na mesma ordem)
  if (user?.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-16 h-16 rounded-full bg-rose-500/10 flex items-center justify-center"><Lock size={28} className="text-rose-400" /></div>
        <h2 className="text-xl font-bold text-slate-700">Acesso restrito</h2>
        <p className="text-sm text-slate-400">Apenas diretores podem gerenciar permissões.</p>
      </div>
    )
  }

  const cols = 'grid grid-cols-[minmax(0,1fr)_repeat(4,92px)] md:grid-cols-[minmax(0,1fr)_repeat(4,120px)]'

  return (
    <div className="min-h-screen bg-slate-50 p-6 lg:p-8">
      <div className="max-w-[1400px] mx-auto space-y-5">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-sm bg-gradient-to-br from-violet-500 to-violet-700">
              <Shield size={20} strokeWidth={1.5} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Controle de Acesso</h1>
              <p className="text-sm text-slate-500">Quais módulos cada perfil enxerga — a Diretoria vê tudo sempre</p>
            </div>
          </div>
          <button onClick={loadAll} className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-violet-600">
            {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Atualizar
          </button>
        </div>

        {/* Perfis — clicáveis (abre o painel do perfil) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {ROLES.map(r => {
            const pct = Math.round((counts[r.key] / EDITABLE.length) * 100)
            return (
              <button key={r.key} type="button" onClick={() => setPanelRole(r)}
                onMouseEnter={() => setFocusRole(r.key)} onMouseLeave={() => setFocusRole(null)}
                className="text-left bg-white border border-slate-200 rounded-2xl p-4 hover:border-slate-300 hover:shadow-sm transition">
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs font-bold uppercase tracking-wide ${r.text}`}>{r.label}</span>
                  <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg ${r.soft}`}>{r.emoji}</span>
                </div>
                <p className="text-2xl font-black text-slate-800">{counts[r.key]}<span className="text-sm font-semibold text-slate-400"> / {EDITABLE.length}</span></p>
                <div className="h-1.5 rounded-full bg-slate-100 mt-2 overflow-hidden"><div className={`h-full rounded-full ${r.bar}`} style={{ width: `${pct}%` }} /></div>
                <p className="text-[11px] text-slate-400 mt-1.5 truncate">
                  {usersByRole[r.key]?.length ? usersByRole[r.key].map(u => u.name.split(' ')[0]).join(', ') : 'nenhum usuário'} · ver perfil →
                </p>
              </button>
            )
          })}
        </div>

        <div className="flex items-start gap-2 text-xs text-slate-500 bg-white border border-slate-200 rounded-xl px-3 py-2">
          <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />
          <span>Muda na hora — quem está logado precisa recarregar a página. <b>Diretoria</b>{directors.length ? ` (${directors.map(u => u.name.split(' ')[0]).join(', ')})` : ''} sempre vê tudo, inclusive os módulos exclusivos lá embaixo.</span>
        </div>

        {/* Filtros */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            {['Todos', ...SECTIONS].map(s => (
              <button key={s} onClick={() => setSection(s)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${section === s ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}>{s}</button>
            ))}
          </div>
          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar módulo..." className="input pl-9 py-2 text-sm" />
          </div>
        </div>

        {/* Matriz — colunas alinhadas, cabeçalho fixo */}
        {loading ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-200"><Loader2 size={26} className="mx-auto animate-spin text-slate-300" /></div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className={`${cols} items-center sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-slate-200 px-4 py-2.5`}>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Módulo</span>
              {ROLES.map(r => (
                <button key={r.key} onClick={() => setPanelRole(r)}
                  className={`text-[11px] font-bold uppercase tracking-wide text-center rounded-lg py-1 ${r.text} ${focusRole === r.key ? r.soft : ''}`}>
                  {r.label}
                </button>
              ))}
            </div>

            {visibleSections.map(sec => {
              const mods = visible.filter(m => m.section === sec)
              return (
                <div key={sec}>
                  <div className={`${cols} items-center px-4 py-1.5 bg-slate-50 border-b border-slate-100`}>
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">{sec}</span>
                    {ROLES.map(r => {
                      const all = EDITABLE.filter(m => m.section === sec)
                      const on = all.filter(m => perms[`${m.key}:${r.key}`] === true).length
                      return <span key={r.key} className="text-[10px] font-semibold text-slate-400 text-center tabular-nums">{on}/{all.length}</span>
                    })}
                  </div>
                  {mods.map(m => (
                    <div key={m.key} className={`${cols} items-center px-4 py-2 border-b border-slate-50 hover:bg-slate-50/70 transition-colors`}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-base w-6 text-center shrink-0">{m.icon}</span>
                        <span className="text-sm text-slate-700 truncate">{m.label}</span>
                      </div>
                      {ROLES.map(r => {
                        const k = `${m.key}:${r.key}`
                        return (
                          <div key={r.key} className={`flex justify-center rounded-lg py-1 ${focusRole === r.key ? r.soft : ''}`}>
                            <Switch on={perms[k] === true} busy={saving[k]} color={r.on} onClick={() => toggle(m.key, r.key)}
                              title={`${r.label} · ${m.label}: ${perms[k] === true ? 'liberado' : 'bloqueado'}`} />
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              )
            })}
            {!visible.length && <p className="text-sm text-slate-400 text-center py-10">Nenhum módulo encontrado.</p>}
          </div>
        )}

        {/* Exclusivos da Diretoria — só informativo */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <p className="text-sm font-bold text-slate-700 flex items-center gap-1.5 mb-2.5"><Lock size={14} className="text-violet-500" /> Exclusivos da Diretoria <span className="text-xs font-normal text-slate-400">— não dá pra liberar pra outros perfis</span></p>
          <div className="flex flex-wrap gap-1.5">
            {ADMIN_ONLY.map(m => <span key={m.key} className="text-xs font-semibold px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-100">{m.icon} {m.label}</span>)}
          </div>
        </div>
      </div>

      {panelRole && (
        <RolePanel role={panelRole} perms={perms} users={usersByRole[panelRole.key] || []}
          onToggle={toggle} onBulk={bulk} saving={saving} onClose={() => setPanelRole(null)} />
      )}
    </div>
  )
}
