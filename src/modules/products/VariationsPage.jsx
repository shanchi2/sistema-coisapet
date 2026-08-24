import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import {
  Layers, Search, ChevronDown, ChevronRight, Plus, X,
  Pencil, Check, AlertCircle, Link2, Unlink, Tag,
  Package, Palette, Ruler, Weight, Droplets, LayoutGrid,
  ArrowRight, Save, Loader2,
} from 'lucide-react'
import toast from 'react-hot-toast'

// ─── Ícones por tipo de variação ──────────────────────────────────────────────
const TYPE_ICONS = {
  'Cor':     { icon: Palette,    color: 'text-pink-500',   bg: 'bg-pink-50',   border: 'border-pink-200' },
  'Tamanho': { icon: LayoutGrid, color: 'text-blue-500',   bg: 'bg-blue-50',   border: 'border-blue-200' },
  'Peso':    { icon: Weight,     color: 'text-amber-500',  bg: 'bg-amber-50',  border: 'border-amber-200' },
  'Líquido': { icon: Droplets,   color: 'text-cyan-500',   bg: 'bg-cyan-50',   border: 'border-cyan-200' },
  'Medida':  { icon: Ruler,      color: 'text-violet-500', bg: 'bg-violet-50', border: 'border-violet-200' },
}

// ─── Badge de variação ────────────────────────────────────────────────────────
function VarBadge({ tipo, valor }) {
  const cfg = TYPE_ICONS[tipo] || { icon: Tag, color: 'text-gray-500', bg: 'bg-gray-50', border: 'border-gray-200' }
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.border} ${cfg.color}`}>
      <Icon size={10} strokeWidth={2} />
      {valor}
    </span>
  )
}

// ─── Modal de agrupamento ─────────────────────────────────────────────────────
// Permite selecionar N produtos e definir qual é o "pai" (mestre do grupo)
function GroupModal({ products, selectedIds, onClose, onSave }) {
  const selected = products.filter(p => selectedIds.has(p.id))
  const [masterId, setMasterId] = useState(selected[0]?.id || '')
  const [saving, setSaving]     = useState(false)

  // Extrai o código base do SKU (tudo antes do último segmento de variação)
  // Ex: TER-60-S-AMD → TER-60-S
  function getBaseSku(sku) {
    const parts = sku.split('-')
    // Remove o último segmento se for variação conhecida (cor, tam, peso)
    return parts.slice(0, -1).join('-') || sku
  }

  async function handleSave() {
    setSaving(true)
    try {
      // Todos os produtos selecionados (menos o mestre) apontam para o mestre
      const childIds = selected.filter(p => p.id !== masterId).map(p => p.id)

      if (childIds.length === 0) {
        toast.error('Selecione pelo menos 2 produtos para agrupar.')
        return
      }

      const { error } = await supabase
        .from('products')
        .update({ parent_product_id: masterId })
        .in('id', childIds)

      if (error) throw error

      // O mestre não tem parent (é raiz)
      await supabase
        .from('products')
        .update({ parent_product_id: null })
        .eq('id', masterId)

      toast.success(`${selected.length} produtos agrupados!`)
      onSave()
      onClose()
    } catch (err) {
      toast.error('Erro ao agrupar produtos.')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <Link2 size={18} strokeWidth={1.5} className="text-violet-500" />
            <div>
              <h3 className="font-semibold text-gray-800">Agrupar como variações</h3>
              <p className="text-xs text-gray-400 mt-0.5">{selected.length} produtos selecionados</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Explicação */}
          <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 text-sm text-violet-800">
            <p className="font-semibold mb-1">Como funciona o agrupamento?</p>
            <p className="text-xs leading-relaxed">
              Escolha um produto como <strong>mestre</strong> — ele representa o produto base (ex: Terrário 60cm).
              Os outros produtos do grupo são as <strong>variações</strong> dele (ex: cores diferentes).
              No catálogo, aparecerá como um único produto com opções de variação.
            </p>
          </div>

          {/* Escolha do mestre */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-3">
              Escolha o produto mestre
            </label>
            <div className="space-y-2">
              {selected.map(p => {
                const isMaster = p.id === masterId
                const variacoes = p.variations || []
                return (
                  <button
                    key={p.id}
                    onClick={() => setMasterId(p.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                      isMaster
                        ? 'border-violet-400 bg-violet-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      isMaster ? 'border-violet-500 bg-violet-500' : 'border-gray-300'
                    }`}>
                      {isMaster && <Check size={11} className="text-white" strokeWidth={3} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-gray-700">{p.sku}</span>
                        {isMaster && (
                          <span className="text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded font-semibold">
                            MESTRE
                          </span>
                        )}
                        {!isMaster && (
                          <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                            variação
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 truncate mt-0.5">{p.name}</p>
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {variacoes.map(v => (
                          <VarBadge key={v.option_id} tipo={v.type_name} valor={v.value} />
                        ))}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Preview do agrupamento */}
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Preview do grupo</p>
            <div className="flex items-center gap-2 text-sm">
              <span className="font-mono font-bold text-gray-800">
                {getBaseSku(selected.find(p => p.id === masterId)?.sku || '')}
              </span>
              <ArrowRight size={14} className="text-gray-400" />
              <div className="flex gap-1 flex-wrap">
                {selected.map(p => (
                  <span key={p.id} className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                    p.id === masterId ? 'bg-violet-100 text-violet-700 font-bold' : 'bg-gray-200 text-gray-600'
                  }`}>
                    {p.sku.split('-').slice(-1)[0]}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 pb-5">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !masterId}
            className="flex-1 py-2.5 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
            Agrupar {selected.length} produtos
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal de edição de variações ─────────────────────────────────────────────
function EditVariationsModal({ product, allTypes, onClose, onSave }) {
  const [variation,  setVariation]  = useState(product.variations || [])
  const [saving,     setSaving]     = useState(false)
  const [options,    setOptions]    = useState({}) // type_id → [options]

  // Estados para adicionar nova opção inline
  const [addingTo,   setAddingTo]   = useState(null)  // type_id que está com input aberto
  const [newValue,   setNewValue]   = useState('')     // texto digitado
  const [addingSave, setAddingSave] = useState(false)  // loading do save da nova opção

  useEffect(() => {
    loadOptions()
  }, [])

  async function loadOptions() {
    const { data } = await supabase
      .from('product_variation_options')
      .select('id, value, type_id')
      .order('value')
    if (data) {
      const grouped = {}
      for (const o of data) {
        if (!grouped[o.type_id]) grouped[o.type_id] = []
        grouped[o.type_id].push(o)
      }
      setOptions(grouped)
    }
  }

  // Abre o input inline de uma categoria, fecha o anterior se houver
  function openAddInput(typeId) {
    setAddingTo(typeId)
    setNewValue('')
  }

  function cancelAdd() {
    setAddingTo(null)
    setNewValue('')
  }

  // Salva a nova opção no banco e atualiza a lista local
  async function handleAddOption(type) {
    const val = newValue.trim()
    if (!val) return

    // Verifica duplicata localmente antes de ir ao banco
    const existing = (options[type.id] || []).find(
      o => o.value.toLowerCase() === val.toLowerCase()
    )
    if (existing) {
      toast.error(`"${val}" já existe em ${type.name}`)
      return
    }

    setAddingSave(true)
    try {
      const { data, error } = await supabase
        .from('product_variation_options')
        .insert({ type_id: type.id, value: val })
        .select('id, value, type_id')
        .single()

      if (error) throw error

      // Atualiza o estado local de options sem precisar recarregar tudo
      setOptions(prev => ({
        ...prev,
        [type.id]: [...(prev[type.id] || []), data].sort((a, b) => a.value.localeCompare(b.value)),
      }))

      // Já seleciona a nova opção automaticamente para o produto
      setVariation(prev => [...prev, {
        option_id: data.id,
        value:     data.value,
        type_name: type.name,
        type_id:   type.id,
      }])

      toast.success(`"${val}" adicionado em ${type.name}`)
      cancelAdd()
    } catch (err) {
      toast.error('Erro ao adicionar opção.')
      console.error(err)
    } finally {
      setAddingSave(false)
    }
  }

  // Toggle uma opção (add/remove do array de variações)
  function toggleOption(typeId, typeName, optionId, optionValue) {
    const exists = variation.find(v => v.option_id === optionId)
    if (exists) {
      setVariation(prev => prev.filter(v => v.option_id !== optionId))
    } else {
      setVariation(prev => [...prev, {
        option_id: optionId,
        type_name: typeName,
        type_id: typeId,
        value: optionValue,
      }])
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      // Busca ou cria a product_variation para este produto
      let { data: existingVar } = await supabase
        .from('product_variations')
        .select('id')
        .eq('product_id', product.id)
        .single()

      let varId = existingVar?.id

      if (!varId) {
        const { data: newVar } = await supabase
          .from('product_variations')
          .insert({ product_id: product.id, sku: product.sku, active: true })
          .select('id')
          .single()
        varId = newVar?.id
      }

      if (!varId) throw new Error('Não foi possível criar a variation')

      // Remove todos os links atuais
      await supabase
        .from('product_variation_option_links')
        .delete()
        .eq('variation_id', varId)

      // Insere os novos links
      if (variation.length > 0) {
        await supabase
          .from('product_variation_option_links')
          .insert(variation.map(v => ({
            variation_id: varId,
            option_id: v.option_id,
          })))
      }

      toast.success('Variações atualizadas!')
      onSave()
      onClose()
    } catch (err) {
      toast.error('Erro ao salvar variações.')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="font-semibold text-gray-800">Editar variações</h3>
            <p className="text-xs font-mono text-gray-400 mt-0.5">{product.sku}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X size={16} />
          </button>
        </div>

        {/* Variações atuais */}
        <div className="px-6 pt-4 shrink-0">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Variações selecionadas</p>
          <div className="flex flex-wrap gap-1.5 min-h-[32px]">
            {variation.length === 0 ? (
              <p className="text-xs text-gray-400 italic">Nenhuma variação selecionada</p>
            ) : variation.map(v => (
              <button
                key={v.option_id}
                onClick={() => toggleOption(v.type_id, v.type_name, v.option_id, v.value)}
                className="inline-flex items-center gap-1"
              >
                <VarBadge tipo={v.type_name} valor={v.value} />
              </button>
            ))}
          </div>
        </div>

        {/* Seletor de opções por tipo */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {allTypes.map(type => {
            const cfg = TYPE_ICONS[type.name] || {}
            const Icon = cfg.icon || Tag
            const typeOptions = options[type.id] || []
            const isAddingHere = addingTo === type.id
            return (
              <div key={type.id}>
                {/* Cabeçalho do tipo com botão + */}
                <div className="flex items-center gap-1.5 mb-2">
                  <Icon size={13} strokeWidth={1.5} className={cfg.color} />
                  <p className="text-xs font-semibold text-gray-600">{type.name}</p>
                  <button
                    onClick={() => isAddingHere ? cancelAdd() : openAddInput(type.id)}
                    title={`Adicionar nova opção em ${type.name}`}
                    className={`ml-1 w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                      isAddingHere
                        ? 'bg-gray-200 text-gray-500 hover:bg-gray-300'
                        : `${cfg.bg} ${cfg.color} hover:opacity-80`
                    }`}
                  >
                    {isAddingHere
                      ? <X size={9} strokeWidth={2.5} />
                      : <Plus size={9} strokeWidth={2.5} />
                    }
                  </button>
                </div>

                {/* Input inline para nova opção */}
                {isAddingHere && (
                  <div className={`flex items-center gap-2 mb-2 p-2 rounded-lg border ${cfg.border} ${cfg.bg}`}>
                    <input
                      autoFocus
                      value={newValue}
                      onChange={e => setNewValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleAddOption(type)
                        if (e.key === 'Escape') cancelAdd()
                      }}
                      placeholder={`Nova opção de ${type.name}...`}
                      className={`flex-1 text-xs bg-transparent border-0 outline-none placeholder:text-gray-400 ${cfg.color}`}
                    />
                    <button
                      onClick={() => handleAddOption(type)}
                      disabled={!newValue.trim() || addingSave}
                      className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold text-white disabled:opacity-40 transition-all ${
                        cfg.color.includes('pink') ? 'bg-pink-500 hover:bg-pink-600' :
                        cfg.color.includes('blue') ? 'bg-blue-500 hover:bg-blue-600' :
                        cfg.color.includes('amber') ? 'bg-amber-500 hover:bg-amber-600' :
                        cfg.color.includes('cyan') ? 'bg-cyan-500 hover:bg-cyan-600' :
                        'bg-violet-500 hover:bg-violet-600'
                      }`}
                    >
                      {addingSave
                        ? <Loader2 size={10} className="animate-spin" />
                        : <Check size={10} strokeWidth={2.5} />
                      }
                      Salvar
                    </button>
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {typeOptions.map(opt => {
                    const isSelected = variation.some(v => v.option_id === opt.id)
                    return (
                      <button
                        key={opt.id}
                        onClick={() => toggleOption(type.id, type.name, opt.id, opt.value)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                          isSelected
                            ? `${cfg.bg} ${cfg.border} ${cfg.color}`
                            : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'
                        }`}
                      >
                        {isSelected && <Check size={9} className="inline mr-1" strokeWidth={3} />}
                        {opt.value}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 text-sm font-medium text-white bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Salvar variações
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export function VariationsPage() {
  const [products,     setProducts]     = useState([])
  const [types,        setTypes]        = useState([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [filterType,   setFilterType]   = useState('all')
  const [filterGroup,  setFilterGroup]  = useState('all') // all | grouped | ungrouped
  const [selectedIds,  setSelectedIds]  = useState(new Set())
  const [groupModal,   setGroupModal]   = useState(false)
  const [editProduct,  setEditProduct]  = useState(null)
  const [expandedIds,  setExpandedIds]  = useState(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Carrega tipos de variação
      const { data: typesData } = await supabase
        .from('product_variation_types')
        .select('*')
        .order('sort_order')

      setTypes(typesData || [])

      // Carrega produtos com suas variações via JOIN
      const { data: productsData } = await supabase
        .from('products')
        .select(`
          id, sku, name, active, parent_product_id,
          product_variations (
            id,
            product_variation_option_links (
              option_id,
              product_variation_options (
                id, value,
                product_variation_types ( id, name )
              )
            )
          )
        `)
        .eq('active', true)
        .order('sku')

      // Normaliza os dados — achata o JOIN aninhado em um array simples de variações
      const normalized = (productsData || []).map(p => {
        const variations = []
        for (const pv of (p.product_variations || [])) {
          for (const link of (pv.product_variation_option_links || [])) {
            const opt = link.product_variation_options
            if (opt) {
              variations.push({
                option_id: opt.id,
                value:     opt.value,
                type_name: opt.product_variation_types?.name,
                type_id:   opt.product_variation_types?.id,
              })
            }
          }
        }
        return { ...p, variations }
      })

      setProducts(normalized)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ── Filtragem ──────────────────────────────────────────────────────────────
  const filtered = products.filter(p => {
    // Busca por SKU ou nome
    if (search) {
      const q = search.toLowerCase()
      if (!p.sku.toLowerCase().includes(q) && !p.name.toLowerCase().includes(q)) return false
    }
    // Filtro por tipo de variação
    if (filterType !== 'all') {
      if (!p.variations.some(v => v.type_name === filterType)) return false
    }
    // Filtro agrupado/não agrupado
    if (filterGroup === 'grouped')   return !!p.parent_product_id
    if (filterGroup === 'ungrouped') return !p.parent_product_id
    return true
  })

  // ── Seleção múltipla ───────────────────────────────────────────────────────
  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function clearSelection() { setSelectedIds(new Set()) }

  // ── Desagrupar produto ─────────────────────────────────────────────────────
  async function ungroup(product) {
    const { error } = await supabase
      .from('products')
      .update({ parent_product_id: null })
      .eq('id', product.id)
    if (!error) { toast.success('Produto desagrupado!'); load() }
  }

  // ── Toggle expand grupo ────────────────────────────────────────────────────
  function toggleExpand(id) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ── Agrupa produtos por parent ─────────────────────────────────────────────
  // Masters = produtos sem parent (ou que são referenciados como parent de outros)
  const masterIds = new Set(products.filter(p => p.parent_product_id).map(p => p.parent_product_id))

  // Estatísticas
  const stats = {
    total:      products.length,
    comVar:     products.filter(p => p.variations.length > 0).length,
    agrupados:  products.filter(p => p.parent_product_id || masterIds.has(p.id)).length,
    semVar:     products.filter(p => p.variations.length === 0).length,
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-violet-600 rounded-xl flex items-center justify-center">
              <Layers size={20} strokeWidth={1.5} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-800">Variações de Produtos</h1>
              <p className="text-sm text-gray-500">Gerencie variações e agrupamentos de produtos</p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total de produtos', value: stats.total,     color: 'text-gray-800' },
            { label: 'Com variações',     value: stats.comVar,    color: 'text-violet-600' },
            { label: 'Agrupados',         value: stats.agrupados, color: 'text-green-600' },
            { label: 'Sem variação',      value: stats.semVar,    color: 'text-amber-600' },
          ].map(s => (
            <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-4 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap gap-3">
            {/* Busca */}
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por SKU ou nome..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-violet-400 transition-colors"
              />
            </div>

            {/* Filtro por tipo */}
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-violet-400 transition-colors"
            >
              <option value="all">Todos os tipos</option>
              {types.map(t => (
                <option key={t.id} value={t.name}>{t.name}</option>
              ))}
            </select>

            {/* Filtro por agrupamento */}
            <select
              value={filterGroup}
              onChange={e => setFilterGroup(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-violet-400 transition-colors"
            >
              <option value="all">Todos</option>
              <option value="grouped">Agrupados</option>
              <option value="ungrouped">Não agrupados</option>
            </select>
          </div>

          {/* Barra de seleção múltipla */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 bg-violet-50 border border-violet-200 rounded-lg px-4 py-2.5">
              <span className="text-sm font-medium text-violet-700">
                {selectedIds.size} produto{selectedIds.size > 1 ? 's' : ''} selecionado{selectedIds.size > 1 ? 's' : ''}
              </span>
              <button
                onClick={() => setGroupModal(true)}
                disabled={selectedIds.size < 2}
                className="flex items-center gap-1.5 text-xs font-medium text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-40 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Link2 size={12} /> Agrupar como variações
              </button>
              <button
                onClick={clearSelection}
                className="ml-auto text-xs text-violet-500 hover:text-violet-700"
              >
                <X size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Lista de produtos */}
        {loading ? (
          <div className="flex items-center justify-center py-16 bg-white rounded-xl border border-gray-200">
            <Loader2 size={24} className="animate-spin text-violet-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <Package size={36} strokeWidth={1} className="mx-auto mb-3 text-gray-200" />
            <p className="text-gray-500">Nenhum produto encontrado</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {/* Cabeçalho da tabela */}
            <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 px-4 py-2.5 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <span className="w-5" />
              <span>Produto</span>
              <span>Variações</span>
              <span>Ações</span>
            </div>

            {/* Linhas */}
            <div className="divide-y divide-gray-50">
              {filtered.map(p => {
                const isSelected  = selectedIds.has(p.id)
                const isMaster    = masterIds.has(p.id)
                const isChild     = !!p.parent_product_id
                const children    = products.filter(c => c.parent_product_id === p.id)
                const isExpanded  = expandedIds.has(p.id)

                return (
                  <div key={p.id}>
                    {/* Linha principal */}
                    <div className={`grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 px-4 py-3 transition-colors ${
                      isSelected ? 'bg-violet-50' : isChild ? 'bg-gray-50/50' : 'hover:bg-gray-50/50'
                    }`}>
                      {/* Checkbox */}
                      <button
                        onClick={() => toggleSelect(p.id)}
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all shrink-0 ${
                          isSelected ? 'bg-violet-600 border-violet-600' : 'border-gray-300 hover:border-violet-400'
                        }`}
                      >
                        {isSelected && <Check size={11} className="text-white" strokeWidth={3} />}
                      </button>

                      {/* Nome + SKU */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {isChild && <span className="text-gray-300 text-xs">└</span>}
                          <span className="font-mono text-xs font-semibold text-gray-700">{p.sku}</span>
                          {isMaster && (
                            <span className="text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded font-semibold">
                              MESTRE ({children.length} var.)
                            </span>
                          )}
                          {isChild && (
                            <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                              variação
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 truncate mt-0.5">{p.name}</p>
                      </div>

                      {/* Badges de variação */}
                      <div className="flex flex-wrap gap-1 justify-end">
                        {p.variations.length === 0 ? (
                          <span className="text-xs text-gray-300 italic">sem variação</span>
                        ) : p.variations.map(v => (
                          <VarBadge key={v.option_id} tipo={v.type_name} valor={v.value} />
                        ))}
                      </div>

                      {/* Ações */}
                      <div className="flex items-center gap-1 shrink-0">
                        {isMaster && children.length > 0 && (
                          <button
                            onClick={() => toggleExpand(p.id)}
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                            title="Ver variações do grupo"
                          >
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        )}
                        <button
                          onClick={() => setEditProduct(p)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                          title="Editar variações"
                        >
                          <Pencil size={13} strokeWidth={1.5} />
                        </button>
                        {isChild && (
                          <button
                            onClick={() => ungroup(p)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                            title="Desagrupar"
                          >
                            <Unlink size={13} strokeWidth={1.5} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Filhos expandidos */}
                    {isMaster && isExpanded && children.map(child => (
                      <div
                        key={child.id}
                        className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 px-4 py-2.5 bg-violet-50/30 border-t border-violet-100/50"
                      >
                        <span className="w-5" />
                        <div className="min-w-0 pl-4">
                          <div className="flex items-center gap-2">
                            <span className="text-violet-300 text-xs">└</span>
                            <span className="font-mono text-xs font-semibold text-gray-600">{child.sku}</span>
                          </div>
                          <p className="text-xs text-gray-400 truncate mt-0.5 pl-3">{child.name}</p>
                        </div>
                        <div className="flex flex-wrap gap-1 justify-end">
                          {child.variations.map(v => (
                            <VarBadge key={v.option_id} tipo={v.type_name} valor={v.value} />
                          ))}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => setEditProduct(child)} className="p-1.5 rounded-lg hover:bg-white text-gray-400 hover:text-gray-600 transition-colors">
                            <Pencil size={13} strokeWidth={1.5} />
                          </button>
                          <button onClick={() => ungroup(child)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                            <Unlink size={13} strokeWidth={1.5} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>

            {/* Footer da tabela */}
            <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">
              Mostrando {filtered.length} de {products.length} produtos
            </div>
          </div>
        )}
      </div>

      {/* Modal de agrupamento */}
      {groupModal && (
        <GroupModal
          products={products}
          selectedIds={selectedIds}
          onClose={() => setGroupModal(false)}
          onSave={() => { clearSelection(); load() }}
        />
      )}

      {/* Modal de edição de variações */}
      {editProduct && (
        <EditVariationsModal
          product={editProduct}
          allTypes={types}
          onClose={() => setEditProduct(null)}
          onSave={load}
        />
      )}
    </div>
  )
}