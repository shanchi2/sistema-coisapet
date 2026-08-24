import { useState, useEffect, useMemo } from 'react'
import {
  Sun, Moon, Plus, Trash2, CheckCircle2, Circle,
  ChevronDown, ChevronUp, AlertTriangle, Clock,
  Send, Edit2, X, Save, ClipboardList,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'

// ─── Helpers ──────────────────────────────────────────────────────
const today    = () => new Date().toISOString().split('T')[0]
const fmtDate  = d => !d ? '—' : new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
const fmtTime  = d => !d ? '—' : new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

function getSession() {
  try { return JSON.parse(localStorage.getItem('coisapet_session') || '{}') } catch { return {} }
}

const TURNOS = {
  dia:   { label: 'Turno Dia',   icon: Sun,  color: 'text-amber-500',  bg: 'bg-amber-50',  border: 'border-amber-200', badgeBg: 'bg-amber-100',  badgeText: 'text-amber-700'  },
  noite: { label: 'Turno Noite', icon: Moon, color: 'text-indigo-500', bg: 'bg-indigo-50', border: 'border-indigo-200', badgeBg: 'bg-indigo-100', badgeText: 'text-indigo-700' },
}

const DESTINO = { dia: 'noite', noite: 'dia' }

// ─── Badge de turno ────────────────────────────────────────────────
function TurnoBadge({ turno, size = 'sm' }) {
  const t = TURNOS[turno]
  if (!t) return null
  const Icon = t.icon
  const sz = size === 'sm' ? 11 : 14
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${t.badgeBg} ${t.badgeText}`}>
      <Icon size={sz} /> {t.label}
    </span>
  )
}

// ─── Item da passagem ──────────────────────────────────────────────
function ItemInput({ item, onChange, onRemove }) {
  return (
    <div className="flex items-center gap-2">
      {/* Prioridade */}
      <button
        type="button"
        onClick={() => onChange({ ...item, priority: item.priority === 'urgente' ? 'normal' : 'urgente' })}
        className={`shrink-0 p-1.5 rounded-lg transition-all ${
          item.priority === 'urgente'
            ? 'bg-rose-100 text-rose-500'
            : 'bg-slate-100 text-slate-400 hover:bg-amber-50 hover:text-amber-500'
        }`}
        title={item.priority === 'urgente' ? 'Urgente — clique para normalizar' : 'Normal — clique para urgente'}
      >
        <AlertTriangle size={13} />
      </button>

      <input
        className="input flex-1 text-sm"
        placeholder="Descreva a tarefa ou recado..."
        value={item.text}
        onChange={e => onChange({ ...item, text: e.target.value })}
      />

      <button onClick={onRemove} className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors shrink-0">
        <X size={14} />
      </button>
    </div>
  )
}

// ─── Formulário de nova passagem ───────────────────────────────────
function NovaPassagemForm({ onSave, loadingInit }) {
  const [turno,  setTurno]  = useState('dia')
  const [notes,  setNotes]  = useState('')
  const [items,  setItems]  = useState([{ text: '', priority: 'normal' }])
  const [saving, setSaving] = useState(false)

  function addItem()          { setItems(p => [...p, { text: '', priority: 'normal' }]) }
  function updateItem(i, val) { setItems(p => p.map((it, x) => x === i ? val : it)) }
  function removeItem(i)      { setItems(p => p.length === 1 ? [{ text: '', priority: 'normal' }] : p.filter((_, x) => x !== i)) }

  const validItems = items.filter(it => it.text.trim())
  const destino    = DESTINO[turno]
  const tDest      = TURNOS[destino]

  async function handleSave() {
    if (validItems.length === 0) { toast.error('Adicione pelo menos uma tarefa.'); return }
    setSaving(true)
    try { await onSave({ turno, destino, notes, items: validItems }) }
    catch {}
    finally { setSaving(false) }
  }

  return (
    <div className="card flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <ClipboardList size={16} className="text-slate-400" />
        <span className="font-bold text-slate-700">Nova passagem de turno</span>
      </div>

      {/* Quem está saindo */}
      <div>
        <label className="form-label">Turno que está saindo</label>
        <div className="flex gap-3">
          {Object.entries(TURNOS).map(([key, t]) => {
            const Icon = t.icon
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTurno(key)}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border-2 font-semibold text-sm transition-all ${
                  turno === key
                    ? `${t.border} ${t.bg} ${t.color}`
                    : 'border-slate-200 text-slate-400 hover:border-slate-300 bg-white'
                }`}
              >
                <Icon size={16} /> {t.label}
              </button>
            )
          })}
        </div>
        {/* Destino visual */}
        <div className={`mt-2 flex items-center gap-2 px-3 py-2 rounded-xl ${tDest.bg} ${tDest.border} border`}>
          <tDest.icon size={13} className={tDest.color} />
          <p className={`text-xs font-semibold ${tDest.color}`}>
            Essa passagem será exibida para o <strong>{tDest.label}</strong>
          </p>
        </div>
      </div>

      {/* Itens / tarefas */}
      <div>
        <label className="form-label">Tarefas e recados</label>
        <div className="flex flex-col gap-2 mb-2">
          {items.map((item, i) => (
            <ItemInput key={i} item={item} onChange={v => updateItem(i, v)} onRemove={() => removeItem(i)} />
          ))}
        </div>
        <button onClick={addItem}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 hover:border-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all text-sm font-semibold">
          <Plus size={14} /> Adicionar item
        </button>
        <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1">
          <AlertTriangle size={10} className="text-rose-400" /> Clique no ícone de alerta para marcar como urgente
        </p>
      </div>

      {/* Observações gerais */}
      <div>
        <label className="form-label">Observações gerais (opcional)</label>
        <textarea className="textarea" rows={2} placeholder="Situação geral do turno, ocorrências, recados extras..."
          value={notes} onChange={e => setNotes(e.target.value)} />
      </div>

      <button onClick={handleSave} disabled={saving || validItems.length === 0}
        className="btn-primary w-full py-3 disabled:opacity-50">
        {saving
          ? <div className="flex items-center gap-2 justify-center"><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Enviando...</div>
          : <div className="flex items-center gap-2 justify-center"><Send size={15} /> Enviar passagem para o {tDest.label}</div>
        }
      </button>
    </div>
  )
}

// ─── Card de passagem (histórico / recebida) ───────────────────────
function PassagemCard({ passagem, onToggleItem, onDelete, onEdit, canDelete }) {
  const [expanded,   setExpanded]   = useState(true)
  const [delConfirm, setDelConfirm] = useState(false)
  const [editing,    setEditing]    = useState(false)
  const [editNotes,  setEditNotes]  = useState(passagem.notes || '')
  const [editItems,  setEditItems]  = useState(passagem.items ?? [])
  const [saving,     setSaving]     = useState(false)

  async function handleEditSave() {
    const validItems = editItems.filter(it => it.text?.trim())
    if (!validItems.length) { toast.error('Adicione pelo menos um item.'); return }
    setSaving(true)
    try {
      await onEdit(passagem.id, { notes: editNotes || null, items: validItems })
      setEditing(false)
    } catch {}
    finally { setSaving(false) }
  }

  function addEditItem()          { setEditItems(p => [...p, { text: '', priority: 'normal', done: false }]) }
  function updateEditItem(i, val) { setEditItems(p => p.map((it, x) => x === i ? val : it)) }
  function removeEditItem(i)      { setEditItems(p => p.length === 1 ? p : p.filter((_, x) => x !== i)) }

  const tOrigem = TURNOS[passagem.turno]
  const tDest   = TURNOS[passagem.destino]
  const items   = passagem.items ?? []
  const done    = items.filter(it => it.done).length
  const total   = items.length
  const allDone = done === total && total > 0
  const hasUrgent = items.some(it => it.priority === 'urgente' && !it.done)

  return (
    <div className={`rounded-2xl border overflow-hidden transition-all ${
      allDone ? 'border-emerald-200 bg-emerald-50/20'
      : hasUrgent ? 'border-rose-200 bg-rose-50/10'
      : 'border-slate-200 bg-white'
    }`}>
      {/* Header */}
      <div className="flex items-start gap-3 p-4 cursor-pointer" onClick={() => setExpanded(e => !e)}>
        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${tOrigem?.bg ?? 'bg-slate-100'}`}>
          {tOrigem && <tOrigem.icon size={18} className={tOrigem.color} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <TurnoBadge turno={passagem.turno} />
            <span className="text-slate-400 text-xs">→</span>
            <TurnoBadge turno={passagem.destino} />
            {hasUrgent && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-600">
                <AlertTriangle size={9} /> Urgente
              </span>
            )}
            {allDone && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                <CheckCircle2 size={9} /> Concluído
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {fmtDate(passagem.date)} · {fmtTime(passagem.created_at)}
            {' · '}{done}/{total} itens
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {canDelete && !editing && (
            <button onClick={e => { e.stopPropagation(); setEditing(true); setExpanded(true) }}
              className="p-1.5 rounded-xl hover:bg-sky-50 text-slate-300 hover:text-sky-500 transition-colors"
              title="Editar passagem">
              <Edit2 size={13} />
            </button>
          )}
          {canDelete && !editing && (
            <button onClick={e => { e.stopPropagation(); setDelConfirm(true) }}
              className="p-1.5 rounded-xl hover:bg-rose-50 text-slate-300 hover:text-rose-500 transition-colors">
              <Trash2 size={13} />
            </button>
          )}
          {!editing && (expanded ? <ChevronUp size={15} className="text-slate-400" /> : <ChevronDown size={15} className="text-slate-400" />)}
        </div>
      </div>

      {/* MODO EDIÇÃO */}
      {editing && (
        <div className="px-4 pb-4 flex flex-col gap-3 border-t border-sky-100 pt-3 bg-sky-50/30">
          <p className="text-xs font-bold text-sky-600 uppercase tracking-wide flex items-center gap-1">
            <Edit2 size={11}/> Editando passagem
          </p>

          {/* Itens editáveis */}
          <div className="flex flex-col gap-2">
            {editItems.map((item, i) => (
              <ItemInput key={i} item={item} onChange={v => updateEditItem(i, v)} onRemove={() => removeEditItem(i)} />
            ))}
          </div>
          <button onClick={addEditItem}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-2xl border-2 border-dashed border-sky-200 text-sky-400 hover:border-sky-400 hover:text-sky-600 hover:bg-sky-50 transition-all text-sm font-semibold">
            <Plus size={13}/> Adicionar item
          </button>

          {/* Observações */}
          <div>
            <label className="form-label">Observações gerais</label>
            <textarea className="textarea" rows={2} value={editNotes} onChange={e => setEditNotes(e.target.value)}
              placeholder="Situação geral do turno..." />
          </div>

          {/* Ações */}
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)}
              className="btn-secondary flex-1">
              Cancelar
            </button>
            <button onClick={handleEditSave} disabled={saving}
              className="btn-primary flex-1">
              {saving
                ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto"/>
                : <><Save size={14}/> Salvar alterações</>
              }
            </button>
          </div>
        </div>
      )}

      {/* MODO VISUALIZAÇÃO */}
      {!editing && expanded && (
        <div className="px-4 pb-4 flex flex-col gap-2 border-t border-slate-100 pt-3">
          {items.map((item, i) => (
            <div key={i}
              onClick={() => onToggleItem(passagem.id, i, !item.done)}
              className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all select-none ${
                item.done
                  ? 'bg-emerald-50 border border-emerald-200 opacity-70'
                  : item.priority === 'urgente'
                    ? 'bg-rose-50 border border-rose-200 hover:bg-rose-100/60'
                    : 'bg-slate-50 border border-slate-100 hover:bg-slate-100'
              }`}>
              {item.done
                ? <CheckCircle2 size={17} className="text-emerald-500 shrink-0" />
                : <Circle       size={17} className={`shrink-0 ${item.priority === 'urgente' ? 'text-rose-400' : 'text-slate-300'}`} />
              }
              {item.priority === 'urgente' && !item.done && (
                <AlertTriangle size={13} className="text-rose-400 shrink-0" />
              )}
              <span className={`text-sm flex-1 ${item.done ? 'line-through text-slate-400' : item.priority === 'urgente' ? 'font-bold text-rose-700' : 'font-semibold text-slate-700'}`}>
                {item.text}
              </span>
            </div>
          ))}

          {passagem.notes && (
            <div className="mt-1 px-3 py-2.5 bg-slate-50 rounded-xl border border-slate-100">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Observações</p>
              <p className="text-sm text-slate-600 whitespace-pre-line">{passagem.notes}</p>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={delConfirm}
        onClose={() => setDelConfirm(false)}
        onConfirm={() => { onDelete(passagem.id); setDelConfirm(false) }}
        title="Excluir passagem?"
        description="Esta passagem de turno será removida permanentemente."
        confirmLabel="Excluir"
      />
    </div>
  )
}

// ─── Página principal ──────────────────────────────────────────────
export function PassagemTurnoPage() {
  const [passagens, setPassagens] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [view,      setView]      = useState('hoje') // 'hoje' | 'historico'
  const [turnoFiltro, setTurnoFiltro] = useState('') // '' | 'dia' | 'noite'

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('shift_handovers')
      .select('*')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(60)
    if (!error) setPassagens(data ?? [])
    setLoading(false)
  }

  async function handleSave({ turno, destino, notes, items }) {
    const { id: uid } = getSession()
    const { error } = await supabase.from('shift_handovers').insert({
      date:       today(),
      turno,
      destino,
      notes:      notes || null,
      items:      items.map(it => ({ ...it, done: false })),
      created_by: uid || null,
    })
    if (error) { toast.error('Erro ao salvar: ' + error.message); throw error }
    toast.success('Passagem enviada!')
    load()
  }

  async function handleToggleItem(id, itemIndex, done) {
    const passagem = passagens.find(p => p.id === id)
    if (!passagem) return
    const newItems = passagem.items.map((it, i) => i === itemIndex ? { ...it, done } : it)
    const { error } = await supabase.from('shift_handovers').update({ items: newItems }).eq('id', id)
    if (error) { toast.error('Erro ao atualizar.'); return }
    setPassagens(prev => prev.map(p => p.id === id ? { ...p, items: newItems } : p))
  }

  async function handleEdit(id, payload) {
    const { error } = await supabase.from('shift_handovers')
      .update({ notes: payload.notes, items: payload.items })
      .eq('id', id)
    if (error) { toast.error('Erro ao editar: ' + error.message); throw error }
    toast.success('Passagem atualizada!')
    load()
  }

  async function handleDelete(id) {
    const { error } = await supabase.from('shift_handovers').delete().eq('id', id)
    if (error) { toast.error('Erro ao excluir.'); return }
    toast.success('Passagem excluída.')
    load()
  }

  // Separa passagens de hoje e histórico
  const todayStr = today()
  const hoje     = passagens.filter(p => p.date === todayStr)
  const historico = passagens.filter(p => p.date !== todayStr)

  const filteredHoje = turnoFiltro
    ? hoje.filter(p => p.destino === turnoFiltro)
    : hoje

  const filteredHistorico = turnoFiltro
    ? historico.filter(p => p.destino === turnoFiltro)
    : historico

  const pendentesHoje = hoje.flatMap(p => p.items ?? []).filter(it => !it.done).length

  return (
    <div className="flex flex-col gap-6 animate-fade-in">

      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Passagem de Turno</h2>
          <p className="page-subtitle">
            {pendentesHoje > 0
              ? `${pendentesHoje} tarefa(s) pendente(s) hoje`
              : 'Todas as tarefas de hoje concluídas'
            }
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.1fr] gap-6 items-start">

        {/* ── Formulário ─────────────────────────────────────────── */}
        <NovaPassagemForm onSave={handleSave} />

        {/* ── Lista de passagens ──────────────────────────────────── */}
        <div className="flex flex-col gap-4">

          {/* Tabs hoje / histórico + filtro turno */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1 bg-slate-100 p-1 rounded-2xl">
              <button onClick={() => setView('hoje')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${view === 'hoje' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                <Clock size={12} /> Hoje
                {hoje.length > 0 && <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${pendentesHoje > 0 ? 'bg-rose-400 text-white' : 'bg-emerald-400 text-white'}`}>{hoje.length}</span>}
              </button>
              <button onClick={() => setView('historico')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${view === 'historico' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                <ClipboardList size={12} /> Histórico
              </button>
            </div>

            {/* Filtro por turno destino */}
            <div className="flex gap-1 ml-auto">
              {['', 'dia', 'noite'].map(t => (
                <button key={t} onClick={() => setTurnoFiltro(t)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    turnoFiltro === t
                      ? 'bg-slate-800 text-white border-slate-800'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                  }`}>
                  {t === '' ? 'Todos' : t === 'dia' ? '☀️ Dia' : '🌙 Noite'}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="card flex justify-center py-10">
              <div className="w-6 h-6 rounded-full border-4 border-rose-100 border-t-rose-400 animate-spin" />
            </div>
          ) : view === 'hoje' ? (
            filteredHoje.length === 0 ? (
              <div className="card text-center py-12">
                <ClipboardList size={28} className="mx-auto mb-2 text-slate-200" />
                <p className="font-semibold text-slate-500 text-sm">Nenhuma passagem hoje</p>
                <p className="text-xs text-slate-400 mt-1">Use o formulário para criar a primeira passagem do dia</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {filteredHoje.map(p => (
                  <PassagemCard key={p.id} passagem={p}
                    onToggleItem={handleToggleItem}
                    onDelete={handleDelete}
                    onEdit={handleEdit}
                    canDelete={true} />
                ))}
              </div>
            )
          ) : (
            filteredHistorico.length === 0 ? (
              <div className="card text-center py-12">
                <ClipboardList size={28} className="mx-auto mb-2 text-slate-200" />
                <p className="font-semibold text-slate-500 text-sm">Sem histórico ainda</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {/* Agrupa por data */}
                {Object.entries(
                  filteredHistorico.reduce((acc, p) => {
                    if (!acc[p.date]) acc[p.date] = []
                    acc[p.date].push(p)
                    return acc
                  }, {})
                ).map(([date, list]) => (
                  <div key={date}>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2 capitalize">{fmtDate(date)}</p>
                    <div className="flex flex-col gap-2">
                      {list.map(p => (
                        <PassagemCard key={p.id} passagem={p}
                          onToggleItem={handleToggleItem}
                          onDelete={handleDelete}
                          onEdit={handleEdit}
                          canDelete={true} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}