import React, { useState, useMemo, useEffect } from 'react'
import { Plus, Search, Tag, Pencil, Trash2, Package, ClipboardList, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Layers, ChevronDown, ChevronUp, LayoutList, LayoutGrid, Palette, Ruler, Weight, Droplets } from 'lucide-react'
import { useProducts }              from './hooks/useProducts'
import { useProductCategories }     from './hooks/useProductCategories'
import { ProductFormModal }         from './components/ProductFormModal'
import { ProductCategoriesModal }   from './components/ProductCategoriesModal'
import { BillOfMaterialsModal }     from './components/BillOfMaterialsModal'
import { ConfirmDialog }            from '../../components/ui/ConfirmDialog'
import { EmptyState }               from '../../components/ui/EmptyState'
import { supabase }                 from '../../lib/supabase'

const PAGE_SIZE = 10

function formatCurrency(val) {
  return Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ─── Configuração visual dos tipos de variação ───────────────────
const VAR_TYPE_CFG = {
  'Cor':     { icon: Palette,  color: '#ec4899', bg: '#fdf2f8', border: '#fbcfe8' },
  'Tamanho': { icon: Layers,   color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe' },
  'Peso':    { icon: Weight,   color: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
  'Líquido': { icon: Droplets, color: '#06b6d4', bg: '#ecfeff', border: '#a5f3fc' },
  'Medida':  { icon: Ruler,    color: '#8b5cf6', bg: '#f5f3ff', border: '#ddd6fe' },
}

// Badge de variação inline
function VarBadge({ tipo, valor }) {
  const cfg = VAR_TYPE_CFG[tipo]
  if (!cfg) return <span className="text-xs text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5">{valor}</span>
  const Icon = cfg.icon
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5 border"
      style={{ color: cfg.color, background: cfg.bg, borderColor: cfg.border }}
    >
      <Icon size={9} strokeWidth={2} />
      {valor}
    </span>
  )
}

// Hook para buscar variações de todos os produtos de uma vez
function useProductVariations(productIds, refreshToken = 0) {
  const [varMap, setVarMap] = useState({})

  useEffect(() => {
    if (!productIds || productIds.length === 0) return
    supabase
      .from('product_variations')
      .select(`
        product_id,
        product_variation_option_links (
          product_variation_options (
            value,
            product_variation_types ( name, sort_order )
          )
        )
      `)
      .in('product_id', productIds)
      .then(({ data }) => {
        if (!data) return
        const map = {}
        data.forEach(pv => {
          const vars = []
          pv.product_variation_option_links?.forEach(link => {
            const opt = link.product_variation_options
            if (opt) vars.push({
              type_name:  opt.product_variation_types?.name,
              value:      opt.value,
              sort_order: opt.product_variation_types?.sort_order ?? 99,
            })
          })
          vars.sort((a, b) => a.sort_order - b.sort_order)
          map[pv.product_id] = vars
        })
        setVarMap(map)
      })
  // refreshToken força reexecução quando incrementado após save
  }, [productIds?.join(','), refreshToken])

  return varMap
}

// Hook para buscar capacidade produtiva de todos os produtos
function useProductionCapacity() {
  const [capacity, setCapacity] = useState({})

  useEffect(() => {
    supabase
      .from('production_capacity')
      .select('product_id, can_produce, bom_items')
      .then(({ data }) => {
        if (data) {
          const map = {}
          data.forEach(r => { map[r.product_id] = r })
          setCapacity(map)
        }
      })
  }, [])

  return capacity
}

// Badge de capacidade produtiva
function CapacityBadge({ productId, capacity }) {
  const data = capacity[productId]
  if (!data || Number(data.bom_items) === 0) {
    return <span className="badge-neutral">Sem ficha</span>
  }
  const n = Number(data.can_produce ?? 0)
  if (n === 0) return <span className="badge-danger">Estoque zerado</span>
  if (n <= 5)  return <span className="badge-warn">{n} un. possíveis</span>
  return <span className="badge-ok">{n} un. possíveis</span>
}


// ─── Thumbnail de foto ───────────────────────────────────────────
function ProductPhoto({ photoUrl, name }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    if (!photoUrl) return
    supabase.storage.from('product-photos').createSignedUrl(photoUrl, 3600)
      .then(({ data }) => { if (data) setUrl(data.signedUrl) })
  }, [photoUrl])

  if (!url) return (
    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
      <Package size={16} className="text-slate-300" />
    </div>
  )
  return (
    <img src={url} alt={name}
      className="w-10 h-10 rounded-xl object-cover shrink-0 border border-slate-100" />
  )
}

export function ProductsPage() {
  const { products, loading, create, update, remove, refetch } = useProducts()
  const [varRefresh, setVarRefresh] = useState(0) // incrementa após save para recarregar varMap
  const { categories } = useProductCategories()
  const capacity       = useProductionCapacity()
  // Busca variações de todos os produtos visíveis para exibir nos badges
  const allProductIds  = products.map(p => p.id)
  const varMap         = useProductVariations(allProductIds, varRefresh)

  const [formOpen,       setFormOpen]       = useState(false)
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const [bomOpen,        setBomOpen]        = useState(false)
  const [editing,        setEditing]        = useState(null)
  const [bomProduct,     setBomProduct]     = useState(null)
  const [deleteTarget,   setDeleteTarget]   = useState(null)
  const [saving,         setSaving]         = useState(false)
  const [search,         setSearch]         = useState('')
  const [filterCat,      setFilterCat]      = useState('')
  const [sortBy,         setSortBy]         = useState('name_asc')
  const [page,           setPage]           = useState(1)
  const [viewMode,       setViewMode]       = useState('groups') // 'groups' | 'flat'
  const [expandedGroups, setExpandedGroups] = useState(new Set())

  const filtered = useMemo(() =>
    products
      .filter(p => p.active)
      .filter(p => !search    || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku?.toLowerCase().includes(search.toLowerCase()))
      .filter(p => !filterCat || p.category_id === filterCat)
      .sort((a, b) => {
        switch(sortBy) {
          case 'name_asc':   return a.name.localeCompare(b.name, 'pt-BR')
          case 'name_desc':  return b.name.localeCompare(a.name, 'pt-BR')
          case 'cat':        return (a.category?.name||'').localeCompare(b.category?.name||'', 'pt-BR')
          case 'newest':     return new Date(b.created_at) - new Date(a.created_at)
          case 'oldest':     return new Date(a.created_at) - new Date(b.created_at)
          case 'updated':    return new Date(b.updated_at||b.created_at) - new Date(a.updated_at||a.created_at)
          default:           return 0
        }
      })
  , [products, search, filterCat, sortBy])


  // Agrupa produtos usando parent_product_id (novo sistema)
  // Lógica:
  //   - Produto SEM parent_product_id = é um produto independente ou é o MESTRE do grupo
  //   - Produto COM parent_product_id = é VARIAÇÃO, aparece dentro do mestre
  //   - Produtos que são referenciados como parent de outros = mestres
  const groups = useMemo(() => {
    const map = new Map()

    // Primeiro: descobre quais IDs são mestres (são referenciados por outros)
    const masterIds = new Set(
      filtered.filter(p => p.parent_product_id).map(p => p.parent_product_id)
    )

    filtered.forEach(p => {
      // Variações (filhos) não criam grupo próprio — entram no grupo do pai
      if (p.parent_product_id) return

      // Chave do grupo: id do produto (mestre ou independente)
      const key = p.id
      if (!map.has(key)) {
        map.set(key, {
          key,
          name:      p.name,
          products:  [],
          group_id:  p.group_id,
          category:  p.category,
          image_url: p.image_url,
          photo_url: p.photo_url,
          isMaster:  masterIds.has(p.id),
        })
      }
      map.get(key).products.push(p)
    })

    // Adiciona os filhos (variações) ao grupo do pai
    filtered.filter(p => p.parent_product_id).forEach(p => {
      if (map.has(p.parent_product_id)) {
        map.get(p.parent_product_id).products.push(p)
      } else {
        // Pai não está na lista filtrada (pode estar inativo ou fora do filtro)
        // Cria um grupo temporário para o filho aparecer
        const key = p.id
        map.set(key, {
          key,
          name:      p.name,
          products:  [p],
          group_id:  p.group_id,
          category:  p.category,
          image_url: p.image_url,
          photo_url: p.photo_url,
          isMaster:  false,
        })
      }
    })

    // Ordena variações por preço dentro de cada grupo
    map.forEach(g => g.products.sort((a, b) => Number(a.sale_price) - Number(b.sale_price)))
    return Array.from(map.values())
  }, [filtered])

  const totalPages = viewMode === 'groups'
    ? Math.ceil(groups.length / PAGE_SIZE)
    : Math.ceil(filtered.length / PAGE_SIZE)
  const paginated  = viewMode === 'groups'
    ? groups.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    : filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function toggleGroup(key) {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function openNew()  { setEditing(null); setFormOpen(true) }
  function openEdit(p){ setEditing(p);    setFormOpen(true) }
  function openBom(p) { setBomProduct(p); setBomOpen(true)  }

  async function handleSave(payload) {
    setSaving(true)
    try {
      if (editing) await update(editing.id, payload)
      else         await create(payload)
      setFormOpen(false)
    } catch {}
    finally { setSaving(false) }
  }

  async function handleDelete() {
    setSaving(true)
    try { await remove(deleteTarget.id); setDeleteTarget(null) }
    catch {} finally { setSaving(false) }
  }

  const activeCount = products.filter(p => p.active).length
  const withBom     = Object.values(capacity).filter(c => Number(c.bom_items) > 0).length

  return (
    <div className="flex flex-col gap-6 animate-fade-in">

      {/* Cabeçalho */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Produtos</h2>
          <p className="page-subtitle">Catálogo e fichas técnicas de produção</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setCategoriesOpen(true)} className="btn-secondary">
            <Tag size={16} /> Categorias
          </button>
          <button onClick={openNew} className="btn-primary">
            <Plus size={16} /> Novo produto
          </button>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="card flex items-center gap-4 py-4">
          <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center">
            <Package size={20} className="text-rose-400" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Produtos ativos</p>
            <p className="font-display font-black text-xl text-slate-800" style={{ fontFamily: 'Nunito, sans-serif' }}>
              {activeCount}
            </p>
          </div>
        </div>
        <div className="card flex items-center gap-4 py-4">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
            <Tag size={20} className="text-amber-500" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Categorias</p>
            <p className="font-display font-black text-xl text-slate-800" style={{ fontFamily: 'Nunito, sans-serif' }}>
              {categories.length}
            </p>
          </div>
        </div>
        <div className="card flex items-center gap-4 py-4">
          <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center">
            <ClipboardList size={20} className="text-sky-500" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Com ficha técnica</p>
            <p className="font-display font-black text-xl text-slate-800" style={{ fontFamily: 'Nunito, sans-serif' }}>
              {withBom}/{activeCount}
            </p>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="card p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-8" placeholder="Buscar por nome ou SKU..."
            value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <select className="select w-auto min-w-[160px]" value={filterCat}
          onChange={e => { setFilterCat(e.target.value); setPage(1) }}>
          <option value="">Todas as categorias</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="select w-auto min-w-[160px]" value={sortBy}
          onChange={e => { setSortBy(e.target.value); setPage(1) }}>
          <option value="name_asc">Nome A→Z</option>
          <option value="name_desc">Nome Z→A</option>
          <option value="cat">Categoria</option>
          <option value="newest">Mais recentes</option>
          <option value="oldest">Mais antigos</option>
          <option value="updated">Última atualização</option>
        </select>
        {/* Toggle view mode */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
          <button onClick={() => { setViewMode('groups'); setPage(1) }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
              ${viewMode==='groups' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            <Layers size={13}/> Grupos
          </button>
          <button onClick={() => { setViewMode('flat'); setPage(1) }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
              ${viewMode==='flat' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            <LayoutList size={13}/> Todos
          </button>
        </div>
        {/* Contador */}
        <div className="flex items-center text-xs text-slate-400 font-semibold">
          {viewMode === 'groups'
            ? <><span className="text-slate-700 font-bold">{groups.length}</span>&nbsp;grupos · {filtered.length} variações</>
            : <><span className="text-slate-700 font-bold">{filtered.length}</span>&nbsp;produtos</>
          }
        </div>
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="card flex justify-center items-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-4 border-rose-100 border-t-rose-400 animate-spin" />
            <p className="text-sm text-slate-400">Carregando produtos...</p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <EmptyState icon={Package}
            title={products.length === 0 ? 'Nenhum produto cadastrado' : 'Nenhum resultado'}
            description={products.length === 0 ? 'Cadastre os produtos fabricados pela CoisaPet.' : 'Tente ajustar os filtros.'}
            action={products.length === 0 && (
              <button onClick={openNew} className="btn-primary">
                <Plus size={16} /> Cadastrar primeiro produto
              </button>
            )} />
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>{viewMode==='groups' ? 'Grupo / Produto' : 'Produto'}</th>
                <th>{viewMode==='groups' ? 'Variações' : 'SKU'}</th>
                <th>Categoria</th>
                <th>Preço</th>
                <th>Produção</th>
                <th>Ficha</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {viewMode === 'groups' ? paginated.map((group) => {
                const isExpanded = expandedGroups.has(group.key)
                const priceRange = group.products.length > 1
                  ? `${formatCurrency(group.products[0].sale_price)} – ${formatCurrency(group.products[group.products.length-1].sale_price)}`
                  : formatCurrency(group.products[0]?.sale_price)
                return (
                  <React.Fragment key={group.key}>
                    {/* Linha do grupo */}
                    <tr className={`border-b border-slate-100 hover:bg-rose-50/20 transition-colors cursor-pointer ${isExpanded?'bg-rose-50/10':''}`}
                      onClick={() => toggleGroup(group.key)}>
                      <td>
                        <div className="flex items-center gap-3">
                          <ProductPhoto photoUrl={group.products[0]?.photo_url} name={group.name}/>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-800 leading-snug">{group.name}</p>
                            {group.products.length > 1 && (
                              <p className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[240px] font-mono">
                                {group.products.map(p=>p.sku).slice(0,4).join(' · ')}{group.products.length>4?` +${group.products.length-4} mais`:''}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-500">
                          <Layers size={10}/> {group.products.length} {group.products.length===1?'item':'variações'}
                        </span>
                      </td>
                      <td>
                        {group.category ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{backgroundColor:group.category.color}}/>
                            <span className="text-xs text-slate-600">{group.category.name}</span>
                          </span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="text-xs font-semibold text-slate-700">{priceRange}</td>
                      <td>—</td>
                      <td>—</td>
                      <td>
                        <div className="flex items-center justify-end">
                          <button className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
                            {isExpanded ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {/* Variações expandidas */}
                    {isExpanded && group.products.map(prod => {
                      const prodVars = varMap[prod.id] || []
                      return (
                      <tr key={prod.id} className="border-b border-slate-50 bg-slate-50/30 hover:bg-slate-100/40 transition-colors">
                        <td>
                          <div className="flex items-center gap-3 pl-10">
                            {/* Linha vertical colorida */}
                            <div className="w-0.5 h-10 rounded-full bg-rose-200 shrink-0"/>
                            {/* Foto pequena da variação */}
                            <ProductPhoto photoUrl={prod.photo_url} name={prod.sku}/>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-700 font-mono">{prod.sku}</p>
                              {/* Badges de variação */}
                              {prodVars.length > 0 ? (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {prodVars.map((v, i) => (
                                    <VarBadge key={i} tipo={v.type_name} valor={v.value} />
                                  ))}
                                </div>
                              ) : prod.notes ? (
                                <p className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[220px]">{prod.notes}</p>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td>
                          {prod.sku ? <span className="badge-neutral font-mono text-[10px]">{prod.sku}</span> : '—'}
                        </td>
                        <td className="text-xs text-slate-400">{prod.category?.name||'—'}</td>
                        <td>
                          <div className="text-xs">
                            <p className="font-bold text-slate-700">{formatCurrency(prod.sale_price)}</p>
                            {prod.price_shopee && <p className="text-slate-400"><span className="font-bold text-[9px]">SHP</span> {formatCurrency(prod.price_shopee)}</p>}
                            {prod.price_ml    && <p className="text-slate-400"><span className="font-bold text-[9px]">ML</span>  {formatCurrency(prod.price_ml)}</p>}
                          </div>
                        </td>
                        <td><CapacityBadge productId={prod.id} capacity={capacity}/></td>
                        <td>
                          <button onClick={e=>{e.stopPropagation();openBom(prod)}}
                            className="flex items-center gap-1 text-xs font-semibold text-sky-500 hover:text-sky-600">
                            <ClipboardList size={13}/>
                            {Number(capacity[prod.id]?.bom_items??0)===0?'Criar ficha':`${capacity[prod.id].bom_items} insumo(s)`}
                          </button>
                        </td>
                        <td>
                          <div className="flex items-center justify-end gap-1" onClick={e=>e.stopPropagation()}>
                            <button onClick={()=>openEdit(prod)} className="p-1.5 rounded-lg text-slate-400 hover:text-sky-500 hover:bg-sky-50"><Pencil size={14}/></button>
                            <button onClick={()=>setDeleteTarget(prod)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50"><Trash2 size={14}/></button>
                          </div>
                        </td>
                      </tr>
                    )})}
                  </React.Fragment>
                )
              }) : paginated.map(prod => (
                <tr key={prod.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                  <td>
                    <div className="flex items-center gap-3">
                      <ProductPhoto photoUrl={prod.photo_url} name={prod.name}/>
                      <div className="min-w-0">
                        <span className="font-semibold text-slate-800">{prod.name}</span>
                        {prod.notes && <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[200px]">{prod.notes}</p>}
                      </div>
                    </div>
                  </td>
                  <td>{prod.sku ? <span className="badge-neutral font-mono">{prod.sku}</span> : <span className="text-slate-300">—</span>}</td>
                  <td>
                    {prod.category ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full" style={{backgroundColor:prod.category.color}}/>
                        <span className="text-slate-600">{prod.category.name}</span>
                      </span>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td>
                    {prod.price_shopee && <p className="text-xs text-slate-500"><span className="font-semibold text-slate-400 text-[10px] mr-1">SHP</span>{formatCurrency(prod.price_shopee)}</p>}
                    {prod.price_ml    && <p className="text-xs text-slate-500"><span className="font-semibold text-slate-400 text-[10px] mr-1">ML</span>{formatCurrency(prod.price_ml)}</p>}
                    {!prod.price_shopee && !prod.price_ml && <span className="font-semibold text-slate-700">{formatCurrency(prod.sale_price)}</span>}
                  </td>
                  <td><CapacityBadge productId={prod.id} capacity={capacity}/></td>
                  <td>
                    <button onClick={()=>openBom(prod)} className="flex items-center gap-1.5 text-xs font-semibold text-sky-500 hover:text-sky-600">
                      <ClipboardList size={14}/>
                      {Number(capacity[prod.id]?.bom_items??0)===0?'Criar ficha':`${capacity[prod.id].bom_items} insumo(s)`}
                    </button>
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={()=>openEdit(prod)} className="p-1.5 rounded-lg text-slate-400 hover:text-sky-500 hover:bg-sky-50"><Pencil size={15}/></button>
                      <button onClick={()=>setDeleteTarget(prod)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50"><Trash2 size={15}/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
              {/* Info */}
              <p className="text-xs text-slate-400">
                <span className="font-semibold text-slate-600">{(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE, filtered.length)}</span>
                {' '}de{' '}
                <span className="font-semibold text-slate-600">{filtered.length}</span>
              </p>

              {/* Botões */}
              <div className="flex items-center gap-1">
                {/* Ir para primeira */}
                <button onClick={() => setPage(1)} disabled={page === 1} title="Primeira página"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-25 disabled:cursor-not-allowed transition-all">
                  <ChevronsLeft size={16} />
                </button>
                {/* Anterior */}
                <button onClick={() => setPage(p => p - 1)} disabled={page === 1} title="Página anterior"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-25 disabled:cursor-not-allowed transition-all">
                  <ChevronLeft size={16} />
                </button>

                {/* Números — janela fixa de 5 páginas centrada na atual */}
                {(() => {
                  const delta = 2
                  const start = Math.max(1, Math.min(page - delta, totalPages - delta * 2))
                  const end   = Math.min(totalPages, start + delta * 2)
                  const pages = []
                  if (start > 1) {
                    pages.push(<span key="s" className="w-8 text-center text-slate-300 text-xs select-none">•••</span>)
                  }
                  for (let i = start; i <= end; i++) {
                    pages.push(
                      <button key={i} onClick={() => setPage(i)}
                        className={`w-8 h-8 rounded-lg text-sm font-semibold transition-all ${
                          i === page ? 'bg-rose-400 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'
                        }`}>
                        {i}
                      </button>
                    )
                  }
                  if (end < totalPages) {
                    pages.push(<span key="e" className="w-8 text-center text-slate-300 text-xs select-none">•••</span>)
                  }
                  return pages
                })()}

                {/* Próxima */}
                <button onClick={() => setPage(p => p + 1)} disabled={page === totalPages} title="Próxima página"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-25 disabled:cursor-not-allowed transition-all">
                  <ChevronRight size={16} />
                </button>
                {/* Ir para última */}
                <button onClick={() => setPage(totalPages)} disabled={page === totalPages} title="Última página"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-25 disabled:cursor-not-allowed transition-all">
                  <ChevronsRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modais */}
      <ProductFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSave={handleSave}
        onSaved={() => setVarRefresh(v => v + 1)}
        initial={editing}
        loading={saving}
        categories={categories}
      />
      <ProductCategoriesModal
        open={categoriesOpen}
        onClose={() => { setCategoriesOpen(false); refetch() }}
      />
      <BillOfMaterialsModal
        open={bomOpen}
        onClose={() => { setBomOpen(false); setBomProduct(null) }}
        product={bomProduct}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={saving}
        title={`Remover "${deleteTarget?.name}"?`}
        description="O produto será desativado. Fichas técnicas e histórico serão mantidos."
        confirmLabel="Remover produto"
      />
    </div>
  )
}