// Mecânica do hero: sequência de 7 fotos reais (a mesma cena, câmera
// avançando) em crossfade + leve zoom contínuo, cada uma ocupando uma
// fatia igual do scroll — quanto mais quadros, mais parece "andar de
// verdade" em vez de só 2-3 fotos alternando.
//
// Não desliga em prefers-reduced-motion: essa preferência costuma vir
// ligada por padrão/performance em muita gente (não só por sensibilidade
// a movimento), e o scroll aqui É o conteúdo principal da dobra, não um
// efeito decorativo por cima de conteúdo já legível — desligar deixaria
// a maior parte das visitas vendo uma imagem parada sem entender por quê.
document.addEventListener('DOMContentLoaded', () => {
  const hero = document.getElementById('hero')
  const scene = document.getElementById('heroScene')
  if (!hero || !scene || typeof gsap === 'undefined') return

  const frames = Array.from(scene.querySelectorAll('.hero-photo'))
  const overlay = hero.querySelector('.hero-fade-overlay')
  const copyEls = hero.querySelectorAll('[data-hero-fade]')
  const label1 = document.getElementById('heroLabel1')
  const label2 = document.getElementById('heroLabel2')
  const scrollHint = document.getElementById('scrollHint')

  gsap.registerPlugin(ScrollTrigger)

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: '#hero',
      start: 'top top',
      end: 'bottom bottom',
      scrub: .6,
    },
  })

  // saída do texto de abertura e da dica de scroll
  tl.to(copyEls, { opacity: 0, y: -30, stagger: .03, duration: .1 }, 0)
  tl.to(scrollHint, { opacity: 0, duration: .05 }, 0)

  // 7 quadros, cada um ocupa 1/7 da timeline. Zoom leve dentro de cada
  // quadro (nunca precisa ampliar muito, já que os pontos de parada
  // estão próximos); crossfade curto entre um quadro e o próximo.
  const n = frames.length
  const step = 1 / n
  const crossfade = step * 0.35

  frames.forEach((frame, i) => {
    const start = i * step
    // Ken Burns bem sutil — a foto nunca fica parada enquanto visível.
    gsap.set(frame, { scale: 1 })
    tl.to(frame, { scale: 1.06, duration: step, ease: 'none' }, start)

    if (i < n - 1) {
      // crossfade pro próximo quadro no fim do trecho deste
      const fadeStart = start + step - crossfade
      tl.to(frame, { opacity: 0, duration: crossfade }, fadeStart)
      tl.to(frames[i + 1], { opacity: 1, duration: crossfade }, fadeStart)
    }
  })

  // labels de produto: um perto da roda (quadro 3), outro perto da
  // casinha (quadros 5-6)
  const wheelWindowStart = 3 * step
  const houseWindowStart = 5 * step
  tl.fromTo(label1, { opacity: 0 }, { opacity: 1, duration: .06 }, wheelWindowStart + step * .15)
  tl.to(label1, { opacity: 0, duration: .06 }, wheelWindowStart + step * .8)
  tl.fromTo(label2, { opacity: 0 }, { opacity: 1, duration: .06 }, houseWindowStart + step * .3)
  tl.to(label2, { opacity: 0, duration: .06 }, .93)

  // dissolve pra seção institucional no finalzinho
  tl.to(overlay, { opacity: 1, duration: .16 }, .86)
})
