import { useState, useMemo } from 'react'
import {
  Plus, Search, Pencil, Trash2, Users, KeyRound,
  Phone, Mail, MapPin, Calendar, Clock, DollarSign,
  AlertCircle, ChevronRight, User, Shield, X,
  Cake, Briefcase, HeartHandshake, Camera, FileDown, WifiOff,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useSystemUsers }    from './hooks/useSystemUsers'
import { UserFormModal, ROLES, getRoleInfo } from './components/UserFormModal'
import { ConfirmDialog }     from '../../components/ui/ConfirmDialog'
import { EmptyState }        from '../../components/ui/EmptyState'
import { Modal }             from '../../components/ui/Modal'
import toast from 'react-hot-toast'

// ─── Helpers ──────────────────────────────────────────────────────
const fmtDate = d => !d ? '—' : new Date(d+'T12:00:00').toLocaleDateString('pt-BR')
const fmtDateLong = d => !d ? '—' : new Date(d+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'})
const fmtCurrency = v => v!=null ? Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) : '—'

function getAge(birthday) {
  if(!birthday) return null
  const today = new Date()
  const b = new Date(birthday+'T12:00:00')
  let age = today.getFullYear() - b.getFullYear()
  const m = today.getMonth() - b.getMonth()
  if(m<0||(m===0&&today.getDate()<b.getDate())) age--
  return age
}

function getYearsOfService(hireDate) {
  if(!hireDate) return null
  const today = new Date()
  const h = new Date(hireDate+'T12:00:00')
  const years = today.getFullYear() - h.getFullYear()
  const m = today.getMonth() - h.getMonth()
  const months = m<0 ? years*12 + m + 12 : years*12 + m
  if(months < 12) return `${months} ${months===1?'mês':'meses'}`
  const y = Math.floor(months/12)
  const rem = months % 12
  return `${y} ${y===1?'ano':'anos'}${rem>0?` e ${rem} ${rem===1?'mês':'meses'}`:''}`
}

function isUpcomingBirthday(birthday) {
  if(!birthday) return false
  const today = new Date()
  const b = new Date(birthday+'T12:00:00')
  const next = new Date(today.getFullYear(), b.getMonth(), b.getDate())
  if(next < today) next.setFullYear(today.getFullYear()+1)
  const diff = (next - today) / 86400000
  return diff <= 7
}

// ─── Ficha do colaborador (modal lateral) ─────────────────────────
// ─── Gerador de Ficha PDF ────────────────────────────────────────
async function gerarFichaPDF(u) {
  // Busca dados extras
  const [psR, atR, docsR, vrR] = await Promise.all([
    supabase.from('payslips').select('reference,month,year,file_url,mirror_url')
      .eq('employee_id', u.id).order('year',{ascending:false}).order('month',{ascending:false}).limit(24),
    supabase.from('medical_certificates').select('date,days_off,notes')
      .eq('employee_id', u.id).order('date',{ascending:false}).limit(20),
    supabase.from('employee_documents').select('name,doc_type,created_at')
      .eq('employee_id', u.id).order('created_at',{ascending:false}),
    supabase.from('vacation_requests').select('date_start,date_end,days,status,notes')
      .eq('employee_id', u.id).order('date_start',{ascending:false}).limit(20),
  ])
  const payslips = psR.data ?? []
  const atests   = atR.data ?? []
  const empDocs  = docsR.data ?? []
  const ferias   = vrR.data ?? []

  const fmtD = d => d ? new Date(d+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'}) : '—'
  const fmtM = d => d ? new Date(d+'T12:00:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'}) : '—'
  const fmtC = v => v ? Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) : '—'
  const getAge = b => { if(!b) return null; const t=new Date(),bd=new Date(b+'T12:00:00'); let a=t.getFullYear()-bd.getFullYear(); if(t<new Date(t.getFullYear(),bd.getMonth(),bd.getDate())) a--; return a }
  const getService = h => { if(!h) return null; const t=new Date(),hd=new Date(h+'T12:00:00'); let y=t.getFullYear()-hd.getFullYear(),m=t.getMonth()-hd.getMonth(); if(m<0){y--;m+=12} return y>0?`${y} ano${y>1?'s':''}${m>0?` e ${m} ${m>1?'meses':'mês'}`:''}`:`${m} ${m>1?'meses':'mês'}` }
  const typeLabel = {'clt':'CLT','prestador':'Prestador de Serviço','escritorio':'Escritório'}[u.employee_type] ?? 'CLT'
  const roleLabel = {'admin':'Diretor','administrativo':'Administrativo','atendimento':'Atendimento','producao':'Produção','equipe':'Equipe'}[u.role] ?? u.role
  const halfLabel = u.half_day ? 'Meio período — 5h/dia' : 'Integral — 8h44m/dia'
  const now = new Date().toLocaleString('pt-BR',{day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'})
  const age = getAge(u.birthday)
  const svc = getService(u.hire_date)

  const docTypeLabel = {rg:'RG',cpf:'CPF',cnh:'CNH',ctps:'CTPS',comp:'Comp. Residência',outro:'Outro'}

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>Ficha — ${u.name}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Nunito:wght@800;900&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Inter',sans-serif;background:#fff;color:#1e293b;font-size:13px;line-height:1.5}
  @media print{
    body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .no-print{display:none!important}
    @page{margin:16mm 14mm;size:A4}
  }

  /* ── Layout ── */
  .page{max-width:794px;margin:0 auto;padding:32px 36px}

  /* ── Header ── */
  .header-bar{height:8px;background:linear-gradient(90deg,#6E3F25,#C5904A);border-radius:6px 6px 0 0;margin-bottom:0}
  .header{display:flex;align-items:center;gap:20px;padding:24px 28px;background:linear-gradient(135deg,#2D1A0E 0%,#6E3F25 60%,#C5904A 100%);border-radius:0 0 20px 20px;margin-bottom:28px}
  .avatar{width:72px;height:72px;border-radius:16px;object-fit:cover;border:3px solid rgba(255,255,255,.25);flex-shrink:0;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:900;color:rgba(255,255,255,.9);font-family:'Nunito',sans-serif}
  .header-info{flex:1}
  .header-name{font-family:'Nunito',sans-serif;font-size:24px;font-weight:900;color:#fff;letter-spacing:-.5px;line-height:1.1;margin-bottom:3px}
  .header-role{font-size:12px;color:rgba(255,255,255,.7);margin-bottom:8px}
  .badges{display:flex;gap:6px;flex-wrap:wrap}
  .badge{display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;padding:3px 10px;border-radius:20px;letter-spacing:.2px}
  .badge-clt{background:rgba(255,255,255,.18);color:#fff}
  .badge-active{background:rgba(61,212,126,.25);color:#7ffab8}
  .badge-type{background:rgba(197,144,74,.3);color:#ffd59e}
  .header-meta{text-align:right;color:rgba(255,255,255,.6);font-size:10px;line-height:1.6}
  .header-meta strong{color:rgba(255,255,255,.9);font-weight:700}

  /* ── Seções ── */
  .section{margin-bottom:22px}
  .section-title{display:flex;align-items:center;gap:8px;font-size:9px;font-weight:800;color:#6E3F25;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #C5904A}
  .section-title svg{flex-shrink:0}

  /* ── Grid de campos ── */
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid #f1e8df;border-radius:12px;overflow:hidden}
  .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;border:1px solid #f1e8df;border-radius:12px;overflow:hidden}
  .field{padding:10px 14px;background:#fff}
  .field:nth-child(odd){background:#fdfaf7}
  .field-label{font-size:9px;font-weight:700;color:#8B6F5E;text-transform:uppercase;letter-spacing:.8px;margin-bottom:2px}
  .field-value{font-size:13px;font-weight:600;color:#1e293b}
  .field-value.mono{font-family:'Courier New',monospace;font-size:12px}
  .field-value.muted{color:#94a3b8;font-weight:400;font-style:italic}
  .field-value.highlight{color:#059669;font-weight:700}

  /* ── Tabela holerites ── */
  .table-wrap{border:1px solid #f1e8df;border-radius:12px;overflow:hidden;margin-top:2px}
  table{width:100%;border-collapse:collapse}
  th{background:#fdf4eb;font-size:9px;font-weight:800;color:#6E3F25;text-transform:uppercase;letter-spacing:.8px;padding:8px 14px;text-align:left}
  td{padding:8px 14px;font-size:12px;border-top:1px solid #f9f0e8;color:#334155}
  tr:nth-child(even) td{background:#fdfaf7}
  td.center{text-align:center}
  td.ok{color:#059669;font-weight:700;text-align:center}
  td.no{color:#cbd5e1;text-align:center}

  /* ── Docs ── */
  .docs-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:2px}
  .doc-item{display:flex;align-items:center;gap:8px;padding:8px 12px;background:#fdfaf7;border:1px solid #f1e8df;border-radius:10px}
  .doc-icon{width:28px;height:28px;background:#fdf4eb;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:14px}
  .doc-name{font-size:11px;font-weight:600;color:#1e293b;line-height:1.3}
  .doc-type{font-size:9px;color:#8B6F5E;text-transform:uppercase;letter-spacing:.5px;font-weight:700}

  /* ── Contatos múltiplos ── */
  .contact-row{display:flex;align-items:center;gap:12px;padding:8px 14px;background:#fdfaf7;border:1px solid #f1e8df;border-radius:10px;margin-bottom:6px}
  .contact-avatar{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#fdf4eb,#fce7cc);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;color:#C5904A;flex-shrink:0;font-family:'Nunito',sans-serif}
  .contact-info{flex:1}
  .contact-name{font-size:12px;font-weight:700;color:#1e293b}
  .contact-role{font-size:10px;color:#8B6F5E}
  .contact-detail{font-size:11px;color:#475569}

  /* ── Notas ── */
  .notes-box{background:#fdfaf7;border:1px solid #f1e8df;border-left:4px solid #C5904A;border-radius:0 10px 10px 0;padding:12px 16px;font-size:12px;color:#475569;line-height:1.6;white-space:pre-wrap}

  /* ── Rodapé ── */
  .footer{margin-top:32px;padding-top:16px;border-top:2px solid #f1e8df;display:flex;align-items:center;justify-content:space-between}
  .footer-brand{font-family:'Nunito',sans-serif;font-size:14px;font-weight:900;color:#6E3F25;letter-spacing:-.3px}
  .footer-info{font-size:9px;color:#94a3b8;text-align:right;line-height:1.5}

  /* ── Botão print ── */
  .print-btn{position:fixed;bottom:24px;right:24px;background:linear-gradient(135deg,#6E3F25,#C5904A);color:#fff;border:none;border-radius:16px;padding:14px 24px;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:8px;box-shadow:0 8px 24px rgba(110,63,37,.35);font-family:'Inter',sans-serif;letter-spacing:.2px;transition:transform .15s}
  .print-btn:hover{transform:scale(1.04)}
  .print-btn:active{transform:scale(.98)}
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header-bar"></div>
  <div class="header">
    ${u.photo_url
      ? `<img src="${u.photo_url}" class="avatar" alt="${u.name}"/>`
      : `<div class="avatar">${u.name.split(' ').map(n=>n[0]).slice(0,2).join('')}</div>`
    }
    <div class="header-info">
      <div class="header-name">${u.name}</div>
      <div class="header-role">${u.job_title || roleLabel}</div>
      <div class="badges">
        <span class="badge badge-active">✓ Ativo</span>
        <span class="badge badge-clt">${roleLabel}</span>
        <span class="badge badge-type">${typeLabel}</span>
        ${u.half_day ? '<span class="badge badge-type">½ Período</span>' : ''}
      </div>
    </div>
    <div class="header-meta">
      ${svc ? `<div><strong>${svc}</strong><br>na empresa</div>` : ''}
      ${u.hire_date ? `<div style="margin-top:4px">desde ${fmtD(u.hire_date)}</div>` : ''}
    </div>
  </div>

  <!-- Dados Pessoais -->
  <div class="section">
    <div class="section-title">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
      Dados Pessoais
    </div>
    <div class="grid2">
      <div class="field"><div class="field-label">CPF</div><div class="field-value mono">${u.cpf||'<span class="muted">não informado</span>'}</div></div>
      <div class="field"><div class="field-label">RG / Identidade</div><div class="field-value mono">${u.document_personal||'<span class="muted">não informado</span>'}</div></div>
      <div class="field"><div class="field-label">CNH</div><div class="field-value">${u.cnh||'<span class="muted">não informado</span>'}</div></div>
      <div class="field"><div class="field-label">Data de nascimento</div><div class="field-value">${u.birthday?`${fmtD(u.birthday)}${age!=null?' ('+age+' anos)':''}` : '<span class="muted">—</span>'}</div></div>
      <div class="field"><div class="field-label">Telefone</div><div class="field-value">${u.phone||'<span class="muted">—</span>'}</div></div>
      <div class="field"><div class="field-label">E-mail</div><div class="field-value mono">${u.email||'<span class="muted">—</span>'}</div></div>
      ${u.address ? `<div class="field" style="grid-column:1/-1"><div class="field-label">Endereço</div><div class="field-value">${u.address}</div></div>` : ''}
    </div>
  </div>

  <!-- Contrato -->
  <div class="section">
    <div class="section-title">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 12h6M9 8h6M9 16h4"/></svg>
      Contrato de Trabalho
    </div>
    <div class="grid2">
      <div class="field"><div class="field-label">Data de contratação</div><div class="field-value">${u.hire_date?`${fmtD(u.hire_date)}${svc?' — '+svc:''}` : '<span class="muted">—</span>'}</div></div>
      <div class="field"><div class="field-label">Regime de trabalho</div><div class="field-value">${halfLabel}</div></div>
      <div class="field"><div class="field-label">Salário bruto mensal</div><div class="field-value highlight">${fmtC(u.monthly_salary)}</div></div>
      <div class="field"><div class="field-label">Dia de pagamento</div><div class="field-value">Dia ${u.payment_day||5} de cada mês</div></div>
      <div class="field"><div class="field-label">Contrato assinado</div><div class="field-value">${u.contract_signed?'✓ Assinado':'✗ Pendente'}</div></div>
      <div class="field"><div class="field-label">Tipo de colaborador</div><div class="field-value">${typeLabel}</div></div>
      ${u.company_name ? `<div class="field"><div class="field-label">Razão social</div><div class="field-value">${u.company_name}</div></div>` : ''}
      ${u.company_cnpj ? `<div class="field"><div class="field-label">CNPJ</div><div class="field-value mono">${u.company_cnpj}</div></div>` : ''}
    </div>
  </div>

  <!-- Documentos -->
  ${empDocs.length > 0 ? `
  <div class="section">
    <div class="section-title">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      Documentos Anexados (${empDocs.length})
    </div>
    <div class="docs-grid">
      ${empDocs.map(d => `
        <div class="doc-item">
          <div class="doc-icon">${{rg:'🪪',cpf:'📄',cnh:'🚗',ctps:'📋',comp:'🏠',outro:'📎'}[d.doc_type]||'📎'}</div>
          <div>
            <div class="doc-type">${docTypeLabel[d.doc_type]||'Documento'}</div>
            <div class="doc-name">${d.name}</div>
          </div>
        </div>`).join('')}
    </div>
  </div>` : ''}

  <!-- Holerites -->
  ${payslips.length > 0 ? `
  <div class="section">
    <div class="section-title">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
      Holerites (${payslips.length} registros)
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Referência</th><th>Período</th><th style="text-align:center">Holerite</th><th style="text-align:center">Espelho</th></tr></thead>
        <tbody>
          ${payslips.map(p=>`<tr>
            <td><strong>${p.reference||'—'}</strong></td>
            <td>${String(p.month).padStart(2,'0')}/${p.year}</td>
            <td class="${p.file_url?'ok':'no'}">${p.file_url?'✓':'—'}</td>
            <td class="${p.mirror_url?'ok':'no'}">${p.mirror_url?'✓':'—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>` : ''}

  <!-- Atestados -->
  ${atests.length > 0 ? `
  <div class="section">
    <div class="section-title">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
      Atestados Médicos (${atests.length})
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Data</th><th>Dias afastado</th><th>Observações</th></tr></thead>
        <tbody>
          ${atests.map(a=>`<tr>
            <td><strong>${fmtD(a.date)}</strong></td>
            <td class="center">${a.days_off||'—'} dia${(a.days_off||0)>1?'s':''}</td>
            <td>${a.notes||'—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>` : ''}

  <!-- Férias -->
  ${ferias.length > 0 ? `
  <div class="section">
    <div class="section-title">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 2a7 7 0 017 7c0 4-7 13-7 13S5 13 5 9a7 7 0 017-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
      Férias (${ferias.length} período${ferias.length > 1 ? 's' : ''})
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Início</th><th>Fim</th><th style="text-align:center">Dias</th><th>Status</th><th>Observações</th></tr></thead>
        <tbody>
          ${ferias.map(v => {
            const stCls = {aprovado:'color:#059669;font-weight:700',pendente:'color:#d97706;font-weight:700',reprovado:'color:#dc2626;font-weight:700'}[v.status] || ''
            const stLbl = {aprovado:'✓ Aprovado',pendente:'⏳ Pendente',reprovado:'✗ Reprovado'}[v.status] || v.status
            return `<tr>
              <td><strong>${fmtD(v.date_start)}</strong></td>
              <td>${fmtD(v.date_end)}</td>
              <td class="center">${v.days || '—'}</td>
              <td style="${stCls}">${stLbl}</td>
              <td style="color:#64748b;font-size:11px">${v.notes || '—'}</td>
            </tr>`
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>` : ''}

  <!-- Emergência -->
  ${(u.emergency_name||u.emergency_phone) ? `
  <div class="section">
    <div class="section-title">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.15 11a19.79 19.79 0 01-3.07-8.67A2 2 0 012.06 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
      Contato de Emergência
    </div>
    <div class="grid2">
      <div class="field"><div class="field-label">Nome</div><div class="field-value">${u.emergency_name||'—'}</div></div>
      <div class="field"><div class="field-label">Telefone</div><div class="field-value">${u.emergency_phone||'—'}</div></div>
    </div>
  </div>` : ''}

  <!-- Observações -->
  ${u.notes ? `
  <div class="section">
    <div class="section-title">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      Observações
    </div>
    <div class="notes-box">${u.notes}</div>
  </div>` : ''}

  <!-- Footer -->
  <div class="footer">
    <div>
      <div class="footer-brand">🐾 CoisaPet</div>
      <div style="font-size:9px;color:#94a3b8;margin-top:2px">Documento confidencial — uso interno</div>
    </div>
    <div class="footer-info">
      Ficha gerada em ${now}<br/>
      ${u.name} · ${typeLabel}
    </div>
  </div>

</div>

<!-- Botão imprimir -->
<button class="print-btn no-print" onclick="window.print()">
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
  Salvar / Imprimir PDF
</button>

</body></html>`

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const win  = window.open(url, '_blank')
  if (!win) toast.error('Permita pop-ups para gerar a ficha.')
}

function EmployeeCard({ user: u, open, onClose, onEdit, onReset, onForceLogout, onPhotoUpload }) {
  if(!u) return null
  const roleInfo  = getRoleInfo(u.role)
  const age       = getAge(u.birthday)
  const service   = getYearsOfService(u.hire_date)
  const hourly    = u.monthly_salary && u.monthly_hours ? (u.monthly_salary / u.monthly_hours).toFixed(2) : null
  const isBday    = isUpcomingBirthday(u.birthday)
  const initials  = u.name.split(' ').map(n=>n[0]).slice(0,2).join('').toUpperCase()

  const Section = ({icon:Icon, label, children}) => (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-5 h-5 rounded-lg bg-slate-100 flex items-center justify-center">
          <Icon size={11} className="text-slate-500"/>
        </div>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">{label}</p>
      </div>
      <div className="flex flex-col gap-2 pl-1">{children}</div>
    </div>
  )

  const Row = ({label, value, mono=false, highlight=false}) => (
    <div className="flex justify-between items-start gap-4">
      <span className="text-xs text-slate-400 shrink-0">{label}</span>
      <span className={`text-sm font-semibold text-right ${mono?'font-mono':''} ${highlight?'text-emerald-600':'text-slate-700'}`}>
        {value || <span className="text-slate-300 font-normal">—</span>}
      </span>
    </div>
  )

  return (
    <Modal open={open} onClose={onClose} title="" size="lg"
      footer={
        <div className="flex gap-2 w-full">
          <button onClick={()=>{onReset(u);onClose()}} className="btn-secondary text-amber-600 border-amber-200 hover:bg-amber-50 px-3" title="Resetar senha">
            <KeyRound size={14}/>
          </button>
          <button onClick={()=>{onForceLogout(u);onClose()}} className="btn-secondary text-rose-600 border-rose-200 hover:bg-rose-50 px-3" title="Desconectar de qualquer dispositivo">
            <WifiOff size={14}/>
          </button>
          <button onClick={() => gerarFichaPDF(u)}
            className="btn-secondary flex items-center gap-1.5 text-indigo-600 border-indigo-200 hover:bg-indigo-50 px-3">
            <FileDown size={14}/> PDF
          </button>
          <button onClick={()=>{onEdit(u);onClose()}} className="btn-primary flex-1">
            <Pencil size={14}/> Editar ficha
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-5 -mt-2">

        {/* Cabeçalho do perfil */}
        <div className="flex items-start gap-4 p-4 bg-gradient-to-br from-slate-50 to-white rounded-2xl border border-slate-100">
          <div className="relative w-14 h-14 shrink-0 group/avatar">
            <div className="w-14 h-14 rounded-2xl overflow-hidden flex items-center justify-center text-xl font-black"
              style={u.photo_url ? {} : {fontFamily:'Nunito,sans-serif',background:'linear-gradient(135deg,#fce7f3,#fdf2f8)',color:'#e11d48'}}>
              {u.photo_url
                ? <img src={u.photo_url} alt={u.name} className="w-full h-full object-cover"/>
                : initials
              }
            </div>
            <label className="absolute inset-0 rounded-2xl bg-black/50 opacity-0 group-hover/avatar:opacity-100 transition-opacity cursor-pointer flex items-center justify-center"
              title="Trocar foto">
              <Camera size={16} className="text-white"/>
              <input type="file" accept="image/*" className="hidden" onChange={e => onPhotoUpload?.(e, u.id)}/>
            </label>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-slate-900 text-base leading-tight">{u.name}</h3>
            <p className="text-sm text-slate-500 mt-0.5">{u.job_title || roleInfo.label}</p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${roleInfo.color}`}>{roleInfo.label}</span>
              {!u.contract_signed && u.employee_type !== 'escritorio'
                ? <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-600">🔒 Acesso bloqueado</span>
                : u.must_change_password
                  ? <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-600">Aguardando 1º login</span>
                  : <><span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600">✓ Ativo</span>
                  <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full
                    ${u.employee_type === 'prestador' ? 'bg-amber-50 text-amber-600'
                      : u.employee_type === 'escritorio' ? 'bg-violet-50 text-violet-600'
                      : 'bg-slate-100 text-slate-500'}`}>
                    {u.employee_type === 'prestador' ? '🔧 Prestador'
                      : u.employee_type === 'escritorio' ? '⚖️ Escritório'
                      : '🏢 CLT'}
                  </span>
                  {u.role === 'escritorio' && u.escritorio_sector && (
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-cyan-50 text-cyan-600">
                      📋 {{advocacia:'Advocacia', marcas_patentes:'Marcas e Patentes'}[u.escritorio_sector] ?? u.escritorio_sector}
                    </span>
                  )}</>
              }
              {isBday && <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-pink-50 text-pink-500">🎂 Aniversário próximo!</span>}
            </div>
          </div>
        </div>

        {/* Contato */}
        <Section icon={Phone} label="Contato">
          <Row label="E-mail"    value={u.email}  mono/>
          <Row label="Telefone"  value={u.phone}/>
          <Row label="Endereço"  value={u.address}/>
        </Section>

        <div className="border-t border-slate-100"/>

        {/* Pessoal */}
        <Section icon={User} label="Dados pessoais">
          <Row label="CPF"         value={u.cpf} mono/>
          <Row label="Nascimento"  value={u.birthday ? `${fmtDateLong(u.birthday)}${age!=null?` (${age} anos)`:''}` : null}/>
        </Section>

        <div className="border-t border-slate-100"/>

        {/* Contrato */}
        <Section icon={Briefcase} label="Contrato">
          <Row label="Contratação"   value={u.hire_date ? `${fmtDateLong(u.hire_date)}${service?` — ${service}`:''}` : null}/>
          <Row label="Carga horária" value={u.monthly_hours ? `${u.monthly_hours}h / mês` : null}/>
          <Row label="Salário bruto" value={u.monthly_salary ? fmtCurrency(u.monthly_salary) : null} highlight={!!u.monthly_salary}/>
          {hourly && <Row label="Valor / hora" value={`${fmtCurrency(hourly)}/h`}/>}
        </Section>

        {/* Emergência */}
        {(u.emergency_name||u.emergency_phone) && <>
          <div className="border-t border-slate-100"/>
          <Section icon={HeartHandshake} label="Contato de emergência">
            <Row label="Nome"     value={u.emergency_name}/>
            <Row label="Telefone" value={u.emergency_phone}/>
          </Section>
        </>}

        {/* Observações */}
        {u.notes && <>
          <div className="border-t border-slate-100"/>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Observações</p>
            <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 rounded-xl p-3 border border-slate-100 whitespace-pre-wrap">{u.notes}</p>
          </div>
        </>}

      </div>
    </Modal>
  )
}

// ─── Modal de reset de senha ──────────────────────────────────────
function ResetPasswordModal({ open, onClose, user, onConfirm }) {
  const [loading, setLoading] = useState(false)
  async function handle() {
    setLoading(true)
    try { await onConfirm(user.id); onClose() }
    catch {} finally { setLoading(false) }
  }
  return (
    <Modal open={open} onClose={onClose} title="Resetar senha" size="sm"
      footer={<><button onClick={onClose} className="btn-secondary" disabled={loading}>Cancelar</button><button onClick={handle} className="btn-primary" disabled={loading}>{loading?<div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>:'Confirmar reset'}</button></>}>
      <div className="flex flex-col items-center text-center py-2 gap-3">
        <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center">
          <KeyRound size={24} className="text-amber-400"/>
        </div>
        <p className="text-slate-700 font-semibold">Resetar senha de <strong>{user?.name}</strong>?</p>
        <p className="text-sm text-slate-400">Uma nova senha aleatória será gerada e copiada. O usuário precisará trocá-la no próximo login.</p>
      </div>
    </Modal>
  )
}

// ─── Card de colaborador ──────────────────────────────────────────
function EmployeeListCard({ u, onView, onEdit, onDelete, onReset }) {
  const roleInfo = getRoleInfo(u.role)
  const initials = u.name.split(' ').map(n=>n[0]).slice(0,2).join('').toUpperCase()
  const service  = getYearsOfService(u.hire_date)
  const isBday   = isUpcomingBirthday(u.birthday)
  const hourly   = u.monthly_salary && u.monthly_hours ? (u.monthly_salary/u.monthly_hours).toFixed(2) : null

  return (
    <div
      className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer group hover:-translate-y-0.5"
      onClick={()=>onView(u)}
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl shrink-0 overflow-hidden flex items-center justify-center text-sm font-black"
              style={u.photo_url ? {} : {fontFamily:'Nunito,sans-serif',background:'linear-gradient(135deg,#fce7f3,#fdf2f8)',color:'#e11d48'}}>
              {u.photo_url
                ? <img src={u.photo_url} alt={u.name} className="w-full h-full object-cover"/>
                : initials
              }
            </div>
            <div>
              <p className="font-bold text-slate-800 leading-tight">{u.name}</p>
              <p className="text-xs text-slate-500">{u.job_title || roleInfo.label}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${roleInfo.color}`}>{roleInfo.label}</span>
            {u.employee_type && u.employee_type !== 'clt' && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full
                ${u.employee_type === 'prestador' ? 'bg-amber-50 text-amber-600' : 'bg-violet-50 text-violet-600'}`}>
                {u.employee_type === 'prestador' ? '🔧 Prestador' : '⚖️ Escritório'}
              </span>
            )}
            {u.role === 'escritorio' && u.escritorio_sector && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-50 text-cyan-600">
                📋 {{advocacia:'Advocacia', marcas_patentes:'Marcas e Patentes'}[u.escritorio_sector] ?? u.escritorio_sector}
              </span>
            )}
            {!u.contract_signed && u.employee_type !== 'escritorio' && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-500">🔒 Bloqueado</span>
            )}
            {isBday && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-pink-50 text-pink-500">🎂</span>}
          </div>
        </div>

        <div className="flex flex-col gap-1.5 mb-4">
          {u.email    && <div className="flex items-center gap-2 text-xs text-slate-500"><Mail size={11} className="shrink-0 text-slate-300"/>{u.email}</div>}
          {u.phone    && <div className="flex items-center gap-2 text-xs text-slate-500"><Phone size={11} className="shrink-0 text-slate-300"/>{u.phone}</div>}
          {u.hire_date&& <div className="flex items-center gap-2 text-xs text-slate-500"><Briefcase size={11} className="shrink-0 text-slate-300"/>{service ? `${service} de empresa` : fmtDate(u.hire_date)}</div>}
        </div>

{/* Salário oculto no card — visível apenas no modal de edição */}

        <div className="flex items-center justify-between">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${u.must_change_password?'bg-amber-50 text-amber-600':'bg-emerald-50 text-emerald-600'}`}>
            {u.must_change_password?'Aguardando login':'Ativo'}
          </span>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e=>e.stopPropagation()}>
            <button onClick={()=>onReset(u)} className="p-1.5 rounded-lg text-slate-300 hover:text-amber-500 hover:bg-amber-50 transition-all" title="Resetar senha"><KeyRound size={13}/></button>
            <button onClick={()=>onEdit(u)}  className="p-1.5 rounded-lg text-slate-300 hover:text-sky-500 hover:bg-sky-50 transition-all" title="Editar"><Pencil size={13}/></button>
            <button onClick={()=>onDelete(u)} className="p-1.5 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all" title="Remover"><Trash2 size={13}/></button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────
export function UsersPage() {
  const { users, loading, create, update, remove, resetPassword, forceLogout, refetch } = useSystemUsers()

  const [formOpen,     setFormOpen]     = useState(false)
  const [editing,      setEditing]      = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [resetTarget,  setResetTarget]  = useState(null)
  const [logoutTarget, setLogoutTarget] = useState(null)
  const [viewTarget,   setViewTarget]   = useState(null)
  const [saving,       setSaving]       = useState(false)
  const [search,       setSearch]       = useState('')
  const [filterRole,   setFilterRole]   = useState('')
  const [viewMode,     setViewMode]     = useState('cards') // 'cards' | 'table'

  const filtered = useMemo(()=>
    users.filter(u=>
      (!search    ||u.name.toLowerCase().includes(search.toLowerCase())||u.email.toLowerCase().includes(search.toLowerCase()))&&
      (!filterRole||u.role===filterRole)
    ),[users,search,filterRole])

  const counts = useMemo(()=>{
    const map={}
    ROLES.forEach(r=>{map[r.value]=0})
    users.forEach(u=>{map[u.role]=(map[u.role]??0)+1})
    return map
  },[users])

  const upcomingBdays = useMemo(()=>users.filter(u=>isUpcomingBirthday(u.birthday)),[users])

  async function handleSave(payload) {
    setSaving(true)
    try {
      if(editing)await update(editing.id,payload)
      else await create(payload)
      setFormOpen(false)
      setEditing(null)
    }catch{}finally{setSaving(false)}
  }

  async function handleDelete() {
    setSaving(true)
    try{await remove(deleteTarget.id);setDeleteTarget(null)}
    catch{}finally{setSaving(false)}
  }

  async function handleForceLogout() {
    setSaving(true)
    try{ await forceLogout(logoutTarget.id); setLogoutTarget(null) }
    catch{} finally{ setSaving(false) }
  }

  async function handleResetPassword(userId) {
    const upper='ABCDEFGHJKLMNPQRSTUVWXYZ',lower='abcdefghjkmnpqrstuvwxyz',digits='23456789',special='@#!$'
    const rand=s=>s[Math.floor(Math.random()*s.length)],all=upper+lower+digits+special
    const newPass=[rand(upper),rand(digits),rand(special),rand(lower),...Array.from({length:4},()=>rand(all))].sort(()=>Math.random()-.5).join('')
    await resetPassword(userId,newPass)
    navigator.clipboard.writeText(newPass)
    toast.success(`Nova senha: ${newPass} (copiada!)`,{duration:8000})
  }

  function openEdit(u){setEditing(u);setFormOpen(true)}

  async function handlePhotoUpload(e, userId) {
    const file = e.target.files[0]
    if (!file) return
    const ext  = file.name.split('.').pop()
    const path = `fotos/${userId}/foto.${ext}`
    await supabase.storage.from('employee-docs').remove([path])
    const { error } = await supabase.storage.from('employee-docs').upload(path, file)
    if (error) { toast.error('Erro no upload da foto.'); return }
    const { data } = await supabase.storage.from('employee-docs').createSignedUrl(path, 60 * 60 * 24 * 365)
    if (!data?.signedUrl) return
    await supabase.from('system_users').update({ photo_url: data.signedUrl }).eq('id', userId)
    toast.success('Foto atualizada!')
    refetch()
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in">

      {/* Cabeçalho */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Colaboradores</h2>
          <p className="page-subtitle">{users.length} colaborador{users.length!==1?'es':''} cadastrado{users.length!==1?'s':''}</p>
        </div>
        <button onClick={()=>{setEditing(null);setFormOpen(true)}} className="btn-primary">
          <Plus size={16}/> Novo colaborador
        </button>
      </div>

      {/* Aniversariantes da semana */}
      {upcomingBdays.length>0&&(
        <div className="flex items-center gap-3 p-4 bg-pink-50 border border-pink-200 rounded-2xl">
          <span className="text-2xl">🎂</span>
          <div>
            <p className="text-sm font-bold text-pink-700">Aniversário nos próximos 7 dias!</p>
            <p className="text-xs text-pink-500">{upcomingBdays.map(u=>u.name.split(' ')[0]).join(', ')}</p>
          </div>
        </div>
      )}

      {/* Cards por hierarquia */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {ROLES.map(role=>(
          <div key={role.value} onClick={()=>setFilterRole(filterRole===role.value?'':role.value)}
            className={`card cursor-pointer transition-all hover:shadow-md py-4 ${filterRole===role.value?'ring-2 ring-rose-400':''}`}>
            <div className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold mb-2 ${role.color}`}>{role.label}</div>
            <p className="font-black text-2xl text-slate-800" style={{fontFamily:'Nunito,sans-serif'}}>{counts[role.value]??0}</p>
            <p className="text-xs text-slate-400">{(counts[role.value]??0)===1?'colaborador':'colaboradores'}</p>
          </div>
        ))}
      </div>

      {/* Filtros + toggle de view */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input className="input pl-8" placeholder="Buscar por nome ou e-mail..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <select className="select w-auto min-w-[160px]" value={filterRole} onChange={e=>setFilterRole(e.target.value)}>
          <option value="">Todas as hierarquias</option>
          {ROLES.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
          <button onClick={()=>setViewMode('cards')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${viewMode==='cards'?'bg-white text-slate-800 shadow-sm':'text-slate-500'}`}>Cards</button>
          <button onClick={()=>setViewMode('table')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${viewMode==='table'?'bg-white text-slate-800 shadow-sm':'text-slate-500'}`}>Tabela</button>
        </div>
      </div>

      {/* Conteúdo */}
      {loading?(
        <div className="card flex justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-4 border-rose-100 border-t-rose-400 animate-spin"/>
            <p className="text-sm text-slate-400">Carregando colaboradores...</p>
          </div>
        </div>
      ):filtered.length===0?(
        <div className="card">
          <EmptyState icon={Users} title={users.length===0?'Nenhum colaborador cadastrado':'Nenhum resultado'}
            description={users.length===0?'Cadastre os colaboradores do sistema CoisaPet.':'Ajuste os filtros.'}
            action={users.length===0&&<button onClick={()=>setFormOpen(true)} className="btn-primary"><Plus size={16}/> Cadastrar primeiro colaborador</button>}/>
        </div>
      ):viewMode==='cards'?(
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(u=>(
            <EmployeeListCard key={u.id} u={u}
              onView={setViewTarget}
              onEdit={u=>{setEditing(u);setFormOpen(true)}}
              onDelete={setDeleteTarget}
              onReset={setResetTarget}/>
          ))}
        </div>
      ):(
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Hierarquia</th>
                <th>Cargo</th>
                <th>E-mail</th>
                <th>Contratação</th>
                {/* col salário oculta */}
                <th>Status</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(u=>{
                const ri=getRoleInfo(u.role)
                const service=getYearsOfService(u.hire_date)
                const isBday=isUpcomingBirthday(u.birthday)
                return(
                  <tr key={u.id} className="cursor-pointer hover:bg-slate-50" onClick={()=>setViewTarget(u)}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl shrink-0 overflow-hidden flex items-center justify-center text-xs font-black"
                          style={u.photo_url ? {} : {fontFamily:'Nunito,sans-serif',background:'linear-gradient(135deg,#fce7f3,#fdf2f8)',color:'#e11d48'}}>
                          {u.photo_url
                            ? <img src={u.photo_url} alt={u.name} className="w-full h-full object-cover"/>
                            : u.name.split(' ').map(n=>n[0]).slice(0,2).join('').toUpperCase()
                          }
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800">{u.name}</p>
                          {isBday&&<p className="text-[10px] text-pink-500 font-semibold">🎂 Aniversário próximo</p>}
                        </div>
                      </div>
                    </td>
                    <td><span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${ri.color}`}>{ri.label}</span></td>
                    <td className="text-slate-500 text-sm">{u.job_title??'—'}</td>
                    <td className="text-slate-500 text-sm font-mono">{u.email}</td>
                    <td className="text-slate-500 text-sm">{u.hire_date?<div><p>{fmtDate(u.hire_date)}</p>{service&&<p className="text-xs text-slate-400">{service}</p>}</div>:'—'}</td>
                    {/* Salário oculto na tabela — visível apenas no modal de edição */}
                    <td>{u.must_change_password?<span className="badge-warn">Aguardando 1º login</span>:<span className="badge-ok">Ativo</span>}</td>
                    <td onClick={e=>e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <button onClick={()=>setResetTarget(u)} className="p-1.5 rounded-lg text-slate-400 hover:text-amber-500 hover:bg-amber-50 transition-all" title="Resetar senha"><KeyRound size={15}/></button>
                        <button onClick={()=>openEdit(u)} className="p-1.5 rounded-lg text-slate-400 hover:text-sky-500 hover:bg-sky-50 transition-all" title="Editar"><Pencil size={15}/></button>
                        <button onClick={()=>setDeleteTarget(u)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all" title="Remover"><Trash2 size={15}/></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modais */}
      <EmployeeCard
        user={viewTarget}
        open={!!viewTarget}
        onClose={()=>setViewTarget(null)}
        onEdit={u=>{setEditing(u);setFormOpen(true)}}
        onReset={u=>setResetTarget(u)}
        onForceLogout={u=>setLogoutTarget(u)}
        onPhotoUpload={handlePhotoUpload}
      />
      <UserFormModal open={formOpen} onClose={()=>setFormOpen(false)} onSave={handleSave} initial={editing} loading={saving}/>
      <ResetPasswordModal open={!!resetTarget} onClose={()=>setResetTarget(null)} user={resetTarget} onConfirm={handleResetPassword}/>
      <ConfirmDialog
        open={!!logoutTarget} onClose={()=>setLogoutTarget(null)} onConfirm={handleForceLogout} loading={saving}
        title={`Desconectar "${logoutTarget?.name}"?`}
        description="A sessão dele será encerrada em qualquer dispositivo onde estiver logado, na próxima checagem automática do app (leva até ~1 minuto)."
        confirmLabel="Desconectar"
      />
      <ConfirmDialog
        open={!!deleteTarget} onClose={()=>setDeleteTarget(null)} onConfirm={handleDelete} loading={saving}
        title={`Remover "${deleteTarget?.name}"?`}
        description="O usuário será desativado e não conseguirá mais fazer login."
        confirmLabel="Remover colaborador"/>
    </div>
  )
}