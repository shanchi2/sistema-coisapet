import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import QRCode from 'qrcode'
import toast from 'react-hot-toast'
import {
  ChevronLeft, ChevronRight, HandCoins, QrCode, Copy, Check, Upload, FileText,
  AlertTriangle, CheckCircle2, Clock, Paperclip, Loader2, KeyRound,
} from 'lucide-react'
import { Modal } from '../../../components/ui/Modal'
import { EmployeeTypeBadge } from '../../../lib/employeeType'
import { PIX_KEY_TYPES, pixKeyProblem } from '../../../lib/pix'
import { supabase } from '../../../lib/supabase'
import { useHonorarios, MONTHS, fmtBRL } from './useHonorarios'

// ─────────────────────────────────────────────────────────────────────
// Pagamento de Honorários (06/10, pedido do Raphael). Só diretor.
// Fluxo: escolhe a competência → "Efetuar pagamento" → confere/edita o
// valor (edição exige motivo) → Gerar Pix (QR + copia e cola) → paga no
// banco → "Confirmar pagamento" (comprovante agora ou depois).
// Ao confirmar, dá baixa no lançamento do Fin. Diretoria e o comprovante
// aparece como "Recibo" do mês na ficha do funcionário.
// ─────────────────────────────────────────────────────────────────────

const keyTypeLabel = t => PIX_KEY_TYPES.find(k => k.v === t)?.label || 'Chave'

async function openReceipt(path) {
  const { data } = await supabase.storage.from('employee-docs').createSignedUrl(path, 3600)
  if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  else toast.error('Não consegui abrir o comprovante.')
}

function defaultCompetence() {
  const d = new Date()
  d.setDate(1); d.setMonth(d.getMonth() - 1) // mês passado (paga-se no começo do mês seguinte)
  return { y: d.getFullYear(), m: d.getMonth() + 1 }
}

export function HonorariosPage() {
  const api = useHonorarios()
  const { load } = api
  const [{ y, m }, setComp] = useState(defaultCompetence)
  const [rows, setRows] = useState(null)
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(null) // linha aberta no modal

  const reload = useCallback(async () => {
    setLoading(true)
    try { setRows(await load(y, m)) }
    catch (e) { toast.error('Erro ao carregar: ' + e.message) }
    finally { setLoading(false) }
  }, [load, y, m])
  useEffect(() => { reload() }, [reload])

  const shift = delta => setComp(({ y, m }) => {
    const d = new Date(y, m - 1 + delta, 1)
    return { y: d.getFullYear(), m: d.getMonth() + 1 }
  })

  const totals = useMemo(() => {
    const r = rows || []
    const paid = r.filter(x => x.payment?.status === 'pago')
    return {
      toPay: r.filter(x => x.payment?.status !== 'pago').reduce((s, x) => s + (x.payment?.amount ?? x.amount), 0),
      paid: paid.reduce((s, x) => s + Number(x.payment.amount), 0),
      paidCount: paid.length,
      pending: r.length - paid.length,
    }
  }, [rows])

  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-emerald-50 flex items-center justify-center"><HandCoins className="text-emerald-600" size={22} /></div>
          <div>
            <h1 className="text-xl font-display font-bold text-slate-800">Pagamento de Honorários</h1>
            <p className="text-sm text-slate-400">Gera o Pix do mês de cada colaborador, com o valor já calculado.</p>
          </div>
        </div>
        <div className="flex items-center gap-1 card !p-1.5 !rounded-xl">
          <button onClick={() => shift(-1)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><ChevronLeft size={18} /></button>
          <div className="text-center min-w-[150px]">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Competência</p>
            <p className="font-display font-extrabold text-slate-800 leading-tight">{MONTHS[m - 1]} {y}</p>
          </div>
          <button onClick={() => shift(1)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><ChevronRight size={18} /></button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card !p-4"><p className="text-[13px] font-semibold text-slate-500">A pagar</p><p className="font-display font-extrabold text-[26px] text-slate-800 mt-1">{fmtBRL(totals.toPay)}</p><p className="text-xs text-slate-400">{totals.pending} colaborador{totals.pending === 1 ? '' : 'es'}</p></div>
        <div className="card !p-4"><p className="text-[13px] font-semibold text-slate-500">Pago</p><p className="font-display font-extrabold text-[26px] text-slate-800 mt-1">{fmtBRL(totals.paid)}</p><p className="text-xs text-slate-400">{totals.paidCount} pagamento{totals.paidCount === 1 ? '' : 's'}</p></div>
        <div className="card !p-4 flex items-start gap-2"><AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" /><p className="text-xs text-slate-500">Valores calculados com o ponto de {MONTHS[m - 1]}. Confira os ajustes no <Link to="/rh/relatorio" className="font-semibold text-rose-500">Relatório de Ponto</Link> antes de pagar. Descontos (empréstimo, adiantamento) entram editando o valor, com o motivo.</p></div>
      </div>

      <div className={`table-wrapper transition-opacity ${loading ? 'opacity-60' : ''}`}>
        <table className="table">
          <thead>
            <tr><th>Colaborador</th><th>Como foi calculado</th><th className="text-right">Valor</th><th>Chave Pix</th><th>Status</th><th className="text-right">Ação</th></tr>
          </thead>
          <tbody>
            {rows === null ? (
              <tr><td colSpan={6} className="text-center text-slate-400 py-10">Carregando…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="text-center text-slate-400 py-10">Ninguém com valor a receber nesta competência.</td></tr>
            ) : rows.map(r => {
              const p = r.payment
              const keyErr = pixKeyProblem(r.user.pix_key, r.user.pix_key_type)
              const value = p?.amount ?? r.amount
              return (
                <tr key={r.user.id}>
                  <td>
                    <p className="font-semibold text-slate-800">{r.user.name}</p>
                    <div className="mt-0.5"><EmployeeTypeBadge type={r.user.employee_type} small /></div>
                  </td>
                  <td className="text-xs text-slate-500 max-w-[280px]">{r.note || <span className="text-slate-300">Sem salário/valor-hora na ficha</span>}</td>
                  <td className="text-right">
                    <p className="font-bold text-slate-800 tabular-nums">{fmtBRL(value)}</p>
                    {p && Math.abs(Number(p.amount) - Number(p.default_amount)) > 0.004 && (
                      <p className="text-[10px] text-amber-600" title={p.edit_reason || ''}>ajustado de {fmtBRL(p.default_amount)}</p>
                    )}
                  </td>
                  <td className="text-xs">
                    {keyErr
                      ? <span className="inline-flex items-center gap-1 text-amber-600 font-semibold"><AlertTriangle size={12} />{keyErr}</span>
                      : <span className="text-slate-600"><span className="text-slate-400">{keyTypeLabel(r.user.pix_key_type)}:</span> {r.user.pix_key}</span>}
                  </td>
                  <td>
                    {p?.status === 'pago' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full"><CheckCircle2 size={12} />Pago {new Date(p.paid_at).toLocaleDateString('pt-BR')}</span>
                    ) : p ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-sky-600 bg-sky-50 px-2 py-0.5 rounded-full"><QrCode size={12} />Pix gerado</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full"><Clock size={12} />A pagar</span>
                    )}
                    {p?.receipt_path && (
                      <button onClick={() => openReceipt(p.receipt_path)} className="ml-1.5 inline-flex items-center gap-1 text-xs font-semibold text-violet-500 hover:text-violet-600"><Paperclip size={12} />comprovante</button>
                    )}
                  </td>
                  <td className="text-right">
                    <button onClick={() => setActive(r)} className={p?.status === 'pago' ? 'btn-secondary text-xs' : 'btn-primary text-xs'}>
                      {p?.status === 'pago' ? (p.receipt_path ? 'Ver' : 'Anexar comprovante') : p ? 'Continuar' : 'Efetuar pagamento'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {active && (
        <PaymentModal row={active} y={y} m={m} api={api}
          onClose={() => setActive(null)}
          onChanged={async () => { const fresh = await api.load(y, m); setRows(fresh); setActive(a => a && (fresh.find(x => x.user.id === a.user.id) || null)) }} />
      )}
    </div>
  )
}

// ─── Modal do pagamento ─────────────────────────────────────────────
function PaymentModal({ row, y, m, api, onClose, onChanged }) {
  const u = row.user
  const p = row.payment
  const paid = p?.status === 'pago'
  const keyErr = pixKeyProblem(u.pix_key, u.pix_key_type)
  const [amountStr, setAmountStr] = useState(() => (Number(p?.amount ?? row.amount) || 0).toFixed(2).replace('.', ','))
  const [reason, setReason] = useState(p?.edit_reason || '')
  const [desc, setDesc] = useState(`Honorarios ${MONTHS[m - 1].slice(0, 3)}/${y}`)
  const [qr, setQr] = useState(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [file, setFile] = useState(null)

  const amount = Number(amountStr.replace(/\./g, '').replace(',', '.')) || 0
  const edited = Math.abs(amount - row.amount) > 0.004
  const payload = p?.pix_payload && Math.abs(Number(p.amount) - amount) < 0.005 ? p.pix_payload : null

  useEffect(() => {
    if (!payload) { setQr(null); return }
    QRCode.toDataURL(payload, { margin: 1, width: 240 }).then(setQr).catch(() => setQr(null))
  }, [payload])

  async function gerar() {
    if (amount <= 0) { toast.error('Informe um valor maior que zero.'); return }
    if (edited && !reason.trim()) { toast.error('Explique por que o valor foi alterado.'); return }
    setBusy(true)
    try { await api.generatePix({ row, y, m, amount, reason: reason.trim(), description: desc }); await onChanged() }
    catch (e) { toast.error('Erro ao gerar Pix: ' + e.message) }
    finally { setBusy(false) }
  }

  async function copiar() {
    try { await navigator.clipboard.writeText(payload); setCopied(true); setTimeout(() => setCopied(false), 2000); toast.success('Pix copiado! Cole no app do banco em Pix → Copia e Cola.') }
    catch { toast.error('Não consegui copiar — selecione o código e copie manualmente.') }
  }

  async function confirmar() {
    setBusy(true)
    try {
      if (file) await api.uploadReceipt({ payment: p, file, y, m })
      if (!paid) {
        const { data: fresh } = await supabase.from('employee_payments').select('*').eq('id', p.id).single()
        await api.markPaid({ row, payment: fresh, y, m })
      }
      toast.success(paid ? 'Comprovante anexado!' : `Pagamento de ${u.name.split(' ')[0]} confirmado!`)
      await onChanged()
      onClose()
    } catch (e) { toast.error('Erro: ' + e.message) }
    finally { setBusy(false) }
  }

  return (
    <Modal open onClose={busy ? () => {} : onClose} size="md"
      title={`${paid ? 'Pagamento' : 'Efetuar pagamento'} — ${u.name}`}
      subtitle={`Competência ${MONTHS[m - 1]}/${y}`}
      footer={<button onClick={onClose} className="btn-secondary" disabled={busy}>Fechar</button>}>
      <div className="flex flex-col gap-4">
        {/* Chave */}
        <div className={`rounded-xl border px-3 py-2.5 text-sm ${keyErr ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1"><KeyRound size={11} />Chave Pix</p>
          {keyErr ? (
            <p className="text-amber-700 font-semibold mt-0.5">{keyErr}. Cadastre em <Link to="/usuarios" className="underline">Usuários</Link> → ficha do colaborador → Contrato.</p>
          ) : (
            <p className="text-slate-700 mt-0.5"><b>{keyTypeLabel(u.pix_key_type)}:</b> {u.pix_key}{u.pix_holder && <span className="text-slate-400"> · titular {u.pix_holder}</span>}</p>
          )}
        </div>

        {!paid && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="form-label">Valor (R$)</label>
                <input className="input text-lg font-bold" inputMode="decimal" value={amountStr}
                  onChange={e => setAmountStr(e.target.value.replace(/[^\d,.]/g, ''))} />
                <p className="text-[11px] text-slate-400 mt-1">Padrão: {fmtBRL(row.amount)}{row.note ? ` — ${row.note}` : ''}</p>
              </div>
              <div>
                <label className="form-label">Descrição no Pix</label>
                <input className="input" maxLength={40} value={desc} onChange={e => setDesc(e.target.value)} />
                <p className="text-[11px] text-slate-400 mt-1">Aparece pro funcionário no extrato.</p>
              </div>
            </div>
            {edited && (
              <div>
                <label className="form-label">Por que o valor foi alterado? *</label>
                <textarea className="input min-h-[64px]" value={reason} onChange={e => setReason(e.target.value)}
                  placeholder="Ex: desconto do empréstimo (parcela 2/5) · adiantamento de R$300 em 15/09" />
              </div>
            )}
            <button onClick={gerar} disabled={busy || !!keyErr || amount <= 0} className="btn-primary flex items-center justify-center gap-2 disabled:opacity-50">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <QrCode size={15} />}
              {payload ? 'Gerar Pix de novo' : 'Gerar Pix pra pagamento'}
            </button>
          </>
        )}

        {/* Pix gerado */}
        {payload && !paid && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 flex flex-col sm:flex-row gap-4 items-center">
            {qr && <img src={qr} alt="QR Code Pix" className="w-40 h-40 rounded-lg bg-white p-1 shrink-0" />}
            <div className="flex-1 min-w-0 w-full">
              <p className="font-display font-extrabold text-2xl text-slate-800">{fmtBRL(p.amount)}</p>
              <p className="text-xs text-slate-500 mb-2">Escaneie o QR com o celular, ou copie e cole no banco em <b>Pix → Copia e Cola</b>. Chave e valor já vêm preenchidos — é só conferir e confirmar.</p>
              <button onClick={copiar} className="btn-primary w-full flex items-center justify-center gap-2">
                {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copiado!' : 'Copiar Pix copia e cola'}
              </button>
              <p className="text-[10px] text-slate-400 mt-2 break-all font-mono leading-tight select-all">{payload}</p>
            </div>
          </div>
        )}

        {paid && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
            <p className="font-bold flex items-center gap-1.5"><CheckCircle2 size={15} />Pago {fmtBRL(p.amount)} em {new Date(p.paid_at).toLocaleDateString('pt-BR')}{p.paid_by_name ? ` por ${p.paid_by_name}` : ''}</p>
            {p.edit_reason && <p className="text-xs mt-1">Ajuste: {p.edit_reason} (padrão era {fmtBRL(p.default_amount)})</p>}
            {p.receipt_path && <button onClick={() => openReceipt(p.receipt_path)} className="text-xs font-semibold text-violet-600 mt-1 flex items-center gap-1"><FileText size={12} />Ver comprovante</button>}
          </div>
        )}

        {/* Confirmar / comprovante */}
        {p && (!paid || !p.receipt_path) && (
          <div className="border-t border-slate-100 pt-4 flex flex-col gap-2">
            <label className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-slate-300 cursor-pointer hover:border-emerald-400 text-sm text-slate-600">
              <Upload size={15} className="text-slate-400" />
              <span className="truncate">{file ? file.name : 'Anexar comprovante (PDF ou imagem)' + (paid ? '' : ' — pode ser depois')}</span>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
            </label>
            <button onClick={confirmar} disabled={busy || (paid && !file)} className="btn-primary flex items-center justify-center gap-2 disabled:opacity-50 !bg-emerald-600 hover:!bg-emerald-700">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
              {paid ? 'Anexar comprovante' : 'Já paguei — confirmar pagamento'}
            </button>
            {!paid && <p className="text-[11px] text-slate-400 text-center">Dá baixa no lançamento do Fin. Diretoria. O comprovante vai pra ficha do funcionário (Holerites → Recibo).</p>}
          </div>
        )}
      </div>
    </Modal>
  )
}
