import { useMemo, useState } from 'react'
import { Search, Loader2, Upload, Printer, Save, ArrowLeft, Package, X, Sparkles, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { useSignedUrl } from '../../lib/signedUrlCache'
import { buildManualHtml } from './manualTemplate'
import { useProductDocs } from './hooks/useProductDocs'
import { callAiFunction } from '../../lib/aiFunctionClient'

function GenProductThumb({ photoUrl }) {
  const url = useSignedUrl('product-photos', photoUrl)
  if (!url) return <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0"><Package size={14} className="text-slate-300" /></div>
  return <img src={url} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0 border border-slate-100" />
}

// product-docs (bucket dos manuais em si) só aceita .html/.pdf — imagem
// vai pro bucket "manuals" (mesmo já usado em ManualsPage.jsx/ImgUpload).
async function uploadManualImage(file, productId) {
  const ext  = file.name.split('.').pop().toLowerCase()
  const path = `docgen-images/${productId}/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('manuals').upload(path, file, { contentType: file.type || `image/${ext}` })
  if (error) throw error
  return supabase.storage.from('manuals').getPublicUrl(path).data.publicUrl
}

async function callManualAi(productName, rawText) {
  return callAiFunction('manual-ai', 'generate_sections', { product_name: productName, raw_text: rawText })
}

const emptySections = () => ({
  tagline: '', hero_intro: '', tags: [],
  about_title: '', about_text: '',
  benefits: [], compatibility: [], alert: null,
  usage_steps: [], amount_formula: null,
  care: { storage: [], maintenance: [], discard: [] },
})

// Editor genérico de lista de pares {a,b} — usado pra benefícios,
// compatibilidade e passos de uso (mesmo shape, rótulos diferentes).
function PairListEditor({ items, onChange, labelA, labelB, placeholderA, placeholderB }) {
  function update(i, field, val) {
    onChange(items.map((it, x) => x === i ? { ...it, [field]: val } : it))
  }
  function remove(i) { onChange(items.filter((_, x) => x !== i)) }
  function add() { onChange([...items, { [labelA]: '', [labelB]: '' }]) }
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="flex gap-2 items-start">
          <div className="flex-1 space-y-1">
            <input value={it[labelA] || ''} onChange={e => update(i, labelA, e.target.value)} placeholder={placeholderA}
              className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-slate-400 font-semibold" />
            <input value={it[labelB] || ''} onChange={e => update(i, labelB, e.target.value)} placeholder={placeholderB}
              className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-slate-400" />
          </div>
          <button onClick={() => remove(i)} className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-300 hover:text-rose-500 mt-1"><Trash2 size={13} /></button>
        </div>
      ))}
      <button onClick={add} className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700">
        <Plus size={12} /> Adicionar
      </button>
    </div>
  )
}

function linesToArr(text) { return text.split('\n').map(l => l.trim()).filter(Boolean) }

export function ManualGeneratorTab() {
  const { searchProducts, addResource } = useProductDocs()
  const [product,   setProduct]   = useState(null)
  const [query,     setQuery]     = useState('')
  const [results,   setResults]   = useState([])
  const [searching, setSearching] = useState(false)
  const [label,     setLabel]     = useState('Manual de Uso')
  const [imageUrl,  setImageUrl]  = useState('')
  const [uploadingImg, setUploadingImg] = useState(false)
  const [rawText,   setRawText]   = useState('')
  const [generating, setGenerating] = useState(false)
  const [sections,  setSections]  = useState(null) // null = ainda não gerou
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

  async function handleGenerate() {
    if (!rawText.trim()) { toast.error('Escreva o texto sobre o produto primeiro.'); return }
    setGenerating(true)
    try {
      const data = await callManualAi(product.name, rawText)
      setSections({ ...emptySections(), ...data, care: { ...emptySections().care, ...(data.care || {}) } })
      toast.success('Conteúdo gerado! Revise antes de salvar.')
    } catch (err) {
      toast.error('Erro ao gerar: ' + err.message)
    } finally {
      setGenerating(false)
    }
  }

  function setSec(patch) { setSections(prev => ({ ...prev, ...patch })) }
  function setCare(patch) { setSections(prev => ({ ...prev, care: { ...prev.care, ...patch } })) }

  const finalHtml = useMemo(() => {
    if (!product) return ''
    return buildManualHtml({ productName: product.name, imageUrl, sections: sections || {} })
  }, [product, imageUrl, sections])

  function handleDownloadPdf() {
    const win = window.open('', '_blank')
    if (!win) { toast.error('Seu navegador bloqueou o pop-up — permita pop-ups pra baixar o PDF.'); return }
    win.document.open()
    win.document.write(finalHtml)
    win.document.close()
    win.onload = () => { win.focus(); setTimeout(() => win.print(), 600) }
  }

  async function handleSave() {
    if (!product || !label.trim() || !sections) {
      toast.error('Escolha o produto, o título e gere o conteúdo primeiro.')
      return
    }
    setSaving(true)
    try {
      const file = new File([finalHtml], 'manual-gerado.html', { type: 'text/html' })
      await addResource(product.id, { label: label.trim(), kind: 'file', file })
      setProduct(null); setQuery(''); setResults([])
      setLabel('Manual de Uso'); setImageUrl(''); setRawText(''); setSections(null)
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
              <button onClick={() => { setProduct(null); setImageUrl(''); setSections(null); setRawText('') }} className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 shrink-0">
                <ArrowLeft size={15} />
              </button>
              <GenProductThumb photoUrl={product.photo_url} />
              <p className="text-sm font-semibold text-slate-700 truncate">{product.name}</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1.5">2. Título do manual</label>
                <input value={label} onChange={e => setLabel(e.target.value)}
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
                <label className="text-xs font-semibold text-slate-500 block mb-1.5">4. Texto sobre o produto</label>
                <textarea value={rawText} onChange={e => setRawText(e.target.value)} rows={5}
                  placeholder="Escreva livremente o que precisa constar: o que é, pra que serve, como usar, cuidados, pra quais animais é indicado..."
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400 resize-none" />
                <button onClick={handleGenerate} disabled={generating || !rawText.trim()}
                  className="mt-2 flex items-center gap-2 text-sm font-semibold text-white bg-gradient-to-r from-amber-600 to-orange-600 hover:opacity-90 disabled:opacity-40 px-4 py-2 rounded-lg transition-opacity">
                  {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  {generating ? 'Gerando...' : sections ? 'Gerar de novo' : 'Gerar com IA'}
                </button>
              </div>
            </div>

            {sections && (
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
                <p className="text-sm font-semibold text-slate-700">5. Revise o conteúdo gerado</p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 block mb-1">Categoria (hero)</label>
                    <input value={sections.tagline || ''} onChange={e => setSec({ tagline: e.target.value })}
                      className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5" />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 block mb-1">Tags (vírgula)</label>
                    <input value={(sections.tags || []).join(', ')} onChange={e => setSec({ tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })}
                      className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5" />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">Introdução do hero</label>
                  <textarea value={sections.hero_intro || ''} onChange={e => setSec({ hero_intro: e.target.value })} rows={2}
                    className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 resize-none" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 block mb-1">Título "O que é"</label>
                    <input value={sections.about_title || ''} onChange={e => setSec({ about_title: e.target.value })}
                      className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5" />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">Texto "O que é"</label>
                  <textarea value={sections.about_text || ''} onChange={e => setSec({ about_text: e.target.value })} rows={2}
                    className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 resize-none" />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">Benefícios (cards)</label>
                  <PairListEditor items={sections.benefits || []} onChange={v => setSec({ benefits: v })}
                    labelA="title" labelB="desc" placeholderA="Título do benefício" placeholderB="Descrição curta" />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">Indicado para (compatibilidade)</label>
                  <PairListEditor items={sections.compatibility || []} onChange={v => setSec({ compatibility: v })}
                    labelA="animal" labelB="note" placeholderA="Espécie/porte" placeholderB="Observação de uso" />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-400 flex items-center justify-between mb-1">
                    Aviso importante (opcional)
                    {sections.alert
                      ? <button onClick={() => setSec({ alert: null })} className="text-rose-400 hover:text-rose-600 font-normal normal-case">remover</button>
                      : <button onClick={() => setSec({ alert: { title: '', text: '' } })} className="text-slate-400 hover:text-slate-600 font-normal normal-case">adicionar</button>}
                  </label>
                  {sections.alert && (
                    <div className="space-y-1">
                      <input value={sections.alert.title || ''} onChange={e => setSec({ alert: { ...sections.alert, title: e.target.value } })}
                        placeholder="Título do aviso" className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 font-semibold" />
                      <input value={sections.alert.text || ''} onChange={e => setSec({ alert: { ...sections.alert, text: e.target.value } })}
                        placeholder="Texto do aviso" className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5" />
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">Como usar (passos)</label>
                  <PairListEditor items={sections.usage_steps || []} onChange={v => setSec({ usage_steps: v })}
                    labelA="title" labelB="desc" placeholderA="Título do passo" placeholderB="Descrição curta" />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-400 flex items-center justify-between mb-1">
                    Fórmula de quantidade (opcional, só pra produto a granel)
                    {sections.amount_formula
                      ? <button onClick={() => setSec({ amount_formula: null })} className="text-rose-400 hover:text-rose-600 font-normal normal-case">remover</button>
                      : <button onClick={() => setSec({ amount_formula: { label: 'Quanto usar?', formula: '', note: '' } })} className="text-slate-400 hover:text-slate-600 font-normal normal-case">adicionar</button>}
                  </label>
                  {sections.amount_formula && (
                    <div className="space-y-1">
                      <input value={sections.amount_formula.label || ''} onChange={e => setSec({ amount_formula: { ...sections.amount_formula, label: e.target.value } })}
                        placeholder="Pergunta curta" className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 font-semibold" />
                      <input value={sections.amount_formula.formula || ''} onChange={e => setSec({ amount_formula: { ...sections.amount_formula, formula: e.target.value } })}
                        placeholder="Fórmula/regra prática" className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5" />
                      <input value={sections.amount_formula.note || ''} onChange={e => setSec({ amount_formula: { ...sections.amount_formula, note: e.target.value } })}
                        placeholder="Explicação curta" className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5" />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 block mb-1">Cuidados — Armazenamento (1 por linha)</label>
                    <textarea value={(sections.care?.storage || []).join('\n')} onChange={e => setCare({ storage: linesToArr(e.target.value) })} rows={2}
                      className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 resize-none" />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 block mb-1">Cuidados — Manutenção (1 por linha)</label>
                    <textarea value={(sections.care?.maintenance || []).join('\n')} onChange={e => setCare({ maintenance: linesToArr(e.target.value) })} rows={2}
                      className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 resize-none" />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 block mb-1">Cuidados — Descarte (1 por linha)</label>
                    <textarea value={(sections.care?.discard || []).join('\n')} onChange={e => setCare({ discard: linesToArr(e.target.value) })} rows={2}
                      className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 resize-none" />
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={handleDownloadPdf} disabled={!sections}
                className="flex-1 py-2.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg transition-colors flex items-center justify-center gap-2">
                <Printer size={14} /> Baixar PDF
              </button>
              <button onClick={handleSave} disabled={saving || !sections || !label.trim()}
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
        <div className="bg-white rounded-lg overflow-hidden border border-slate-200" style={{ height: 640 }}>
          {finalHtml
            ? <iframe title="Pré-visualização do manual" srcDoc={finalHtml} className="w-full h-full" style={{ border: 'none' }} />
            : <div className="flex items-center justify-center h-full text-xs text-slate-400 text-center px-8">Escolha um produto e gere o conteúdo pra ver a prévia aqui.</div>}
        </div>
      </div>
    </div>
  )
}
