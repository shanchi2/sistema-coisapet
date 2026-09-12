// Navegação, menu mobile, reveal-on-scroll, contadores animados e grid de
// produtos — tudo que NÃO é a mecânica do hero (isso fica em hero.js).
document.addEventListener('DOMContentLoaded', () => {

  // ── nav sólida ao rolar ──────────────────────────────────────────
  const nav = document.getElementById('nav')
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 60)
  }, { passive: true })

  // ── menu mobile ──────────────────────────────────────────────────
  const burger = document.getElementById('burger')
  const mobMenu = document.getElementById('mobMenu')
  const mobClose = document.getElementById('mobClose')
  function toggleMob() { mobMenu.classList.toggle('open') }
  burger.addEventListener('click', toggleMob)
  mobClose.addEventListener('click', toggleMob)
  mobMenu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => mobMenu.classList.remove('open')))

  // ── reveal on scroll ─────────────────────────────────────────────
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('up'); revealObserver.unobserve(e.target) }
    })
  }, { threshold: .15 })
  document.querySelectorAll('.reveal,.reveal-l,.reveal-r,.stagger').forEach(el => revealObserver.observe(el))

  // ── contadores animados ──────────────────────────────────────────
  function animateCount(el) {
    const target = parseFloat(el.dataset.count)
    const suffix = el.dataset.suffix || ''
    const decimal = el.dataset.decimal === 'true'
    const duration = 1400
    const start = performance.now()
    function tick(now) {
      const p = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      const val = target * eased
      el.textContent = (decimal ? val.toFixed(1) : Math.round(val)) + suffix
      if (p < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }
  const countObserver = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { animateCount(e.target); countObserver.unobserve(e.target) }
    })
  }, { threshold: .5 })
  document.querySelectorAll('.cred-num').forEach(el => countObserver.observe(el))

  // ── grid de produtos (curadoria real, ver assets/products/manifest.json) ──
  const PRODUCTS = [
    { name: 'Alimentador Interativo', category: 'Acessórios', price: 46.90, file: 'alimentador-interativo.webp' },
    { name: 'Banheira de Banho de Areia', category: 'Acessórios', price: 39.90, file: 'banheira-banho-areia.webp' },
    { name: 'Bebedouro Comedouro Cerâmica', category: 'Acessórios', price: 14.90, file: 'bebedouro-ceramica.webp' },
    { name: 'Brinquedo Labirinto Playground', category: 'Brinquedos', price: 29.90, file: 'labirinto-playground.webp' },
    { name: 'Caixa de Escavação Dig Box', category: 'Brinquedos', price: 44.90, file: 'caixa-escavacao-dig-box.webp' },
    { name: 'Comedouro Interativo', category: 'Acessórios', price: 26.90, file: 'comedouro-interativo.webp' },
    { name: 'Divisória Muro de Contenção', category: 'Terrários', price: 39.90, file: 'divisoria-terrario.webp' },
    { name: 'Enriquecimento Ambiental — Fibra de Côco', category: 'Insumos Naturais', price: 19.90, file: 'enriquecimento-fibra-coco.webp' },
    { name: 'Escada Especial com Esconderijo', category: 'Tocas', price: 24.90, file: 'escada-com-esconderijo.webp' },
    { name: 'Labirinto Esconderijo com Visor', category: 'Tocas', price: 109.90, file: 'labirinto-com-visor.webp' },
    { name: 'Pedras Seixo de Rio', category: 'Insumos Naturais', price: 21.90, file: 'pedras-seixo-de-rio.webp' },
    { name: 'Plataforma Elevada Dupla', category: 'Brinquedos', price: 49.90, file: 'plataforma-elevada-dupla.webp' },
  ]
  const fmtBRL = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const grid = document.getElementById('prodGrid')
  if (grid) {
    grid.innerHTML = PRODUCTS.map(p => `
      <div class="prod-card">
        <div class="prod-card-img"><img src="assets/products/${p.file}" alt="${p.name}" loading="lazy"/></div>
        <div class="prod-card-body">
          <div class="prod-cat">${p.category}</div>
          <div class="prod-name">${p.name}</div>
          <div class="prod-price">${fmtBRL(p.price)}</div>
        </div>
      </div>
    `).join('')
  }
})
