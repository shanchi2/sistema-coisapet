// Template do "Gerador de Manual" — mesmo padrão editorial fixo
// aprovado pelo Raphael (manual "Aspen Normal", em blocos: hero,
// sobre, benefícios em cards, compatibilidade, como usar, quantidade,
// cuidados), agora parametrizado pelo conteúdo gerado pela IA
// (supabase/functions/manual-ai). Cada seção é OPCIONAL — só renderiza
// o que vier preenchido, pra não forçar bloco vazio/genérico.
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

const STYLE = `
:root{--coffee:#35170a;--terracotta:#7b3f22;--caramel:#b8794e;--cream:#f3e5c4;--cream-light:#faf1dd;--paper:#fffaf0;--white:#fffdf8;--ink:#32180d;--muted:#796457;--line:#dfd0bb}
*{box-sizing:border-box;margin:0;padding:0}
/* Todo font-size abaixo é em rem — a "escala" do manual inteiro é 1
   número só (o font-size do html). Na tela usa um valor grande, legível
   de verdade (achado 20/09: fonte original tava pensada só pra impressão
   em A4, ilegível na tela — parecia "caixas muito largas com pouco texto"
   porque o texto é que tava minúsculo, não o espaço em excesso). Na
   impressão/PDF volta pro tamanho original (10px de base), que é o
   design aprovado pro papel. */
html{background:#d9d5cf;font-size:19px}
body{font-family:"DM Sans",sans-serif;color:var(--ink);line-height:1.45}
.manual{width:210mm;max-width:100%;margin:20px auto;background:var(--paper);box-shadow:0 18px 50px rgba(0,0,0,.14)}
.container{padding-left:14mm;padding-right:14mm}
h1,h2,h3{font-family:"DM Serif Display",serif;font-weight:400}
.section{padding-top:11mm;padding-bottom:11mm}
.section-title{margin-bottom:6mm;display:flex;justify-content:space-between;align-items:flex-end;gap:10mm;flex-wrap:wrap}
.section-title h2{font-size:2.2rem;line-height:1}
.section-title p{max-width:85mm;font-size:.7rem;line-height:1.55;color:var(--muted);text-align:right}
.label{display:block;margin-bottom:2mm;color:var(--terracotta);font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:1.5px}
.hero{background:var(--coffee);color:var(--cream);padding-top:10mm;padding-bottom:12mm}
.topbar{display:flex;align-items:center;justify-content:space-between;padding-bottom:7mm;border-bottom:1px solid rgba(255,255,255,.12)}
.topbar img{height:22px}
.brand{font-size:1.2rem;font-weight:700;letter-spacing:.4px}
.guide{color:#b89d88;font-size:.6rem;font-weight:600;text-transform:uppercase;letter-spacing:1.5px}
.hero-main{padding-top:10mm;display:grid;grid-template-columns:1.25fr .75fr;gap:12mm;align-items:end}
.hero-label{color:var(--caramel);font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:1.7px}
.hero h1{margin-top:2mm;font-size:4.3rem;line-height:.95}
.hero p{max-width:110mm;margin-top:4mm;color:#d8c8ba;font-size:.85rem;line-height:1.6}
.hero-tags{display:flex;flex-wrap:wrap;gap:2mm;justify-content:flex-end}
.hero-tags span{padding:5px 9px;border:1px solid rgba(255,255,255,.17);font-size:.58rem;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#d9c5b5}
.about{display:grid;grid-template-columns:1.15fr .85fr;border-bottom:1px solid var(--line)}
.about-copy{padding:11mm 10mm 11mm 14mm}
.about-copy h2{font-size:2.2rem;line-height:1.05}
.about-copy p{margin-top:4mm;max-width:105mm;font-size:.8rem;line-height:1.65;color:var(--muted)}
.about-image{min-height:55mm;background:#e8d5b4;display:flex;align-items:center;justify-content:center;text-align:center;overflow:hidden}
.about-image img{width:100%;height:100%;object-fit:cover}
.about-image strong{display:block;color:var(--terracotta);font-family:"DM Serif Display",serif;font-size:1.4rem;font-weight:400}
.about-image span{display:block;margin-top:1mm;color:#9d795f;font-size:.55rem;font-weight:700;text-transform:uppercase;letter-spacing:1.4px}
.benefits{display:grid;grid-template-columns:repeat(auto-fit,minmax(0,1fr));gap:3mm}
.card{border:1px solid var(--line);background:var(--white);padding:5mm}
.card-number{display:block;margin-bottom:5mm;color:var(--caramel);font-family:"DM Serif Display",serif;font-size:1.8rem}
.card h3{font-family:"DM Sans",sans-serif;font-size:.8rem;font-weight:700}
.card p{margin-top:2mm;color:var(--muted);font-size:.65rem;line-height:1.5}
.compatibility-section{background:var(--cream-light)}
.animals{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid var(--line);background:var(--paper)}
.animal{padding:5mm;min-height:25mm;border-right:1px solid var(--line);border-bottom:1px solid var(--line)}
.animal small{color:var(--caramel);font-family:"DM Serif Display",serif;font-size:1.3rem}
.animal strong{display:block;margin-top:1mm;font-size:.75rem}
.animal span{display:block;margin-top:1mm;color:var(--muted);font-size:.6rem}
.alert{margin-top:3mm;padding:5mm 6mm;display:grid;grid-template-columns:35mm 1fr;gap:6mm;align-items:center;background:var(--coffee);color:var(--cream)}
.alert small{color:var(--caramel);font-size:.55rem;font-weight:700;text-transform:uppercase;letter-spacing:1.2px}
.alert strong{display:block;margin-top:1mm;font-size:.8rem}
.alert p{color:#d9c9bc;font-size:.65rem;line-height:1.5}
.usage-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(0,1fr));gap:3mm}
.usage{background:var(--cream-light);padding:5mm;min-height:35mm}
.usage-number{color:var(--terracotta);font-family:"DM Serif Display",serif;font-size:1.8rem}
.usage strong{display:block;margin-top:4mm;font-size:.75rem}
.usage p{margin-top:1.5mm;color:var(--muted);font-size:.62rem;line-height:1.45}
.amount{padding-top:8mm;padding-bottom:8mm;background:var(--terracotta);color:#fff}
.amount-inner{display:grid;grid-template-columns:.8fr 1.2fr;gap:12mm;align-items:center}
.amount small{color:#edc0a4;font-size:.55rem;font-weight:700;text-transform:uppercase;letter-spacing:1.4px}
.amount h2{margin-top:1mm;font-size:1.8rem}
.formula{padding:5mm;border:1px solid rgba(255,255,255,.25);text-align:center}
.formula-main{font-size:1rem;font-weight:700;letter-spacing:.3px}
.formula p{margin-top:2mm;color:#f2d8c8;font-size:.57rem}
.care-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(0,1fr));gap:3mm}
.care-card{padding:5mm;border:1px solid var(--line);background:var(--white)}
.care-card.dark{border-color:var(--coffee);background:var(--coffee);color:var(--cream)}
.care-card .label{margin-bottom:3mm}
.care-card h3{font-family:"DM Sans",sans-serif;font-size:.8rem;font-weight:700}
.care-card ul{list-style:none;margin-top:3mm}
.care-card li{position:relative;margin-top:2mm;padding-left:3.5mm;color:var(--muted);font-size:.63rem;line-height:1.45}
.care-card.dark li{color:#d8c8ba}
.care-card li:before{content:"";position:absolute;left:0;top:3px;width:1.4mm;height:1.4mm;background:var(--caramel)}
.footer{padding-top:8mm;padding-bottom:8mm;background:var(--cream)}
.footer-inner{display:flex;justify-content:space-between;align-items:center}
.footer .brand{color:var(--coffee)}
.footer p{color:#806553;font-size:.58rem;text-transform:uppercase;letter-spacing:1.2px}
@media print{html{font-size:10px;background:#fff}body{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}.manual{margin:0;box-shadow:none;max-width:none}}
@media(max-width:850px){html{background:#fff}.manual{margin:0 auto}}
/* Celular (achado 20/09: o layout em grade de N colunas — cards,
   compatibilidade, hero lado a lado — ficava espremido/ilegível numa
   tela estreita, mesmo já com fonte maior). Empilha tudo em 1 coluna e
   reduz os respiros de página (pensados pra A4/desktop) pra caber sem
   desperdiçar tela. grid-template-columns tem !important porque cada
   card recebe a contagem de colunas inline (style=) na hora de montar
   o HTML — sem isso o inline vence a media query. */
@media(max-width:680px){
  html{font-size:16px}
  .manual{width:100%}
  .container{padding-left:5mm;padding-right:5mm}
  .hero{padding-top:7mm;padding-bottom:9mm}
  .hero-main{grid-template-columns:1fr;gap:6mm}
  .hero h1{font-size:2rem;line-height:1.05}
  .hero-tags{justify-content:flex-start}
  .about{grid-template-columns:1fr}
  .about-copy{padding:7mm 5mm}
  .about-copy p{max-width:100%}
  /* height fixo (não min-height): empilhado, a foto perde a altura que
     antes vinha "de graça" da coluna de texto ao lado (grid de 2
     colunas com align-items:stretch) — sem isso o img.height:100% não
     tem base pra calcular e a foto sai do tamanho natural dela, que
     pode ser enorme. Achado 20/09. */
  .about-image{height:55vw;min-height:auto;max-height:280px}
  .section{padding-top:8mm;padding-bottom:8mm}
  .section-title{flex-direction:column;align-items:flex-start;gap:2mm}
  .section-title p{text-align:left;max-width:100%}
  .benefits,.usage-grid,.care-grid{grid-template-columns:1fr!important}
  .animals{grid-template-columns:1fr}
  .animal{border-right:0}
  .alert{grid-template-columns:1fr;gap:3mm;text-align:center}
  .amount-inner{grid-template-columns:1fr;gap:5mm;text-align:center}
  .formula{margin:0 auto}
  .footer-inner{flex-direction:column;gap:3mm;text-align:center}
}
`

const LOGO_URL = 'https://lcybmdiqxmbqeuyeuhdj.supabase.co/storage/v1/object/public/manuals/logos/logo-coisapet-2026.png'

function numbered(n) { return String(n).padStart(2, '0') }

export function buildManualHtml({ productName, imageUrl, sections = {} }) {
  const s = sections || {}
  const title = productName ? `${productName} — Guia de Uso | Coisa Pet` : 'Guia de Uso | Coisa Pet'

  const heroSection = `
<section class="hero"><div class="container">
  <div class="topbar"><img src="${LOGO_URL}" alt="Coisa Pet"/><div class="guide">Guia de preparo e uso seguro</div></div>
  <div class="hero-main">
    <div>
      ${s.tagline ? `<div class="hero-label">${escapeHtml(s.tagline)}</div>` : ''}
      <h1>${escapeHtml(productName || 'Produto CoisaPet')}</h1>
      ${s.hero_intro ? `<p>${escapeHtml(s.hero_intro)}</p>` : ''}
    </div>
    ${Array.isArray(s.tags) && s.tags.length ? `<div class="hero-tags">${s.tags.map(t => `<span>${escapeHtml(t)}</span>`).join('')}</div>` : ''}
  </div>
</div></section>`

  const aboutSection = (s.about_title || s.about_text || imageUrl) ? `
<section class="about">
  <div class="about-copy">
    <span class="label">O que é?</span>
    ${s.about_title ? `<h2>${escapeHtml(s.about_title)}</h2>` : ''}
    ${s.about_text ? `<p>${escapeHtml(s.about_text)}</p>` : ''}
  </div>
  <div class="about-image">
    ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(productName || '')}"/>` : `<div><strong>${escapeHtml(productName || '')}</strong><span>Foto do produto</span></div>`}
  </div>
</section>` : ''

  const benefitsSection = (Array.isArray(s.benefits) && s.benefits.length) ? `
<section class="section container">
  <div class="section-title"><h2>Por que usar?</h2><p>Principais funções do produto no dia a dia.</p></div>
  <div class="benefits" style="grid-template-columns:repeat(${s.benefits.length},1fr)">
    ${s.benefits.map((b, i) => `<div class="card"><span class="card-number">${numbered(i + 1)}</span><h3>${escapeHtml(b.title)}</h3><p>${escapeHtml(b.desc)}</p></div>`).join('')}
  </div>
</section>` : ''

  const compatSection = (Array.isArray(s.compatibility) && s.compatibility.length) ? `
<section class="section compatibility-section"><div class="container">
  <div class="section-title"><h2>Indicado para</h2><p>Utilize sempre considerando as necessidades específicas de cada espécie.</p></div>
  <div class="animals">
    ${s.compatibility.map((c, i) => `<div class="animal"><small>${numbered(i + 1)}</small><strong>${escapeHtml(c.animal)}</strong><span>${escapeHtml(c.note || '')}</span></div>`).join('')}
  </div>
  ${s.alert ? `<div class="alert"><div><small>Atenção</small><strong>${escapeHtml(s.alert.title)}</strong></div><p>${escapeHtml(s.alert.text)}</p></div>` : ''}
</div></section>` : ''

  const usageSection = (Array.isArray(s.usage_steps) && s.usage_steps.length) ? `
<section class="section container">
  <div class="section-title"><h2>Como usar</h2><p>Uso simples e manutenção localizada no dia a dia.</p></div>
  <div class="usage-grid" style="grid-template-columns:repeat(${s.usage_steps.length},1fr)">
    ${s.usage_steps.map((u, i) => `<div class="usage"><span class="usage-number">${numbered(i + 1)}</span><strong>${escapeHtml(u.title)}</strong><p>${escapeHtml(u.desc)}</p></div>`).join('')}
  </div>
</section>` : ''

  const amountSection = s.amount_formula ? `
<section class="amount"><div class="container amount-inner">
  <div><small>${escapeHtml(s.amount_formula.label || 'Quanto usar?')}</small><h2>Calcule a quantidade</h2></div>
  <div class="formula">
    ${s.amount_formula.formula ? `<div class="formula-main">${escapeHtml(s.amount_formula.formula)}</div>` : ''}
    ${s.amount_formula.note ? `<p>${escapeHtml(s.amount_formula.note)}</p>` : ''}
  </div>
</div></section>` : ''

  const care = s.care || {}
  const careCards = [
    care.storage?.length     ? { label: 'Armazenamento', title: 'Como guardar',  items: care.storage } : null,
    care.maintenance?.length ? { label: 'Manutenção',    title: 'No dia a dia',  items: care.maintenance } : null,
    care.discard?.length     ? { label: 'Descarte',       title: 'Hora de trocar', items: care.discard, dark: true } : null,
  ].filter(Boolean)
  const careSection = careCards.length ? `
<section class="section container">
  <div class="section-title"><h2>Cuidados</h2><p>Armazenamento, manutenção e sinais para descarte.</p></div>
  <div class="care-grid" style="grid-template-columns:repeat(${careCards.length},1fr)">
    ${careCards.map(c => `<div class="care-card${c.dark ? ' dark' : ''}"><span class="label">${escapeHtml(c.label)}</span><h3>${escapeHtml(c.title)}</h3><ul>${c.items.map(it => `<li>${escapeHtml(it)}</li>`).join('')}</ul></div>`).join('')}
  </div>
</section>` : ''

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet">
<style>${STYLE}</style>
</head><body><main class="manual">
${heroSection}
${aboutSection}
${benefitsSection}
${compatSection}
${usageSection}
${amountSection}
${careSection}
<footer class="footer"><div class="container footer-inner"><div class="brand">COISA PET</div><p>Guia de preparo e uso seguro${productName ? ' · ' + escapeHtml(productName) : ''}</p></div></footer>
</main></body></html>`
}
