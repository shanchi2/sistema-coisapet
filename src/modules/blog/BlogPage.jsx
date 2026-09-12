import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Newspaper, Search, Pencil, Trash2, Sparkles, Calendar, Clock3, Upload, Settings, ImageDown, Loader2, CalendarClock } from 'lucide-react'
import toast from 'react-hot-toast'
import { useBlogPosts } from './hooks/useBlogPosts'
import { callBlogAi } from './blogAi'
import { useBlogCategories } from './hooks/useBlogCategories'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { WpImportModal } from './components/WpImportModal'
import { BlogCategoriesModal } from './components/BlogCategoriesModal'

const STATUS_INFO = {
  draft:     { label: 'Rascunho',  bg: 'bg-slate-100',  text: 'text-slate-600' },
  scheduled: { label: 'Agendado',  bg: 'bg-amber-100',  text: 'text-amber-700' },
  published: { label: 'Publicado', bg: 'bg-emerald-100', text: 'text-emerald-700' },
}

function formatDateTime(d) {
  if (!d) return null
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// cover_image_url já é a URL pública do bucket 'blog-covers' (getPublicUrl
// no upload) — bucket público de propósito, o site principal vai exibir
// essa imagem direto pro visitante, não só o sistema interno.
function CoverThumb({ url }) {
  if (!url) return <div className="w-full h-full flex items-center justify-center"><Newspaper size={18} className="text-slate-300" /></div>
  return <img src={url} alt="" className="w-full h-full object-cover" />
}

function formatDate(d) {
  if (!d) return null
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function BlogPage() {
  const { posts, loading, moveToTrash, bulkImport, refetch: refetchPosts } = useBlogPosts()
  const { categories, refetch: refetchCategories } = useBlogCategories()
  const navigate = useNavigate()
  const [search,   setSearch]   = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [deleting, setDeleting] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [manageCategoriesOpen, setManageCategoriesOpen] = useState(false)
  const [rehostConfirmOpen, setRehostConfirmOpen] = useState(false)
  const [rehostBusy, setRehostBusy] = useState(false)

  const existingSlugs = useMemo(() => new Set(posts.map(p => p.slug)), [posts])

  const filtered = useMemo(() => {
    let list = posts
    if (statusFilter !== 'all') list = list.filter(p => p.status === statusFilter)
    if (categoryFilter !== 'all') list = list.filter(p => p.category_id === categoryFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(p => p.title.toLowerCase().includes(q) || p.focus_keyword?.toLowerCase().includes(q))
    }
    return list
  }, [posts, search, statusFilter, categoryFilter])

  async function confirmDelete() {
    if (!deleting) return
    setDeleteBusy(true)
    try { await moveToTrash(deleting.id, deleting.title); setDeleting(null) }
    catch {} finally { setDeleteBusy(false) }
  }

  async function handleRehostImages() {
    setRehostBusy(true)
    try {
      const data = await callBlogAi('rehost_images')
      toast.success(`${data.images_downloaded} imagem(ns) re-hospedada(s) em ${data.posts_updated} post(s)${data.images_failed ? ` · ${data.images_failed} falharam` : ''}.`)
      await refetchPosts()
    } catch (err) {
      toast.error('Erro ao re-hospedar imagens: ' + err.message)
    } finally {
      setRehostBusy(false)
      setRehostConfirmOpen(false)
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-2xl flex items-center justify-center shrink-0 shadow-sm shadow-indigo-200">
            <Newspaper size={22} strokeWidth={1.5} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Blog</h1>
            <p className="text-sm text-slate-500">Conteúdo do blog, gerado com IA e otimizado pra SEO</p>
          </div>
        </div>
        <div className="flex gap-2">
          {posts.length > 0 && (
            <button onClick={() => setRehostConfirmOpen(true)} disabled={rehostBusy}
              className="flex items-center gap-1.5 px-4 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
              title="Baixa imagens externas (ex: do WordPress) e hospeda no nosso storage">
              {rehostBusy ? <Loader2 size={15} className="animate-spin" /> : <ImageDown size={15} />} Re-hospedar imagens
            </button>
          )}
          <button onClick={() => setImportOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm font-medium rounded-xl transition-colors">
            <Upload size={15} /> Importar do WordPress
          </button>
          <button onClick={() => navigate('/blog/novo')}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium rounded-xl transition-colors shadow-sm">
            <Sparkles size={15} /> Novo post
          </button>
        </div>
      </div>

      {/* Filtros */}
      {posts.length > 0 && (
        <div className="flex flex-col gap-3 mb-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative max-w-md flex-1 min-w-[200px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="input pl-8" placeholder="Buscar por título ou palavra-chave..."
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="flex gap-1.5">
              {[['all','Todos'],['draft','Rascunhos'],['scheduled','Agendados'],['published','Publicados']].map(([key,label]) => (
                <button key={key} onClick={() => setStatusFilter(key)}
                  className={`px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${
                    statusFilter === key ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button onClick={() => setCategoryFilter('all')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                categoryFilter === 'all' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}>
              Todas categorias
            </button>
            {categories.map(c => (
              <button key={c.id} onClick={() => setCategoryFilter(c.id)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5"
                style={categoryFilter === c.id
                  ? { backgroundColor: c.color, color: '#fff' }
                  : { backgroundColor: `${c.color}1A`, color: c.color }}>
                {c.name}
              </button>
            ))}
            <button onClick={() => setManageCategoriesOpen(true)}
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors" title="Gerenciar categorias">
              <Settings size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : posts.length === 0 ? (
        <EmptyState
          icon={Newspaper}
          title="Nenhum post ainda"
          description="Crie o primeiro post do blog — dê uma palavra-chave e um mini-contexto, e a IA gera o rascunho pra você lapidar. Ou importe o que já existe no WordPress."
          action={
            <div className="flex gap-2">
              <button onClick={() => setImportOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm font-medium rounded-xl transition-colors">
                <Upload size={15} /> Importar do WordPress
              </button>
              <button onClick={() => navigate('/blog/novo')}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium rounded-xl transition-colors shadow-sm">
                <Sparkles size={15} /> Novo post
              </button>
            </div>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title="Nenhum post encontrado" description="Tente outra busca ou filtro." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(post => {
            const st = STATUS_INFO[post.status] || STATUS_INFO.draft
            return (
              <div key={post.id}
                className="group bg-white border border-slate-200 rounded-2xl overflow-hidden hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer flex flex-col"
                onClick={() => navigate(`/blog/${post.id}`)}>
                <div className="h-36 bg-slate-50">
                  <CoverThumb url={post.cover_image_url} />
                </div>
                <div className="p-4 flex-1 flex flex-col">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${st.bg} ${st.text}`}>{st.label}</span>
                    {post.category && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: `${post.category.color}1A`, color: post.category.color }}>
                        {post.category.name}
                      </span>
                    )}
                    {post.focus_keyword && (
                      <span className="text-[11px] text-slate-400 truncate">🔑 {post.focus_keyword}</span>
                    )}
                  </div>
                  <h3 className="font-bold text-slate-800 text-sm leading-snug mb-1.5 line-clamp-2">{post.title}</h3>
                  {post.excerpt && <p className="text-xs text-slate-500 line-clamp-2 flex-1">{post.excerpt}</p>}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                    <span className="flex items-center gap-1 text-[11px] text-slate-400">
                      {post.status === 'published' ? <><Calendar size={12}/> {formatDate(post.published_at)}</>
                        : post.status === 'scheduled' ? <><CalendarClock size={12}/> agendado {formatDateTime(post.scheduled_at)}</>
                        : <><Clock3 size={12}/> editado {formatDate(post.updated_at)}</>}
                    </span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={e => { e.stopPropagation(); navigate(`/blog/${post.id}`) }}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-indigo-600" title="Editar">
                        <Pencil size={14} />
                      </button>
                      <button onClick={e => { e.stopPropagation(); setDeleting(post) }}
                        className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-500" title="Remover">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={deleteBusy}
        title="Remover post"
        description={`Tem certeza que quer remover "${deleting?.title}"? Vai pra lixeira, não é apagado de vez.`}
        confirmLabel="Remover"
      />

      <WpImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        existingSlugs={existingSlugs}
        onDone={bulkImport}
      />

      <BlogCategoriesModal
        open={manageCategoriesOpen}
        onClose={() => { setManageCategoriesOpen(false); refetchCategories() }}
      />

      <ConfirmDialog
        open={rehostConfirmOpen}
        onClose={() => setRehostConfirmOpen(false)}
        onConfirm={handleRehostImages}
        loading={rehostBusy}
        danger={false}
        title="Re-hospedar imagens externas"
        description="Baixa toda imagem de post que ainda aponta pra fora (ex: WordPress) e reenvia pro nosso storage, trocando o link automaticamente. Importante rodar isso ANTES de tirar o WordPress do ar ou remover o redirecionamento do /blog — sem isso, essas imagens vão quebrar."
        confirmLabel="Re-hospedar agora"
      />
    </div>
  )
}
