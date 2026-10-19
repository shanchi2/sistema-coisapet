import { useEffect, useRef, useState } from 'react'
import { X, Loader2, Sparkles, Newspaper, Check, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { igCall, uploadMedia } from './igApi'

// Post do blog → carrossel (19/10). A IA resume o artigo em slides; o desenho
// dos slides é feito aqui no navegador (canvas 1080×1350, formato 4:5) e
// enviado como JPEG pro bucket. Dá pra editar os textos antes de usar.
const W = 1080, H = 1350
const THEMES = {
  rosa:   { label: 'Rosa',   bg: '#fff1f2', accent: '#f43f5e', text: '#3f1d2b', soft: '#fecdd3' },
  creme:  { label: 'Creme',  bg: '#fbeedd', accent: '#c2410c', text: '#3b2314', soft: '#f3d9b8' },
  menta:  { label: 'Menta',  bg: '#ecfdf5', accent: '#059669', text: '#064e3b', soft: '#a7f3d0' },
  noite:  { label: 'Noite',  bg: '#1e1b4b', accent: '#f472b6', text: '#f8fafc', soft: '#4338ca' },
}

function wrap(ctx, text, maxW) {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  const lines = []; let line = ''
  for (const w of words) {
    const t = line ? `${line} ${w}` : w
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w } else line = t
  }
  if (line) lines.push(line)
  return lines
}

async function loadImg(url) {
  return new Promise((res) => {
    const i = new Image(); i.crossOrigin = 'anonymous'
    i.onload = () => res(i); i.onerror = () => res(null); i.src = url
  })
}

async function drawSlide(canvas, slide, i, total, theme, cover, blogTitle) {
  const t = THEMES[theme]
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')
  await document.fonts?.load?.('900 80px Nunito').catch(() => {})
  const font = (w, s) => `${w} ${s}px Nunito, "Nunito Sans", Arial, sans-serif`
  const first = i === 0, last = i === total - 1

  if (first && cover) {
    // capa: foto do post do blog cobrindo tudo + faixa com o título
    const r = Math.max(W / cover.width, H / cover.height)
    ctx.drawImage(cover, (W - cover.width * r) / 2, (H - cover.height * r) / 2, cover.width * r, cover.height * r)
    const g = ctx.createLinearGradient(0, H * 0.35, 0, H)
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.82)')
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = t.accent
    roundRect(ctx, 80, 90, 300, 64, 32); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = font(800, 30); ctx.textBaseline = 'middle'
    ctx.fillText('NO BLOG CoisaPet', 108, 123)
    ctx.textBaseline = 'alphabetic'
    ctx.font = font(900, 86)
    const lines = wrap(ctx, slide.title, W - 160).slice(0, 4)
    let y = H - 200 - (lines.length - 1) * 96 - (slide.body ? 80 : 0)
    for (const l of lines) { ctx.fillText(l, 80, y); y += 96 }
    if (slide.body) { ctx.font = font(600, 38); ctx.fillStyle = 'rgba(255,255,255,0.88)'; for (const l of wrap(ctx, slide.body, W - 160).slice(0, 2)) { ctx.fillText(l, 80, y + 6); y += 50 } }
  } else {
    ctx.fillStyle = t.bg; ctx.fillRect(0, 0, W, H)
    // detalhes de fundo
    ctx.fillStyle = t.soft; ctx.globalAlpha = 0.6
    ctx.beginPath(); ctx.arc(W + 40, -40, 300, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(-80, H + 60, 260, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 1
    // número
    if (!first && !last) {
      ctx.fillStyle = t.accent; ctx.font = font(900, 150)
      ctx.fillText(String(i).padStart(2, '0'), 80, 260)
    }
    ctx.fillStyle = t.text; ctx.font = font(900, first ? 88 : 72)
    const tl = wrap(ctx, slide.title, W - 160).slice(0, 4)
    let y = first || last ? 420 : 400
    for (const l of tl) { ctx.fillText(l, 80, y); y += first ? 98 : 84 }
    ctx.fillStyle = t.accent; ctx.fillRect(80, y - 20, 120, 10)
    y += 70
    ctx.fillStyle = t.text; ctx.globalAlpha = 0.85; ctx.font = font(600, 46)
    for (const l of wrap(ctx, slide.body, W - 160).slice(0, 9)) { ctx.fillText(l, 80, y); y += 66 }
    ctx.globalAlpha = 1
    if (last) {
      ctx.fillStyle = t.accent; roundRect(ctx, 80, H - 330, W - 160, 120, 60); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.font = font(800, 42); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('Artigo completo no link da bio 🔗', W / 2, H - 270)
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
    }
  }
  // rodapé: marca + paginação
  ctx.font = font(800, 32); ctx.fillStyle = first && cover ? '#fff' : t.text; ctx.globalAlpha = 0.75
  ctx.fillText('@coisapet', 80, H - 70)
  ctx.textAlign = 'right'; ctx.fillText(`${i + 1}/${total}`, W - 80, H - 70); ctx.textAlign = 'left'
  ctx.globalAlpha = 1
  if (!last && !(first && cover)) { ctx.fillStyle = t.accent; ctx.font = font(800, 32); ctx.textAlign = 'right'; ctx.fillText('arrasta →', W - 80, 120); ctx.textAlign = 'left' }
  if (first && cover) { ctx.fillStyle = '#fff'; ctx.font = font(800, 32); ctx.textAlign = 'right'; ctx.fillText('arrasta →', W - 80, 123); ctx.textAlign = 'left' }
  void blogTitle
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
}

export function IgBlogCarousel({ onClose, onDone }) {
  const [blogPosts, setBlogPosts] = useState([])
  const [postId, setPostId] = useState('')
  const [count, setCount] = useState(6)
  const [theme, setTheme] = useState('rosa')
  const [gen, setGen] = useState(null)      // { blog, slides, caption }
  const [busy, setBusy] = useState(null)
  const [thumbs, setThumbs] = useState([])
  const coverRef = useRef(null)

  useEffect(() => {
    supabase.from('blog_posts').select('id, title, status, published_at, cover_image_url').neq('status', 'trash')
      .order('published_at', { ascending: false, nullsFirst: false }).limit(80)
      .then(({ data }) => setBlogPosts(data || []))
  }, [])

  // redesenha as miniaturas quando muda texto/tema
  useEffect(() => {
    if (!gen) return
    let alive = true
    ;(async () => {
      if (coverRef.current === undefined || coverRef.current?.src !== gen.blog.cover) coverRef.current = gen.blog.cover ? await loadImg(gen.blog.cover) : null
      const out = []
      for (let i = 0; i < gen.slides.length; i++) {
        const c = document.createElement('canvas')
        await drawSlide(c, gen.slides[i], i, gen.slides.length, theme, coverRef.current, gen.blog.title)
        out.push(c.toDataURL('image/jpeg', 0.6))
      }
      if (alive) setThumbs(out)
    })()
    return () => { alive = false }
  }, [gen, theme])

  async function generate() {
    if (!postId) return toast.error('Escolha o post do blog')
    setBusy('gen')
    try {
      const r = await igCall('blog_carousel', { blog_post_id: postId, slides: count })
      if (!r.slides?.length) throw new Error('A IA não devolveu slides — tente de novo')
      setGen({ blog: r.blog, slides: r.slides, caption: r.caption })
    } catch (e) { toast.error(e.message) } finally { setBusy(null) }
  }

  const edit = (i, k, v) => setGen(g => ({ ...g, slides: g.slides.map((s, j) => j === i ? { ...s, [k]: v } : s) }))

  async function use() {
    setBusy('use')
    try {
      const items = []
      for (let i = 0; i < gen.slides.length; i++) {
        const c = document.createElement('canvas')
        await drawSlide(c, gen.slides[i], i, gen.slides.length, theme, coverRef.current, gen.blog.title)
        let blob
        try { blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92)) } catch { blob = null }
        if (!blob) throw new Error('Não consegui gerar a imagem (a capa do blog bloqueou o desenho). Tente outro tema.')
        const up = await uploadMedia(blob, 'jpg')
        items.push({ ...up, type: 'IMAGE', w: W, h: H, key: up.path, localUrl: URL.createObjectURL(blob) })
      }
      onDone({ items, caption: gen.caption, blogPostId: gen.blog.id })
      toast.success('Carrossel pronto — revise e agende')
    } catch (e) { toast.error(e.message) } finally { setBusy(null) }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/50 flex items-start md:items-center justify-center p-2 md:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100">
          <Newspaper size={17} className="text-violet-500" />
          <p className="font-bold text-slate-800">Carrossel a partir do blog</p>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <div className="flex flex-wrap gap-2 items-end">
            <label className="flex-1 min-w-[240px] text-xs font-semibold text-slate-500">Post do blog
              <select value={postId} onChange={e => { setPostId(e.target.value); setGen(null) }} className="mt-1 w-full text-sm font-normal border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-700">
                <option value="">Escolha…</option>
                {blogPosts.map(p => <option key={p.id} value={p.id}>{p.title}{p.status === 'draft' ? ' (rascunho)' : ''}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-500">Slides
              <select value={count} onChange={e => setCount(Number(e.target.value))} className="mt-1 block text-sm font-normal border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-700">
                {[4, 5, 6, 7, 8, 9].map(n => <option key={n}>{n}</option>)}
              </select>
            </label>
            <button onClick={generate} disabled={!!busy} className="px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold flex items-center gap-1.5 disabled:opacity-60">
              {busy === 'gen' ? <Loader2 size={15} className="animate-spin" /> : gen ? <RefreshCw size={15} /> : <Sparkles size={15} />} {gen ? 'Gerar de novo' : 'Gerar com IA'}
            </button>
          </div>

          {gen && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">Tema:</span>
                {Object.entries(THEMES).map(([k, t]) => (
                  <button key={k} onClick={() => setTheme(k)} className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${theme === k ? 'border-slate-700' : 'border-slate-200'}`}>
                    <span className="w-3.5 h-3.5 rounded-full" style={{ background: t.bg, boxShadow: `inset 0 0 0 4px ${t.accent}` }} /> {t.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {gen.slides.map((s, i) => (
                  <div key={i} className="w-48 shrink-0 flex flex-col gap-1.5">
                    <div className="aspect-[4/5] rounded-xl bg-slate-100 overflow-hidden">{thumbs[i] && <img src={thumbs[i]} alt="" className="w-full h-full object-cover" />}</div>
                    <input value={s.title} onChange={e => edit(i, 'title', e.target.value)} className="text-xs font-semibold border border-slate-200 rounded-lg px-2 py-1" />
                    <textarea value={s.body || ''} onChange={e => edit(i, 'body', e.target.value)} rows={3} className="text-[11px] border border-slate-200 rounded-lg px-2 py-1" />
                  </div>
                ))}
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1">Legenda sugerida</p>
                <textarea value={gen.caption} onChange={e => setGen(g => ({ ...g, caption: e.target.value }))} rows={4} className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2" />
              </div>
              <button onClick={use} disabled={!!busy} className="self-end px-4 py-2 rounded-xl bg-gradient-to-r from-pink-500 to-violet-600 text-white text-sm font-semibold flex items-center gap-1.5 disabled:opacity-60">
                {busy === 'use' ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Usar este carrossel
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
