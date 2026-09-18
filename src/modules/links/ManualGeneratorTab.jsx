import { useEffect, useMemo, useState } from 'react'
import { Search, Loader2, Upload, Printer, Save, ArrowLeft, Package, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { useSignedUrl } from '../../lib/signedUrlCache'
import { RichEditor } from '../../components/ui/RichEditor'
import { buildManualHtml } from './manualTemplate'
import { useProductDocs } from './hooks/useProductDocs'

function GenProductThumb({ photoUrl }) {
  const url = useSignedUrl('product-photos', photoUrl)
  if (!url) return <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0"><Package size={14} className="text-slate-300" /></div>
  return <img src={url} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0 border border-slate-100" />
}

// product-docs (bucket dos manuais em si) só aceita .html/.pdf — imagem
// vai pro bucket "manuals" (mesmo já usado em ManualsPage.jsx/ImgUpload,
// confirmado aceitando image/* antes de usar aqui).
async function uploadManualImage(file, productId) {
  const ext  = file.name.split('.').pop().toLowerCase()
  const path = `docgen-images/${productId}/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('manuals').upload(path, file, { contentType: file.type || `image/${ext}` })
  if (error) throw error
  return supabase.storage.from('manuals').getPublicUrl(path).data.publicUrl
}

// Aba "Gerador de Manual" — escreve o texto, sobe uma imagem, e o
// sistema monta o HTML pronto (mesma cara sempre, logo no topo) e já
// vincula como recurso do produto via addResource (mesmo mecanismo já
// usado na aba Manuais, sem duplicar upload/DB).
export function ManualGeneratorTab() {
  const { searchProducts, addResource } = useProductDocs()
  const [product,   setProduct]   = useState(null)
  const [query,     setQuery]     = useState('')
  const [results,   setResults]   = useState([])
  const [searching, setSearching] = useState(false)
  const [label,     setLabel]     = useState('Manual de Uso')
  const [bodyHtml,  setBodyHtml]  = useState('')
  const [imageUrl,  setImageUrl]  = useState('')
  const [uploadingImg, setUploadingImg] = useState(false)
  const [saving,    setSaving]    = useState(false)

  async function runSearch(q) {
    setQuery(q)
    if (!q.trim()) { setResults([]); return }
    setSearching(true)
    setResults(await searchProducts(q))
    setSearching(false)
  }

  async function handleImage(file) {
    if (!file || !product) return
    setUploadingImg(true)
    try {
      setImageUrl(await uploadManualImage(file, product.id))
      toast.success('Imagem enviada!')
    } catch (err) {
      toast.error('Erro ao subir imagem: ' + err.message)
    } finally {
      setUploadingImg(false)
    }
  }

  const finalHtml = useMemo(() => buildManualHtml({
    productName: product?.name, imageUrl, bodyHtml,
  }), [product, imageUrl, bodyHtml])

  function handleDownloadPdf() {
    const win = window.open('', '_blank')
    if (!win) { toast.error('Seu navegador bloqueou o pop-up — permita pop-ups pra baixar o PDF.'); return }
    win.document.open()
    win.document.write(finalHtml)
    win.document.close()
    win.onload = () => { win.focus(); setTimeout(() => win.print(), 600) }
  }

  async function handleSave() {
    if (!product || !label.trim() || !bodyHtml.trim()) {
      toast.error('Escolha o produto, o título e escreva o texto do manual.')
      return
    }
    setSaving(true)
    try {
      const file = new File([finalHtml], 'manual-gerado.html', { type: 'text/html' })
      await addResource(product.id, { label: label.trim(), kind: 'file', file })
      // Reseta pra montar outro manual em seguida
      setProduct(null); setQuery(''); setResults([])
      setLabel('Manual de Uso'); setBodyHtml(''); setImageUrl('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* ── Formulário ── */}
      <div className="space-y-4">
        {!product ? (
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <p className="text-sm font-semibold text-slate-700">1. Escolha o produto</p>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input autoFocus value={query} onChange={e => runSearch(e.target.value)}
                placeholder="Buscar produto por nome..."
                className="w-full text-sm border border-slate-200 rounded-lg pl-8 pr-3 py-2 focus:outline-none focus:border-slate-400" />
            </div>
            {searching ? (
              <div className="flex justify-center py-6"><Loader2 size={18} className="animate-spin text-slate-300" /></div>
            ) : (
              <div className="flex flex-col gap-1 max-h-72 overflow-y-auto">
                {results.map(p => (
                  <button key={p.id} onClick={() => setProduct(p)}
                    className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-50 text-left">
                    <GenProductThumb photoUrl={p.photo_url} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-700 truncate">{p.name}</p>
                      {p.sku && <p className="text-[10px] text-slate-400 font-mono">{p.sku}</p>}
                    </div>
                  </button>
                ))}
                {query.trim() && !searching && results.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-4">Nenhum produto encontrado.</p>
                )}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 bg-slate-50">
              <button onClick={() => { setProduct(null); setImageUrl('') }} className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 shrink-0">
                <ArrowLeft size={15} />
              </button>
              <GenProductThumb photoUrl={product.photo_url} />
              <p className="text-sm font-semibold text-slate-700 truncate">{product.name}</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1.5">2. Título do manual</label>
                <input value={label} onChange={e => setLabel(e.target.value)}
                  placeholder="Ex: Manual de Uso, Instruções de Montagem..."
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400" />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1.5">3. Imagem do produto (opcional)</label>
                {imageUrl ? (
                  <div className="relative w-fit">
                    <img src={imageUrl} alt="" className="h-24 rounded-lg border border-slate-200 object-contain bg-slate-50 p-1" />
                    <button onClick={() => setImageUrl('')} className="absolute -top-2 -right-2 bg-white border border-slate-200 rounded-full p-1 text-slate-400 hover:text-rose-500">
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 text-sm text-slate-500 border border-dashed border-slate-300 rounded-lg px-3 py-2.5 cursor-pointer hover:border-slate-400 hover:bg-slate-50 w-fit">
                    {uploadingImg ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                    {uploadingImg ? 'Enviando...' : 'Enviar imagem'}
                    <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" className="hidden"
                      onChange={e => handleImage(e.target.files?.[0])} disabled={uploadingImg} />
                  </label>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1.5">4. Texto do manual</label>
                <RichEditor value={bodyHtml} onChange={setBodyHtml} />
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={handleDownloadPdf} disabled={!bodyHtml.trim()}
                className="flex-1 py-2.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg transition-colors flex items-center justify-center gap-2">
                <Printer size={14} /> Baixar PDF
              </button>
              <button onClick={handleSave} disabled={saving || !bodyHtml.trim() || !label.trim()}
                className="flex-1 py-2.5 text-sm font-medium text-white bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-2">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Salvar e vincular ao produto
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Pré-visualização ao vivo ── */}
      <div className="bg-slate-100 border border-slate-200 rounded-xl p-3 lg:sticky lg:top-4 h-fit">
        <p className="text-xs font-semibold text-slate-500 mb-2 px-1">Pré-visualização</p>
        <div className="bg-white rounded-lg overflow-hidden border border-slate-200" style={{ height: 560 }}>
          <iframe title="Pré-visualização do manual" srcDoc={finalHtml} className="w-full h-full" style={{ border: 'none' }} />
        </div>
      </div>
    </div>
  )
}
