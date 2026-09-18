// Template do "Gerador de Manual" — gera um .html standalone, pronto
// pra virar recurso em product_doc_resources (mesmo mecanismo que já
// publica em coisapet.com.br/doc/<slug>). Paleta/fontes seguem o
// padrão já usado nos manuais feitos à mão (coffee/terracotta/cream,
// DM Sans + DM Serif Display) — versão simplificada, sem tentar
// replicar seção por seção o manual bespoke do Substrato Aspen.
const LOGO_URL = 'https://lcybmdiqxmbqeuyeuhdj.supabase.co/storage/v1/object/public/manuals/logos/logo-coisapet-2026.png'

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

export function buildManualHtml({ productName, imageUrl, bodyHtml }) {
  const title = productName ? `${productName} — Guia de Uso | Coisa Pet` : 'Guia de Uso | Coisa Pet'
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet">
<style>
:root{
  --coffee:#35170a; --brown:#542611; --terracotta:#7b3f22; --caramel:#b8794e;
  --sand:#d6ae7c; --cream:#f3e5c4; --paper:#fffaf0; --ink:#32180d;
  --muted:#796457; --line:#dfd0bb;
}
*{box-sizing:border-box;margin:0;padding:0}
html{background:#d9d5cf}
body{font-family:"DM Sans",sans-serif;color:var(--ink);line-height:1.6}
h1,h2,h3{font-family:"DM Serif Display",serif;font-weight:400}
.manual{width:210mm;min-height:297mm;margin:20px auto;background:var(--paper);box-shadow:0 18px 50px rgba(0,0,0,.14)}
.hero{background:var(--coffee);color:var(--cream);padding:10mm 14mm 12mm}
.topbar{display:flex;align-items:center;gap:10px;padding-bottom:7mm;border-bottom:1px solid rgba(255,255,255,.12)}
.topbar img{height:28px;object-fit:contain}
.guide{color:#b89d88;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1.5px}
.hero-main{padding-top:8mm;display:flex;align-items:flex-end;justify-content:space-between;gap:12mm;flex-wrap:wrap}
.hero-label{color:var(--caramel);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.7px;display:block;margin-bottom:3mm}
.hero-title{font-size:32px;line-height:1.1}
.hero-img{width:100mm;max-width:100%;border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,.3)}
.container{padding:12mm 14mm 16mm}
.body-content{font-size:14px;color:var(--ink)}
.body-content p{margin-bottom:4mm}
.body-content b,.body-content strong{color:var(--terracotta)}
.footer{padding:8mm 14mm;border-top:1px solid var(--line);color:var(--muted);font-size:11px;text-align:center}
@media print{
  html{background:#fff}
  .manual{margin:0;box-shadow:none;width:auto;min-height:0}
  @page{size:A4;margin:0}
}
</style>
</head>
<body>
<div class="manual">
  <div class="hero">
    <div class="topbar">
      <img src="${LOGO_URL}" alt="Coisa Pet"/>
      <span class="guide">Guia de Uso</span>
    </div>
    <div class="hero-main">
      <div>
        <span class="hero-label">Manual do produto</span>
        <h1 class="hero-title">${escapeHtml(productName || 'Produto CoisaPet')}</h1>
      </div>
      ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(productName || '')}" class="hero-img"/>` : ''}
    </div>
  </div>
  <div class="container">
    <div class="body-content">${bodyHtml || ''}</div>
  </div>
  <div class="footer">© 2026 CoisaPet® · Feito com ♥ para os pets</div>
</div>
</body>
</html>`
}
