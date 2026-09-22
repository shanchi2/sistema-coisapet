// Mesmo padrão do ML (ver ml-insights/healthPageCache.js) — cache em
// memória fora do componente, sobrevive a sair/voltar da tela. Pedido
// do Raphael, 22/09.
export const shopeeHealthCache = {
  rows: null, // null = nunca escaneado nesta sessão
  search: '',
}
