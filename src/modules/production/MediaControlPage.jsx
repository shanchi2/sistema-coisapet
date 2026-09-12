import { useEffect, useMemo, useState } from 'react'
import { Film, Search, Package, Plus, MessageSquare, StickyNote } from 'lucide-react'
import { useProductMediaStatus } from './hooks/useProductMediaStatus'
import { useSignedUrl } from '../../lib/signedUrlCache'
import { Modal } from '../../components/ui/Modal'

const STATUS_OPTIONS = [
  ['nao_iniciada', 'Não iniciada'],
  ['em_producao', 'Em produção'],
  ['atualizada', 'Atualizada'],
  ['refazer', 'Refazer'],
]
const OVERALL_OPTIONS = [
  ['pendente', 'Pendente'],
  ['em_andamento', 'Em andamento'],
  ['concluido', 'Concluído'],
  ['refazer', 'Refazer'],
]
// Mesma paleta de cor pra vídeo/foto/status geral, mesmo os dois
// primeiros tendo rótulos diferentes do terceiro — a posição na lista
// (nao_iniciada/em_producao/atualizada/refazer ~ pendente/em_andamento/
// concluido/refazer) já indica a mesma "temperatura".
const STATUS_COLOR = {
  nao_iniciada: 'bg-slate-100 text-slate-600',
  em_producao:  'bg-amber-100 text-amber-700',
  atualizada:   'bg-emerald-100 text-emerald-700',
  refazer:      'bg-rose-100 text-rose-700',
  pendente:     'bg-slate-100 text-slate-600',
  em_andamento: 'bg-amber-100 text-amber-700',
  concluido:    'bg-emerald-100 text-emerald-700',
}

function fmtDateTime(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function StatusSelect({ value, options, onChange }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className={`text-xs font-semibold rounded-lg px-2 py-1.5 border-0 outline-none cursor-pointer ${STATUS_COLOR[value] || 'bg-slate-100 text-slate-600'}`}>
      {options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
    </select>
  )
}

function ProductThumb({ photoUrl }) {
  const url = useSignedUrl('product-photos', photoUrl)
  if (!url) return <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0"><Package size={13} className="text-slate-300" /></div>
  return <img src={url} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
}

// Botão compacto pra célula de tabela — some no "vazio" (só um "+"
// discreto, pra não poluir a tela inteira de botão em produto que
// nunca teve feedback/observação) e vira um selo colorido clicável
// assim que existe conteúdo. Evita 2 colunas largas de texto (o motivo
// real do scroll horizontal antes).
function CellButton({ has, label, icon: Icon, tone, onClick, title }) {
  if (!has) {
    return (
      <button onClick={onClick} title={title}
        className="p-1.5 rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-colors">
        <Plus size={14} />
      </button>
    )
  }
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg transition-colors ${tone}`}>
      <Icon size={11} /> {label}
    </button>
  )
}

function FeedbackModal({ open, onClose, row, onSave }) {
  const [value, setValue] = useState(null)
  const [details, setDetails] = useState('')
  useEffect(() => {
    if (!open) return
    setValue(row?.feedback_montagem ?? null)
    setDetails(row?.feedback_details || '')
  }, [open, row])

  return (
    <Modal open={open} onClose={onClose} size="sm" title="Feedback de montagem" subtitle={row?.name}
      footer={<>
        <button onClick={onClose} className="btn-secondary">Cancelar</button>
        <button onClick={() => onSave(value, details)} className="btn-primary">Salvar</button>
      </>}>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Teve feedback de montagem?</label>
          <div className="flex gap-1.5">
            {[[true, 'Sim'], [false, 'Não'], [null, 'Sem info']].map(([v, l]) => (
              <button key={String(v)} type="button" onClick={() => setValue(v)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${value === v ? 'bg-violet-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Detalhes</label>
          <textarea value={details} onChange={e => setDetails(e.target.value)} rows={4}
            className="input" placeholder="O que foi observado na montagem..." />
        </div>
      </div>
    </Modal>
  )
}

function NoteModal({ open, onClose, row, onSave }) {
  const [value, setValue] = useState('')
  useEffect(() => { if (open) setValue(row?.observations || '') }, [open, row])

  return (
    <Modal open={open} onClose={onClose} size="sm" title="Observações" subtitle={row?.name}
      footer={<>
        <button onClick={onClose} className="btn-secondary">Cancelar</button>
        <button onClick={() => onSave(value)} className="btn-primary">Salvar</button>
      </>}>
      <textarea value={value} onChange={e => setValue(e.target.value)} rows={5}
        className="input" placeholder="Escreva aqui..." autoFocus />
    </Modal>
  )
}

export function MediaControlPage() {
  const { rows, loading, updateField } = useProductMediaStatus()
  const [search, setSearch] = useState('')
  const [feedbackRow, setFeedbackRow] = useState(null)
  const [noteRow, setNoteRow] = useState(null)

  const filtered = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.toLowerCase()
    return rows.filter(r => r.name.toLowerCase().includes(q) || r.sku?.toLowerCase().includes(q))
  }, [rows, search])

  const totals = useMemo(() => ({
    total: rows.length,
    videos: rows.filter(r => r.video_status === 'atualizada').length,
    fotos: rows.filter(r => r.photo_status === 'atualizada').length,
    feedback: rows.filter(r => r.feedback_montagem === true).length,
  }), [rows])

  function saveFeedback(value, details) {
    updateField(feedbackRow.id, { feedback_montagem: value, feedback_details: details.trim() || null })
    setFeedbackRow(null)
  }
  function saveNote(value) {
    updateField(noteRow.id, { observations: value.trim() || null })
    setNoteRow(null)
  }

  return (
    <div className="p-6 max-w-[1300px] mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3.5 mb-6">
        <div className="w-11 h-11 bg-gradient-to-br from-violet-500 to-violet-600 rounded-2xl flex items-center justify-center shrink-0 shadow-sm shadow-violet-200">
          <Film size={22} strokeWidth={1.5} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Controle de Atualização dos Produtos</h1>
          <p className="text-sm text-slate-500">Vídeo, foto e feedback de montagem por produto</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <p className="text-[11px] text-slate-400 font-semibold uppercase">Produtos cadastrados</p>
          <p className="text-2xl font-black text-slate-800">{totals.total}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <p className="text-[11px] text-slate-400 font-semibold uppercase">Vídeos atualizados</p>
          <p className="text-2xl font-black text-slate-800">{totals.videos}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <p className="text-[11px] text-slate-400 font-semibold uppercase">Fotos atualizadas</p>
          <p className="text-2xl font-black text-slate-800">{totals.fotos}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <p className="text-[11px] text-slate-400 font-semibold uppercase">Com feedback</p>
          <p className="text-2xl font-black text-slate-800">{totals.feedback}</p>
        </div>
      </div>

      {/* Busca */}
      <div className="relative mb-4 max-w-md">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className="input pl-8" placeholder="Buscar por produto ou SKU..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto max-h-[70vh]">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-slate-50 z-10">
                <tr>
                  {['Produto', 'Vídeo', 'Foto', 'Previsão do vídeo', 'Última atualização', 'Feedback', 'Observações', 'Status geral'].map(h => (
                    <th key={h} className="text-[11px] font-bold text-slate-500 uppercase px-3 py-2.5 border-b border-slate-200 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2 min-w-[200px]">
                        <ProductThumb photoUrl={r.photo_url} />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-700 line-clamp-1">{r.name}</p>
                          {r.sku && <p className="text-[10px] text-slate-400 font-mono">{r.sku}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <StatusSelect value={r.video_status} options={STATUS_OPTIONS} onChange={v => updateField(r.id, { video_status: v })} />
                    </td>
                    <td className="px-3 py-2">
                      <StatusSelect value={r.photo_status} options={STATUS_OPTIONS} onChange={v => updateField(r.id, { photo_status: v })} />
                    </td>
                    <td className="px-3 py-2">
                      <input type="date" value={r.video_forecast || ''} onChange={e => updateField(r.id, { video_forecast: e.target.value || null })}
                        className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-rose-300" />
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-400 whitespace-nowrap">{fmtDateTime(r.updated_at)}</td>
                    <td className="px-3 py-2">
                      <CellButton
                        has={r.feedback_montagem !== null}
                        label={r.feedback_montagem ? 'Sim' : 'Não'}
                        icon={MessageSquare}
                        tone={r.feedback_montagem ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}
                        title="Registrar feedback de montagem"
                        onClick={() => setFeedbackRow(r)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <CellButton
                        has={!!r.observations?.trim()}
                        label="Ver"
                        icon={StickyNote}
                        tone="bg-amber-100 text-amber-700 hover:bg-amber-200"
                        title="Adicionar observação"
                        onClick={() => setNoteRow(r)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <StatusSelect value={r.overall_status} options={OVERALL_OPTIONS} onChange={v => updateField(r.id, { overall_status: v })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <FeedbackModal open={!!feedbackRow} onClose={() => setFeedbackRow(null)} row={feedbackRow} onSave={saveFeedback} />
      <NoteModal open={!!noteRow} onClose={() => setNoteRow(null)} row={noteRow} onSave={saveNote} />
    </div>
  )
}
