import { useState, useMemo, useEffect } from 'react'
import { Search, Plus, Trash2, FileDown, Package, User, Phone, FileText, ArrowLeft, Save, Clock, Receipt } from 'lucide-react'
import { useProducts } from '../products/hooks/useProducts'
import { useBudgets } from './hooks/useBudgets'
import { supabase } from '../../lib/supabase'
import { useSignedUrl } from '../../lib/signedUrlCache'

// Arquivo solto na pasta public/ (não usa import) — o app funciona
// normalmente mesmo se ele ainda não existir; quando existir, é só
// isso, sem precisar tocar em código nenhum.
const LOGO_URL         = '/logo-coisapet.webp'
const COMPANY_SITE     = 'coisapet.com.br'
const COMPANY_WHATSAPP = '' // TODO: preencher com o número oficial (ex: '(14) 99999-9999')

function fmtPreco(v) {
  const n = parseFloat(v)
  if (!n || isNaN(n)) return 'R$ 0,00'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function parsePrecoInput(v) {
  const clean = String(v).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3},)/g, '').replace(',', '.')
  const n = parseFloat(clean)
  return isNaN(n) ? 0 : n
}
function formatPhoneBR(value) {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 2) return digits.replace(/^(\d*)/, '($1')
  if (digits.length <= 6) return digits.replace(/^(\d{2})(\d*)/, '($1) $2')
  if (digits.length <= 10) return digits.replace(/^(\d{2})(\d{4})(\d*)/, '($1) $2-$3')
  return digits.replace(/^(\d{2})(\d{5})(\d*)/, '($1) $2-$3')
}
function fmtDT(d) {
  if (!d) return ''
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ─── Thumbnail com signed URL (cache compartilhado — evita buscar de novo) ────
function ThumbPhoto({ photoUrl, size = 36 }) {
  const url = useSignedUrl('product-photos', photoUrl)

  if (!url) return (
    <div className="rounded-lg bg-slate-100 flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <Package size={size * 0.45} className="text-slate-300" />
    </div>
  )
  return <img src={url} alt="" className="rounded-lg object-cover shrink-0 border border-slate-100" style={{ width: size, height: size }} />
}

// Converte qualquer imagem (URL local ou remota) pra PNG em memória —
// usado tanto pra logo quanto pras fotos dos produtos no PDF.
async function loadImageDataUrl(url) {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error('fetch failed')
    const blob   = await res.blob()
    const bitmap = await createImageBitmap(blob)
    const canvas = document.createElement('canvas')
    canvas.width  = bitmap.width
    canvas.height = bitmap.height
    canvas.getContext('2d').drawImage(bitmap, 0, 0)
    return { dataUrl: canvas.toDataURL('image/png'), width: bitmap.width, height: bitmap.height }
  } catch (e) {
    console.warn('Não foi possível carregar imagem:', e)
    return null
  }
}

// ─── Geração do PDF ───────────────────────────────────────────────
async function generateBudgetPDF({ code, customerName, customerPhone, items, notes }) {
  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const PAGE_W = 210, PAGE_H = 297, MARGIN = 16

  // ── Cabeçalho ──────────────────────────────────────────────────
  doc.setFillColor(61, 31, 13) // marrom escuro CoisaPet
  doc.rect(0, 0, PAGE_W, 40, 'F')

  const logo = await loadImageDataUrl(LOGO_URL)
  let textX = MARGIN
  if (logo) {
    const logoH = 22
    const logoW = logoH * (logo.width / logo.height)
    doc.addImage(logo.dataUrl, 'PNG', MARGIN, 9, logoW, logoH)
    textX = MARGIN + logoW + 8
  } else {
    doc.setTextColor(196, 149, 106)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(22)
    doc.text('CoisaPet', MARGIN, 22)
  }

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Orçamento', textX, logo ? 20 : 30)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(220, 200, 180)
  doc.text(`Emitido em ${new Date().toLocaleDateString('pt-BR')}`, textX, logo ? 26 : 35)

  const orcNum = code || `#${Date.now().toString().slice(-6)}`
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(196, 149, 106)
  doc.text(orcNum, PAGE_W - MARGIN, 20, { align: 'right' })

  // ── Dados do cliente ───────────────────────────────────────────
  let y = 52
  doc.setFillColor(241, 226, 205)
  doc.roundedRect(MARGIN, y, PAGE_W - MARGIN * 2, 20, 3, 3, 'F')
  doc.setTextColor(110, 63, 37)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('CLIENTE', MARGIN + 6, y + 7)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(61, 31, 13)
  doc.text(customerName || 'Não informado', MARGIN + 6, y + 15)
  if (customerPhone) {
    doc.setFontSize(9)
    doc.setTextColor(110, 63, 37)
    doc.text(customerPhone, PAGE_W - MARGIN - 6, y + 15, { align: 'right' })
  }
  y += 32

  // ── Pré-carrega as fotos dos itens que têm (em paralelo) ────────
  const itemImages = {}
  await Promise.all(items.filter(it => it.photo_url).map(async it => {
    const { data } = await supabase.storage.from('product-photos').createSignedUrl(it.photo_url, 3600)
    if (data?.signedUrl) {
      const img = await loadImageDataUrl(data.signedUrl)
      if (img) itemImages[it.id] = img
    }
  }))
  const hasPhotos = Object.keys(itemImages).length > 0

  // ── Tabela de itens ─────────────────────────────────────────────
  const photoColW = hasPhotos ? 16 : 0
  const colX  = [MARGIN + photoColW, MARGIN + photoColW + 74, MARGIN + photoColW + 104, MARGIN + photoColW + 134]
  const rowH  = hasPhotos ? 17 : 12

  doc.setFillColor(61, 31, 13)
  doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 9, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(196, 149, 106)
  doc.text('PRODUTO', colX[0] + 3, y + 6)
  doc.text('PREÇO UNIT.', colX[1] + 3, y + 6)
  doc.text('QTD', colX[2] + 3, y + 6)
  doc.text('SUBTOTAL', colX[3] + 3, y + 6)
  y += 9

  let total = 0
  doc.setFont('helvetica', 'normal')
  items.forEach((it, idx) => {
    if (y > PAGE_H - 65) { doc.addPage(); y = MARGIN }
    const subtotal = (parseFloat(it.unit_price) || 0) * (parseInt(it.qty) || 0)
    total += subtotal

    if (idx % 2 === 1) {
      doc.setFillColor(250, 248, 245)
      doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, rowH, 'F')
    }

    if (hasPhotos) {
      const img = itemImages[it.id]
      const thumbSize = 13
      const thumbY = y + (rowH - thumbSize) / 2
      if (img) {
        doc.addImage(img.dataUrl, 'PNG', MARGIN + 1.5, thumbY, thumbSize, thumbSize)
      } else {
        doc.setFillColor(240, 240, 240)
        doc.roundedRect(MARGIN + 1.5, thumbY, thumbSize, thumbSize, 1.5, 1.5, 'F')
      }
    }

    doc.setTextColor(60, 60, 60)
    doc.setFontSize(9)
    const nameLines = doc.splitTextToSize(it.name, colX[1] - colX[0] - 6)
    const nameY = hasPhotos ? y + (rowH / 2) - (nameLines.length > 1 ? 4 : 1.5) : y + 5
    doc.text(nameLines.slice(0, 2), colX[0] + 3, nameY)
    if (it.category === 'personalizado') {
      doc.setFontSize(6.5)
      doc.setTextColor(180, 140, 100)
      doc.text('PRODUTO PERSONALIZADO', colX[0] + 3, nameY + (nameLines.length > 1 ? 7 : 5.5))
      doc.setFontSize(9)
      doc.setTextColor(60, 60, 60)
    }

    const midY = y + rowH / 2 + 1.5
    doc.text(fmtPreco(it.unit_price), colX[1] + 3, midY)
    doc.text(String(it.qty), colX[2] + 3, midY)
    doc.setFont('helvetica', 'bold')
    doc.text(fmtPreco(subtotal), colX[3] + 3, midY)
    doc.setFont('helvetica', 'normal')
    y += rowH
  })

  // ── Aviso de imagens ilustrativas (só se teve alguma foto) ──────
  if (hasPhotos) {
    y += 4
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(7.5)
    doc.setTextColor(160, 150, 140)
    doc.text('* Imagens meramente ilustrativas.', MARGIN, y)
    y += 4
  }

  // ── Total ────────────────────────────────────────────────────
  y += 3
  doc.setFillColor(61, 31, 13)
  doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 13, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(196, 149, 106)
  doc.text('TOTAL GERAL', colX[0] - photoColW + 3, y + 8.5)
  doc.setFontSize(13)
  doc.setTextColor(255, 255, 255)
  doc.text(fmtPreco(total), PAGE_W - MARGIN - 3, y + 8.5, { align: 'right' })
  y += 22

  // ── Observações ──────────────────────────────────────────────
  if (notes?.trim()) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(110, 63, 37)
    doc.text('OBSERVAÇÕES', MARGIN, y)
    y += 6
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(80, 80, 80)
    const noteLines = doc.splitTextToSize(notes.trim(), PAGE_W - MARGIN * 2)
    doc.text(noteLines, MARGIN, y)
    y += noteLines.length * 5 + 8
  }

  // ── Rodapé fixo ──────────────────────────────────────────────
  const footY = PAGE_H - 30
  doc.setDrawColor(230, 220, 210)
  doc.setLineWidth(0.4)
  doc.line(MARGIN, footY, PAGE_W - MARGIN, footY)

  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8.5)
  doc.setTextColor(140, 120, 100)
  doc.text('Este orçamento é válido por 7 dias a partir da data de emissão.', MARGIN, footY + 7)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(110, 63, 37)
  const contactParts = [
    `CoisaPet® · ${COMPANY_SITE}`,
    COMPANY_WHATSAPP ? `WhatsApp: ${COMPANY_WHATSAPP}` : null,
  ].filter(Boolean)
  doc.text(contactParts.join('   ·   '), MARGIN, footY + 14)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(190, 180, 170)
  doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, PAGE_W - MARGIN, footY + 14, { align: 'right' })

  const safeName = (customerName || 'orcamento').replace(/\s+/g, '_').toLowerCase()
  doc.save(`orcamento_${safeName}_${(orcNum||'').replace(/[^\w-]/g,'')}.pdf`)
}

// ─── Página ─────────────────────────────────────────────────────
export function OrcamentosPage() {
  const { products } = useProducts()
  const { budgets, loading: loadingBudgets, fetchOne, create, update, removeBudget } = useBudgets()

  const [view, setView] = useState('list') // 'list' | 'builder'
  const [editingId, setEditingId] = useState(null)
  const [editingCode, setEditingCode] = useState(null)
  const [history, setHistory] = useState([])
  const [listSearch, setListSearch] = useState('')

  const [search,        setSearch]        = useState('')
  const [customerName,  setCustomerName]  = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [notes,         setNotes]         = useState('')
  const [items,         setItems]         = useState([])
  const [showCustomForm,setShowCustomForm]= useState(false)
  const [customName,    setCustomName]    = useState('')
  const [customPrice,   setCustomPrice]   = useState('')
  const [generating,    setGenerating]    = useState(false)
  const [saving,        setSaving]        = useState(false)

  const filteredBudgets = useMemo(() => {
    if (!listSearch.trim()) return budgets
    const q = listSearch.toLowerCase()
    return budgets.filter(b => b.customer_name?.toLowerCase().includes(q) || b.code?.toLowerCase().includes(q))
  }, [budgets, listSearch])

  const results = useMemo(() => {
    if (!search.trim()) return []
    const q = search.toLowerCase()
    return products
      .filter(p => p.active)
      .filter(p => p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q))
      .slice(0, 8)
  }, [search, products])

  function resetBuilder() {
    setEditingId(null); setEditingCode(null); setHistory([])
    setCustomerName(''); setCustomerPhone(''); setNotes(''); setItems([])
    setSearch(''); setShowCustomForm(false); setCustomName(''); setCustomPrice('')
  }

  function openNew() {
    resetBuilder()
    setView('builder')
  }

  async function openEdit(budgetSummary) {
    const data = await fetchOne(budgetSummary.id)
    setEditingId(data.id)
    setEditingCode(data.code)
    setCustomerName(data.customer_name || '')
    setCustomerPhone(data.customer_phone || '')
    setNotes(data.notes || '')
    setItems((data.items || []).map(it => ({
      id: it.id, product_id: it.product_id, name: it.name, sku: it.sku,
      photo_url: it.photo_url, unit_price: it.unit_price, qty: it.qty, category: it.category,
    })))
    setHistory(data.history || [])
    setView('builder')
  }

  function addProduct(prod) {
    setItems(prev => {
      const existing = prev.find(it => it.product_id === prod.id)
      if (existing) return prev.map(it => it.product_id === prod.id ? { ...it, qty: it.qty + 1 } : it)
      return [...prev, {
        id: crypto.randomUUID(), product_id: prod.id, name: prod.name, sku: prod.sku,
        photo_url: prod.photo_url, unit_price: prod.sale_price || 0, qty: 1, category: 'catalogo',
      }]
    })
    setSearch('')
  }

  function addCustom() {
    if (!customName.trim()) return
    setItems(prev => [...prev, {
      id: crypto.randomUUID(), product_id: null, name: customName.trim(), sku: null,
      photo_url: null, unit_price: parsePrecoInput(customPrice), qty: 1, category: 'personalizado',
    }])
    setCustomName(''); setCustomPrice(''); setShowCustomForm(false)
  }

  function updateItem(id, field, value) {
    setItems(prev => prev.map(it => it.id === id ? { ...it, [field]: value } : it))
  }
  function removeItem(id) {
    setItems(prev => prev.filter(it => it.id !== id))
  }

  const total = items.reduce((acc, it) => acc + (parseFloat(it.unit_price) || 0) * (parseInt(it.qty) || 0), 0)

  async function handleGeneratePDF() {
    if (items.length === 0) return
    setGenerating(true)
    try {
      await generateBudgetPDF({ code: editingCode, customerName, customerPhone, items, notes })
    } finally {
      setGenerating(false)
    }
  }

  async function handleSave() {
    if (items.length === 0) return
    setSaving(true)
    try {
      const payload = { customerName, customerPhone, notes, items }
      if (editingId) {
        await update(editingId, payload)
        const fresh = await fetchOne(editingId)
        setHistory(fresh.history || [])
      } else {
        const created = await create(payload)
        setEditingId(created.id)
        setEditingCode(created.code)
        const fresh = await fetchOne(created.id)
        setHistory(fresh.history || [])
      }
    } finally {
      setSaving(false)
    }
  }

  // ══════════════════════════════ LISTA ══════════════════════════════
  if (view === 'list') {
    return (
      <div className="flex flex-col gap-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800" style={{ fontFamily: 'Nunito,sans-serif' }}>Orçamentos</h1>
            <p className="text-sm text-slate-400">Monte, salve e gere PDFs de orçamento pra enviar ao cliente</p>
          </div>
          <button onClick={openNew} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Novo orçamento
          </button>
        </div>

        <div className="relative max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Buscar por cliente ou código..."
            value={listSearch} onChange={e => setListSearch(e.target.value)} />
        </div>

        <div className="card overflow-hidden">
          {loadingBudgets ? (
            <div className="flex justify-center py-16">
              <div className="w-7 h-7 border-4 border-rose-100 border-t-rose-400 rounded-full animate-spin" />
            </div>
          ) : filteredBudgets.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Receipt size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">Nenhum orçamento ainda</p>
              <p className="text-xs text-slate-300 mt-1">Clique em "Novo orçamento" pra começar</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide border-b border-slate-100">
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Itens</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Criado por</th>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredBudgets.map(b => (
                  <tr key={b.id} className="hover:bg-slate-50 cursor-pointer group" onClick={() => openEdit(b)}>
                    <td className="px-4 py-3 font-mono text-xs font-bold text-slate-500">{b.code}</td>
                    <td className="px-4 py-3 font-semibold text-slate-700">{b.customer_name || <span className="text-slate-300 font-normal">Não informado</span>}</td>
                    <td className="px-4 py-3 text-slate-500">{b.items?.[0]?.count ?? 0}</td>
                    <td className="px-4 py-3 font-bold text-emerald-600">{fmtPreco(b.total)}</td>
                    <td className="px-4 py-3 text-slate-500">{b.creator?.name || '—'}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{fmtDT(b.created_at)}</td>
                    <td className="px-4 py-3">
                      <button onClick={e => { e.stopPropagation(); if (confirm(`Excluir orçamento ${b.code}?`)) removeBudget(b.id) }}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-opacity">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    )
  }

  // ══════════════════════════════ EDITOR ══════════════════════════════
  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <button onClick={() => setView('list')} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2" style={{ fontFamily: 'Nunito,sans-serif' }}>
            {editingId ? 'Editar orçamento' : 'Novo orçamento'}
            {editingCode && <span className="text-xs font-mono font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-lg">{editingCode}</span>}
          </h1>
          <p className="text-sm text-slate-400">Busque produtos, ajuste preços/quantidades e gere o PDF</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">

        {/* Coluna principal — busca + itens */}
        <div className="flex flex-col gap-4">

          <div className="card p-4 relative">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2 block">Adicionar produto</label>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="input pl-9" placeholder="Buscar por SKU ou nome do produto..."
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>

            {results.length > 0 && (
              <div className="absolute left-4 right-4 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-10 max-h-72 overflow-y-auto">
                {results.map(p => (
                  <button key={p.id} onClick={() => addProduct(p)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 text-left border-b border-slate-50 last:border-0">
                    <ThumbPhoto photoUrl={p.photo_url} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-700 truncate">{p.name}</p>
                      <div className="flex items-center gap-2">
                        {p.sku && <span className="text-[10px] font-mono text-slate-400">{p.sku}</span>}
                        <span className="text-xs font-bold text-emerald-600">{fmtPreco(p.sale_price)}</span>
                      </div>
                    </div>
                    <Plus size={16} className="text-rose-400 shrink-0" />
                  </button>
                ))}
              </div>
            )}

            <button onClick={() => setShowCustomForm(v => !v)}
              className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-rose-500">
              <Plus size={13} /> Produto personalizado (não está no catálogo)
            </button>

            {showCustomForm && (
              <div className="mt-3 flex gap-2 items-end bg-slate-50 rounded-xl p-3">
                <div className="flex-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Nome do item</label>
                  <input className="input text-sm" value={customName} onChange={e => setCustomName(e.target.value)}
                    placeholder="Ex: Cama personalizada tamanho G" />
                </div>
                <div className="w-32">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Preço unit.</label>
                  <input className="input text-sm" value={customPrice} onChange={e => setCustomPrice(e.target.value)}
                    placeholder="0,00" />
                </div>
                <button onClick={addCustom} className="btn-primary text-xs px-4 py-2.5">Adicionar</button>
              </div>
            )}
          </div>

          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Itens do orçamento ({items.length})</p>
            </div>
            {items.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Package size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm font-medium">Nenhum item ainda</p>
                <p className="text-xs text-slate-300 mt-1">Busque um produto acima pra começar</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {items.map(it => (
                  <div key={it.id} className="flex items-center gap-3 px-4 py-3">
                    <ThumbPhoto photoUrl={it.photo_url} size={40} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-700 truncate">{it.name}</p>
                      {it.category === 'personalizado'
                        ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600">Produto Personalizado</span>
                        : it.sku && <span className="text-[10px] font-mono text-slate-400">{it.sku}</span>}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-slate-400">R$</span>
                      <input type="number" step="0.01" min="0" value={it.unit_price}
                        onChange={e => updateItem(it.id, 'unit_price', parseFloat(e.target.value) || 0)}
                        className="w-20 text-sm text-right border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-rose-300" />
                    </div>
                    <span className="text-slate-300">×</span>
                    <input type="number" min="1" value={it.qty}
                      onChange={e => updateItem(it.id, 'qty', Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-14 text-sm text-center border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-rose-300" />
                    <span className="w-24 text-right text-sm font-bold text-slate-700 shrink-0">
                      {fmtPreco((parseFloat(it.unit_price) || 0) * (parseInt(it.qty) || 0))}
                    </span>
                    <button onClick={() => removeItem(it.id)} className="p-1.5 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 shrink-0">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Histórico de edições — só aparece em orçamentos já salvos */}
          {editingId && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                <Clock size={14} className="text-slate-400" />
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Histórico de edições</p>
              </div>
              <div className="divide-y divide-slate-50 max-h-56 overflow-y-auto">
                {history.length === 0 ? (
                  <p className="text-xs text-slate-400 px-4 py-4">Sem histórico ainda.</p>
                ) : history.map(h => (
                  <div key={h.id} className="px-4 py-2.5 flex items-start gap-3">
                    <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${h.action === 'created' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                    <div className="min-w-0">
                      <p className="text-xs text-slate-600">
                        <strong className="text-slate-700">{h.editor?.name || 'Usuário'}</strong>
                        {' '}{h.action === 'created' ? 'criou o orçamento' : 'editou o orçamento'}
                      </p>
                      {h.summary && <p className="text-[11px] text-slate-400 mt-0.5">{h.summary}</p>}
                      <p className="text-[10px] text-slate-300 mt-0.5">{fmtDT(h.edited_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Coluna lateral — cliente + observações + ações */}
        <div className="flex flex-col gap-4">
          <div className="card p-5 flex flex-col gap-4">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Dados do cliente</p>
            <div>
              <label className="text-xs text-slate-500 font-semibold flex items-center gap-1.5 mb-1"><User size={12} /> Nome</label>
              <input className="input" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Nome do cliente" />
            </div>
            <div>
              <label className="text-xs text-slate-500 font-semibold flex items-center gap-1.5 mb-1"><Phone size={12} /> WhatsApp</label>
              <input className="input" value={customerPhone}
                onChange={e => setCustomerPhone(formatPhoneBR(e.target.value))}
                placeholder="(00) 00000-0000" maxLength={15} inputMode="numeric" />
            </div>
            <div>
              <label className="text-xs text-slate-500 font-semibold flex items-center gap-1.5 mb-1"><FileText size={12} /> Observações (opcional)</label>
              <textarea className="textarea w-full" rows={3} value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Condições, prazo de entrega, forma de pagamento..." />
            </div>
          </div>

          <div className="card p-5 flex flex-col gap-3 bg-emerald-50/50 border-emerald-100">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-600">Total geral</span>
              <span className="text-2xl font-black text-emerald-700" style={{ fontFamily: 'Nunito,sans-serif' }}>{fmtPreco(total)}</span>
            </div>

            <button onClick={handleSave} disabled={items.length === 0 || saving}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm text-white bg-slate-700 hover:bg-slate-800 transition-colors disabled:opacity-50">
              {saving
                ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Salvando...</>
                : <><Save size={16} /> {editingId ? 'Salvar alterações' : 'Salvar orçamento'}</>
              }
            </button>

            <button onClick={handleGeneratePDF} disabled={items.length === 0 || generating}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
              {generating
                ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Gerando...</>
                : <><FileDown size={16} /> Gerar PDF do orçamento</>
              }
            </button>
            <p className="text-[10px] text-slate-400 text-center">Validade fixa de 7 dias, já incluída no rodapé do PDF.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
