import { useState, useEffect, useRef, useId } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Plus, X, Calendar, Paperclip, MessageCircle, Pencil,
  Flag, AlertCircle, Zap, ArrowRight, Check, User,
  Trash2, Send, Upload, FileText, Image, Save,
  Loader2, SquareCheck, Square, ListTodo, ChevronDown, Eye, EyeOff} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { createNotifications } from '../../components/notifications/NotificationBell'
import { useAuth }  from '../../contexts/AuthContext'
import { Modal } from '../../components/ui/Modal'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'

// ─── Helpers ──────────────────────────────────────────────────────
const fmtDate = d => !d ? null : new Date(d+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})
const fmtDT   = d => !d ? '' : new Date(d).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})
const fmtSize = b => b<1024?b+'B':b<1048576?(b/1024).toFixed(1)+'KB':(b/1048576).toFixed(1)+'MB'

// Data local (YYYY-MM-DD) — evita bug de fuso horário na comparação
function localISO(d = new Date()) {
  const tz = d.getTimezoneOffset() * 60000
  return new Date(d - tz).toISOString().slice(0, 10)
}
// Compara devido_date (string YYYY-MM-DD) com hoje, sem levar em conta hora.
// 'today' até às 23:59:59 do dia da data limite não conta como atrasado.
function getDueStatus(due_date, status) {
  if (!due_date || status === 'done') return null
  const today = localISO()
  if (due_date < today)  return 'overdue'
  if (due_date === today) return 'today'
  return null
}

function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

// Destaca @Nome nos comentários renderizados, quando bate com um usuário conhecido
function renderMentions(text, users) {
  if (!text || !users?.length) return text
  const names = [...users].map(u => u.name).sort((a, b) => b.length - a.length)
  const pattern = new RegExp(`@(${names.map(escapeRegExp).join('|')})\\b`, 'g')
  const parts = []
  let last = 0, m
  while ((m = pattern.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    parts.push(<span key={m.index} className="font-bold text-indigo-600 bg-indigo-50 px-1 rounded">@{m[1]}</span>)
    last = m.index + m[0].length
  }
  parts.push(text.slice(last))
  return parts
}

function getSession(){
  try{ return JSON.parse(localStorage.getItem('coisapet_session')||'{}') }catch{ return {} }
}

// ─── Config ───────────────────────────────────────────────────────
const COLUMNS = [
  { id:'backlog',  label:'Backlog',        color:'#94a3b8', bg:'bg-slate-50',   border:'border-slate-200',  dot:'bg-slate-400',   desc:'Ideias e tarefas futuras' },
  { id:'todo',     label:'A Fazer',        color:'#6366f1', bg:'bg-indigo-50',  border:'border-indigo-200', dot:'bg-indigo-400',  desc:'Próximas tarefas' },
  { id:'doing',    label:'Em andamento',   color:'#f59e0b', bg:'bg-amber-50',   border:'border-amber-200',  dot:'bg-amber-400',   desc:'Trabalhando agora' },
  { id:'review',   label:'QA Coisa Pet',   color:'#8b5cf6', bg:'bg-violet-50',  border:'border-violet-200', dot:'bg-violet-400',  desc:'Aguardando aprovação' },
  { id:'done',     label:'Concluído',      color:'#22c55e', bg:'bg-emerald-50', border:'border-emerald-200',dot:'bg-emerald-400', desc:'Finalizadas' },
]

const PRIORITY_CFG = {
  baixa:   { label:'Baixa',   color:'text-slate-400', bg:'bg-slate-100',  Icon:Flag,         border:'border-slate-200'  },
  media:   { label:'Média',   color:'text-sky-500',   bg:'bg-sky-50',     Icon:Flag,         border:'border-sky-200'    },
  alta:    { label:'Alta',    color:'text-amber-500', bg:'bg-amber-50',   Icon:AlertCircle,  border:'border-amber-200'  },
  urgente: { label:'Urgente', color:'text-rose-500',  bg:'bg-rose-50',    Icon:Zap,          border:'border-rose-200'   },
}

// Setores — define visibilidade por role
const TASK_SECTORS = {
  producao:      { label: 'Produção',       color: '#f59e0b' },
  atendimento:   { label: 'Atendimento',    color: '#6366f1' },
  marketplaces:  { label: 'Marketplaces',   color: '#f97316' },
  administrativo:{ label: 'Administrativo', color: '#14b8a6' },
  advocacia:     { label: 'Advocacia',      color: '#7c3aed' },
  marcas_patentes:{ label:'Marcas e Patentes', color: '#0891b2' },
  geral:         { label: 'Geral',          color: '#64748b' },
}

// Monta uma descrição legível do que mudou entre a versão antiga e a nova da
// tarefa — usado pra enriquecer o corpo das notificações (sino + e-mail).
function diffTask(before, after, users) {
  if (!before) return null
  const changes = []
  if (before.status !== after.status) {
    const a = COLUMNS.find(c=>c.id===before.status)?.label || before.status
    const b = COLUMNS.find(c=>c.id===after.status)?.label  || after.status
    changes.push(`Status: ${a} → ${b}`)
  }
  if (before.priority !== after.priority) {
    const a = PRIORITY_CFG[before.priority]?.label || before.priority
    const b = PRIORITY_CFG[after.priority]?.label  || after.priority
    changes.push(`Prioridade: ${a} → ${b}`)
  }
  if ((before.assigned_to||null) !== (after.assigned_to||null)) {
    const nome = users.find(u=>u.id===after.assigned_to)?.name || 'ninguém'
    changes.push(`Responsável: ${nome}`)
  }
  if ((before.due_date||'') !== (after.due_date||'')) {
    changes.push(`Data limite: ${fmtDate(before.due_date)||'—'} → ${fmtDate(after.due_date)||'—'}`)
  }
  if ((before.title||'') !== (after.title||'')) changes.push('Título alterado')
  if ((before.description||'') !== (after.description||'')) changes.push('Descrição alterada')
  return changes.length ? changes.join(' · ') : null
}

const TASK_TYPES = [
  { color: null,      label: '—',             sector: 'geral'       },
  // Produção
  { color: '#f59e0b', label: 'Produção',       sector: 'producao'    },
  { color: '#ef4444', label: 'Embalagem',      sector: 'producao'    },
  { color: '#22c55e', label: 'Estoque',        sector: 'producao'    },
  { color: '#06b6d4', label: 'Qualidade',      sector: 'producao'    },
  { color: '#64748b', label: 'Manutenção',     sector: 'producao'    },
  { color: '#2b75db', label: 'Projetos',       sector: 'producao'    },
  // Atendimento / Marketing
  { color: '#6366f1', label: 'Pedidos',        sector: 'atendimento' },
  { color: '#ec4899', label: 'Cliente',        sector: 'atendimento' },
  { color: '#8b5cf6', label: 'Marketplace',    sector: 'atendimento' },
  { color: '#3b82f6', label: 'Redes Sociais',  sector: 'atendimento' },
  { color: '#0ea5e9', label: 'Site',           sector: 'atendimento' },
  { color: '#490000', label: 'Blog',           sector: 'atendimento' },
  { color: '#164401', label: 'Fotos',           sector: 'atendimento' },
  { color: '#480057', label: 'Anúncios',           sector: 'atendimento' },

  // Marketplaces — visível só para atendimento e admin
  { color: '#f97316', label: 'Campanhas',          sector: 'marketplaces' },
  { color: '#ea580c', label: 'Ajustes',            sector: 'marketplaces' },
  { color: '#10b981', label: 'Operações',          sector: 'marketplaces' },
  { color: '#059669', label: 'Outros MKT',         sector: 'marketplaces' },

  // Administrativo — vinculado só a colaboradores role='administrativo'
  { color: '#14b8a6', label: 'Administrativo',     sector: 'administrativo' },

  // Advocacia — visível só pro escritório de advocacia (ex: Zochio & Saroa)
  { color: '#7c3aed', label: 'Advocacia',           sector: 'advocacia' },

  // Marcas e Patentes — visível só pro escritório correspondente (ex: Consempi)
  { color: '#0891b2', label: 'Marcas e Patentes',   sector: 'marcas_patentes' },
]
const CARD_COLORS = TASK_TYPES.map(t => t.color)

// ─── TaskCard ─────────────────────────────────────────────────────
function TaskCard({ task, users, onOpen, onMove, colIndex, readOnly = false }) {
  const [dragging, setDragging] = useState(false)
  const p  = PRIORITY_CFG[task.priority]||PRIORITY_CFG.media
  const PIcon = p.Icon
  const dueStatus = getDueStatus(task.due_date, task.status)
  const isOverdue = dueStatus === 'overdue'
  const isDueToday = dueStatus === 'today'
  const assigned = users.find(u=>u.id===task.assigned_to)

  return (
    <div
      className={`group bg-white rounded-b-2xl border transition-all cursor-pointer select-none
        ${dragging?'opacity-40 scale-95':'hover:-translate-y-0.5'}
        ${task.status==='done'?'opacity-60':''}
        ${isOverdue?'border-rose-200':isDueToday?'border-sky-200':'border-slate-200 shadow-sm hover:shadow-md'}`}
      style={{
        backgroundColor: isOverdue ? 'rgba(239,68,68,0.04)' : isDueToday ? 'rgba(14,165,233,0.05)' : undefined,
        ...(isOverdue  ? {boxShadow:'0 0 0 2px rgba(239,68,68,0.12), 0 2px 12px rgba(239,68,68,0.12)'} :
            isDueToday ? {boxShadow:'0 0 0 2px rgba(14,165,233,0.16), 0 2px 12px rgba(14,165,233,0.12)'} : {})
      }}
      draggable={!readOnly}
      onDragStart={e=>{if(readOnly)return;setDragging(true);e.dataTransfer.setData('taskId',task.id)}}
      onDragEnd={()=>setDragging(false)}
      onClick={()=>onOpen(task)}
    >
      {task.color && (
        <div>
          <div className="h-1" style={{background:task.color}}/>
          <div className="px-3 pt-2">
            <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{background: task.color+'22', color: task.color, border:`1px solid ${task.color}44`}}>
              {TASK_TYPES.find(t=>t.color===task.color)?.label || ''}
            </span>
          </div>
        </div>
      )}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            {task.task_code && (
              <span className="inline-block text-[9px] font-black font-mono tracking-widest text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded mb-1 mr-1">
                #{task.task_code}
              </span>
            )}
            {task.task_sector && task.task_sector !== 'geral' && (
              <span className="inline-block text-[9px] font-bold px-1.5 py-0.5 rounded mb-1"
                style={{
                  background: (TASK_SECTORS[task.task_sector]?.color ?? '#64748b') + '18',
                  color: TASK_SECTORS[task.task_sector]?.color ?? '#64748b'
                }}>
                {TASK_SECTORS[task.task_sector]?.label}
              </span>
            )}
            <p className={`text-sm font-semibold text-slate-800 leading-snug ${task.status==='done'?'line-through text-slate-400':''}`}>
              {task.title}
            </p>
          </div>
          {!readOnly && (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              {colIndex>0 && (
                <button onClick={e=>{e.stopPropagation();onMove(task,COLUMNS[colIndex-1].id)}}
                  className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 rotate-180">
                  <ArrowRight size={12}/>
                </button>
              )}
              {colIndex<COLUMNS.length-1 && (
                <button onClick={e=>{e.stopPropagation();onMove(task,COLUMNS[colIndex+1].id)}}
                  className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
                  <ArrowRight size={12}/>
                </button>
              )}
            </div>
          )}
        </div>
        {task.description && <p className="text-xs text-slate-400 mb-3 line-clamp-2 leading-relaxed">{task.description}</p>}
        {/* Barra de progresso subtasks */}
        {task._subtasks_total > 0 && (
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-500">
                <ListTodo size={9}/> {task._subtasks_done}/{task._subtasks_total}
              </span>
              <span className="text-[10px] font-bold text-slate-400">
                {Math.round(task._subtasks_done/task._subtasks_total*100)}%
              </span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.round(task._subtasks_done/task._subtasks_total*100)}%`,
                  background: task._subtasks_done===task._subtasks_total ? '#22c55e' : '#6366f1'
                }}
              />
            </div>
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${p.bg} ${p.color} ${p.border}`}>
            <PIcon size={9}/> {p.label}
          </span>
          {task.due_date && (
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${isOverdue?'text-rose-500':isDueToday?'text-sky-500':'text-slate-400'}`}>
              <Calendar size={9}/> {fmtDate(task.due_date)}{isOverdue&&' · Atrasada'}{isDueToday&&' · Vence hoje'}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {task._comments>0 && <span className="flex items-center gap-0.5 text-[10px] text-slate-400"><MessageCircle size={10}/>{task._comments}</span>}
            {task._attachments>0 && <span className="flex items-center gap-0.5 text-[10px] text-slate-400"><Paperclip size={10}/>{task._attachments}</span>}
            {assigned && (
              <div className="w-5 h-5 rounded-full bg-rose-100 flex items-center justify-center text-[8px] font-black text-rose-500">
                {assigned.name.split(' ').map(n=>n[0]).slice(0,2).join('')}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── AttachThumb — fora do TaskModal para não violar Rules of Hooks ─
function AttachThumb({ a }) {
  const [src, setSrc] = useState(null)
  const isImg = /\.(jpg|jpeg|png|gif|webp)$/i.test(a.file_name)
  useEffect(() => {
    if (!isImg) return
    supabase.storage.from('task-files').createSignedUrl(a.file_url, 3600)
      .then(({ data }) => { if (data) setSrc(data.signedUrl) })
  }, [a.file_url])

  return (
    <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-100 shrink-0 flex items-center justify-center border border-slate-200">
      {src
        ? <img src={src} alt={a.file_name} className="w-full h-full object-cover"/>
        : isImg
          ? <Image size={18} className="text-slate-400"/>
          : <FileText size={18} className="text-slate-400"/>
      }
    </div>
  )
}

// ─── TaskModal ────────────────────────────────────────────────────
function useWideScreen() {
  const [wide, setWide] = useState(() => window.innerWidth >= 1440 && window.innerHeight >= 900)
  useEffect(() => {
    const fn = () => setWide(window.innerWidth >= 1440 && window.innerHeight >= 900)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])
  return wide
}

// ─── SubtaskTitle — edição inline ao clicar ──────────────────────
function SubtaskTitle({ sub, onUpdate }) {
  const [editing, setEditing] = useState(false)
  const [val,     setVal]     = useState('')

  // Sincroniza val quando sub.title muda (evita uncontrolled→controlled)
  useEffect(() => { setVal(sub.title ?? '') }, [sub.title])

  if (editing) return (
    <input
      autoFocus
      className="flex-1 text-sm border border-indigo-300 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-200"
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={() => { onUpdate(sub.id, val); setEditing(false) }}
      onKeyDown={e => { if(e.key==='Enter'){ onUpdate(sub.id, val); setEditing(false) } if(e.key==='Escape') setEditing(false) }}
    />
  )
  return (
    <span
      onClick={() => setEditing(true)}
      className={`flex-1 text-sm cursor-pointer hover:text-indigo-600 transition-colors leading-snug
        ${sub.done ? 'line-through text-slate-400' : 'text-slate-700'}`}
      title="Clique para editar"
    >
      {sub.title}
    </span>
  )
}

// ─── CategoryDropdown — dropdown customizado com cores ───────────
function CategoryDropdown({ value, onChange, allowedSectors, disabled = false }) {
  // Popover API cuida de: tecla Esc e empilhamento acima de tudo (top layer).
  // O "clique fora" (light-dismiss) nativo não se comportou de forma confiável
  // dentro do nosso Modal customizado, então reforçamos com um detector leve —
  // só fica ativo enquanto o popover está de fato aberto.
  const popoverId = useId().replace(/:/g, '') // useId gera ':' que não é válido em CSS anchor-name
  const anchorName = `--cat-${popoverId}`
  const btnRef   = useRef(null)
  const panelRef = useRef(null)

  const selected = TASK_TYPES.find(t => t.color === value)

  // Filtra categorias pelo setor permitido
  const visibleTypes = TASK_TYPES.filter(t => {
    if (!t.color) return false
    if (!allowedSectors) return true
    return allowedSectors.includes(t.sector)
  })

  // Se o valor atual não é permitido, limpa
  useEffect(() => {
    if (value && allowedSectors) {
      const type = TASK_TYPES.find(t => t.color === value)
      if (type && !allowedSectors.includes(type.sector)) onChange(null)
    }
  }, [allowedSectors])

  // Reforço de clique fora — usa :popover-open (nativo) pra saber se tá
  // aberto, sem precisar de um useState próprio só pra isso
  useEffect(() => {
    function onPointerDown(e) {
      const panel = panelRef.current
      if (panel?.matches(':popover-open') && !panel.contains(e.target) && !btnRef.current?.contains(e.target)) {
        panel.hidePopover()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  function pick(color) {
    onChange(color)
    panelRef.current?.hidePopover()
  }

  // Somente leitura — mostra um "chip" estático, sem popover clicável
  if (disabled) {
    return (
      <div className="select w-full flex items-center gap-2 text-sm cursor-not-allowed opacity-90"
        style={selected ? { background: selected.color+'18', borderColor: selected.color+'66', color: selected.color, fontWeight: 700 } : {}}>
        {selected ? (
          <>
            <span className="w-3 h-3 rounded-full shrink-0" style={{background: selected.color}}/>
            <span className="flex-1 text-left truncate">{selected.label}</span>
          </>
        ) : (
          <span className="flex-1 text-left text-slate-400 text-xs">Sem categoria</span>
        )}
      </div>
    )
  }

  return (
    <div className="relative">
      <button ref={btnRef} type="button"
        onClick={() => panelRef.current?.togglePopover()}
        className="select w-full flex items-center gap-2 text-sm"
        style={{
          anchorName, // registra este botão como âncora — o popover se posiciona relativo a ele
          ...(value ? { background: value+'18', borderColor: value+'66', color: value, fontWeight: 700 } : {}),
        }}>
        {selected ? (
          <>
            <span className="w-3 h-3 rounded-full shrink-0" style={{background: selected.color}}/>
            <span className="flex-1 text-left truncate">{selected.label}</span>
          </>
        ) : (
          <span className="flex-1 text-left text-rose-400 font-semibold text-xs">⚠ Escolha uma categoria *</span>
        )}
        <ChevronDown size={13} className="shrink-0 text-slate-400"/>
      </button>

      <div ref={panelRef} id={popoverId} popover="auto"
        className="bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden m-0"
        style={{
          positionAnchor: anchorName,
          position: 'fixed',                          // exigido pelo spec de anchor positioning
          top: 'calc(anchor(bottom) + 4px)',
          left: 'anchor(left)',
          width: 'anchor-size(width)',                 // acompanha a largura do botão, sem medir nada em JS
          maxHeight: '55vh',                            // sem isso, uma lista longa fica cortada e sem scroll
          overflowY: 'auto',
        }}>
        {/* Agrupa por setor — sem categoria obrigatória */}
        {['producao','atendimento',
          ...(allowedSectors === null || allowedSectors?.includes('marketplaces') ? ['marketplaces'] : []),
          ...(allowedSectors === null || allowedSectors?.includes('administrativo') ? ['administrativo'] : []),
          ...(allowedSectors === null || allowedSectors?.includes('advocacia') ? ['advocacia'] : []),
          ...(allowedSectors === null || allowedSectors?.includes('marcas_patentes') ? ['marcas_patentes'] : []),
        ].map(sec => {
          const items = visibleTypes.filter(t => t.sector === sec)
          if (!items.length) return null
          const secCfg = TASK_SECTORS[sec]
          return (
            <div key={sec}>
              <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wider sticky top-0"
                style={{ color: secCfg.color, background: secCfg.color+'10' }}>
                {secCfg.label}
              </div>
              {items.map(({color, label}) => (
                <button key={color} type="button"
                  onClick={() => pick(color)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm font-semibold hover:opacity-80 transition-opacity`}
                  style={{ background: color+'12', color }}>
                  <span className="w-3 h-3 rounded-full shrink-0" style={{background: color}}/>
                  {label}
                  {value === color && <Check size={13} className="ml-auto"/>}
                </button>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TaskModal({ task, users, open, onClose, onSave, onDelete, canSeeAtendimento = true, userRole = '', escritorioSector = null }) {
  const [form,    setForm]    = useState({title:'',description:'',status:'backlog',priority:'media',due_date:'',assigned_to:'',color:null})
  const [assignees, setAssignees] = useState([])
  const [comments,setComments]= useState([])
  const [attachs, setAttachs] = useState([])
  const [subtasks,setSubtasks]= useState([])
  const [newCmt,  setNewCmt]  = useState('')
  const [mentionQuery, setMentionQuery] = useState(null)
  const [newSub,  setNewSub]  = useState('')
  const [saving,  setSaving]  = useState(false)
  const [tab,     setTab]     = useState('details')
  const [uploading,setUploading]=useState(false)
  const [dragSub, setDragSub] = useState(null)
  const fileRef = useRef()
  const cmtRef  = useRef()
  const wide = useWideScreen()

  useEffect(()=>{
    if(!task) return
    // Escritório: tarefa nova já nasce na categoria do setor dele (o único
    // que ele pode enxergar/criar) — evita ele ficar sem opção pra escolher
    const escritorioColor = (userRole === 'escritorio' && !task.id)
      ? TASK_TYPES.find(t => t.sector === escritorioSector)?.color ?? null
      : null
    setForm({
      title:       task.title        ?? '',
      description: task.description  ?? '',
      status:      task.status       ?? 'backlog',
      priority:    task.priority     ?? 'media',
      due_date:    task.due_date     ?? '',
      assigned_to: task.assigned_to  ?? (users[0]?.id || ''),
      color:       task.color        ?? escritorioColor,
    })
    setTab('details')
    if(task.id){ loadComments(task.id); loadAttachments(task.id); loadSubtasks(task.id); loadAssignees(task.id) }
    else{ setComments([]); setAttachs([]); setSubtasks([]); setAssignees([]) }
  },[task])

  // Busca do banco quem é (de fato) co-responsável desta tarefa — sem isso,
  // o campo ficava com o valor da última tarefa aberta e "vazava" pra outras.
  async function loadAssignees(id){
    const{data}=await supabase.from('task_assignees').select('user_id').eq('task_id',id)
    setAssignees((data??[]).map(a=>a.user_id))
  }

  async function loadComments(id){
    const{data}=await supabase.from('task_comments').select('*, author:system_users!author_id(name)').eq('task_id',id).order('created_at',{ascending:false})
    setComments(data??[])
  }
  async function loadAttachments(id){
    const{data}=await supabase.from('task_attachments').select('*, uploader:system_users!uploaded_by(name)').eq('task_id',id).order('created_at',{ascending:false})
    setAttachs(data??[])
  }

  // ── Ctrl+V para colar imagem (deve ficar no topo junto dos outros hooks) ──
  useEffect(() => {
    function onPaste(e) {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) uploadFile(file)
          break
        }
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [task?.id]) // eslint-disable-line

  async function loadSubtasks(id){
    const{data}=await supabase.from('task_subtasks').select('*').eq('task_id',id).order('position',{ascending:true}).order('created_at',{ascending:true})
    setSubtasks(data??[])
  }
  async function addSubtask(){
    if(!newSub.trim()) return
    const taskId = await ensureTaskSaved()
    if (!taskId) return
    const{id:uid}=getSession()
    const pos = subtasks.length
    const{error}=await supabase.from('task_subtasks').insert({task_id:taskId,title:newSub.trim(),done:false,position:pos,created_by:uid})
    if(error){ toast.error('Erro ao adicionar subtask.'); return }
    setNewSub(''); loadSubtasks(taskId)
  }
  async function toggleSubtask(sub){
    await supabase.from('task_subtasks').update({done:!sub.done}).eq('id',sub.id)
    loadSubtasks(task.id)
  }
  async function deleteSubtask(id){
    await supabase.from('task_subtasks').delete().eq('id',id)
    loadSubtasks(task.id)
  }
  async function updateSubtaskTitle(id, title){
    if(!title.trim()) return
    await supabase.from('task_subtasks').update({title:title.trim()}).eq('id',id)
    loadSubtasks(task.id)
  }

  const set=(k,v)=>setForm(p=>({...p,[k]:v}))

  // Salva a task automaticamente se ainda não tiver ID
  // Retorna o ID da task (novo ou existente)
  async function ensureTaskSaved() {
    if (task?.id) return task.id
    if (!form.title.trim()) {
      toast.error('Digite um título antes de adicionar subtasks ou arquivos.')
      return null
    }
    setSaving(true)
    try {
      await onSave({ ...task, ...form, assigned_to: form.assigned_to||null, due_date: form.due_date||null, color: form.color||null }, assignees)
      // onSave chama load() que recarrega as tasks — aguarda um tick
      // O ID novo vai estar no banco; busca via título+status
      await new Promise(r => setTimeout(r, 600))
      const { data } = await supabase
        .from('tasks')
        .select('id')
        .eq('title', form.title.trim())
        .eq('status', form.status ?? 'backlog')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      if (data?.id) {
        // Atualiza o task local para ter o ID
        task.id = data.id
        return data.id
      }
      return null
    } catch {
      toast.error('Erro ao salvar tarefa.')
      return null
    } finally {
      setSaving(false)
    }
  }

  async function handleSave(){
    if(!form.title.trim()){ toast.error('Título obrigatório.'); return }
    if(!form.color){ toast.error('Escolha uma categoria para a task.'); return }
    setSaving(true)
    try{ await onSave({...task,...form,assigned_to:form.assigned_to||null,due_date:form.due_date||null,color:form.color||null}, assignees); onClose() }
    catch(e){ toast.error('Erro ao salvar.') }
    finally{ setSaving(false) }
  }

  const [editingCommentId, setEditingCommentId] = useState(null)
  const [editCommentText,  setEditCommentText]  = useState('')

  async function updateComment(id, newBody) {
    if (!newBody.trim()) return
    const { error } = await supabase.from('task_comments').update({ body: newBody.trim() }).eq('id', id)
    if (error) { toast.error('Erro ao editar comentário.'); return }
    setEditingCommentId(null)
    loadComments(task.id)
  }

  async function deleteComment(id) {
    const { error } = await supabase.from('task_comments').delete().eq('id', id)
    if (error) { toast.error('Erro ao excluir comentário.'); return }
    loadComments(task.id)
  }

  async function sendComment(){
    if(!newCmt.trim()) return
    const{id:uid}=getSession()
    const body = newCmt.trim()
    const{error}=await supabase.from('task_comments').insert({task_id:task.id,author_id:uid,body})
    if(error){ toast.error('Erro ao comentar.'); return }

    // Menções @Nome — usuários citados recebem uma notificação específica
    const mentionedIds = users
      .filter(u => u.id!==uid && new RegExp(`@${escapeRegExp(u.name)}\\b`,'i').test(body))
      .map(u => u.id)

    const{data:asgnCmt}=await supabase.from('task_assignees').select('user_id').eq('task_id',task.id)
    const membersCmt=[...new Set([task.assigned_to,task.created_by,...(asgnCmt||[]).map(a=>a.user_id)].filter(Boolean))]
    const standardRecipients = membersCmt.filter(id=>id!==uid && !mentionedIds.includes(id))
    const autor = users.find(u=>u.id===uid)?.name || 'Alguém'
    const link  = task.task_code ? `/kanban-op?task=${task.task_code}` : null

    if(standardRecipients.length) await createNotifications({taskId:task.id,taskCode:task.task_code,taskTitle:task.title,type:'task_comment',body:`${autor} comentou: "${body.slice(0,160)}"`,recipientIds:standardRecipients,link})
    if(mentionedIds.length)       await createNotifications({taskId:task.id,taskCode:task.task_code,taskTitle:task.title,type:'task_comment',body:`📌 ${autor} te mencionou: "${body.slice(0,160)}"`,recipientIds:mentionedIds,link})

    setNewCmt(''); setMentionQuery(null); loadComments(task.id)
  }

  // ── Autocomplete de @menção no campo de comentário ────────────
  function handleCmtChange(e){
    const val = e.target.value
    setNewCmt(val)
    const pos = e.target.selectionStart
    const before = val.slice(0, pos)
    const m = before.match(/@([\p{L}0-9 ]{0,30})$/u)
    setMentionQuery(m ? m[1] : null)
  }
  function insertMention(u){
    const el = cmtRef.current
    const pos = el ? el.selectionStart : newCmt.length
    const before = newCmt.slice(0, pos)
    const after  = newCmt.slice(pos)
    const replaced = before.replace(/@([\p{L}0-9 ]{0,30})$/u, `@${u.name} `)
    setNewCmt(replaced + after)
    setMentionQuery(null)
    requestAnimationFrame(() => el?.focus())
  }
  const mentionMatches = mentionQuery !== null
    ? users.filter(u => u.name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0,5)
    : []

  // Setor da categoria selecionada + usuários elegíveis pra Responsável/Co-responsável
  // (restringe a role='administrativo' quando a categoria é Administrativo).
  // Fica ANTES do 'if(!task) return null' de propósito — hooks precisam rodar sempre,
  // em toda renderização, na mesma ordem (Rules of Hooks).
  const selectedSector = TASK_TYPES.find(t => t.color === form.color)?.sector
  const assignableUsers = selectedSector === 'administrativo'
    ? users.filter(u => u.role === 'administrativo')
    // Escritório só é elegível quando a categoria bate com o setor dele
    // (ex: só aparece "Zochio & Saroa" quando a categoria é "Advocacia")
    : users.filter(u => u.role !== 'escritorio' || u.escritorio_sector === selectedSector)

  // ── Permissão de edição — calculada aqui em cima porque os painéis
  // (Detalhes/Subtasks/Comentários/Arquivos) usam isso pra travar campos ──
  const isMarketplaceRole = userRole === 'marketplace'
  const isEscritorioRole  = userRole === 'escritorio'
  const canEdit = isEscritorioRole
    ? (!task?.id || task?.task_sector === escritorioSector) // escritório edita tudo dentro do próprio setor
    : isMarketplaceRole
      ? (task?.task_sector === 'marketplaces') // marketplace só edita tasks de marketplaces
      : (canSeeAtendimento || (task?.task_sector !== 'atendimento' && task?.task_sector !== 'marketplaces'))

  useEffect(() => {
    if (!task) return
    // Reavalia responsáveis sempre que a categoria muda pra um setor restrito
    // (Administrativo, Advocacia, Marcas e Patentes) — evita deixar um
    // responsável "órfão" que não é mais elegível pra essa categoria
    const restricted = ['administrativo','advocacia','marcas_patentes'].includes(selectedSector)
    if (!restricted) return
    if (form.assigned_to && !assignableUsers.some(u => u.id === form.assigned_to)) {
      set('assigned_to', assignableUsers[0]?.id || '')
    }
    if (assignees.some(id => !assignableUsers.some(u => u.id === id))) {
      setAssignees(prev => prev.filter(id => assignableUsers.some(u => u.id === id)))
    }
  }, [selectedSector])

  async function uploadFile(file){
    if(!file) return
    const taskId = await ensureTaskSaved()
    if (!taskId) return
    setUploading(true)
    const ext=file.name.split('.').pop()
    const path=`tasks/${taskId}/${Date.now()}.${ext}`
    const{error:ue}=await supabase.storage.from('task-files').upload(path,file)
    if(ue){ toast.error('Erro ao enviar arquivo.'); setUploading(false); return }
    const{id:uid}=getSession()
    await supabase.from('task_attachments').insert({task_id:taskId,uploaded_by:uid,file_name:file.name,file_url:path,file_size:file.size})
    toast.success('Arquivo anexado!')
    setUploading(false); loadAttachments(taskId)
  }

  async function viewFile(url){
    const{data}=await supabase.storage.from('task-files').createSignedUrl(url,3600)
    if(data) window.open(data.signedUrl,'_blank')
  }
  async function deleteAttach(id,url){
    await supabase.storage.from('task-files').remove([url])
    await supabase.from('task_attachments').delete().eq('id',id)
    loadAttachments(task.id)
  }

  if(!task) return null
  const isNew=!task.id

  // ── Painel Detalhes ─────────────────────────────────────────
  const selectedType = TASK_TYPES.find(t => t.color === form.color)
  const dueStatus = getDueStatus(form.due_date, form.status)
  const creator   = users.find(u => u.id === task.created_by)
  const sectorCfg = TASK_SECTORS[task.task_sector] || TASK_SECTORS.geral
  const prio      = PRIORITY_CFG[form.priority] || PRIORITY_CFG.media
  const PanelDetails = (
    <div className="flex flex-col gap-4 h-full">

      {/* Linha 0 — Metadados somente-leitura (Relator, Departamento, criado/atualizado) */}
      {!isNew && (
        <div className="flex items-center gap-4 flex-wrap text-xs text-slate-400 pb-3 border-b border-slate-100">
          <span className="flex items-center gap-1.5">
            <User size={12}/> Relator: <strong className="text-slate-600 font-semibold">{creator?.name || '—'}</strong>
          </span>
          <span className="flex items-center gap-1.5">
            Departamento:
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{background:sectorCfg.color+'18', color:sectorCfg.color}}>
              {sectorCfg.label}
            </span>
          </span>
          <span>Criado em {fmtDT(task.created_at)}</span>
          <span>Atualizado em {fmtDT(task.updated_at)}</span>
        </div>
      )}

      {/* Linha 1 — Categoria (dropdown) + campos de controle */}
      <div className="grid grid-cols-4 gap-3">
        {/* Categoria dropdown customizado com cores — travada no setor do escritório */}
        <div className="col-span-1">
          <label className="form-label">Categoria</label>
          <div className="relative">
            <CategoryDropdown
              value={form.color ?? null}
              onChange={v => set('color', v)}
              allowedSectors={isEscritorioRole ? [escritorioSector] : userRole === 'marketplace' ? ['marketplaces'] : canSeeAtendimento ? null : ['producao']}
              disabled={isEscritorioRole}
            />
          </div>
        </div>
        {/* Status */}
        <div>
          <label className="form-label">Status</label>
          <select className="select" value={form.status} onChange={e=>set('status',e.target.value)}>
            {COLUMNS.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        {/* Prioridade — com destaque de cor */}
        <div>
          <label className="form-label">Prioridade</label>
          <div className={`flex items-center gap-2 rounded-xl border px-2.5 ${prio.bg} ${prio.border}`}>
            <prio.Icon size={13} className={`shrink-0 ${prio.color}`}/>
            <select className={`select !border-0 !bg-transparent !px-0 flex-1 font-bold ${prio.color}`}
              value={form.priority} onChange={e=>set('priority',e.target.value)}>
              {Object.entries(PRIORITY_CFG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
        </div>
        {/* Responsável */}
        <div>
          <label className="form-label">Responsável</label>
          <select className="select" value={form.assigned_to} onChange={e=>set('assigned_to',e.target.value)}>
            {assignableUsers.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>

        {/* Co-responsáveis — mostra TODO MUNDO, sem filtro de setor/cargo
            (diferente do Responsável): pedido explícito do Raphael, já que
            é comum precisar marcar alguém de outra área (ex: produção numa
            task de atendimento) só pra dar visibilidade/cobrança, sem
            precisar que a pessoa "pertença" ao setor da categoria. */}
        <div>
          <label className="form-label">Co-responsável adicional</label>
          <select className="select" value={assignees[0] || ''}
            onChange={e => setAssignees(e.target.value ? [e.target.value] : [])}>
            <option value="">Ninguém</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
      </div>

      {/* Linha 2 — Título + Data limite */}
      <div className="grid grid-cols-[1fr_180px] gap-3">
        <div>
          <label className="form-label">Título *</label>
          <input className="input text-base font-semibold" value={form.title}
            onChange={e=>set('title',e.target.value)} placeholder="Descreva a tarefa..."/>
        </div>
        <div>
          <label className="form-label">Data limite</label>
          <input type="date" className={`input ${
            dueStatus==='overdue' ? '!border-rose-300 !bg-rose-50 !text-rose-700 font-semibold' :
            dueStatus==='today'   ? '!border-sky-300 !bg-sky-50 !text-sky-700 font-semibold' : ''
          }`} value={form.due_date} onChange={e=>set('due_date',e.target.value)}/>
          {dueStatus==='overdue' && <p className="text-[10px] text-rose-500 font-semibold mt-1">⚠ Atrasada</p>}
          {dueStatus==='today'   && <p className="text-[10px] text-sky-600 font-semibold mt-1">⏰ Vence hoje</p>}
        </div>
      </div>

      {/* Linha 3 — Descrição (espaçosa) */}
      <div className="flex-1">
        <label className="form-label">Descrição</label>
        <textarea className="textarea w-full" rows={10}
          style={{minHeight: '200px', resize: 'vertical'}}
          value={form.description} onChange={e=>set('description',e.target.value)}
          placeholder="Detalhes, contexto, links, referências..."/>
      </div>
    </div>
  )

  // ── Drag & Drop entre subtasks ────────────────────────────────
  async function reorderSubtask(fromId, toId) {
    if (!fromId || !toId || fromId === toId) return
    setSubtasks(prev => {
      const arr  = [...prev]
      const from = arr.findIndex(s => s.id === fromId)
      const to   = arr.findIndex(s => s.id === toId)
      if (from === -1 || to === -1) return prev
      const [item] = arr.splice(from, 1)
      arr.splice(to, 0, item)
      const reordered = arr.map((s, i) => ({ ...s, position: i }))
      // Persiste no banco de forma assíncrona
      Promise.all(reordered.map((s, i) =>
        supabase.from('task_subtasks').update({ position: i }).eq('id', s.id)
      ))
      return reordered
    })
  }

  // ── Painel Subtasks ────────────────────────────────────────
  const doneSubs = subtasks.filter(s=>s.done).length
  const PanelSubtasks = (
    <div className="flex flex-col gap-3">
      {/* Progresso */}
      {subtasks.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-slate-500">{doneSubs}/{subtasks.length} concluídas</span>
            <span className="text-xs font-bold text-slate-400">{Math.round(doneSubs/subtasks.length*100)}%</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500"
              style={{width:`${Math.round(doneSubs/subtasks.length*100)}%`,background:doneSubs===subtasks.length?'#22c55e':'#6366f1'}}/>
          </div>
        </div>
      )}

      {/* Lista com D&D */}
      <div className="flex flex-col gap-1.5">
        {subtasks.length === 0 && (
          <div className="text-center py-6 text-slate-400">
            <ListTodo size={28} className="mx-auto mb-2 opacity-30"/>
            <p className="text-sm font-medium">Nenhuma subtask ainda</p>
            <p className="text-xs text-slate-300 mt-1">Divida esta tarefa em etapas menores</p>
          </div>
        )}
        {subtasks.map(sub => (
          <div key={sub.id}
            draggable
            onDragStart={e => { e.dataTransfer.effectAllowed='move'; setDragSub(sub.id) }}
            onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect='move' }}
            onDragEnter={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); reorderSubtask(dragSub, sub.id); setDragSub(null) }}
            onDragEnd={() => setDragSub(null)}
            className={`flex items-center gap-2 p-3 rounded-xl border transition-all cursor-grab active:cursor-grabbing
              ${dragSub === sub.id ? 'opacity-30 scale-95 border-dashed' : ''}
              ${dragSub && dragSub !== sub.id ? 'border-indigo-200 bg-indigo-50/30' : ''}
              ${sub.done && !dragSub ? 'bg-emerald-50/60 border-emerald-100' : ''}
              ${!sub.done && !dragSub ? 'bg-white border-slate-100 hover:border-slate-200' : ''}`}>
            {/* Handle drag */}
            <span className="text-slate-300 hover:text-slate-400 cursor-grab shrink-0 select-none text-xs">⠿</span>
            <button onClick={()=>toggleSubtask(sub)} className="shrink-0 transition-transform hover:scale-110">
              {sub.done
                ? <SquareCheck size={18} className="text-emerald-500"/>
                : <Square size={18} className="text-slate-300 hover:text-indigo-400"/>
              }
            </button>
            <SubtaskTitle sub={sub} onUpdate={updateSubtaskTitle}/>
            {/* 2. Botão deletar sempre visível */}
            <button onClick={()=>deleteSubtask(sub.id)}
              className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors shrink-0">
              <Trash2 size={13}/>
            </button>
          </div>
        ))}
      </div>

      {/* Input nova subtask */}
      <div className="flex gap-2 pt-2 border-t border-slate-100">
        <input
          className="input flex-1 text-sm"
          placeholder="Nova subtask... (Enter para adicionar)"
          value={newSub}
          onChange={e=>setNewSub(e.target.value)}
          onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); addSubtask() } }}
        />
        <button onClick={addSubtask} disabled={!newSub.trim()} className="btn-primary px-4 shrink-0">
          <Plus size={15}/>
        </button>
      </div>
    </div>
  )

  // ── Painel Comentários ──────────────────────────────────────
  const PanelComments = (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex-1 overflow-y-auto flex flex-col gap-3 pr-1" style={{maxHeight: tab==='comments' ? 'calc(60vh - 80px)' : '100%'}}>
        {comments.length===0
          ? <div className="text-center py-8 text-slate-400"><MessageCircle size={28} className="mx-auto mb-2 opacity-30"/><p className="text-sm font-medium">Nenhum comentário ainda</p></div>
          : comments.map(cm=>{
              const isMine = cm.author_id === getSession()?.id
              const isEditing = editingCommentId === cm.id
              return (
                <div key={cm.id} className="flex gap-3 items-start group">
                  <div className="w-7 h-7 rounded-full bg-rose-100 flex items-center justify-center text-[9px] font-black text-rose-500 shrink-0 mt-0.5">
                    {cm.author?.name?.split(' ').map(n=>n[0]).slice(0,2).join('')||'?'}
                  </div>
                  <div className="flex-1 bg-slate-50 rounded-2xl rounded-tl-sm px-4 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-xs font-bold text-slate-700">{cm.author?.name||'Usuário'}</p>
                      <p className="text-[10px] text-slate-400">{fmtDT(cm.created_at)}</p>
                      {isMine && !isEditing && (
                        <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => { setEditingCommentId(cm.id); setEditCommentText(cm.body) }}
                            className="p-1 rounded-lg text-slate-300 hover:text-indigo-500 hover:bg-indigo-50"><Pencil size={11}/></button>
                          <button onClick={() => deleteComment(cm.id)}
                            className="p-1 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50"><Trash2 size={11}/></button>
                        </div>
                      )}
                    </div>
                    {isEditing ? (
                      <div className="flex flex-col gap-2">
                        <textarea autoFocus rows={2} className="textarea w-full resize-none text-sm"
                          value={editCommentText} onChange={e=>setEditCommentText(e.target.value)}
                          onKeyDown={e=>{if(e.key==='Enter'&&e.ctrlKey)updateComment(cm.id,editCommentText)}}/>
                        <div className="flex gap-2 justify-end">
                          <button onClick={()=>setEditingCommentId(null)} className="text-xs text-slate-400 hover:text-slate-600 font-semibold px-2">Cancelar</button>
                          <button onClick={()=>updateComment(cm.id,editCommentText)} className="text-xs text-white bg-indigo-500 hover:bg-indigo-600 font-semibold px-3 py-1 rounded-lg">Salvar</button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{renderMentions(cm.body, users)}</p>
                    )}
                  </div>
                </div>
              )
            })
        }
      </div>
      <div className="relative mt-auto pt-2 border-t border-slate-100">
        {mentionMatches.length>0 && (
          <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-10">
            {mentionMatches.map(u=>(
              <button key={u.id} type="button" onClick={()=>insertMention(u)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 text-left">
                <span className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center text-[8px] font-black text-indigo-600 shrink-0">
                  {u.name.split(' ').map(n=>n[0]).slice(0,2).join('')}
                </span>
                {u.name}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <textarea ref={cmtRef} className="textarea flex-1 resize-none" rows={2} value={newCmt}
            onChange={handleCmtChange}
            placeholder="Adicionar comentário... use @nome para mencionar"
            onKeyDown={e=>{if(e.key==='Enter'&&e.ctrlKey)sendComment()}}/>
          <button onClick={sendComment} disabled={!newCmt.trim()} className="btn-primary self-end px-4"><Send size={14}/></button>
        </div>
        <p className="text-[10px] text-slate-400 mt-1">Ctrl+Enter para enviar · @nome para mencionar e notificar por e-mail</p>
      </div>
    </div>
  )

  // ── Painel Arquivos ─────────────────────────────────────────
  const PanelFiles = (
    <div className="flex flex-col gap-3">
      <div className="border-2 border-dashed border-slate-200 rounded-2xl p-5 text-center cursor-pointer hover:border-rose-300 hover:bg-rose-50/30 transition-colors"
        onClick={()=>fileRef.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();uploadFile(e.dataTransfer.files[0])}}>
        {uploading
          ? <div className="w-6 h-6 border-2 border-rose-200 border-t-rose-400 rounded-full animate-spin mx-auto"/>
          : <>
              <Upload size={22} className="text-slate-300 mx-auto mb-2"/>
              <p className="text-sm font-semibold text-slate-500">Clique, arraste ou <kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-xs font-mono">Ctrl+V</kbd></p>
              <p className="text-xs text-slate-400 mt-1">PDF, imagens, documentos</p>
            </>
        }
        <input ref={fileRef} type="file" className="hidden" onChange={e=>uploadFile(e.target.files[0])}/>
      </div>
      {attachs.length===0
        ? <p className="text-center text-sm text-slate-400 py-4">Nenhum arquivo anexado</p>
        : attachs.map(a=>(
            <div key={a.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 hover:border-slate-200 transition-colors">
              <AttachThumb a={a}/>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-700 truncate">{a.file_name}</p>
                <p className="text-[10px] text-slate-400">{a.file_size?fmtSize(a.file_size):''} · {a.uploader?.name} · {fmtDT(a.created_at)}</p>
              </div>
              <button onClick={()=>viewFile(a.file_url)} className="text-xs font-bold text-sky-500 hover:text-sky-600 shrink-0">Ver</button>
              <button onClick={()=>deleteAttach(a.id,a.file_url)} className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"><Trash2 size={13}/></button>
            </div>
          ))
      }
    </div>
  )

  const isAtendimentoTask  = task?.task_sector === 'atendimento'
  const isMarketplaceTask  = task?.task_sector === 'marketplaces'

  const footer = (
    <div className="flex items-center justify-between w-full">
      {!isNew && canEdit
        ? <button onClick={()=>onDelete(task)} className="text-xs text-rose-500 hover:text-rose-600 font-semibold flex items-center gap-1"><Trash2 size={13}/> Excluir</button>
        : <div/>
      }
      <div className="flex gap-2">
        <button onClick={onClose} className="btn-secondary">Cancelar</button>
        <button onClick={handleSave} disabled={saving || (!canEdit && !isNew)} className="btn-primary">
          {saving?<div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>:<><Check size={14}/> Salvar</>}
        </button>
      </div>
    </div>
  )

  // ── Layout WIDE (≥1440×900) — estilo Jira: principal | Informações | Comentários ──
  if(wide && !isNew) return (
    <Modal open={open} onClose={onClose} size="task"
      title={<span>Tarefa {task?.task_code && <span className="ml-2 text-sm font-black font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded-lg">#{task.task_code}</span>}</span>}
      footer={footer}>
      <div className="flex h-full" style={{minHeight:'560px'}}>

        {/* Coluna 1 — Título + Descrição */}
        <div className="w-[460px] shrink-0 pr-6 overflow-y-auto flex flex-col gap-4">
          <div>
            <label className="form-label">Título *</label>
            <input className="input text-lg font-bold" value={form.title}
              onChange={e=>set('title',e.target.value)} placeholder="Descreva a tarefa..."/>
          </div>
          <div className="flex-1 flex flex-col">
            <label className="form-label">Descrição</label>
            <textarea className="textarea w-full flex-1" rows={12}
              style={{minHeight:'320px', resize:'vertical'}}
              value={form.description} onChange={e=>set('description',e.target.value)}
              placeholder="Detalhes, contexto, links, referências..."/>
          </div>
        </div>

        <div className="w-px bg-slate-100 shrink-0"/>

        {/* Coluna 2 — Subtasks */}
        <div className="w-64 shrink-0 px-5 overflow-y-auto flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <ListTodo size={15} className="text-indigo-500"/>
            <h3 className="font-semibold text-slate-700 text-sm">Subtasks</h3>
            {subtasks.length>0 && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-semibold">{subtasks.length}</span>}
          </div>
          {PanelSubtasks}
        </div>

        <div className="w-px bg-slate-100 shrink-0"/>

        {/* Coluna 3 — Arquivos */}
        <div className="w-64 shrink-0 px-5 overflow-y-auto flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <Paperclip size={15} className="text-slate-500"/>
            <h3 className="font-semibold text-slate-700 text-sm">Arquivos</h3>
            {attachs.length>0 && <span className="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-semibold">{attachs.length}</span>}
          </div>
          {PanelFiles}
        </div>

        <div className="w-px bg-slate-100 shrink-0"/>

        {/* Coluna 4 — Informações — estilo Jira */}
        <div className="w-64 shrink-0 px-5 overflow-y-auto flex flex-col gap-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Informações</p>

          <div>
            <p className="text-[11px] text-slate-400 mb-1">Categoria</p>
            <CategoryDropdown
              value={form.color ?? null}
              onChange={v => set('color', v)}
              allowedSectors={isEscritorioRole ? [escritorioSector] : userRole === 'marketplace' ? ['marketplaces'] : canSeeAtendimento ? null : ['producao']}
              disabled={isEscritorioRole}
            />
          </div>

          <div>
            <p className="text-[11px] text-slate-400 mb-1">Status</p>
            <select className="select text-sm" value={form.status} onChange={e=>set('status',e.target.value)}>
              {COLUMNS.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>

          <div>
            <p className="text-[11px] text-slate-400 mb-1">Prioridade</p>
            <div className={`flex items-center gap-2 rounded-xl border px-2.5 ${prio.bg} ${prio.border}`}>
              <prio.Icon size={13} className={`shrink-0 ${prio.color}`}/>
              <select className={`select !border-0 !bg-transparent !px-0 flex-1 text-sm font-bold ${prio.color}`}
                value={form.priority} onChange={e=>set('priority',e.target.value)}>
                {Object.entries(PRIORITY_CFG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <p className="text-[11px] text-slate-400 mb-1">Responsável</p>
            <select className="select text-sm" value={form.assigned_to} onChange={e=>set('assigned_to',e.target.value)}>
              {assignableUsers.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>

          <div>
            <p className="text-[11px] text-slate-400 mb-1">Co-responsável</p>
            <select className="select text-sm" value={assignees[0] || ''}
              onChange={e => setAssignees(e.target.value ? [e.target.value] : [])}>
              <option value="">Ninguém</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>

          <div>
            <p className="text-[11px] text-slate-400 mb-1">Relator</p>
            <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><User size={12} className="text-slate-400"/> {creator?.name || '—'}</p>
          </div>

          <div>
            <p className="text-[11px] text-slate-400 mb-1">Departamento</p>
            <span className="inline-block text-xs font-bold px-2 py-1 rounded-lg" style={{background:sectorCfg.color+'18', color:sectorCfg.color}}>
              {sectorCfg.label}
            </span>
          </div>

          <div>
            <p className="text-[11px] text-slate-400 mb-1">Data limite</p>
            <input type="date" className={`input text-sm ${
              dueStatus==='overdue' ? '!border-rose-300 !bg-rose-50 !text-rose-700 font-semibold' :
              dueStatus==='today'   ? '!border-sky-300 !bg-sky-50 !text-sky-700 font-semibold' : ''
            }`} value={form.due_date} onChange={e=>set('due_date',e.target.value)}/>
            {dueStatus==='overdue' && <p className="text-[10px] text-rose-500 font-semibold mt-1">⚠ Atrasada</p>}
            {dueStatus==='today'   && <p className="text-[10px] text-sky-600 font-semibold mt-1">⏰ Vence hoje</p>}
          </div>

          <div className="pt-3 mt-1 border-t border-slate-100 flex flex-col gap-1">
            <p className="text-[11px] text-slate-400">Criado em {fmtDT(task.created_at)}</p>
            <p className="text-[11px] text-slate-400">Atualizado em {fmtDT(task.updated_at)}</p>
          </div>
        </div>

        <div className="w-px bg-slate-100 shrink-0"/>

        {/* Coluna 5 — Comentários — flexível, ocupa o espaço restante, mais novos primeiro */}
        <div className="flex-1 min-w-[320px] pl-5 flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <MessageCircle size={16} className="text-indigo-500"/>
            <h3 className="font-semibold text-slate-700 text-sm">Comentários</h3>
            {comments.length>0 && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-semibold">{comments.length}</span>}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto pr-1">
            {PanelComments}
          </div>
        </div>

      </div>
    </Modal>
  )

  // ── Layout NARROW: abas ─────────────────────────────────────
  return(
    <Modal open={open} onClose={onClose} size={tab==="comments" ? "comments" : "xl"}
      title={isNew ? 'Nova tarefa' : <span>Tarefa {task?.task_code && <span className="ml-2 text-sm font-black font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded-lg">#{task.task_code}</span>}</span>}
      footer={footer}>
      {/* Layout: quando comentários aberto → 2 colunas */}
      <div className={tab==='comments' ? 'flex gap-0 h-full' : ''}>

        {/* Coluna principal */}
        <div className={tab==='comments' ? 'flex-1 min-w-0 pr-5 border-r border-slate-100' : ''}>
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl mb-5 w-fit flex-wrap">
            {[
              ['details',  'Detalhes'],
              ['subtasks', `Subtasks${subtasks.length?' ('+subtasks.length+')':''}`],
              ['files',    `Arquivos${attachs.length?' ('+attachs.length+')':''}`],
            ].map(([id,lbl])=>(
              <button key={id} onClick={()=>setTab(id)}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${tab===id?'bg-white text-slate-800 shadow-sm':'text-slate-500 hover:text-slate-700'}`}>
                {lbl}
              </button>
            ))}
            {!isNew && (
              <button onClick={()=>setTab(t=>t==='comments'?'details':'comments')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${tab==='comments'?'bg-indigo-600 text-white shadow-sm':'text-slate-500 hover:text-slate-700'}`}>
                <MessageCircle size={12}/> Comentários{comments.length>0&&` (${comments.length})`}
              </button>
            )}
          </div>
          {tab==='details'  && PanelDetails}
          {tab==='subtasks' && PanelSubtasks}
          {tab==='files'    && PanelFiles}
          {tab==='comments' && PanelDetails}
        </div>

        {/* Painel lateral de comentários — desliza da direita */}
        {tab==='comments' && (
          <div className="w-80 shrink-0 pl-5 flex flex-col" style={{animation:'fadeIn .2s ease'}}>
            <div className="flex items-center gap-2 mb-4">
              <MessageCircle size={16} className="text-indigo-500"/>
              <h3 className="font-semibold text-slate-700 text-sm">Comentários</h3>
              {comments.length>0 && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-semibold">{comments.length}</span>}
            </div>
            <div className="flex-1 overflow-y-auto pr-1" style={{maxHeight:'calc(70vh - 120px)'}}>
              {PanelComments}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

// ─── Coluna ───────────────────────────────────────────────────────
function KanbanColumn({ col, tasks, users, onOpen, onMove, onDrop, colIndex, readOnly = false }) {
  const [over, setOver] = useState(false)
  return (
    <div className="flex flex-col min-h-0 flex-1" style={{minWidth:0}}>
      <div className={`flex items-center justify-between px-4 py-3 rounded-2xl border ${col.bg} ${col.border} mb-3 shrink-0`}>
        <div className="flex items-center gap-2.5">
          <div className={`w-2.5 h-2.5 rounded-full ${col.dot}`}/>
          <span className="text-sm font-bold text-slate-700" style={{fontFamily:'Nunito, sans-serif'}}>{col.label}</span>
          <span className="text-xs font-bold text-slate-400 bg-white px-2 py-0.5 rounded-full border border-slate-200">{tasks.length}</span>
        </div>
        {!readOnly && (
          <button onClick={()=>onOpen({status:col.id})} className="w-7 h-7 rounded-xl flex items-center justify-center hover:bg-white border border-transparent hover:border-slate-200 transition-all text-slate-400 hover:text-slate-600">
            <Plus size={15}/>
          </button>
        )}
      </div>
      <div className={`flex flex-col gap-3 flex-1 p-2 rounded-2xl transition-all min-h-[120px] overflow-y-auto ${over?'bg-slate-100 ring-2 ring-slate-200':''}`}
        onDragOver={e=>{if(readOnly)return;e.preventDefault();setOver(true)}}
        onDragLeave={()=>setOver(false)}
        onDrop={e=>{e.preventDefault();setOver(false);if(readOnly)return;const id=e.dataTransfer.getData('taskId');if(id)onDrop(id,col.id)}}>
        {tasks.length===0&&!over&&(
          <div className="flex flex-col items-center justify-center py-10 text-slate-300">
            <div className="w-10 h-10 rounded-2xl border-2 border-dashed border-slate-200 flex items-center justify-center mb-2"><Plus size={16} className="text-slate-300"/></div>
            <p className="text-xs font-medium">{col.desc}</p>
          </div>
        )}
        {tasks.map(t=><TaskCard key={t.id} task={t} users={users} colIndex={colIndex} onOpen={onOpen} onMove={onMove} readOnly={readOnly}/>)}
      </div>
    </div>
  )
}

// ─── Página ───────────────────────────────────────────────────────
// Ordena tasks de cada coluna:
// - done → por updated_at desc (mais recente concluída primeiro)
// - demais → por due_date asc (mais urgente primeiro), sem data vai para o fim
function sortTasks(tasks, colId) {
  return [...tasks].sort((a, b) => {
    if (colId === 'done') {
      const da = new Date(a.updated_at || 0)
      const db = new Date(b.updated_at || 0)
      return db - da
    }
    // Sem data vai para o fim
    if (!a.due_date && !b.due_date) return 0
    if (!a.due_date) return 1
    if (!b.due_date) return -1
    return new Date(a.due_date) - new Date(b.due_date)
  })
}

export function KanbanOperacionalPage() {
  const { user } = useAuth()
  const canSeeAtendimento  = ['admin','administrativo','atendimento'].includes(user?.role ?? '')
  const isEscritorioRole   = user?.role === 'escritorio'
  const isDiretoria        = user?.role === 'admin' // só a diretoria vê o filtro por setor

  const [tasks,     setTasks]     = useState([])
  const [escritorioSector, setEscritorioSector] = useState(null) // setor do escritório logado — só pra permissão de edição
  const [showDone,  setShowDone]  = useState(false)
  const [users,     setUsers]     = useState([])
  const [loading,   setLoading]   = useState(true)
  const [selTask,   setSelTask]   = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [delTask,   setDelTask]   = useState(null)
  // Filtro por responsável começa em "eu mesmo" — vê tudo/outra pessoa só se trocar manualmente
  const [filter,    setFilter]    = useState({priority:'',assigned:user?.id ?? '',search:'',color:'',sector:''})
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(()=>{ load() },[])

  // Abre automaticamente a task referenciada por ?task=CODE (vindo de notificações)
  useEffect(()=>{
    const code = searchParams.get('task')
    if(!code || tasks.length===0) return
    const found = tasks.find(t=>t.task_code===code)
    if(found){ openTask(found) }
    setSearchParams(prev=>{ const p=new URLSearchParams(prev); p.delete('task'); return p }, { replace:true })
  },[tasks, searchParams])

  async function load(){
    setLoading(true)
    const [taskR,userR]=await Promise.all([
      supabase.from('tasks').select('*, task_code, task_sector, comments:task_comments(count), attachments:task_attachments(count), subtasks:task_subtasks(count), assignees:task_assignees(user_id)').eq('kanban_type','operacional').order('position',{ascending:true}).order('created_at',{ascending:false}),
      supabase.from('system_users').select('id,name,role,escritorio_sector').eq('active',true).order('name'),
    ])
    const mapped = (taskR.data??[]).map(t=>({
      ...t,
      _comments:       t.comments?.[0]?.count    ?? 0,
      _attachments:    t.attachments?.[0]?.count ?? 0,
      _subtasks_total: t.subtasks?.[0]?.count    ?? 0,
      _subtasks_done:  0,
      _assigneeIds:    (t.assignees??[]).map(a=>a.user_id),
    }))

    // Setor do escritório logado (Advocacia, Marcas e Patentes, etc.) — vem
    // do próprio registro dele em system_users. Usado só pra permissão de
    // edição/criação (canEdit, assignableUsers) — todo mundo vê a task de
    // todo mundo no Kanban Operacional, isso aqui não filtra a lista.
    const mySector = isEscritorioRole
      ? (userR.data ?? []).find(u => u.id === user?.id)?.escritorio_sector ?? null
      : null
    setEscritorioSector(mySector)

    setTasks(mapped)
    setUsers((userR.data??[]).filter(u => !['equipe','horista'].includes(u.role)))
    setLoading(false)
    loadSubtasksDone(mapped)
  }

  async function loadSubtasksDone(taskList) {
    if (!taskList.length) return
    const ids = taskList.filter(t => (t._subtasks_total ?? 0) > 0).map(t => t.id)
    if (!ids.length) return
    const { data } = await supabase
      .from('task_subtasks')
      .select('task_id, done')
      .in('task_id', ids)
      .eq('done', true)
    if (!data) return
    const doneMap = {}
    data.forEach(r => { doneMap[r.task_id] = (doneMap[r.task_id] ?? 0) + 1 })
    setTasks(prev => prev.map(t => ({ ...t, _subtasks_done: doneMap[t.id] ?? 0 })))
  }

  function openTask(task){
    setSelTask(task.id?{...task}:{status:task.status||'backlog',priority:'media',title:''})
    setModalOpen(true)
  }

  async function saveTask(data, assigneeIds=[]){
    if(isEscritorioRole){
      const sector = TASK_TYPES.find(t=>t.color===data.color)?.sector ?? 'geral'
      if(sector !== escritorioSector){ toast.error('Você só pode criar/editar tarefas do seu próprio setor.'); return }
    }
    const{id:uid}=getSession()
    const link = data.task_code ? `/kanban-op?task=${data.task_code}` : null
    if(data.id){
      const before = tasks.find(t=>t.id===data.id)
      const sector = TASK_TYPES.find(t=>t.color===data.color)?.sector ?? 'geral'
      const{error}=await supabase.from('tasks').update({title:data.title,description:data.description,status:data.status,priority:data.priority,due_date:data.due_date,assigned_to:data.assigned_to,color:data.color,task_sector:sector}).eq('id',data.id)
      if(error) throw error
      // Atualiza co-responsáveis
      await supabase.from('task_assignees').delete().eq('task_id', data.id)
      if(assigneeIds?.length) await supabase.from('task_assignees').insert(assigneeIds.map(u=>({task_id:data.id,user_id:u})))
      // Notificações
      const{data:asgn}=await supabase.from('task_assignees').select('user_id').eq('task_id',data.id)
      const members=[...new Set([data.assigned_to,data.created_by,...(asgn||[]).map(a=>a.user_id),...(assigneeIds||[])].filter(Boolean))]
      const recipients=members.filter(id=>id!==uid)
      const changeDesc = diffTask(before, data, users) || 'Detalhes atualizados'
      if(recipients.length) await createNotifications({taskId:data.id,taskCode:data.task_code,taskTitle:data.title,type:'task_moved',body:changeDesc,recipientIds:recipients,link})
      toast.success('Tarefa atualizada!')
    } else {
      const maxPos=Math.max(0,...tasks.filter(t=>t.status===data.status).map(t=>t.position))
      const sector = TASK_TYPES.find(t=>t.color===data.color)?.sector ?? 'geral'
      const{data:newTask,error}=await supabase.from('tasks').insert({title:data.title,description:data.description,status:data.status,priority:data.priority,due_date:data.due_date,assigned_to:data.assigned_to,color:data.color,created_by:uid,position:maxPos+1,kanban_type:'operacional',task_sector:sector}).select('id, task_code').single()
      if(error) throw error
      if(newTask?.id){
        if(assigneeIds?.length) await supabase.from('task_assignees').insert(assigneeIds.map(u=>({task_id:newTask.id,user_id:u})))
        const members=[...new Set([data.assigned_to,...(assigneeIds||[])].filter(Boolean))]
        const recipients=members.filter(id=>id!==uid)
        const newLink = newTask.task_code ? `/kanban-op?task=${newTask.task_code}` : null
        const responsavel = users.find(u=>u.id===data.assigned_to)?.name
        const criadoBody = `Nova tarefa${data.due_date ? ` · Prazo: ${fmtDate(data.due_date)}` : ''}${responsavel ? ` · Responsável: ${responsavel}` : ''}`
        if(recipients.length) await createNotifications({taskId:newTask.id,taskCode:newTask.task_code,taskTitle:data.title,type:'task_created',body:criadoBody,recipientIds:recipients,link:newLink})
      }
      toast.success('Tarefa criada!')
    }
    load()
  }

  async function moveTask(task,newStatus){
    if(isEscritorioRole && task.task_sector !== escritorioSector) return
    await supabase.from('tasks').update({status:newStatus}).eq('id',task.id)
    toast.success(`Movida para ${COLUMNS.find(c=>c.id===newStatus)?.label}`)
    load()
  }

  async function dropTask(taskId,newStatus){
    const t = tasks.find(x=>x.id===taskId)
    if(isEscritorioRole && t?.task_sector !== escritorioSector) return
    await supabase.from('tasks').update({status:newStatus}).eq('id',taskId)
    load()
  }

  async function deleteTask(task){
    if(isEscritorioRole && task.task_sector !== escritorioSector) return
    await supabase.from('tasks').delete().eq('id',task.id)
    toast.success('Tarefa removida.')
    setDelTask(null); setModalOpen(false); load()
  }

  const filtered = tasks.filter(t=>{
    if(filter.priority&&t.priority!==filter.priority) return false
    if(filter.assigned&&t.assigned_to!==filter.assigned&&!(t._assigneeIds||[]).includes(filter.assigned)) return false
    if(filter.search){
      const q = filter.search.toLowerCase().replace(/^#/,'')
      const matchTitle = t.title.toLowerCase().includes(q)
      const matchCode  = t.task_code?.toLowerCase().includes(q)
      if(!matchTitle && !matchCode) return false
    }
    if(filter.color&&t.color!==filter.color) return false
    if(filter.sector&&t.task_sector!==filter.sector) return false
    return true
  })

  const tasksByCol = Object.fromEntries(COLUMNS.map(c=>[c.id, sortTasks(filtered.filter(t=>t.status===c.id), c.id)]))
  const overdue = tasks.filter(t=>getDueStatus(t.due_date,t.status)==='overdue').length

  return (
    <div className="flex flex-col gap-5 h-full animate-fade-in">
      <div className="page-header">
        <div>
          <h2 className="page-title">Kanban</h2>
          <p className="page-subtitle">
            {tasks.length} tarefas · {tasks.filter(t=>t.status==='done').length} concluídas
            {overdue>0&&<span className="text-rose-500 font-semibold"> · {overdue} atrasada(s)</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={()=>setShowDone(s=>!s)}
            className={`btn-secondary text-xs flex items-center gap-1.5 ${showDone?'bg-emerald-50 text-emerald-700 border-emerald-200':''}`}>
            {showDone ? <EyeOff size={13}/> : <Eye size={13}/>}
            {showDone ? 'Ocultar concluídos' : `Concluídos (${tasksByCol['done']?.length||0})`}
          </button>
          <button onClick={()=>openTask({status:'backlog'})} className="btn-primary"><Plus size={16}/> Nova tarefa</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {/* Botões de grupo/setor — só a diretoria filtra por setor */}
        {isDiretoria && (
          <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
            {[
              { key: '',             label: 'Todos'        },
              { key: 'producao',     label: 'Produção'     },
              { key: 'atendimento',  label: 'Atendimento'  },
              { key: 'marketplaces', label: 'Marketplaces' },
              { key: 'administrativo', label: 'Administrativo' },
              { key: 'advocacia',       label: 'Advocacia' },
              { key: 'marcas_patentes', label: 'Marcas e Patentes' },
            ].map(({ key, label }) => {
              const active = filter.sector === key
              const cfg    = key ? TASK_SECTORS[key] : null
              return (
                <button
                  key={key}
                  onClick={() => setFilter(p => ({ ...p, sector: key, color: '' }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    active
                      ? 'bg-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                  style={ active && cfg ? { color: cfg.color } : {} }
                >
                  {cfg && (
                    <span
                      className="inline-block w-2 h-2 rounded-full mr-1.5"
                      style={{ background: cfg.color }}
                    />
                  )}
                  {label}
                </button>
              )
            })}
          </div>
        )}
        <input className="input w-auto min-w-[200px]" placeholder="Buscar por título ou #código..." value={filter.search} onChange={e=>setFilter(p=>({...p,search:e.target.value}))}/>
        <select className="select w-auto" value={filter.priority} onChange={e=>setFilter(p=>({...p,priority:e.target.value}))}>
          <option value="">Todas as prioridades</option>
          {Object.entries(PRIORITY_CFG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className="select w-auto" value={filter.assigned} onChange={e=>setFilter(p=>({...p,assigned:e.target.value}))}>
          <option value="">Todos os responsáveis</option>
          {users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select className="select w-auto" value={filter.color} onChange={e=>setFilter(p=>({...p,color:e.target.value}))}>
          <option value="">Todas as categorias</option>
          {TASK_TYPES
            .filter(t => t.color && (!filter.sector || t.sector === filter.sector))
            .map(({color,label})=>(
              <option key={color} value={color}>{label}</option>
            ))
          }
        </select>
        {(filter.search||filter.priority||filter.assigned||filter.color||filter.sector)&&(
          <button onClick={()=>setFilter({priority:'',assigned:'',search:'',color:'',sector:''})} className="btn-secondary text-xs"><X size={12}/> Limpar</button>
        )}
      </div>

      {loading ? (
        <div className="card flex justify-center py-16"><div className="w-8 h-8 rounded-full border-4 border-rose-100 border-t-rose-400 animate-spin"/></div>
      ) : (
        <div className="grid gap-5 flex-1 pb-4" style={{gridTemplateColumns:`repeat(${COLUMNS.filter(c=>showDone||c.id!=='done').length},minmax(0,1fr))`,minHeight:0,overflow:'hidden'}}>
          {COLUMNS.filter(c=>showDone||c.id!=='done').map((col,idx)=>(
            <KanbanColumn key={col.id} col={col} colIndex={idx} tasks={tasksByCol[col.id]||[]} users={users}
              onOpen={openTask} onMove={moveTask} onDrop={dropTask}/>
          ))}
        </div>
      )}

      <TaskModal task={selTask} users={users} open={modalOpen} onClose={()=>setModalOpen(false)} onSave={saveTask} onDelete={t=>setDelTask(t)} canSeeAtendimento={canSeeAtendimento} userRole={user?.role ?? ''} escritorioSector={escritorioSector}/>
      <ConfirmDialog open={!!delTask} onClose={()=>setDelTask(null)} onConfirm={()=>deleteTask(delTask)}
        title="Excluir tarefa?" description={`"${delTask?.title}" e todos os seus comentários e arquivos serão removidos permanentemente.`} confirmLabel="Excluir"/>
    </div>
  )
}