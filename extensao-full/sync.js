// CoisaPet — sincroniza a Gestão de Envios Full do ML com o sistema.
//
// Roda sozinho em qualquer página da Central de Vendedores do ML
// (vendedores.mercadolivre.com.br), usando a sessão já logada — o ML não
// tem API pública pra envios Full, só o painel. Mesma lógica do antigo
// favorito "Sincronizar Full CoisaPet" (scripts/ml-full-sync-bookmarklet.js).
//
// - Automático: no máximo a cada 2 horas.
// - Clique no ícone da extensão: força agora.
// - Detalhe (itens) só dos envios em aberto ou que mudaram nos últimos
//   7 dias; uma vez por semana busca o detalhe de todos.
// - Autoriza com o código do computador (gerado no sistema, revogável),
//   guardado só aqui no navegador — nenhuma senha dentro da extensão.
(() => {
  if (window.__coisapetFullSync) return
  window.__coisapetFullSync = true

  const INGEST_URL = 'https://lcybmdiqxmbqeuyeuhdj.supabase.co/functions/v1/ml-full-shipments-ingest'
  const BASE = 'https://vendedores.mercadolivre.com.br'
  const AUTO_EVERY_MS = 2 * 60 * 60 * 1000
  const FULL_EVERY_MS = 7 * 24 * 60 * 60 * 1000
  const TERMINAL = ['closed_ok', 'closed_with_changes', 'cancelled', 'expired']
  let running = false

  const sleep = ms => new Promise(r => setTimeout(r, ms))

  // Aviso discreto no canto da tela do ML
  let pill
  function notify(text, kind = 'info', hideAfter = 0) {
    if (!pill) {
      pill = document.createElement('div')
      pill.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:2147483647;font:600 12px/1.4 system-ui,sans-serif;padding:8px 12px;border-radius:10px;box-shadow:0 4px 14px rgba(0,0,0,.18);max-width:340px;cursor:pointer'
      pill.title = 'CoisaPet — clique pra fechar'
      pill.onclick = () => { pill.remove(); pill = null }
      document.body.appendChild(pill)
    }
    const [bg, fg] = { info: ['#0f172a', '#fff'], ok: ['#059669', '#fff'], error: ['#e11d48', '#fff'] }[kind]
    pill.style.background = bg; pill.style.color = fg
    pill.textContent = 'CoisaPet · ' + text
    if (hideAfter) { const p = pill; setTimeout(() => { if (pill === p) { p.remove(); pill = null } }, hideAfter) }
  }

  // A página de detalhe do envio não tem API JSON — os dados vêm embutidos
  // numa tag <script> de hidratação do painel do ML.
  function extractJsonAfter(text, marker) {
    const eq = text.indexOf('=', text.indexOf(marker))
    let i = eq + 1
    while (/\s/.test(text[i])) i++
    if (text[i] !== '{') return null
    let depth = 0, inStr = false, esc = false
    const start = i
    for (; i < text.length; i++) {
      const c = text[i]
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue }
      if (c === '"') { inStr = true; continue }
      if (c === '{') depth++
      else if (c === '}') { depth--; if (depth === 0) { i++; break } }
    }
    return text.slice(start, i)
  }
  function extractUnits(html) {
    const m = html.match(/<script[^>]*>[\s\S]*?appProps[\s\S]*?<\/script>/)
    if (!m) return null
    const jsonText = extractJsonAfter(m[0], '_n.ctx.r=')
    if (!jsonText) return null
    return JSON.parse(jsonText)?.appProps?.pageProps?.view?.data?.units ?? null
  }

  async function sync({ manual = false } = {}) {
    if (running) return
    running = true
    try {
      const { token, lastFullSync = 0 } = await chrome.storage.local.get(['token', 'lastFullSync'])
      if (!token) {
        if (manual) notify('cole o código do computador nas opções da extensão', 'error', 10000)
        return
      }
      const full = Date.now() - lastFullSync > FULL_EVERY_MS
      notify('sincronizando Envios Full…')

      const all = []
      let page = 1, total = Infinity
      while (all.length < total && page <= 50) {
        const offset = (page - 1) * 20
        const res = await fetch(`${BASE}/api/shipping/inbounds/search?query=&page=${page}&status=&orders=&offset=${offset}&limit=20`, { credentials: 'include' })
        if (res.status === 401 || res.status === 403) throw new Error('faça login no Mercado Livre como CoisaPet')
        if (!res.ok) throw new Error('lista de envios do ML respondeu HTTP ' + res.status)
        const data = await res.json()
        const results = data.results || []
        total = data.paging?.total ?? results.length
        all.push(...results)
        if (!results.length) break
        page++
      }

      const weekAgo = Date.now() - FULL_EVERY_MS
      const needDetail = all.filter(s => full || !TERMINAL.includes(s.status) || new Date(s.last_updated || 0).getTime() > weekAgo)
      const items = [], failed = []
      for (let k = 0; k < needDetail.length; k++) {
        const s = needDetail[k]
        notify(`lendo envio ${k + 1} de ${needDetail.length}…`)
        let units = null
        for (let attempt = 0; attempt < 3 && units === null; attempt++) {
          if (attempt) await sleep(800)
          try {
            const res = await fetch(`${BASE}/shipping/inbounds/${s.id}/details`, { credentials: 'include' })
            if (res.ok) units = extractUnits(await res.text())
          } catch { /* tenta de novo */ }
        }
        if (units === null) { failed.push(s.id); continue }
        units.forEach(u => items.push({ shipment_id: s.id, unit: u }))
        await sleep(300) // não martela o servidor do ML
      }

      const res = await fetch(INGEST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, source: 'extensao', shipments: all, items }),
      })
      const out = await res.json().catch(() => ({}))
      if (res.status === 401) throw new Error('código do computador inválido ou revogado — gere outro no sistema')
      if (!res.ok) throw new Error(out.error || 'sistema respondeu HTTP ' + res.status)

      const now = Date.now()
      await chrome.storage.local.set({ lastSync: now, lastResult: `${out.shipments_synced} envios, ${out.items_synced} itens`, ...(full && !failed.length ? { lastFullSync: now } : {}) })
      const warn = failed.length ? ` (${failed.length} sem detalhe, tenta de novo na próxima)` : ''
      notify(`Envios Full sincronizados ✓ ${out.shipments_synced} envios${warn}`, 'ok', manual ? 8000 : 5000)
    } catch (err) {
      console.error('[CoisaPet] erro na sincronização do Full:', err)
      await chrome.storage.local.set({ lastError: String(err.message || err), lastErrorAt: Date.now() })
      notify('erro ao sincronizar o Full — ' + (err.message || err), 'error', 15000)
    } finally {
      running = false
    }
  }

  chrome.runtime.onMessage.addListener(msg => { if (msg?.type === 'coisapet-sync-now') sync({ manual: true }) })

  ;(async () => {
    if (location.hash === '#coisapet-sync') {
      history.replaceState(null, '', location.pathname + location.search)
      return sync({ manual: true })
    }
    const { lastSync = 0 } = await chrome.storage.local.get('lastSync')
    if (Date.now() - lastSync > AUTO_EVERY_MS) sync()
  })()
})()
