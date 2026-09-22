// Cache em memória (fora do componente, sobrevive a montar/desmontar a
// tela) pra "Saúde dos Anúncios" do ML — pedido do Raphael, 22/09: sair
// da tela (ex: abrir o detalhe de 1 anúncio) e voltar não deve escanear
// tudo de novo, só o primeiro carregamento da sessão (ou um clique
// explícito em "Atualizar"). Só reseta se a aba for recarregada de
// verdade (F5) — módulo é reavaliado do zero nesse caso.
export const mlHealthCache = {
  rows: null,       // null = nunca escaneado nesta sessão
  priceMap: null,
  adsSet: null,
  shippingFilter: 'all',
  search: '',
}
