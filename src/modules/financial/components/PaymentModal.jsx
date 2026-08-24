import { useState, useRef, useEffect } from 'react'
import { Upload, FileText, Image, X, Plus, Trash2, Paperclip, CheckCircle2 } from 'lucide-react'
import { Modal }         from '../../../components/ui/Modal'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'

const ACCEPTED = ['application/pdf','image/jpeg','image/png','image/webp']
const MAX_SIZE  = 10 * 1024 * 1024

function fmtCurrency(v) {
  return Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtDate(d) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
}
function FileIcon({ type }) {
  if (type === 'application/pdf') return <FileText size={16} className="text-rose-400" />
  return <Image size={16} className="text-sky-400" />
}

// ─── Mini upload de comprovante por pagamento ─────────────────────
function AttachmentRow({ payment, attachment, removedIds, onView, onRemove, onUpload }) {
  const [file,     setFile]     = useState(null)
  const [saving,   setSaving]   = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [err,      setErr]      = useState('')
  const inputRef = useRef()

  // Se o anexo foi removido localmente, não mostra
  const att = attachment && !removedIds.has(attachment.id) ? attachment : null

  function handleFile(f) {
    if (!f) return
    if (!ACCEPTED.includes(f.type)) { setErr('Use PDF, JPG ou PNG.'); return }
    if (f.size > MAX_SIZE)          { setErr('Máximo 10 MB.'); return }
    setErr('')
    setFile(f)
  }

  async function handleUpload() {
    if (!file) return
    setSaving(true)
    try {
      await onUpload(file, payment.id)
      setFile(null)
    } catch {}
    finally { setSaving(false) }
  }

  return (
    <div className="mt-2 ml-11">
      {att ? (
        /* Comprovante existente */
        <div className="flex items-center gap-2">
          <button
            onClick={() => onView(att)}
            className="flex items-center gap-1 text-xs text-sky-500 hover:text-sky-600 font-semibold"
          >
            <Paperclip size={13} /> Ver comprovante
          </button>
          <span className="text-slate-200">|</span>
          <button
            onClick={() => onRemove(att)}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-rose-500 font-semibold transition-colors"
          >
            <X size={12} /> Remover
          </button>
        </div>
      ) : file ? (
        /* Arquivo selecionado — aguardando confirmar */
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
            <FileIcon type={file.type} />
            <span className="truncate max-w-[140px]">{file.name}</span>
            <button onClick={() => setFile(null)} className="text-slate-400 hover:text-rose-500 ml-1">
              <X size={12} />
            </button>
          </div>
          <button
            onClick={handleUpload}
            disabled={saving}
            className="flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 hover:bg-emerald-100 font-semibold px-2 py-1 rounded-lg transition-all"
          >
            {saving
              ? <div className="w-3 h-3 border-2 border-emerald-200 border-t-emerald-500 rounded-full animate-spin" />
              : <><Plus size={12} /> Confirmar upload</>
            }
          </button>
        </div>
      ) : (
        /* Sem comprovante — botão para adicionar */
        <div>
          <button
            onClick={() => inputRef.current?.click()}
            onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-all ${
              dragOver
                ? 'border-rose-300 bg-rose-50 text-rose-500'
                : 'border-dashed border-slate-200 text-slate-400 hover:border-sky-300 hover:text-sky-500 hover:bg-sky-50'
            }`}
          >
            <Upload size={12} /> Anexar comprovante
          </button>
          {err && <p className="text-xs text-rose-500 mt-1">{err}</p>}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp"
        className="hidden"
        onChange={e => handleFile(e.target.files[0])}
      />
    </div>
  )
}

export function PaymentModal({
  open, onClose, bill,
  onAddPayment, onDeletePayment,
  onUpload, onRemoveAttachment, onGetUrl,
  loading = false
}) {
  const today = new Date().toISOString().split('T')[0]
  const [amount,   setAmount]   = useState('')
  const [paidAt,   setPaidAt]   = useState(today)
  const [notes,    setNotes]    = useState('')
  const [file,     setFile]     = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [fileErr,  setFileErr]  = useState('')
  const [saving,   setSaving]   = useState(false)
  const [delTarget,    setDelTarget]    = useState(null)
  const [attDelTarget, setAttDelTarget] = useState(null)
  // IDs de anexos removidos localmente — atualiza a UI imediatamente sem esperar o fetch
  const [removedIds, setRemovedIds] = useState(new Set())

  // Limpa ao fechar/abrir
  useEffect(() => {
    if (open) {
      setRemovedIds(new Set())
      setAmount('')
      setPaidAt(today)
      setNotes('')
      setFile(null)
    }
  }, [open])

  const inputRef = useRef()

  if (!bill) return null

  const remaining = bill.remaining ?? (Number(bill.amount) - (bill.totalPaid ?? 0))
  const totalPaid  = bill.totalPaid ?? 0
  const payments   = bill.payments ?? []

  function handleFile(f) {
    if (!f) return
    if (!ACCEPTED.includes(f.type)) { setFileErr('Formato não aceito. Use PDF, JPG ou PNG.'); return }
    if (f.size > MAX_SIZE)          { setFileErr('Arquivo muito grande. Máximo 10 MB.'); return }
    setFileErr('')
    setFile(f)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!amount || Number(amount) <= 0) return
    setSaving(true)
    try {
      const payment = await onAddPayment(bill.id, {
        amount:  Number(amount),
        paid_at: paidAt,
        notes:   notes || null,
      })
      if (file && payment?.id) {
        await onUpload(bill.id, file, payment.id)
      }
      setAmount(''); setPaidAt(today); setNotes(''); setFile(null)
    } catch {}
    finally { setSaving(false) }
  }

  async function handleViewAtt(att) {
    const url = await onGetUrl(att.storage_path)
    if (url) window.open(url, '_blank')
  }

  // Remove comprovante + atualiza UI local imediatamente
  async function handleRemoveAtt(att) {
    try {
      await onRemoveAttachment(att.id, att.storage_path)
      // Marca como removido localmente para sumir da UI imediatamente
      setRemovedIds(prev => new Set([...prev, att.id]))
      setAttDelTarget(null)
    } catch {}
  }

  // Upload de comprovante em pagamento existente
  async function handleUploadForPayment(file, paymentId) {
    await onUpload(bill.id, file, paymentId)
  }

  const statusColor = {
    aberto:    'text-sky-600 bg-sky-50',
    parcial:   'text-amber-600 bg-amber-50',
    pago:      'text-emerald-600 bg-emerald-50',
    vencido:   'text-rose-600 bg-rose-50',
    cancelado: 'text-slate-500 bg-slate-100',
  }[bill.status] ?? 'text-slate-500 bg-slate-100'

  const statusLabel = {
    aberto: 'Em aberto', parcial: 'Parcialmente pago',
    pago: 'Pago', vencido: 'Vencido', cancelado: 'Cancelado',
  }[bill.status] ?? bill.status

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Pagamentos"
        subtitle={bill.description}
        size="md"
        footer={<button onClick={onClose} className="btn-secondary">Fechar</button>}
      >
        <div className="flex flex-col gap-5">

          {/* Resumo */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
              <p className="text-xs text-slate-400 mb-0.5">Valor total</p>
              <p className="font-display font-black text-lg text-slate-800" style={{ fontFamily: 'Nunito, sans-serif' }}>
                {fmtCurrency(bill.amount)}
              </p>
            </div>
            <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100">
              <p className="text-xs text-emerald-600 mb-0.5">Total pago</p>
              <p className="font-display font-black text-lg text-emerald-700" style={{ fontFamily: 'Nunito, sans-serif' }}>
                {fmtCurrency(totalPaid)}
              </p>
            </div>
            <div className={`rounded-xl p-3 border ${remaining <= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
              <p className={`text-xs mb-0.5 ${remaining <= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>Saldo restante</p>
              <p className={`font-display font-black text-lg ${remaining <= 0 ? 'text-emerald-700' : 'text-rose-600'}`}
                 style={{ fontFamily: 'Nunito, sans-serif' }}>
                {fmtCurrency(Math.max(remaining, 0))}
              </p>
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusColor}`}>{statusLabel}</span>
            <span className="text-xs text-slate-400">Vencimento: {fmtDate(bill.due_date)}</span>
          </div>

          {/* Observação do boleto */}
          {bill.notes && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-1">Observação</p>
              <p className="text-sm text-amber-900 leading-relaxed whitespace-pre-wrap">{bill.notes}</p>
            </div>
          )}

          {/* ── Histórico de pagamentos ── */}
          {payments.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                Histórico de pagamentos
              </p>
              <div className="flex flex-col gap-3">
                {payments
                  .slice()
                  .sort((a, b) => a.paid_at.localeCompare(b.paid_at))
                  .map(p => {
                    const att = bill.attachments?.find(a => a.payment_id === p.id)
                    return (
                      <div key={p.id} className="rounded-xl border border-slate-100 bg-white px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                            <CheckCircle2 size={16} className="text-emerald-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-800">{fmtCurrency(p.amount)}</p>
                            <p className="text-xs text-slate-400">{fmtDate(p.paid_at)}{p.notes ? ` — ${p.notes}` : ''}</p>
                          </div>
                          {/* Excluir pagamento */}
                          <button
                            onClick={() => setDelTarget(p)}
                            className="p-1.5 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all shrink-0"
                            title="Excluir pagamento"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>

                        {/* Comprovante — sempre visível, com opção de anexar se não tiver */}
                        <AttachmentRow
                          payment={p}
                          attachment={att}
                          removedIds={removedIds}
                          onView={handleViewAtt}
                          onRemove={att => setAttDelTarget(att)}
                          onUpload={handleUploadForPayment}
                        />
                      </div>
                    )
                  })
                }
              </div>
            </div>
          )}

          {/* ── Novo pagamento — só para contas não pagas/canceladas ── */}
          {bill.status !== 'pago' && bill.status !== 'cancelado' && (
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">
                {payments.length > 0 ? 'Registrar novo pagamento' : 'Registrar pagamento'}
              </p>
              <form onSubmit={handleSubmit} className="flex flex-col gap-3 border border-slate-200 rounded-xl p-4 bg-slate-50">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">Valor pago (R$) *</label>
                    <input
                      type="number" min="0.01" step="0.01"
                      className="input bg-white"
                      placeholder={remaining > 0 ? fmtCurrency(remaining).replace('R$\u00a0','') : '0,00'}
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                    />
                    {remaining > 0 && (
                      <button type="button" onClick={() => setAmount(remaining.toFixed(2))}
                        className="text-xs text-rose-500 hover:text-rose-600 font-semibold mt-1 transition-colors">
                        Pagar total ({fmtCurrency(remaining)})
                      </button>
                    )}
                  </div>
                  <div>
                    <label className="form-label">Data do pagamento *</label>
                    <input type="date" className="input bg-white" value={paidAt} onChange={e => setPaidAt(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="form-label">Observação</label>
                  <input className="input bg-white" placeholder="Ex: Pago com desconto, via PIX..."
                    value={notes} onChange={e => setNotes(e.target.value)} />
                </div>
                {/* Upload junto ao novo pagamento */}
                <div>
                  <label className="form-label">Comprovante (opcional)</label>
                  {file ? (
                    <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-white">
                      <FileIcon type={file.type} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-700 truncate">{file.name}</p>
                        <p className="text-xs text-slate-400">{(file.size/1024).toFixed(0)} KB</p>
                      </div>
                      <button type="button" onClick={() => setFile(null)}
                        className="p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all">
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div
                      onClick={() => inputRef.current?.click()}
                      onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
                      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                      onDragLeave={() => setDragOver(false)}
                      className={`border-2 border-dashed rounded-xl p-4 flex items-center gap-3 cursor-pointer transition-all ${
                        dragOver ? 'border-rose-400 bg-rose-50' : 'border-slate-200 hover:border-slate-300 hover:bg-white'
                      }`}
                    >
                      <Upload size={18} className="text-slate-400 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-slate-500">Clique ou arraste o comprovante</p>
                        <p className="text-xs text-slate-400">PDF, JPG ou PNG — máx. 10 MB</p>
                      </div>
                    </div>
                  )}
                  <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden"
                    onChange={e => handleFile(e.target.files[0])} />
                  {fileErr && <p className="text-xs text-rose-500 mt-1">{fileErr}</p>}
                </div>
                <button type="submit" disabled={!amount || Number(amount) <= 0 || saving} className="btn-primary">
                  {saving
                    ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <><Plus size={16} /> Registrar pagamento</>
                  }
                </button>
              </form>
            </div>
          )}

        </div>
      </Modal>

      {/* Confirmar exclusão de pagamento */}
      <ConfirmDialog
        open={!!delTarget}
        onClose={() => setDelTarget(null)}
        onConfirm={async () => {
          try { await onDeletePayment(delTarget.id); setDelTarget(null) } catch {}
        }}
        loading={loading}
        title="Excluir pagamento?"
        description={`Pagamento de ${fmtCurrency(delTarget?.amount)} em ${fmtDate(delTarget?.paid_at)} será removido. O comprovante vinculado também será excluído.`}
        confirmLabel="Excluir pagamento"
      />

      {/* Confirmar remoção só do comprovante */}
      <ConfirmDialog
        open={!!attDelTarget}
        onClose={() => setAttDelTarget(null)}
        onConfirm={() => handleRemoveAtt(attDelTarget)}
        loading={loading}
        title="Remover comprovante?"
        description="O arquivo será removido. O pagamento e o status da conta não serão alterados."
        confirmLabel="Remover comprovante"
      />
    </>
  )
}
