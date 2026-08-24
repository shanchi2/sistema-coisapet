import { useState, useEffect } from 'react'
import { Shield, Check, X, Loader2, Lock, RefreshCw, AlertTriangle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'

// ── Módulos do sistema ────────────────────────────────────────
const MODULES = [
  { key: 'dashboard',    label: 'Dashboard',       section: 'Principal',     icon: '🏠' },
  { key: 'kanban',       label: 'Kanban',          section: 'Principal',     icon: '📋' },
  { key: 'pedidos',      label: 'Pedidos',         section: 'Principal',     icon: '🛒' },
  { key: 'reunioes',     label: 'Reuniões',        section: 'Principal',     icon: '🗓️' },
  { key: 'producao',     label: 'Produção',        section: 'Produção',      icon: '🏭' },
  { key: 'manutencao',   label: 'Manutenção',      section: 'Produção',      icon: '🔧' },
  { key: 'baixa-diaria', label: 'Baixa Diária',    section: 'Produção',      icon: '📦' },
  { key: 'manuais',      label: 'Manuais',         section: 'Produção',      icon: '📖' },
  { key: 'produtos',     label: 'Produtos',        section: 'Catálogo',      icon: '🐾' },
  { key: 'materiais',    label: 'Matéria-Prima',   section: 'Catálogo',      icon: '🪵' },
  { key: 'fornecedores', label: 'Fornecedores',    section: 'Catálogo',      icon: '🚚' },
  { key: 'rh',           label: 'RH',              section: 'Gestão',        icon: '👥' },
  { key: 'financeiro',   label: 'Financeiro',      section: 'Gestão',        icon: '💰' },
  { key: 'relatorios',   label: 'Relatórios',      section: 'Gestão',        icon: '📊' },
  { key: 'timesheet',    label: 'Timesheet',       section: 'Gestão',        icon: '⏱️' },
  { key: 'usuarios',     label: 'Usuários',        section: 'Admin',         icon: '🔑', adminOnly: true },
  { key: 'acesso',       label: 'Controle de Acesso', section: 'Admin',     icon: '🛡️', adminOnly: true },
  { key: 'auditoria',    label: 'Auditoria',       section: 'Admin',         icon: '🔍', adminOnly: true },
  { key: 'historico',    label: 'Histórico',       section: 'Admin',         icon: '📜', adminOnly: true },
]

const ROLES = [
  { key: 'administrativo', label: 'Gerente',  color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/20' },
  { key: 'producao',       label: 'Produção', color: 'text-amber-400',  bg: 'bg-amber-500/10 border-amber-500/20'   },
]

const SECTIONS = [...new Set(MODULES.map(m => m.section))]

// ── Toggle individual ────────────────────────────────────────
function PermToggle({ enabled, loading, locked, onChange }) {
  if (locked) {
    return (
      <div className="flex items-center justify-center w-12 h-7">
        <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
          <Lock size={9} className="text-emerald-400"/>
          <span className="text-[9px] font-bold text-emerald-400">fixo</span>
        </div>
      </div>
    )
  }

  return (
    <button
      onClick={onChange}
      disabled={loading}
      className={`relative w-12 h-6 rounded-full transition-all duration-300 border
        ${enabled
          ? 'bg-emerald-500/20 border-emerald-500/40'
          : 'bg-slate-700/50 border-slate-600/40'
        } disabled:opacity-50`}
    >
      {loading ? (
        <Loader2 size={10} className="absolute inset-0 m-auto animate-spin text-slate-400"/>
      ) : (
        <div className={`absolute top-0.5 w-5 h-5 rounded-full transition-all duration-300 flex items-center justify-center
          ${enabled
            ? 'left-6 bg-emerald-400 shadow-lg shadow-emerald-500/30'
            : 'left-0.5 bg-slate-500'
          }`}>
          {enabled
            ? <Check size={10} className="text-slate-900"/>
            : <X size={10} className="text-slate-400"/>
          }
        </div>
      )}
    </button>
  )
}

// ── Página principal ─────────────────────────────────────────
export function AccessControlPage() {
  const { user } = useAuth()
  const [perms,    setPerms]    = useState({}) // { 'module:role': boolean }
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState({}) // { 'module:role': boolean }
  const [activeSection, setActiveSection] = useState('Todos')

  // Só admin pode acessar
  if (user?.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-16 h-16 rounded-full bg-rose-500/10 flex items-center justify-center">
          <Lock size={28} className="text-rose-400"/>
        </div>
        <h2 className="text-xl font-bold text-slate-700">Acesso restrito</h2>
        <p className="text-sm text-slate-400">Apenas diretores podem gerenciar permissões.</p>
      </div>
    )
  }

  useEffect(() => { loadPerms() }, [])

  async function loadPerms() {
    setLoading(true)
    const { data } = await supabase.from('role_permissions').select('module,role,enabled')
    const map = {}
    ;(data || []).forEach(r => { map[`${r.module}:${r.role}`] = r.enabled })
    setPerms(map)
    setLoading(false)
  }

  async function togglePerm(moduleKey, roleKey) {
    const k       = `${moduleKey}:${roleKey}`
    const current = perms[k] ?? false
    const next    = !current

    setSaving(s => ({ ...s, [k]: true }))
    setPerms(p => ({ ...p, [k]: next })) // optimistic update

    const { error } = await supabase.rpc('admin_set_permission', {
      p_module:  moduleKey,
      p_role:    roleKey,
      p_enabled: next,
      p_user_id: user.id,
    })

    if (error) {
      toast.error('Erro ao salvar permissão')
      setPerms(p => ({ ...p, [k]: current })) // reverte
    } else {
      toast.success(`${next ? '✅' : '🚫'} ${roleKey} → ${moduleKey}`)
    }
    setSaving(s => ({ ...s, [k]: false }))
  }

  const visibleModules = MODULES.filter(m =>
    activeSection === 'Todos' || m.section === activeSection
  )

  // Conta módulos habilitados por role
  const counts = ROLES.reduce((acc, r) => {
    acc[r.key] = MODULES.filter(m => !m.adminOnly && perms[`${m.key}:${r.key}`] !== false).length
    return acc
  }, {})

  return (
    <div className="p-6 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
              <Shield size={20} className="text-violet-400"/>
            </div>
            <h1 className="text-2xl font-black text-slate-800">Controle de Acesso</h1>
          </div>
          <p className="text-sm text-slate-400 ml-13">
            Gerencie quais módulos cada perfil pode acessar. Módulos Admin são fixos.
          </p>
        </div>
        <button
          onClick={loadPerms}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
        >
          <RefreshCw size={14}/> Atualizar
        </button>
      </div>

      {/* Cards de resumo por perfil */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        {ROLES.map(r => (
          <div key={r.key} className={`p-4 rounded-2xl border ${r.bg} flex items-center justify-between`}>
            <div>
              <div className={`text-xs font-bold uppercase tracking-wider mb-1 ${r.color}`}>{r.label}</div>
              <div className="text-2xl font-black text-slate-800">{counts[r.key]}</div>
              <div className="text-xs text-slate-400">módulos habilitados</div>
            </div>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${r.bg}`}>
              {r.key === 'administrativo' ? '👔' : '⚙️'}
            </div>
          </div>
        ))}
      </div>

      {/* Aviso */}
      <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl mb-6">
        <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5"/>
        <p className="text-sm text-amber-700">
          Alterações têm efeito imediato. Usuários logados precisam recarregar a página para ver as mudanças.
          Módulos marcados como <strong>fixo</strong> são exclusivos do Diretor e não podem ser alterados.
        </p>
      </div>

      {/* Filtro por seção */}
      <div className="flex items-center gap-2 flex-wrap mb-6">
        {['Todos', ...SECTIONS].map(s => (
          <button
            key={s}
            onClick={() => setActiveSection(s)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all
              ${activeSection === s
                ? 'bg-violet-600 text-white'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={28} className="animate-spin text-violet-400"/>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          {/* Cabeçalho */}
          <div className="grid grid-cols-[1fr_120px_120px] gap-0 border-b border-slate-100">
            <div className="px-5 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Módulo</div>
            {ROLES.map(r => (
              <div key={r.key} className={`px-4 py-3 text-center text-xs font-bold uppercase tracking-wider ${r.color}`}>
                {r.label}
              </div>
            ))}
          </div>

          {/* Linhas por seção */}
          {SECTIONS.filter(s => activeSection === 'Todos' || activeSection === s).map(section => {
            const sectionModules = visibleModules.filter(m => m.section === section)
            if (!sectionModules.length) return null
            return (
              <div key={section}>
                {/* Label da seção */}
                <div className="px-5 py-2 bg-slate-50 border-b border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{section}</span>
                </div>
                {sectionModules.map((mod, idx) => (
                  <div
                    key={mod.key}
                    className={`grid grid-cols-[1fr_120px_120px] items-center gap-0
                      ${idx < sectionModules.length - 1 ? 'border-b border-slate-50' : ''}
                      hover:bg-slate-50/50 transition-colors`}
                  >
                    {/* Nome do módulo */}
                    <div className="px-5 py-3.5 flex items-center gap-3">
                      <span className="text-lg">{mod.icon}</span>
                      <div>
                        <div className="text-sm font-semibold text-slate-700">{mod.label}</div>
                        {mod.adminOnly && (
                          <div className="text-[10px] text-rose-400 font-semibold">Somente Diretor</div>
                        )}
                      </div>
                    </div>

                    {/* Toggle por role */}
                    {ROLES.map(r => {
                      const k       = `${mod.key}:${r.key}`
                      const enabled = perms[k] !== false // default true se não existir
                      const isLoading = !!saving[k]
                      return (
                        <div key={r.key} className="px-4 py-3.5 flex items-center justify-center">
                          <PermToggle
                            enabled={enabled}
                            loading={isLoading}
                            locked={mod.adminOnly}
                            onChange={() => !mod.adminOnly && togglePerm(mod.key, r.key)}
                          />
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
