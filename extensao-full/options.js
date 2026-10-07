const $ = id => document.getElementById(id)
const fmt = ms => new Date(ms).toLocaleString('pt-BR')

async function render() {
  const s = await chrome.storage.local.get(['token', 'lastSync', 'lastResult', 'lastError', 'lastErrorAt'])
  $('token').value = s.token || ''
  const st = $('status')
  st.className = 'status'
  if (!s.token) { st.textContent = 'Ainda sem código — a sincronização não roda até você colar um.'; return }
  if (s.lastError && (!s.lastSync || s.lastErrorAt > s.lastSync)) {
    st.className = 'status err'
    st.textContent = `Último erro (${fmt(s.lastErrorAt)}): ${s.lastError}`
  } else if (s.lastSync) {
    st.className = 'status ok'
    st.textContent = `Última sincronização: ${fmt(s.lastSync)} — ${s.lastResult || ''}`
  } else {
    st.textContent = 'Código salvo. Abra a Central de Vendedores do Mercado Livre que a sincronização roda sozinha.'
  }
}

$('save').onclick = async () => {
  const token = $('token').value.trim()
  await chrome.storage.local.set({ token })
  await render()
  if (token) $('status').textContent = 'Código salvo ✓ Abra a Central de Vendedores do Mercado Livre (ou clique no ícone da extensão) pra sincronizar.'
}
render()
