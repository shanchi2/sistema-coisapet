import { useEffect, useRef, useState } from 'react'
import { Bold, Italic, List, Quote, Link as LinkIcon, Eraser, Package, Search, ImagePlus, Loader2 } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import toast from 'react-hot-toast'
import { callBlogAi } from '../blogAi'
import { ProductReferencePicker } from './ProductReferencePicker'

// Faixa Unicode dos acentos "soltos" (combining diacritical marks) que
// sobram depois do normalize('NFD') — montada via fromCharCode de
// propósito, pra nunca ter um caractere combinante literal dentro do
// arquivo fonte (mesmo cuidado de ChapasPage.jsx).
const DIACRITICS_RE = new RegExp('[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']', 'g')
function normalizeSearch(s) {
  return (s || '').normalize('NFD').replace(DIACRITICS_RE, '').toLowerCase()
}

// Limpeza do que é colado no editor — pedido do Raphael (09/09) depois
// de ver conteúdo colado do Word/Google Docs entrar com cor, fonte e
// sublinhado do documento original (tudo em `style="..."` inline, que
// tem prioridade sobre o CSS do nosso editor). Sem isso, o texto
// colado NUNCA usa o padrão visual do sistema — o estilo inline vai
// junto no HTML salvo, e viaja pro post publicado do mesmo jeito.
// Em vez de confiar no navegador, reconstruímos o HTML só com a
// estrutura que interessa (título/parágrafo/lista/link/tabela),
// jogando fora qualquer atributo de estilo/classe/fonte.
const PASTE_DROP_TAGS = new Set(['STYLE', 'SCRIPT', 'META', 'LINK', 'HEAD', 'TITLE', 'IMG', 'OBJECT', 'EMBED', 'IFRAME'])
const PASTE_HEADING_MAP = { H1: 'H2', H4: 'H3', H5: 'H3', H6: 'H3' }
const PASTE_ALLOWED_TAGS = new Set(['P', 'H2', 'H3', 'UL', 'OL', 'LI', 'A', 'STRONG', 'B', 'EM', 'I', 'BLOCKQUOTE', 'BR', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD'])

function sanitizePastedHtml(dirtyHtml) {
  const doc = new DOMParser().parseFromString(dirtyHtml, 'text/html')

  function clean(sourceNode) {
    const frag = document.createDocumentFragment()
    sourceNode.childNodes.forEach(child => {
      if (child.nodeType === Node.TEXT_NODE) {
        frag.appendChild(child.cloneNode())
        return
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return // comentário etc.
      if (PASTE_DROP_TAGS.has(child.tagName)) return // nunca mantém conteúdo (nem como texto)

      const tag = PASTE_HEADING_MAP[child.tagName] || child.tagName
      if (!PASTE_ALLOWED_TAGS.has(tag)) {
        // SPAN/FONT (inline) e qualquer tag desconhecida: descarta o
        // envoltório mas mantém o conteúdo de dentro (é onde mora a
        // cor/fonte colada — span é o caso mais comum do Word/Docs).
        // DIV é diferente — no Word/Docs cada "parágrafo" vira um
        // <div>, então precisa virar <p> pra não perder a quebra.
        if (child.tagName === 'DIV') {
          const p = document.createElement('p')
          p.appendChild(clean(child))
          if (p.textContent.trim()) frag.appendChild(p)
        } else {
          frag.appendChild(clean(child))
        }
        return
      }

      const el = document.createElement(tag.toLowerCase())
      if (tag === 'A') {
        const href = child.getAttribute('href')
        if (!href) { frag.appendChild(clean(child)); return } // "link" sem href não é link de verdade
        el.setAttribute('href', href)
        el.setAttribute('target', '_blank')
        el.setAttribute('rel', 'noopener noreferrer')
      }
      if (tag === 'TD' || tag === 'TH') {
        const colspan = child.getAttribute('colspan')
        const rowspan = child.getAttribute('rowspan')
        if (colspan) el.setAttribute('colspan', colspan)
        if (rowspan) el.setAttribute('rowspan', rowspan)
      }
      el.appendChild(clean(child))
      frag.appendChild(el)
    })
    return frag
  }

  const wrapper = document.createElement('div')
  wrapper.appendChild(clean(doc.body))
  return wrapper.innerHTML
}

// Editor de texto simples (sem lib externa — `document.execCommand`
// ainda funciona bem o suficiente pra uma ferramenta interna como essa,
// e evita adicionar dependência nova só pra isso). O `resetKey` força o
// div a remontar (perdendo o cursor de propósito) só quando o HTML muda
// por fora — geração da IA ou carregar um post existente — nunca a cada
// tecla digitada (senão o cursor pularia pro início a cada letra).
function ToolbarButton({ icon: Icon, label, onClick, onMouseDown }) {
  return (
    <button type="button" title={label}
      onMouseDown={onMouseDown ?? (e => e.preventDefault())} // não perde o foco/seleção do texto antes do exec
      onClick={onClick}
      className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors">
      <Icon size={15} />
    </button>
  )
}

// Popover de busca de produto — pedido do Raphael (09/09) depois de ver
// que a sugestão automática por IA quase nunca acha nada: o catálogo
// tem 550 produtos com nomes longos estilo título de marketplace (ex:
// "Divisória Muro Contenção Reta Para Terrário G com Escada..."), texto
// de blog nunca vai conter esse nome literal. Caminho manual e confiável:
// seleciona o trecho no texto, escolhe o produto numa busca, aplica.
function ProductLinkPopover({ products, loading, onPick, onClose }) {
  const [query, setQuery] = useState('')
  const boxRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  const q = normalizeSearch(query)
  const filtered = !q
    ? (products || []).slice(0, 8)
    : (products || []).filter(p => normalizeSearch(p.name).includes(q)).slice(0, 20)

  return (
    <div ref={boxRef}
      className="absolute top-full left-0 mt-1.5 w-80 bg-white border border-slate-200 rounded-xl shadow-lg z-20 overflow-hidden">
      <div className="relative p-2 border-b border-slate-100">
        <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input autoFocus className="input pl-7 text-xs py-2"
          placeholder="Buscar produto pelo nome..."
          value={query} onChange={e => setQuery(e.target.value)} />
      </div>
      <div className="max-h-56 overflow-y-auto">
        {loading ? (
          <p className="text-xs text-slate-400 text-center py-4">Carregando produtos...</p>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4">Nenhum produto encontrado.</p>
        ) : (
          filtered.map(p => (
            <button key={p.id} type="button" onClick={() => onPick(p)}
              className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-rose-50 hover:text-rose-700 transition-colors truncate block">
              {p.name}
            </button>
          ))
        )}
      </div>
    </div>
  )
}

// Popover de geração de imagem por IA (Higgsfield) — insere no ponto
// onde o cursor estava quando o botão foi clicado. Vem pré-preenchido
// com o texto do parágrafo mais próximo (só um ponto de partida, o
// usuário edita antes de gerar — a Higgsfield só aceita um prompt
// livre, então quanto mais específico melhor o resultado).
function ImageGenPopover({ defaultPrompt, generating, onGenerate, onClose }) {
  const [prompt, setPrompt] = useState(defaultPrompt || '')
  const [referenceProduct, setReferenceProduct] = useState(null)
  const boxRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (!generating && boxRef.current && !boxRef.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose, generating])

  return (
    <div ref={boxRef}
      className="absolute top-full left-0 mt-1.5 w-80 bg-white border border-slate-200 rounded-xl shadow-lg z-20 p-3 flex flex-col gap-2">
      <p className="text-xs font-semibold text-slate-600">Descreva a imagem</p>
      <textarea autoFocus disabled={generating}
        className="input text-xs min-h-[70px] resize-none"
        placeholder="Ex: hamster sírio explorando um terrário com substrato natural"
        value={prompt} onChange={e => setPrompt(e.target.value)} />
      <div>
        <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 block">Referência visual (opcional)</label>
        <ProductReferencePicker value={referenceProduct} onChange={setReferenceProduct} />
      </div>
      <button type="button" disabled={generating || !prompt.trim()}
        onClick={() => onGenerate(prompt.trim(), referenceProduct?.photo_url || undefined)}
        className="flex items-center justify-center gap-1.5 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors">
        {generating ? <><Loader2 size={13} className="animate-spin" /> Gerando (pode levar até 1 min)...</> : <><ImagePlus size={13} /> Gerar imagem</>}
      </button>
    </div>
  )
}

export function BlogRichTextEditor({ html, onChange, resetKey }) {
  const ref = useRef(null)
  const savedRangeRef = useRef(null)
  const savedImageRangeRef = useRef(null)
  const [products, setProducts] = useState(null)
  const [productsLoading, setProductsLoading] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [imagePickerOpen, setImagePickerOpen] = useState(false)
  const [imageDefaultPrompt, setImageDefaultPrompt] = useState('')
  const [imageGenerating, setImageGenerating] = useState(false)

  function exec(cmd, arg) {
    document.execCommand(cmd, false, arg)
    ref.current?.focus()
    onChange(ref.current?.innerHTML ?? '')
  }

  function handleLink() {
    const url = window.prompt('URL do link:')
    if (url) exec('createLink', url)
  }

  function handlePaste(e) {
    e.preventDefault()
    const html = e.clipboardData.getData('text/html')
    const inserted = html
      ? sanitizePastedHtml(html)
      : e.clipboardData.getData('text/plain').split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('')
    document.execCommand('insertHTML', false, inserted)
    onChange(ref.current?.innerHTML ?? '')
  }

  function captureSelection() {
    const sel = window.getSelection()
    if (sel && sel.rangeCount && !sel.isCollapsed && ref.current?.contains(sel.anchorNode)) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange()
    } else {
      savedRangeRef.current = null
    }
  }

  async function openProductPicker() {
    if (!savedRangeRef.current) {
      toast.error('Selecione um trecho de texto no post primeiro.')
      return
    }
    setPickerOpen(true)
    if (products === null && !productsLoading) {
      setProductsLoading(true)
      const { data, error } = await supabase.from('products').select('id, name, slug').eq('active', true).order('name')
      setProductsLoading(false)
      if (error) { toast.error('Erro ao carregar produtos.'); return }
      setProducts(data || [])
    }
  }

  // Captura o ponto de inserção da imagem — diferente de
  // captureSelection() (que só guarda seleção NÃO vazia, pra virar
  // link), aqui vale tanto cursor parado quanto texto selecionado
  // (o texto pesquisado no HTML mais próximo vira sugestão de prompt).
  function captureImageInsertionPoint() {
    const sel = window.getSelection()
    if (sel && sel.rangeCount && ref.current?.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0).cloneRange()
      savedImageRangeRef.current = range
      let node = range.startContainer
      while (node && node.nodeType !== Node.ELEMENT_NODE) node = node.parentNode
      while (node && node !== ref.current && !['P', 'H2', 'H3', 'LI', 'BLOCKQUOTE'].includes(node.tagName)) node = node.parentNode
      setImageDefaultPrompt(node && node !== ref.current ? node.textContent.trim().slice(0, 200) : '')
    } else {
      savedImageRangeRef.current = null
      setImageDefaultPrompt('')
    }
  }

  function openImagePicker() {
    if (!savedImageRangeRef.current) {
      toast.error('Clique no texto onde quer inserir a imagem primeiro.')
      return
    }
    setImagePickerOpen(true)
  }

  async function generateAndInsertImage(promptContext, referencePhotoPath) {
    if (!savedImageRangeRef.current) return
    setImageGenerating(true)
    try {
      const data = await callBlogAi('generate_image', { context: promptContext, reference_photo_path: referencePhotoPath })

      ref.current?.focus()
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(savedImageRangeRef.current)
      const range = savedImageRangeRef.current
      range.deleteContents()
      const img = document.createElement('img')
      img.src = data.image_url
      img.alt = promptContext
      range.insertNode(img)
      range.setStartAfter(img)
      range.setEndAfter(img)
      sel.removeAllRanges()
      sel.addRange(range)

      onChange(ref.current?.innerHTML ?? '')
      setImagePickerOpen(false)
      savedImageRangeRef.current = null
      toast.success('Imagem gerada e inserida!')
    } catch (err) {
      toast.error('Erro ao gerar imagem: ' + err.message)
    } finally {
      setImageGenerating(false)
    }
  }

  function applyProductLink(product) {
    if (!savedRangeRef.current) return
    ref.current?.focus()
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(savedRangeRef.current)
    const href = `https://coisapet.com.br/${product.slug}`
    document.execCommand('createLink', false, href)
    // Marca o link como "de produto" (`data-product-link`) — é o que
    // deixa o site público distinguir um link de produto de qualquer
    // outro link interno na hora de contar clique em
    // `blog_product_clicks`, sem precisar adivinhar por regex de URL.
    ref.current?.querySelectorAll(`a[href="${href}"]`).forEach(a => a.setAttribute('data-product-link', 'true'))
    onChange(ref.current?.innerHTML ?? '')
    setPickerOpen(false)
    savedRangeRef.current = null
  }

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white focus-within:border-rose-400 transition-colors">
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-slate-100 bg-slate-50">
        <ToolbarButton icon={Bold}    label="Negrito"     onClick={() => exec('bold')} />
        <ToolbarButton icon={Italic}  label="Itálico"      onClick={() => exec('italic')} />
        <div className="w-px h-4 bg-slate-200 mx-1" />
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => exec('formatBlock', '<h2>')}
          className="px-2 py-1 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-200 hover:text-slate-700">H2</button>
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => exec('formatBlock', '<h3>')}
          className="px-2 py-1 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-200 hover:text-slate-700">H3</button>
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => exec('formatBlock', '<p>')}
          className="px-2 py-1 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-200 hover:text-slate-700">P</button>
        <div className="w-px h-4 bg-slate-200 mx-1" />
        <ToolbarButton icon={List}    label="Lista"        onClick={() => exec('insertUnorderedList')} />
        <ToolbarButton icon={Quote}   label="Citação"      onClick={() => exec('formatBlock', '<blockquote>')} />
        <ToolbarButton icon={LinkIcon} label="Link externo" onClick={handleLink} />
        <div className="relative">
          <ToolbarButton icon={Package} label="Link pra produto (selecione o texto antes)"
            onMouseDown={e => { e.preventDefault(); captureSelection() }}
            onClick={openProductPicker} />
          {pickerOpen && (
            <ProductLinkPopover
              products={products}
              loading={productsLoading}
              onPick={applyProductLink}
              onClose={() => { setPickerOpen(false); savedRangeRef.current = null }}
            />
          )}
        </div>
        <div className="relative">
          <ToolbarButton icon={ImagePlus} label="Inserir imagem com IA (clique no texto antes)"
            onMouseDown={e => { e.preventDefault(); captureImageInsertionPoint() }}
            onClick={openImagePicker} />
          {imagePickerOpen && (
            <ImageGenPopover
              defaultPrompt={imageDefaultPrompt}
              generating={imageGenerating}
              onGenerate={generateAndInsertImage}
              onClose={() => { setImagePickerOpen(false); savedImageRangeRef.current = null }}
            />
          )}
        </div>
        <div className="w-px h-4 bg-slate-200 mx-1" />
        <ToolbarButton icon={Eraser}  label="Limpar formatação" onClick={() => exec('removeFormat')} />
      </div>
      <div
        key={resetKey}
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        data-placeholder="O conteúdo do post aparece aqui — gere com IA ao lado ou escreva direto."
        className="px-4 py-3.5 min-h-[420px] text-sm text-slate-700 leading-relaxed outline-none
          [&:empty]:before:content-[attr(data-placeholder)] [&:empty]:before:text-slate-400
          [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-slate-800 [&_h2]:mt-5 [&_h2]:mb-2
          [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-slate-800 [&_h3]:mt-4 [&_h3]:mb-1.5
          [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_li]:mb-1
          [&_blockquote]:border-l-4 [&_blockquote]:border-rose-200 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-slate-500 [&_blockquote]:mb-3
          [&_a]:text-rose-600 [&_a]:underline [&_a]:decoration-rose-300
          [&_img]:max-w-full [&_img]:rounded-xl [&_img]:my-3
          [&_table]:w-full [&_table]:border-collapse [&_table]:mb-3 [&_table]:text-sm
          [&_th]:border [&_th]:border-slate-200 [&_th]:bg-slate-50 [&_th]:px-2.5 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-bold [&_th]:text-slate-600
          [&_td]:border [&_td]:border-slate-200 [&_td]:px-2.5 [&_td]:py-1.5 [&_td]:text-slate-600"
        dangerouslySetInnerHTML={{ __html: html || '' }}
        onInput={e => onChange(e.currentTarget.innerHTML)}
        onPaste={handlePaste}
      />
    </div>
  )
}
