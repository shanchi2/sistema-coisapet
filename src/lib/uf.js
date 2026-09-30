// Estado → sigla (UF). O banco tem os dois formatos misturados:
// - sigla ("SP"): ML (state.id "BR-SP") e Shopee via código do hub de entrega;
// - por extenso ("São Paulo"): planilha exportada da Shopee.
// A Shopee também manda mascarado ("****") pela API — vira null.
const UF_BY_NAME = {
  'acre': 'AC', 'alagoas': 'AL', 'amapa': 'AP', 'amazonas': 'AM', 'bahia': 'BA', 'ceara': 'CE',
  'distrito federal': 'DF', 'espirito santo': 'ES', 'goias': 'GO', 'maranhao': 'MA', 'mato grosso': 'MT',
  'mato grosso do sul': 'MS', 'minas gerais': 'MG', 'para': 'PA', 'paraiba': 'PB', 'parana': 'PR',
  'pernambuco': 'PE', 'piaui': 'PI', 'rio de janeiro': 'RJ', 'rio grande do norte': 'RN',
  'rio grande do sul': 'RS', 'rondonia': 'RO', 'roraima': 'RR', 'santa catarina': 'SC',
  'sao paulo': 'SP', 'sergipe': 'SE', 'tocantins': 'TO',
}

export function toUF(value) {
  const v = String(value ?? '').trim()
  if (!v || /^\*+$/.test(v)) return null
  const m = v.match(/^(?:BR-)?([A-Za-z]{2})$/)
  if (m) return m[1].toUpperCase()
  return UF_BY_NAME[v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()] || null
}
