import { useState, useEffect, useMemo, useRef } from 'react'
import {
  PackageMinus, Plus, Trash2, Edit2, CheckCircle2, ChevronDown,
  ChevronUp, Calendar, Clock, Search, AlertTriangle, X, Save,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'

// ─── Helpers ──────────────────────────────────────────────────────
const today    = () => new Date().toISOString().split('T')[0]
const fmtDate  = d => !d ? '—' : new Date(d+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'short',year:'numeric'})
const fmtQty   = (v,u) => `${Number(v).toLocaleString('pt-BR')} ${u??''}`

function getSession(){
  try{ return JSON.parse(localStorage.getItem('coisapet_session')||'{}') }catch{ return {} }
}

// ─── Linha de item da baixa ────────────────────────────────────────
function ItemRow({ item, materials, onChange, onRemove }){
  const mat = materials.find(m => m.id === item.raw_material_id)
  const [search, setSearch] = useState('')
  const [open,   setOpen]   = useState(false)
  const wrapRef = useRef()

  // Fecha ao clicar fora do componente
  useEffect(()=>{
    if(!open) return
    function handler(e){
      if(wrapRef.current && !wrapRef.current.contains(e.target)){
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const filtered = useMemo(()=>{
    if(!search.trim()) return materials
    return materials.filter(m =>
      m.name.toLowerCase().includes(search.toLowerCase())
    )
  }, [materials, search])

  function selectMat(m){
    onChange({ ...item, raw_material_id: m.id, unit: m.unit })
    setOpen(false)
    setSearch('')
  }

  const insufficient = mat && parseFloat(item.qty) > Number(mat.stock_qty)

  return(
    <div className={`rounded-2xl border p-4 flex flex-col gap-3 transition-all ${
      insufficient ? 'border-rose-200 bg-rose-50/30' : 'border-slate-200 bg-white'
    }`}>
      <div className="flex items-start gap-3">

        {/* Seletor de matéria prima */}
        <div className="flex-1 min-w-0 relative" ref={wrapRef}>
          {/* Botão de exibição (fechado) */}
          {!open && (
            <button onClick={()=>setOpen(true)}
              className={`w-full text-left flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all ${
                mat
                  ? 'border-slate-200 hover:border-slate-300 bg-white'
                  : 'border-dashed border-slate-300 hover:border-rose-300 hover:bg-rose-50/20'
              }`}>
              {mat ? (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-800 text-sm truncate">{mat.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Estoque: <span className={`font-semibold ${insufficient?'text-rose-500':'text-emerald-600'}`}>{fmtQty(mat.stock_qty, mat.unit)}</span>
                    </p>
                  </div>
                  <ChevronDown size={14} className="text-slate-400 shrink-0"/>
                </>
              ) : (
                <>
                  <Search size={13} className="text-slate-400 shrink-0"/>
                  <span className="text-sm text-slate-400 font-medium">Selecionar matéria prima...</span>
                </>
              )}
            </button>
          )}

          {/* Campo de busca + dropdown (aberto) */}
          {open && (
            <div>
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"/>
                <input
                  autoFocus
                  className="input pl-8 text-sm"
                  placeholder="Buscar matéria prima..."
                  value={search}
                  onChange={e=>setSearch(e.target.value)}
                />
              </div>
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-30 max-h-52 overflow-y-auto">
                {filtered.length === 0
                  ? <p className="text-xs text-slate-400 p-3 text-center">Nenhuma encontrada</p>
                  : filtered.map(m=>(
                    <button key={m.id}
                      onMouseDown={e=>e.preventDefault()}
                      onClick={()=>selectMat(m)}
                      className="w-full text-left flex items-center justify-between px-3 py-2.5 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0">
                      <span className="text-sm font-semibold text-slate-700">{m.name}</span>
                      <span className="text-xs text-slate-400 shrink-0 ml-2">{fmtQty(m.stock_qty, m.unit)}</span>
                    </button>
                  ))
                }
              </div>
            </div>
          )}
        </div>

        {/* Quantidade */}
        <div className="flex items-center gap-2 shrink-0">
          <input
            type="number"
            min="1"
            step="1"
            className={`input w-24 text-center font-bold text-sm ${insufficient?'border-rose-300':''}`}
            placeholder="Qtd"
            value={item.qty || ''}
            onChange={e=>onChange({...item, qty: e.target.value})}
          />
          <span className="text-xs text-slate-400 w-8 shrink-0">{mat?.unit ?? ''}</span>
        </div>

        <button onClick={onRemove}
          className="p-1.5 rounded-xl text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors shrink-0 mt-0.5">
          <X size={15}/>
        </button>
      </div>

      {insufficient && (
        <div className="flex items-center gap-1.5 text-xs text-rose-500 font-semibold">
          <AlertTriangle size={11}/>
          Quantidade maior que o estoque disponível ({fmtQty(mat.stock_qty, mat.unit)})
        </div>
      )}
    </div>
  )
}

// ─── Modal de edição da baixa ─────────────────────────────────────
function EditWithdrawalModal({ withdrawal, materials, open, onClose, onSave }){
  const [date,  setDate]  = useState(withdrawal.date)
  const [notes, setNotes] = useState(withdrawal.notes||'')
  const [items, setItems] = useState(
    (withdrawal.items||[]).map(it=>({
      raw_material_id: it.raw_material_id,
      qty: String(it.quantity),
      unit: materials.find(m=>m.id===it.raw_material_id)?.unit||''
    }))
  )
  const [saving, setSaving] = useState(false)

  if(!open) return null

  function addItem(){ setItems(p=>[...p,{raw_material_id:'',qty:'',unit:''}]) }
  function updateItem(i,v){ setItems(p=>p.map((it,x)=>x===i?v:it)) }
  function removeItem(i){ setItems(p=>p.length===1?[{raw_material_id:'',qty:'',unit:''}]:p.filter((_,x)=>x!==i)) }

  const validItems = items.filter(it=>it.raw_material_id && parseFloat(it.qty)>0)

  async function handleSave(){
    if(validItems.length===0){ toast.error('Adicione pelo menos um item.'); return }
    setSaving(true)
    try{ await onSave(withdrawal, { date, notes, items: validItems }); onClose() }
    catch(e){ toast.error('Erro ao salvar: '+(e?.message||String(e))) }
    finally{ setSaving(false) }
  }

  return(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl flex flex-col max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="font-bold text-slate-800">Editar baixa</h3>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400"><X size={16}/></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Data</label>
              <input type="date" className="input" value={date} onChange={e=>setDate(e.target.value)} max={today()}/>
            </div>
            <div>
              <label className="form-label">Observação</label>
              <input className="input" placeholder="Opcional" value={notes} onChange={e=>setNotes(e.target.value)}/>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {items.map((item,i)=>(
              <ItemRow key={i} item={item} materials={materials} onChange={v=>updateItem(i,v)} onRemove={()=>removeItem(i)}/>
            ))}
          </div>
          <button onClick={addItem}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 hover:border-rose-300 hover:text-rose-500 hover:bg-rose-50/20 transition-all text-sm font-semibold">
            <Plus size={14}/> Adicionar item
          </button>
        </div>
        <div className="flex gap-2 p-4 border-t border-slate-100">
          <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
          <button onClick={handleSave} disabled={saving||validItems.length===0} className="btn-primary flex-1">
            {saving ? <div className="flex items-center gap-2 justify-center"><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> Salvando...</div> : <><Save size={14}/> Salvar alterações</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Card de histórico ─────────────────────────────────────────────
function HistoryCard({ withdrawal, materials, onEdit, onDelete }){
  const [expanded, setExpanded] = useState(false)
  const total = withdrawal.items?.length ?? 0

  return(
    <div className="card overflow-hidden">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center shrink-0 cursor-pointer" onClick={()=>setExpanded(e=>!e)}>
          <PackageMinus size={17} className="text-slate-500"/>
        </div>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={()=>setExpanded(e=>!e)}>
          <div className="flex items-center gap-2">
            <p className="font-bold text-slate-800 text-sm capitalize">{fmtDate(withdrawal.date)}</p>
            {withdrawal.date === today() && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-600 border border-sky-200">Hoje</span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            {total} {total===1?'item':'itens'} descontados
            {withdrawal.notes && ` · ${withdrawal.notes}`}
          </p>
        </div>
        {/* Ações */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-xs text-slate-400 mr-1">
            {new Date(withdrawal.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}
          </span>
          <button onClick={()=>onEdit(withdrawal)}
            className="p-1.5 rounded-xl hover:bg-sky-50 text-slate-400 hover:text-sky-500 transition-colors" title="Editar">
            <Edit2 size={14}/>
          </button>
          <button onClick={()=>onDelete(withdrawal)}
            className="p-1.5 rounded-xl hover:bg-rose-50 text-slate-400 hover:text-rose-500 transition-colors" title="Excluir">
            <Trash2 size={14}/>
          </button>
          <button onClick={()=>setExpanded(e=>!e)} className="p-1.5 text-slate-400">
            {expanded ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}
          </button>
        </div>
      </div>

      {expanded && withdrawal.items?.length > 0 && (
        <div className="mt-3 border-t border-slate-100 pt-3 flex flex-col gap-1.5">
          {withdrawal.items.map((it, i) => {
            const mat = materials.find(m => m.id === it.raw_material_id)
            return(
              <div key={i} className="flex items-center justify-between py-1.5 px-3 bg-slate-50 rounded-xl">
                <span className="text-sm font-semibold text-slate-700">{mat?.name ?? '—'}</span>
                <span className="text-sm font-bold text-rose-500">− {fmtQty(it.quantity, mat?.unit)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Página principal ──────────────────────────────────────────────
export function BaixaDiariaPage(){
  const [materials,    setMaterials]    = useState([])
  const [withdrawals,  setWithdrawals]  = useState([])
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [date,         setDate]         = useState(today())
  const [notes,        setNotes]        = useState('')
  const [items,        setItems]        = useState([{ raw_material_id:'', qty:'', unit:'' }])
  const [editTarget,   setEditTarget]   = useState(null)   // baixa sendo editada
  const [delTarget,    setDelTarget]    = useState(null)   // baixa sendo excluída
  const [deleting,     setDeleting]     = useState(false)

  useEffect(()=>{ load() },[])

  async function load(){
    setLoading(true)
    const [mR, wR] = await Promise.all([
      supabase.from('raw_materials')
        .select('id,name,unit,stock_qty,stock_min')
        .eq('active', true)
        .order('name'),
      supabase.from('stock_withdrawals')
        .select('*, items:stock_withdrawal_items(raw_material_id, quantity)')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(30),
    ])
    setMaterials(mR.data ?? [])
    setWithdrawals(wR.data ?? [])
    setLoading(false)
  }

  function addItem(){
    setItems(prev => [...prev, { raw_material_id:'', qty:'', unit:'' }])
  }

  function updateItem(i, val){
    setItems(prev => prev.map((it,x) => x===i ? val : it))
  }

  function removeItem(i){
    setItems(prev => prev.length===1 ? [{ raw_material_id:'', qty:'', unit:'' }] : prev.filter((_,x)=>x!==i))
  }

  // Valida antes de salvar
  const validItems = items.filter(it => it.raw_material_id && parseFloat(it.qty) > 0)
  const hasInvalid = items.some(it =>
    it.raw_material_id && parseFloat(it.qty) > 0 &&
    parseFloat(it.qty) > Number(materials.find(m=>m.id===it.raw_material_id)?.stock_qty ?? 0)
  )

  // Exclui baixa e RESTAURA o estoque
  async function handleDelete(){
    if(!delTarget) return
    setDeleting(true)
    try{
      // Restaura estoque de cada item
      await Promise.all((delTarget.items||[]).map(async it=>{
        const mat = materials.find(m=>m.id===it.raw_material_id)
        if(!mat) return
        const restored = Number(mat.stock_qty) + Number(it.quantity)
        await supabase.from('raw_materials').update({ stock_qty: restored }).eq('id', it.raw_material_id)
      }))
      // Deleta o registro (cascade deleta os itens)
      const { error } = await supabase.from('stock_withdrawals').delete().eq('id', delTarget.id)
      if(error) throw error
      toast.success('Baixa excluída e estoque restaurado.')
      setDelTarget(null)
      load()
    } catch(e){
      toast.error('Erro ao excluir: '+(e?.message||String(e)))
    } finally{
      setDeleting(false)
    }
  }

  // Edita baixa: reverte estoque antigo, aplica novo
  async function handleEdit(withdrawal, newData){
    // 1. Reverte estoque dos itens ANTIGOS
    await Promise.all((withdrawal.items||[]).map(async it=>{
      const mat = materials.find(m=>m.id===it.raw_material_id)
      if(!mat) return
      const restored = Number(mat.stock_qty) + Number(it.quantity)
      await supabase.from('raw_materials').update({ stock_qty: restored }).eq('id', it.raw_material_id)
    }))
    // 2. Atualiza cabeçalho
    const { error: we } = await supabase.from('stock_withdrawals')
      .update({ date: newData.date, notes: newData.notes||null })
      .eq('id', withdrawal.id)
    if(we) throw we
    // 3. Substitui itens (delete + insert)
    await supabase.from('stock_withdrawal_items').delete().eq('withdrawal_id', withdrawal.id)
    await supabase.from('stock_withdrawal_items').insert(
      newData.items.map(it=>({
        withdrawal_id:   withdrawal.id,
        raw_material_id: it.raw_material_id,
        quantity:        parseFloat(it.qty),
      }))
    )
    // 4. Aplica novo desconto no estoque
    // Recarrega materiais frescos antes de descontar
    const { data: freshMats } = await supabase.from('raw_materials').select('id,stock_qty').in('id', newData.items.map(i=>i.raw_material_id))
    await Promise.all(newData.items.map(async it=>{
      const mat = (freshMats||[]).find(m=>m.id===it.raw_material_id)
      if(!mat) return
      const novoEstoque = Math.max(0, Number(mat.stock_qty) - parseFloat(it.qty))
      await supabase.from('raw_materials').update({ stock_qty: novoEstoque }).eq('id', it.raw_material_id)
    }))
    toast.success('Baixa atualizada!')
    setEditTarget(null)
    load()
  }

  async function handleSubmit(){
    if(validItems.length === 0){
      toast.error('Adicione pelo menos um item com quantidade válida.')
      return
    }
    if(hasInvalid){
      toast.error('Há itens com quantidade maior que o estoque disponível.')
      return
    }

    setSaving(true)
    const { id: uid } = getSession()

    try{
      // 1. Cria o cabeçalho da baixa
      const { data: wd, error: we } = await supabase
        .from('stock_withdrawals')
        .insert({ date, notes: notes||null })
        .select('id')
        .single()
      if(we) throw we

      // 2. Insere os itens
      const { error: ie } = await supabase
        .from('stock_withdrawal_items')
        .insert(validItems.map(it=>({
          withdrawal_id:    wd.id,
          raw_material_id:  it.raw_material_id,
          quantity:         parseFloat(it.qty),
        })))
      if(ie) throw ie

      // 3. Desconta o estoque de cada item
      await Promise.all(validItems.map(async it => {
        const mat = materials.find(m => m.id === it.raw_material_id)
        if(!mat) return
        const novoEstoque = Math.max(0, Number(mat.stock_qty) - parseFloat(it.qty))
        await supabase
          .from('raw_materials')
          .update({ stock_qty: novoEstoque })
          .eq('id', it.raw_material_id)
      }))

      toast.success(`Baixa registrada! ${validItems.length} item(s) descontado(s) do estoque.`)
      setItems([{ raw_material_id:'', qty:'', unit:'' }])
      setNotes('')
      setDate(today())
      load()
    } catch(e){
      toast.error('Erro ao registrar baixa: ' + (e?.message ?? String(e)))
    } finally {
      setSaving(false)
    }
  }

  // Total de itens válidos para exibição no botão
  const totalItens = validItems.length
  const temIncompleto = items.some(it => !it.raw_material_id || !it.qty)

  return(
    <div className="flex flex-col gap-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Baixa Diária</h2>
          <p className="page-subtitle">Desconto de matéria prima utilizada na produção</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6 items-start">

        {/* ── Formulário de baixa ───────────────────────────────── */}
        <div className="flex flex-col gap-4">
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <PackageMinus size={16} className="text-rose-400"/>
              <span className="font-bold text-slate-700">Nova baixa</span>
            </div>

            {/* Data + observação */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="form-label">Data da baixa</label>
                <input type="date" className="input" value={date}
                  onChange={e=>setDate(e.target.value)} max={today()}/>
              </div>
              <div>
                <label className="form-label">Observação (opcional)</label>
                <input className="input" placeholder="Ex: Produção lote #42"
                  value={notes} onChange={e=>setNotes(e.target.value)}/>
              </div>
            </div>

            {/* Itens */}
            <div className="flex flex-col gap-2 mb-3">
              {items.map((item, i)=>(
                <ItemRow
                  key={i}
                  item={item}
                  materials={materials}
                  onChange={val=>updateItem(i,val)}
                  onRemove={()=>removeItem(i)}
                />
              ))}
            </div>

            {/* Adicionar mais */}
            <button onClick={addItem}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 hover:border-rose-300 hover:text-rose-500 hover:bg-rose-50/20 transition-all text-sm font-semibold">
              <Plus size={15}/> Adicionar outro item
            </button>
          </div>

          {/* Resumo + botão submit */}
          {totalItens > 0 && (
            <div className="card border-emerald-200 bg-emerald-50/30">
              <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide mb-3">Resumo da baixa</p>
              <div className="flex flex-col gap-1.5 mb-4">
                {validItems.map((it,i)=>{
                  const mat = materials.find(m=>m.id===it.raw_material_id)
                  return(
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-slate-600 font-semibold">{mat?.name}</span>
                      <span className="font-bold text-rose-500">− {fmtQty(it.qty, mat?.unit)}</span>
                    </div>
                  )
                })}
              </div>
              <button
                onClick={handleSubmit}
                disabled={saving || hasInvalid || totalItens===0}
                className="btn-primary w-full py-3 text-sm disabled:opacity-50"
              >
                {saving
                  ? <div className="flex items-center gap-2 justify-center"><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> Registrando...</div>
                  : <div className="flex items-center gap-2 justify-center"><CheckCircle2 size={16}/> Confirmar baixa de {totalItens} {totalItens===1?'item':'itens'}</div>
                }
              </button>
              {hasInvalid && (
                <p className="text-xs text-rose-500 font-semibold text-center mt-2 flex items-center justify-center gap-1">
                  <AlertTriangle size={11}/> Corrija as quantidades acima do estoque antes de confirmar
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Histórico ─────────────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-slate-400"/>
            <span className="text-sm font-bold text-slate-500">Últimas baixas</span>
            {withdrawals.length > 0 && (
              <span className="text-xs text-slate-400 ml-auto">{withdrawals.length} registro(s)</span>
            )}
          </div>

          {loading ? (
            <div className="card flex justify-center py-10">
              <div className="w-6 h-6 rounded-full border-4 border-rose-100 border-t-rose-400 animate-spin"/>
            </div>
          ) : withdrawals.length === 0 ? (
            <div className="card text-center py-10">
              <PackageMinus size={28} className="mx-auto mb-2 text-slate-200"/>
              <p className="text-sm font-semibold text-slate-500">Nenhuma baixa registrada</p>
              <p className="text-xs text-slate-400 mt-1">As baixas confirmadas aparecerão aqui</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {withdrawals.map(w=>(
                <HistoryCard key={w.id} withdrawal={w} materials={materials} onEdit={setEditTarget} onDelete={setDelTarget}/>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal de edição */}
      {editTarget && (
        <EditWithdrawalModal
          withdrawal={editTarget}
          materials={materials}
          open={true}
          onClose={()=>setEditTarget(null)}
          onSave={handleEdit}
        />
      )}

      {/* Confirm delete */}
      <ConfirmDialog
        open={!!delTarget}
        onClose={()=>setDelTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Excluir esta baixa?"
        description="O estoque de todas as matérias primas desta baixa será restaurado automaticamente. Esta ação não pode ser desfeita."
        confirmLabel="Excluir e restaurar estoque"
      />
    </div>
  )
}
