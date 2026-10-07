// Ao instalar: abre a tela pra colar o código do computador.
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const { token } = await chrome.storage.local.get('token')
  if (reason === 'install' || !token) chrome.runtime.openOptionsPage()
})

// Clique no ícone = "sincronizar agora". Sem código ainda → configurar.
// Se a aba atual é a Central de Vendedores do ML, sincroniza nela;
// senão abre a Gestão de Envios Full do ML já pedindo a sincronização.
const INBOUNDS = 'https://vendedores.mercadolivre.com.br/shipping/inbounds#coisapet-sync'

chrome.action.onClicked.addListener(async tab => {
  const { token } = await chrome.storage.local.get('token')
  if (!token) return chrome.runtime.openOptionsPage()
  if (tab?.url?.startsWith('https://vendedores.mercadolivre.com.br/')) {
    try { await chrome.tabs.sendMessage(tab.id, { type: 'coisapet-sync-now' }); return } catch { /* aba aberta antes da extensão: abre outra */ }
  }
  chrome.tabs.create({ url: INBOUNDS })
})
