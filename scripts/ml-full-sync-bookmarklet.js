// Bookmarklet "Sincronizar Full CoisaPet" — cole isso (minificado numa
// linha só) como a URL de um favorito do navegador. Ao clicar nesse
// favorito ENQUANTO estiver na Central de Vendedores do Mercado Livre
// logado como CoisaPet, ele lê a Gestão de Envios Full (lista + detalhe
// de cada envio) usando a sua própria sessão logada — o ML não libera
// esses dados por nenhuma API pública, só pelo painel no navegador — e
// manda tudo pro nosso sistema, sem precisar pedir pro Claude fazer isso
// manualmente toda vez (pedido do Raphael, 13/09/2026).
//
// Fonte legível (NÃO é isso que vai no favorito — ver instruções no
// coisapet.md pra gerar a versão de uma linha só).
(async function () {
  const SECRET = '83ffdd87e7467636c3f73a70f2c5940c0fe7052e2356cbef'
  const INGEST_URL = 'https://lcybmdiqxmbqeuyeuhdj.supabase.co/functions/v1/ml-full-shipments-ingest'
  const BASE = 'https://vendedores.mercadolivre.com.br'

  // Extrai o objeto JSON completo que começa logo depois de `marker=`,
  // contando chaves balanceadas (ignorando chaves dentro de strings) —
  // mais robusto que cortar no primeiro/último "}" do texto.
  function extractJsonAfter(text, marker) {
    const eq = text.indexOf('=', text.indexOf(marker))
    let i = eq + 1
    while (/\s/.test(text[i])) i++
    if (text[i] !== '{') return null
    let depth = 0, inStr = false, esc = false
    const start = i
    for (; i < text.length; i++) {
      const c = text[i]
      if (inStr) {
        if (esc) esc = false
        else if (c === '\\') esc = true
        else if (c === '"') inStr = false
        continue
      }
      if (c === '"') { inStr = true; continue }
      if (c === '{') depth++
      else if (c === '}') { depth--; if (depth === 0) { i++; break } }
    }
    return text.slice(start, i)
  }

  // A página de detalhe do envio (`/shipping/inbounds/{id}/details`) não
  // tem uma API JSON própria — os dados vêm embutidos numa tag <script>
  // de hidratação do framework (Nordic/Fury) da própria Central de
  // Vendedores. `path` é tipo "appProps.pageProps.view.data.units".
  function extractSsrData(html, path) {
    const m = html.match(/<script[^>]*>[\s\S]*?appProps[\s\S]*?<\/script>/)
    if (!m) return null
    const jsonText = extractJsonAfter(m[0], '_n.ctx.r=')
    if (!jsonText) return null
    const parsed = JSON.parse(jsonText)
    return path.split('.').reduce((o, k) => (o == null ? o : o[k]), parsed)
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

  try {
    console.log('[CoisaPet] Buscando lista de envios Full...')
    // A lista TEM uma API JSON de verdade (usada pela paginação do
    // próprio painel do ML) — bem mais simples que raspar HTML.
    const allShipments = []
    let page = 1, total = Infinity
    while (allShipments.length < total) {
      const offset = (page - 1) * 20
      const res = await fetch(
        `${BASE}/api/shipping/inbounds/search?query=&page=${page}&status=&orders=&offset=${offset}&limit=20`,
        { credentials: 'include' }
      )
      if (!res.ok) throw new Error('Falha ao buscar lista (HTTP ' + res.status + ')')
      const data = await res.json()
      total = data.paging?.total ?? data.results.length
      allShipments.push(...(data.results || []))
      page++
      if (page > 50) break // trava de segurança, nunca deveria chegar aqui
    }
    console.log(`[CoisaPet] ${allShipments.length} envios encontrados. Buscando detalhe de cada um...`)

    // Buscar detalhe em paralelo (mesmo em lotes pequenos) faz o próprio
    // ML devolver página incompleta pra várias delas ao mesmo tempo —
    // testado ao vivo em 13/09: sequencial simples falhou 1 de 29,
    // paralelo em lotes de 5 falhou 15 de 29. Então é sequencial mesmo,
    // um de cada vez, com retry pra cobrir a falha ocasional.
    const failedIds = []
    const items = []
    for (const s of allShipments) {
      let units = null
      for (let attempt = 0; attempt < 3 && units === null; attempt++) {
        if (attempt > 0) await sleep(800)
        try {
          const res = await fetch(`${BASE}/shipping/inbounds/${s.id}/details`, { credentials: 'include' })
          if (!res.ok) continue
          const html = await res.text()
          units = extractSsrData(html, 'appProps.pageProps.view.data.units')
        } catch (e) { /* tenta de novo */ }
      }
      if (units === null) { console.warn('[CoisaPet] falha no detalhe do envio (3 tentativas)', s.id); failedIds.push(s.id); continue }
      for (const u of units) items.push({ shipment_id: s.id, unit: u })
      await sleep(300) // não martela o servidor do ML
    }
    console.log(`[CoisaPet] ${items.length} itens coletados. Enviando pro sistema...`)

    const ingestRes = await fetch(INGEST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: SECRET, shipments: allShipments, items }),
    })
    const result = await ingestRes.json()
    if (!ingestRes.ok) throw new Error(result.error || 'Erro desconhecido')
    const warning = failedIds.length ? `\n\nAtenção: ${failedIds.length} envio(s) não atualizou (${failedIds.join(', ')}) — clique de novo pra tentar só esses.` : ''
    alert(`CoisaPet: sincronizado! ${result.shipments_synced} envios, ${result.items_synced} itens.${warning}`)
  } catch (err) {
    console.error('[CoisaPet] erro na sincronização:', err)
    alert('CoisaPet: erro ao sincronizar — ' + err.message + ' (veja o console do navegador pra detalhes)')
  }
})()
