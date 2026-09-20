// Mesmo problema resolvido no frontend (src/lib/dateBR.js), aqui pro lado
// Deno/edge functions: nunca usar `new Date(...).toISOString().slice(0,10)`
// pra extrair "que dia é esse timestamp" — isso pega o dia em UTC, e
// qualquer instante entre 21h e 23h59 de Brasília já é "amanhã" em UTC.
// Achado 19/09 num epoch (`ship_by_date`) da Shopee sendo cortado assim
// e gravado direto em `orders.ship_date` (a fonte única de verdade do
// Picklist/Expedição) — pedido podia ir pro dia errado por causa disso.
export function toISODateBR(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(date)
}
