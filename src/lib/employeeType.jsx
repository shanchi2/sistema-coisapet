// Tipo de vínculo do colaborador (system_users.employee_type) — fonte única
// pra badge, filtro e nome do documento mensal (01/10, pedido do Gabriel):
// só CLT recebe "Holerite"; Horista e Prestador (PJ) recebem "Recibo de
// pagamento". Escritório (contabilidade, advocacia…) não recebe documento.
export const EMPLOYEE_TYPES = [
  { v: 'clt',        label: 'CLT',        long: 'CLT',                         icon: '🏢', desc: 'Funcionário registrado',       cls: 'bg-sky-50 text-sky-700',       doc: 'Holerite',            docs: 'Holerites' },
  { v: 'horista',    label: 'Horista',    long: 'Horista',                     icon: '⏱️', desc: 'Recebe por hora trabalhada',   cls: 'bg-emerald-50 text-emerald-700', doc: 'Recibo de pagamento', docs: 'Recibos de pagamento' },
  { v: 'prestador',  label: 'Prestador',  long: 'Prestador de Serviço (PJ)',   icon: '🔧', desc: 'Prestador de serviço / PJ',    cls: 'bg-amber-50 text-amber-700',   doc: 'Recibo de pagamento', docs: 'Recibos de pagamento' },
  { v: 'escritorio', label: 'Escritório', long: 'Escritório',                  icon: '⚖️', desc: 'Contabilidade, advocacia...',  cls: 'bg-violet-50 text-violet-700', doc: null,                  docs: null },
]

export const typeInfo = v => EMPLOYEE_TYPES.find(t => t.v === v) || EMPLOYEE_TYPES[0]

// Nome do documento mensal de quem recebe (Holerite / Recibo de pagamento)
export const docName = (v, plural = false) => (plural ? typeInfo(v).docs : typeInfo(v).doc) || (plural ? 'Recibos de pagamento' : 'Recibo de pagamento')

export function EmployeeTypeBadge({ type, small = false, long = false }) {
  const t = typeInfo(type)
  return (
    <span className={`inline-flex items-center gap-1 font-bold rounded-full whitespace-nowrap ${small ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-0.5'} ${t.cls}`}>
      {t.icon} {long ? t.long : t.label}
    </span>
  )
}
