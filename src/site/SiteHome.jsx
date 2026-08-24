import { useEffect, useState, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(
  'https://lcybmdiqxmbqeuyeuhdj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxjeWJtZGlxeG1icWV1eWV1aGRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MjYyMjMsImV4cCI6MjA4OTAwMjIyM30.gAFVxdM6TMuse27UiASfFiw0NwfdcGhvck7AUv9EXPM'
)

// ── Dados estáticos ───────────────────────────────────────────
const REVIEWS = [
  { txt: 'Meu hamster amou o terrário! Qualidade incrível, montagem super fácil e o atendimento foi maravilhoso. Com certeza voltarei a comprar!', author: 'Ana Paula R.' },
  { txt: 'Produto de altíssima qualidade. Chegou bem embalado e meu porquinho ficou muito confortável. Recomendo demais!', author: 'Carlos M.' },
  { txt: 'Já comprei várias tocas e acessórios. A CoisaPet entende muito do que os mini pets precisam. Produto sensacional!', author: 'Fernanda L.' },
  { txt: 'A rodinha silenciosa é incrível! Finalmente uma que não faz barulho à noite. Qualidade artesanal top!', author: 'Rodrigo S.' },
  { txt: 'Comprei o terrário completo e fiquei surpresa com a qualidade. Encaixe perfeito, material resistente. Adorei!', author: 'Juliana K.' },
  { txt: 'Minha chinchila ficou muito feliz com a toca nova. Produto super bem feito, vale cada centavo!', author: 'Marcos T.' },
]

const GRID_SIZES = [
  { rowSpan: 2, colSpan: 1 },
  { rowSpan: 1, colSpan: 1 },
  { rowSpan: 1, colSpan: 1 },
  { rowSpan: 1, colSpan: 1 },
  { rowSpan: 2, colSpan: 1 },
  { rowSpan: 1, colSpan: 1 },
  { rowSpan: 1, colSpan: 2 },
  { rowSpan: 1, colSpan: 1 },
  { rowSpan: 1, colSpan: 1 },
]

// ── Hook: scroll reveal ───────────────────────────────────────
function useReveal() {
  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('up'); obs.unobserve(e.target) } })
    }, { threshold: 0.15 })
    document.querySelectorAll('.reveal,.reveal-l,.reveal-r,.stagger').forEach(el => obs.observe(el))
    return () => obs.disconnect()
  }, [])
}

// ── Hook: cursor personalizado ────────────────────────────────
function useCursor() {
  const curRef  = useRef()
  const ringRef = useRef()
  useEffect(() => {
    let rx = 0, ry = 0, mx = 0, my = 0
    const onMove = e => { mx = e.clientX; my = e.clientY }
    document.addEventListener('mousemove', onMove)
    let raf
    const animate = () => {
      if (curRef.current)  { curRef.current.style.left  = mx + 'px'; curRef.current.style.top  = my + 'px' }
      if (ringRef.current) { rx += (mx - rx) * 0.12; ry += (my - ry) * 0.12; ringRef.current.style.left = rx + 'px'; ringRef.current.style.top = ry + 'px' }
      raf = requestAnimationFrame(animate)
    }
    animate()
    const hover = e => { if (e.target.closest('a,button,.pilar,.dif-item,.prod-card,.social-btn') && ringRef.current) ringRef.current.classList.add('hovered') }
    const unhover = () => { if (ringRef.current) ringRef.current.classList.remove('hovered') }
    document.addEventListener('mouseover', hover)
    document.addEventListener('mouseout', unhover)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseover', hover); document.removeEventListener('mouseout', unhover); cancelAnimationFrame(raf) }
  }, [])
  return { curRef, ringRef }
}

// ── Hook: count-up ────────────────────────────────────────────
function useCountUp(triggered) {
  useEffect(() => {
    if (!triggered) return
    document.querySelectorAll('[data-count]').forEach(el => {
      const target  = parseFloat(el.dataset.count)
      const suffix  = el.dataset.suffix || ''
      const decimal = el.dataset.decimal === 'true'
      const dur = 1800, start = Date.now()
      const step = () => {
        const p = Math.min(1, (Date.now() - start) / dur)
        const ease = 1 - Math.pow(1 - p, 3)
        el.textContent = (decimal ? (target * ease).toFixed(1) : Math.floor(target * ease).toLocaleString('pt-BR')) + suffix
        if (p < 1) requestAnimationFrame(step)
        else el.textContent = (decimal ? target : target.toLocaleString('pt-BR')) + suffix
      }
      step()
    })
  }, [triggered])
}

// ── Componente Products ───────────────────────────────────────
function Products() {
  const [items, setItems]     = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('id,name,photo_url,price,url_shopee,url_ml,category:product_categories(name)')
          .eq('active', true)
          .not('photo_url', 'is', null)
          .order('name')
          .limit(9)

        if (error || !data?.length) throw new Error()

        // Signed URLs em paralelo
        const signed = await Promise.all(data.map(async p => {
          let imgUrl = ''
          if (p.photo_url) {
            const { data: s } = await supabase.storage.from('product-photos').createSignedUrl(p.photo_url, 86400)
            if (s) imgUrl = s.signedUrl
          }
          return { ...p, _img: imgUrl, _cat: p.category?.name || 'Produto' }
        }))
        setItems(signed)
      } catch {
        // fallback visual
        setItems([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) return (
    <div className="shuffle-grid">
      {GRID_SIZES.map((sz, i) => (
        <div key={i} className="prod-card prod-skeleton"
          style={{ gridRow: `span ${sz.rowSpan}`, gridColumn: `span ${sz.colSpan}` }}/>
      ))}
    </div>
  )

  if (!items.length) return (
    <p style={{ color: 'rgba(245,236,215,.4)', textAlign: 'center', padding: '48px 0' }}>
      Em breve, novos produtos aqui.
    </p>
  )

  return (
    <div className="shuffle-grid">
      {items.map((p, i) => {
        const sz = GRID_SIZES[i] || { rowSpan: 1, colSpan: 1 }
        return (
          <div key={p.id} className="prod-card"
            style={{ gridRow: `span ${sz.rowSpan}`, gridColumn: `span ${sz.colSpan}` }}>
            <div className="prod-card-img">
              {p._img
                ? <img src={p._img} alt={p.name} loading="lazy"/>
                : <div className="prod-card-placeholder">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#C4956A" strokeWidth="1">
                      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
                      <line x1="4" y1="22" x2="4" y2="15"/>
                    </svg>
                  </div>
              }
            </div>
            <div className="prod-card-overlay"/>
            <div className="prod-card-body">
              <div className="prod-card-cat">{p._cat}</div>
              <div className="prod-card-name">{p.name}</div>
              {p.price
                ? <div className="prod-card-badge">R$ {parseFloat(p.price).toFixed(2).replace('.', ',')}</div>
                : <div className="prod-card-badge">Ver na loja</div>
              }
            </div>
            {/* Botões marketplace — só mostra se tiver link */}
            {(p.url_shopee || p.url_ml) && (
              <div className="prod-mkt">
                {p.url_shopee && (
                  <a href={p.url_shopee} target="_blank" rel="noopener noreferrer"
                    className="mkt-btn mkt-shopee" onClick={e => e.stopPropagation()}>
                    <svg width="10" height="10" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="white"/><circle cx="12" cy="12" r="6" fill="#EE4D2D"/></svg>
                    Shopee
                  </a>
                )}
                {p.url_ml && (
                  <a href={p.url_ml} target="_blank" rel="noopener noreferrer"
                    className="mkt-btn mkt-ml" onClick={e => e.stopPropagation()}>
                    <svg width="10" height="10" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#2d3277"/><circle cx="12" cy="12" r="6" fill="#FFE600"/></svg>
                    Mercado Livre
                  </a>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Componente Reviews carousel ───────────────────────────────
function Reviews() {
  const all = [...REVIEWS, ...REVIEWS]
  return (
    <div className="reviews-track-wrap">
      <div className="reviews-track">
        {all.map((r, i) => (
          <div key={i} className="review-card">
            <div className="stars">★★★★★</div>
            <p className="review-text">"{r.txt}"</p>
            <div className="review-author">{r.author}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── SiteHome principal ────────────────────────────────────────
export function SiteHome() {
  const { curRef, ringRef } = useCursor()
  const [mobOpen, setMobOpen]     = useState(false)
  const [scrolled, setScrolled]   = useState(false)
  const [credVisible, setCredVisible] = useState(false)
  useReveal()
  useCountUp(credVisible)

  // Nav scroll
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 60)
    window.addEventListener('scroll', fn)
    return () => window.removeEventListener('scroll', fn)
  }, [])

  // Credibilidade observer
  useEffect(() => {
    const el = document.getElementById('credibilidade')
    if (!el) return
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setCredVisible(true); obs.disconnect() } }, { threshold: 0.3 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const scrollTo = id => { document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); setMobOpen(false) }

  return (
    <>
      {/* Cursor */}
      <div className="cursor" ref={curRef}/>
      <div className={`cursor-ring${mobOpen ? '' : ''}`} ref={ringRef}/>

      {/* Mobile menu */}
      <div className={`mob-menu${mobOpen ? ' open' : ''}`}>
        <div className="mob-close" onClick={() => setMobOpen(false)}>✕</div>
        {['historia','produtos','diferenciais','comunidade'].map(id => (
          <a key={id} onClick={() => scrollTo(id)} style={{ cursor: 'pointer' }}>
            {id === 'historia' ? 'Quem Somos' : id === 'produtos' ? 'Produtos' : id === 'diferenciais' ? 'Diferenciais' : 'Comunidade'}
          </a>
        ))}
        <button className="btn-pri" onClick={() => scrollTo('produtos')}>Ver Produtos</button>
      </div>

      {/* Nav */}
      <nav id="nav" className={scrolled ? 'scrolled' : ''}>
        <div className="nav-logo">
          <img src="/logo-coisapet.png" alt="CoisaPet"/>
          <span>CoisaPet</span>
        </div>
        <ul className="nav-links">
          {[['historia','Quem Somos'],['produtos','Produtos'],['diferenciais','Diferenciais'],['comunidade','Comunidade']].map(([id,label]) => (
            <li key={id}><a onClick={() => scrollTo(id)} style={{ cursor: 'pointer' }}>{label}</a></li>
          ))}
        </ul>
        <button className="nav-cta" onClick={() => scrollTo('produtos')}>Ver Produtos</button>
        <div className="nav-burger" onClick={() => setMobOpen(true)}>
          <span/><span/><span/>
        </div>
      </nav>

      {/* S1 HERO */}
      <section id="hero">
        <div className="hero-grain"/>
        <div className="hero-lines"/>
        <div className="hero-inner">
          <div className="hero-left">
            <div className="hero-tag">Terrários e Acessórios para Mini Pets</div>
            <h1 className="hero-headline">
              <span className="word" style={{ animationDelay: '.3s' }}>Produtos</span>
              {' '}
              <span className="word" style={{ animationDelay: '.42s' }}>pensados</span>
              {' '}
              <span className="word" style={{ animationDelay: '.54s' }}>para</span>
              {' '}
              <span className="word" style={{ animationDelay: '.66s' }}>quem</span>
              <br/>
              <span className="word" style={{ animationDelay: '.78s' }}>cuida</span>
              {' '}
              <span className="word" style={{ animationDelay: '.9s' }}>de</span>
              {' '}
              <span className="word" style={{ animationDelay: '.9s' }}><em>verdade.</em></span>
            </h1>
            <p className="hero-sub">A CoisaPet é especialista em produtos para pequenos animais. Do terrário ao acessório, tudo desenvolvido com atenção ao bem-estar do seu mini pet.</p>
            <div className="hero-ctas">
              <button className="btn-pri" onClick={() => scrollTo('produtos')}>Ver Produtos</button>
              <button className="btn-sec" onClick={() => scrollTo('historia')}>Nossa História</button>
            </div>
          </div>
          <div className="hero-right">
            <div className="hero-orb">
              <div className="hero-orb-ring"/>
              <div className="hero-orb-ring"/>
              <div className="hero-orb-ring"/>
              <div className="hero-orb-center">
                <img src="/logo-coisapet.png" alt="CoisaPet"/>
              </div>
            </div>
          </div>
        </div>
        <div className="hero-scroll" onClick={() => scrollTo('credibilidade')}>
          <div className="hero-scroll-line"/>
          scroll
        </div>
      </section>

      {/* S2 CREDIBILIDADE */}
      <div id="credibilidade">
        <div className="cred-inner stagger">
          {[
            { count: 137,  suffix: '',  label: 'produtos próprios' },
            { count: 9500, suffix: '+', label: 'avaliações' },
            { count: 4.9,  suffix: '',  decimal: true, label: 'de nota média' },
            { count: 4,    suffix: '',  label: 'anos cuidando de mini pets' },
          ].map((item, i) => (
            <div key={i} className="cred-item">
              <div className="cred-num"
                data-count={item.count}
                data-suffix={item.suffix}
                data-decimal={item.decimal ? 'true' : 'false'}>
                0
              </div>
              <div className="cred-label">{item.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* S3 HISTÓRIA */}
      <section id="historia">
        <div className="sec-inner">
          <div className="reveal">
            <div className="sec-tag">Nossa História</div>
            <h2 className="sec-headline">A marca que nasceu para quem<br/>leva o cuidado <em>a sério.</em></h2>
          </div>
          <div className="hist-grid">
            <div className="hist-text reveal-l">
              <p>A <strong>CoisaPet</strong> nasceu em 2022 em Cafelândia, São Paulo, com um propósito claro: criar produtos que não existiam no mercado convencional para pequenos animais.</p>
              <p>Terrários, tocas, acessórios e insumos pensados do zero, com <strong>controle total de produção do início ao fim</strong>.</p>
              <p>Quatro anos depois, somos referência em produtos para mini pets no Brasil, com mais de 9.500 avaliações e nota 4,9 em uma das maiores plataformas de e-commerce do país.</p>
            </div>
            <div className="pilares stagger reveal-r">
              {[
                ['Produto Próprio', 'Desenvolvemos e controlamos tudo que vendemos.'],
                ['Fabricação Artesanal', 'Cada peça é produzida com cuidado e precisão no material.'],
                ['Bem-estar Animal', 'Tudo que criamos parte do comportamento natural do seu mini pet.'],
                ['Atendimento Humanizado', 'Você fala com quem também ama mini pets.'],
              ].map(([title, txt], i) => (
                <div key={i} className="pilar">
                  <div className="pilar-num">{i + 1}</div>
                  <div><div className="pilar-title">{title}</div><div className="pilar-txt">{txt}</div></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* S4 PRODUTOS */}
      <section id="produtos">
        <div className="sec-inner">
          <div className="prod-header reveal">
            <div>
              <div className="sec-tag">Catálogo</div>
              <h2 className="sec-headline" style={{ marginBottom: 0 }}>Conheça os produtos<br/>da <em>CoisaPet.</em></h2>
            </div>
          </div>
          <Products/>
        </div>
      </section>

      {/* S5 DIFERENCIAIS */}
      <section id="diferenciais">
        <div className="sec-inner">
          <div className="reveal" style={{ textAlign: 'center', maxWidth: 600, margin: '0 auto' }}>
            <div className="sec-tag">Por que a CoisaPet?</div>
            <h2 className="sec-headline">O que faz a CoisaPet ser<br/>a escolha <em>certa.</em></h2>
            <p className="sec-sub" style={{ margin: '0 auto' }}>Cuidado, conhecimento e produção própria em cada produto que chega até você.</p>
          </div>
          <div className="dif-grid stagger">
            {[
              ['Pré-Corte Customizável', 'Peças cortadas com precisão para montagem fácil e encaixe perfeito.',
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2"/>],
              ['Baseado em Comportamento Animal', 'Cada produto nasce do estudo dos instintos e necessidades naturais do seu pet.',
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>],
              ['Personalização', 'Produtos adaptados para atender as necessidades específicas de cada animal.',
                <><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></>],
              ['Portfólio Completo', 'Do terrário ao insumo natural, tudo que o seu mini pet precisa em um só lugar.',
                <><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></>],
              ['Nicho Especializado', 'Conhecimento profundo de um universo que pet shops generalistas ignoram.',
                <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>],
              ['Entrega para Todo o Brasil', 'Do Norte ao Sul, levamos os produtos da CoisaPet até o seu mini pet com agilidade.',
                <><path d="M5 12H3l9-9 9 9h-2"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></>],
            ].map(([title, txt, icon], i) => (
              <div key={i} className="dif-item">
                <div className="dif-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">{icon}</svg>
                </div>
                <div className="dif-title">{title}</div>
                <div className="dif-txt">{txt}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* S6 PROVA SOCIAL */}
      <section id="prova">
        <div className="sec-inner">
          <div className="reveal" style={{ textAlign: 'center' }}>
            <div className="sec-tag">O que dizem os tutores</div>
            <h2 className="sec-headline">Quem compra, <em>volta.</em> E indica.</h2>
          </div>
        </div>
        <Reviews/>
      </section>

      {/* S7 COMUNIDADE */}
      <section id="comunidade">
        <div className="sec-inner">
          <div className="sec-tag">Comunidade</div>
          <h2 className="sec-headline reveal">Siga a CoisaPet<br/>e <em>faça parte.</em></h2>
          <p className="sec-sub reveal">Dicas de cuidados, bastidores, novidades e muito mais. Acompanhe a CoisaPet nas redes e entre para a comunidade de tutores que levam o bem-estar do mini pet a sério.</p>
          <div className="social-grid reveal">
            {[
              ['https://instagram.com/coisapet', 'Instagram', <><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></>],
              ['https://tiktok.com/@coisapet',   'TikTok',    <path fill="currentColor" d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.32 6.32 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34v-7.1a8.16 8.16 0 0 0 4.77 1.52V6.29a4.85 4.85 0 0 1-1-.6z"/>],
              ['https://youtube.com/@coisapet',  'YouTube',   <><path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46A2.78 2.78 0 0 0 1.46 6.42 29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58 2.78 2.78 0 0 0 1.95 1.96C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.96A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z"/><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" fill="currentColor" stroke="none"/></>],
              ['https://wa.me/5514999999999',    'WhatsApp',  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>],
            ].map(([href, label, icon]) => (
              <a key={label} className="social-btn" href={href} target="_blank" rel="noopener noreferrer">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">{icon}</svg>
                {label}
              </a>
            ))}
          </div>
          <button className="contato-btn reveal" onClick={() => window.open('https://wa.me/5514999081057', '_blank')}>
            Entre em Contato
          </button>
        </div>
      </section>

      {/* FOOTER */}
      <footer>
        <div className="footer-top">
          <div className="footer-brand">
            <img src="/logo-coisapet.png" alt="CoisaPet"/>
            <div className="footer-tagline">"Todo tipo de coisa<br/>para todo tipo de pet."</div>
            <p className="footer-about">A CoisaPet é uma marca especializada em produtos próprios para mini pets, desenvolvidos com cuidado e conhecimento em Cafelândia, São Paulo.</p>
          </div>
          {[
            ['Loja',     [['#','Início'],['#historia','Quem Somos'],['#produtos','Produtos'],['#diferenciais','Diferenciais'],['#comunidade','Comunidade']]],
            ['Produtos', [['#produtos','Terrários'],['#produtos','Tocas'],['#produtos','Acessórios'],['#produtos','Insumos Naturais']]],
            ['Social',   [['https://instagram.com/coisapet','Instagram'],['https://tiktok.com/@coisapet','TikTok'],['https://youtube.com/@coisapet','YouTube'],['https://wa.me/5514999081057','WhatsApp']]],
          ].map(([title, links]) => (
            <div key={title} className="footer-col">
              <h4>{title}</h4>
              <ul>{links.map(([href, label]) => <li key={label}><a href={href}>{label}</a></li>)}</ul>
            </div>
          ))}
        </div>
        <div className="footer-bottom">
          <span className="footer-copy">© 2026 CoisaPet. Todos os direitos reservados.</span>
          <span className="footer-site">coisapet.com.br</span>
        </div>
      </footer>

    </>
  )
}

// ── Estilos do site (injetados para não conflitar com o sistema) ─