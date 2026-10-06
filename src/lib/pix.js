// Pix "copia e cola" estático (BR Code / padrão EMV do Banco Central) —
// leva chave, valor e descrição; qualquer app de banco lê (colando o
// código em Pix → Copia e Cola, ou escaneando o QR). Sem integração e
// sem taxa. Usado no Pagamento de Honorários (06/10).
// Validado contra o exemplo oficial do Manual do BR Code (CRC 1D3D).

const field = (id, value) => id + String(value.length).padStart(2, '0') + value

// CRC16-CCITT-FALSE (poly 0x1021, init 0xFFFF) sobre o payload + "6304"
function crc16(str) {
  let crc = 0xFFFF
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8
    for (let j = 0; j < 8; j++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

// Nome/cidade/descrição: só ASCII simples (bancos recusam acento em alguns campos)
const ascii = (s, max) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^A-Za-z0-9 .,\-/]/g, '').trim().slice(0, max)

export const PIX_KEY_TYPES = [
  { v: 'cpf',       label: 'CPF' },
  { v: 'cnpj',      label: 'CNPJ' },
  { v: 'telefone',  label: 'Celular' },
  { v: 'email',     label: 'E-mail' },
  { v: 'aleatoria', label: 'Chave aleatória' },
]

// Deixa a chave no formato que o Pix exige pra cada tipo
export function normalizePixKey(key, type) {
  const k = String(key || '').trim()
  if (type === 'cpf' || type === 'cnpj') return k.replace(/\D/g, '')
  if (type === 'telefone') {
    const d = k.replace(/\D/g, '')
    return d.startsWith('55') && d.length >= 12 ? '+' + d : '+55' + d
  }
  if (type === 'email') return k.toLowerCase()
  return k // aleatória (EVP) vai como está
}

// Validação simples — evita gerar Pix com chave claramente errada
export function pixKeyProblem(key, type) {
  const k = normalizePixKey(key, type)
  if (!k) return 'Chave Pix não cadastrada'
  if (type === 'cpf' && k.length !== 11) return 'CPF deve ter 11 dígitos'
  if (type === 'cnpj' && k.length !== 14) return 'CNPJ deve ter 14 dígitos'
  if (type === 'telefone' && !/^\+55\d{10,11}$/.test(k)) return 'Celular deve ter DDD + número'
  if (type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(k)) return 'E-mail inválido'
  if (type === 'aleatoria' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k)) return 'Chave aleatória inválida'
  return null
}

/**
 * Monta o Pix copia e cola.
 * @param {object} p
 * @param {string} p.key        chave já normalizada (normalizePixKey)
 * @param {string} p.name       nome do recebedor (máx 25)
 * @param {string} p.city       cidade do recebedor (máx 15)
 * @param {number} [p.amount]   valor em reais (omitido = pagador digita)
 * @param {string} [p.description] aparece pro pagador (máx ~40)
 * @param {string} [p.txid]     identificador (A-Z0-9, máx 25; padrão ***)
 */
export function buildPixPayload({ key, name, city, amount, description, txid }) {
  const desc = ascii(description, 40)
  const mai = field('00', 'br.gov.bcb.pix') + field('01', key) + (desc ? field('02', desc) : '')
  const tx = String(txid || '***').replace(/[^A-Za-z0-9*]/g, '').slice(0, 25) || '***'
  let payload =
    field('00', '01') +
    field('26', mai) +
    field('52', '0000') +
    field('53', '986') +
    (amount > 0 ? field('54', Number(amount).toFixed(2)) : '') +
    field('58', 'BR') +
    field('59', ascii(name, 25) || 'RECEBEDOR') +
    field('60', ascii(city, 15) || 'BRASIL') +
    field('62', field('05', tx)) +
    '6304'
  return payload + crc16(payload)
}
