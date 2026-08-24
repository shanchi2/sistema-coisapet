/**
 * masks.js — Funções de máscara para campos de formulário
 *
 * Uso:
 *   import { maskPhone, maskCNPJ, maskCPF, maskCurrency, parseCurrency } from '../../../lib/masks'
 *
 *   <input value={form.phone} onChange={e => set('phone', maskPhone(e.target.value))} />
 */

// Remove tudo que não for dígito
const digits = s => s.replace(/\D/g, '')

// ── Telefone: (00) 00000-0000 ou (00) 0000-0000 ──────────────────
export function maskPhone(v) {
  const d = digits(v).slice(0, 11)
  if (d.length <= 2)  return `(${d}`
  if (d.length <= 6)  return `(${d.slice(0,2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`
}

// ── CNPJ: 00.000.000/0000-00 ─────────────────────────────────────
export function maskCNPJ(v) {
  const d = digits(v).slice(0, 14)
  if (d.length <= 2)  return d
  if (d.length <= 5)  return `${d.slice(0,2)}.${d.slice(2)}`
  if (d.length <= 8)  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`
}

// ── CPF: 000.000.000-00 ───────────────────────────────────────────
export function maskCPF(v) {
  const d = digits(v).slice(0, 11)
  if (d.length <= 3)  return d
  if (d.length <= 6)  return `${d.slice(0,3)}.${d.slice(3)}`
  if (d.length <= 9)  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`
}

// ── Moeda: R$ 0,00 ───────────────────────────────────────────────
// Formata enquanto o usuário digita, sempre mostrando R$ X.XXX,XX
export function maskCurrency(v) {
  // Pega só os dígitos
  const d = digits(String(v))
  if (!d || d === '0') return ''

  // Converte centavos → reais
  const num = parseInt(d, 10) / 100
  return num.toLocaleString('pt-BR', {
    style:                 'currency',
    currency:              'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

// Converte "R$ 1.234,56" → 1234.56 (número puro para salvar no banco)
export function parseCurrency(v) {
  if (!v) return 0
  const clean = String(v)
    .replace(/R\$\s?/, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .trim()
  return parseFloat(clean) || 0
}
