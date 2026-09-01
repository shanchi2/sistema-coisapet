import { useState } from 'react'
import { InfoTooltip } from './InfoTooltip'

// Sim/Não com valor livre "Outro" pra atributo booleano que a API não
// manda `values` (lista fechada) pra escolher — sem isso o campo virava
// texto livre puro, fácil de digitar algo fora do padrão.
const BOOLEAN_PRESET = ['Sim', 'Não']

// `field` guarda ou {value_id} (lista fechada) ou {value_name} (texto
// livre/booleano) — nunca os dois.
// Usado tanto na edição de um anúncio existente (MlItemDetailPage,
// `attr.current_value*` preenchido) quanto na criação de um anúncio novo
// (MlCreateListingPage, `attr.current_value*` sempre vazio) — mesmo
// componente, o único formato de atributo que a API do ML entende.
export function AttributeRow({ attr, value, onChange }) {
  const editable = !attr.is_variation_attribute
  const hasClosedList = (attr.value_type === 'list' || attr.value_type === 'boolean') && attr.values?.length
  const isBooleanFreeform = attr.value_type === 'boolean' && !attr.values?.length
  const isNumberUnit = attr.value_type === 'number_unit'

  const [booleanMode, setBooleanMode] = useState(() => {
    const v = value?.value_name
    if (!v) return ''
    return BOOLEAN_PRESET.includes(v) ? v : 'Outro'
  })

  // Medida/peso (comprimento, largura, peso da embalagem etc.) — o ML
  // exige o valor COM a unidade junto no texto ("20 cm", nunca só "20",
  // erro real visto em 2026-09-01: seller_package_dimensions rejeitado
  // por vir sem unidade). Guarda a unidade escolhida à parte e monta
  // "número unidade" só na hora de mandar pro form do pai.
  const [unit, setUnit] = useState(attr.default_unit || attr.allowed_units?.[0]?.id || '')
  const numberPart = value?.value_name ? value.value_name.split(' ')[0] : ''

  function handleNumberChange(numStr) {
    onChange(numStr.trim() ? { value_name: `${numStr.trim()} ${unit}` } : null)
  }
  function handleUnitChange(newUnit) {
    setUnit(newUnit)
    if (numberPart) onChange({ value_name: `${numberPart} ${newUnit}` })
  }

  function handleBooleanModeChange(mode) {
    setBooleanMode(mode)
    if (mode === 'Sim' || mode === 'Não') onChange({ value_name: mode })
    else onChange(null) // 'Outro' ou vazio — espera o usuário digitar (ou limpa)
  }

  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-slate-100 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-700 flex items-center gap-1.5">
          {attr.name}
          {attr.required && <span className="text-rose-400">*</span>}
          <InfoTooltip text={attr.hint} source={attr.hint_source}/>
        </p>
        {attr.current_value && <p className="text-xs text-slate-400 truncate">Atual: {attr.current_value}</p>}
        {attr.is_variation_attribute && <p className="text-[11px] text-sky-500">Controlado por variação — editar direto no Mercado Livre</p>}
        {editable && attr.default_value && !value && (
          <button type="button"
            onClick={() => {
              if (attr.default_value.value_id) onChange({ value_id: attr.default_value.value_id })
              else onChange({ value_name: attr.default_value.value_name })
              if (attr.value_type === 'boolean' && !attr.default_value.value_id) setBooleanMode('Outro')
            }}
            className="text-[11px] text-emerald-600 hover:text-emerald-700 underline underline-offset-2 mt-0.5">
            Usar padrão: "{attr.default_value.label}"
          </button>
        )}
      </div>
      {editable && (
        <div className="w-56 shrink-0 space-y-1.5">
          {hasClosedList ? (
            <select
              value={value?.value_id || ''}
              onChange={e => onChange(e.target.value ? { value_id: e.target.value } : null)}
              className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-400 bg-white"
            >
              <option value="">{attr.current_value ? 'Manter atual' : 'Selecione...'}</option>
              {attr.values.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          ) : isBooleanFreeform ? (
            <>
              <select
                value={booleanMode}
                onChange={e => handleBooleanModeChange(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-400 bg-white"
              >
                <option value="">{attr.current_value ? 'Manter atual' : 'Selecione...'}</option>
                <option value="Sim">Sim</option>
                <option value="Não">Não</option>
                <option value="Outro">Outro...</option>
              </select>
              {booleanMode === 'Outro' && (
                <input
                  type="text"
                  value={value?.value_name && !BOOLEAN_PRESET.includes(value.value_name) ? value.value_name : ''}
                  onChange={e => onChange(e.target.value.trim() ? { value_name: e.target.value } : null)}
                  placeholder="Digite o valor..."
                  className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-400"
                />
              )}
            </>
          ) : isNumberUnit ? (
            <div className="flex gap-1.5">
              <input
                type="number" inputMode="decimal" step="any"
                value={numberPart}
                onChange={e => handleNumberChange(e.target.value)}
                placeholder={attr.current_value?.split(' ')[0] || '0'}
                className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-400"
              />
              {attr.allowed_units?.length > 1 ? (
                <select value={unit} onChange={e => handleUnitChange(e.target.value)}
                  className="text-xs border border-slate-200 rounded-lg px-1.5 focus:outline-none focus:border-emerald-400 bg-white shrink-0">
                  {attr.allowed_units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              ) : (
                <span className="text-xs text-slate-400 self-center px-1 shrink-0">{unit}</span>
              )}
            </div>
          ) : (
            <input
              type="text"
              value={value?.value_name || ''}
              onChange={e => onChange(e.target.value.trim() ? { value_name: e.target.value } : null)}
              placeholder={attr.current_value || 'Digite o valor...'}
              className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-400"
            />
          )}
        </div>
      )}
    </div>
  )
}
