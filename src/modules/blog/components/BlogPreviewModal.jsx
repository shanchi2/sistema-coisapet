import { useState } from 'react'
import { Eye, Search } from 'lucide-react'
import { Modal } from '../../../components/ui/Modal'
import { countWords, stripHtml } from '../seoChecks'

function fmtDate(d) {
  if (!d) return null
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}

// Prévia de como o post fica pro leitor — só uma aproximação visual (o
// site público de verdade é o coisapet-site, PHP, fora deste repo),
// mas dá pra revisar título/capa/texto/SEO antes de publicar sem sair
// do sistema. 2 abas: como o post fica, e como aparece no resultado do
// Google (mesma ideia do Yoast) — as duas coisas que mais importam
// antes de apertar Publicar.
export function BlogPreviewModal({ open, onClose, post }) {
  const [tab, setTab] = useState('post')
  if (!post) return null

  const { title, slug, contentHtml, coverImageUrl, category, metaTitle, metaDescription, authorName, publishedAt, scheduledAt, status } = post
  const wordCount = countWords(stripHtml(contentHtml))
  const readingMinutes = Math.max(1, Math.ceil(wordCount / 200))
  const dateLabel = status === 'published' ? fmtDate(publishedAt || new Date())
    : status === 'scheduled' ? `agendado para ${fmtDate(scheduledAt)}`
    : 'rascunho — ainda não publicado'

  const seoTitle = (metaTitle || title || '').slice(0, 70) || 'Título do post'
  const seoDesc  = metaDescription || 'Sem meta descrição definida ainda.'

  return (
    <Modal open={open} onClose={onClose} size="wide" title="Prévia do post">
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit mb-5">
        <button onClick={() => setTab('post')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${tab === 'post' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          <Eye size={13} /> Como fica o post
        </button>
        <button onClick={() => setTab('google')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${tab === 'google' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          <Search size={13} /> Como aparece no Google
        </button>
      </div>

      {tab === 'post' ? (
        <div className="max-w-2xl mx-auto pb-4">
          {coverImageUrl && (
            <img src={coverImageUrl} alt="" className="w-full h-64 object-cover rounded-2xl mb-6" />
          )}
          {category && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full inline-block mb-3"
              style={{ background: `${category.color}18`, color: category.color }}>
              {category.name}
            </span>
          )}
          <h1 className="text-3xl font-black text-slate-800 leading-tight mb-3">{title || 'Título do post'}</h1>
          <p className="text-sm text-slate-400 mb-8">
            {authorName || 'CoisaPet'} · {dateLabel} · {readingMinutes} min de leitura
          </p>
          <div className="text-[15px] text-slate-700 leading-[1.8]
            [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-slate-800 [&_h2]:mt-8 [&_h2]:mb-3
            [&_h3]:text-xl [&_h3]:font-bold [&_h3]:text-slate-800 [&_h3]:mt-6 [&_h3]:mb-2
            [&_p]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4 [&_li]:mb-1.5
            [&_blockquote]:border-l-4 [&_blockquote]:border-rose-200 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-slate-500 [&_blockquote]:mb-4
            [&_a]:text-rose-600 [&_a]:underline [&_a]:decoration-rose-300 [&_a]:font-medium
            [&_table]:w-full [&_table]:border-collapse [&_table]:mb-4 [&_table]:text-sm
            [&_th]:border [&_th]:border-slate-200 [&_th]:bg-slate-50 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-bold [&_th]:text-slate-600
            [&_td]:border [&_td]:border-slate-200 [&_td]:px-3 [&_td]:py-2 [&_td]:text-slate-600"
            dangerouslySetInnerHTML={{ __html: contentHtml || '<p class="text-slate-300">Sem conteúdo ainda.</p>' }} />
        </div>
      ) : (
        <div className="max-w-xl mx-auto py-6">
          <p className="text-xs text-slate-400 mb-4">Aproximação de como o Google costuma exibir — o resultado real pode variar.</p>
          <div className="p-5 border border-slate-100 rounded-xl bg-white">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-rose-400 to-amber-400 shrink-0" />
              <div>
                <p className="text-sm text-slate-700 font-medium leading-none">CoisaPet</p>
                <p className="text-xs text-slate-500 leading-none mt-0.5">coisapet.com.br/blog/{slug || 'slug-do-post'}</p>
              </div>
            </div>
            <p className="text-[#1a0dab] text-lg leading-snug mt-2 truncate" style={{ fontFamily: 'arial, sans-serif' }}>
              {seoTitle}
            </p>
            <p className="text-sm text-[#4d5156] leading-snug mt-1 line-clamp-2" style={{ fontFamily: 'arial, sans-serif' }}>
              {seoDesc}
            </p>
          </div>
          <p className="text-[11px] text-slate-400 mt-3">
            Título SEO: {(metaTitle || '').length} caracteres · Meta descrição: {(metaDescription || '').length} caracteres
          </p>
        </div>
      )}
    </Modal>
  )
}
