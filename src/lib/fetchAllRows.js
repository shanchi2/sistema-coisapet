// Busca TODAS as linhas de uma consulta, contornando o teto de 1000
// linhas por resposta do PostgREST/Supabase.
//
// Por que isso existe (21/09): esse teto é SILENCIOSO — não dá erro,
// só devolve menos linha do que existe. Achado ao vivo na Visão Geral
// da Shopee (`Content-Range: 0-999/2018`): o gráfico mostrava a receita
// de hoje despencando pra quase zero, quando na verdade o dia tinha
// mais de R$3 mil — as linhas do dia mais recente é que tinham sido
// cortadas. Sem ordenação explícita o corte cai em lugar imprevisível,
// por isso `buildQuery` DEVE aplicar um `.order()` estável.
//
// Já existia um `fetchAllInBatches` local em useOrdersReports.js com a
// mesma ideia; este aqui é a versão compartilhada pro resto do sistema.
export async function fetchAllRows(buildQuery, { pageSize = 1000, maxRows = 50000 } = {}) {
  const all = []
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await buildQuery(from, from + pageSize - 1)
    if (error) throw error
    all.push(...(data || []))
    if (!data || data.length < pageSize) break // última página
  }
  return all
}
