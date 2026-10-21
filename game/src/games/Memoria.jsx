import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { HAMSTER_FRAMES, paletteFor, spriteCanvas } from '../art'
import { ITEM_ICONS, FOODS, sprite } from './common'
import { CATALOG } from '../sim'

// 🧠 Memória CoisaPet (0.6; níveis 22/10) — 5 níveis que vão crescendo
// (12 → 30 cartas) com 19 desenhos: produtos da loja, comidas (as boas e as
// que fazem mal) e as raças de hamster. Cada nível tem tempo; acabou o tempo,
// a partida termina com os pontos somados. A cada par aparece uma dica.
// Pontos por nível: 40 por par + 3 por segundo que sobrou − 5 por jogada errada a mais.
export const meta = {
  key: 'memoria', label: 'Memória CoisaPet', icon: '🧠', color: '#d7c8f5',
  how: 'Vire duas cartas por vez e ache os pares antes do tempo acabar. São 5 níveis, cada um com mais cartas e mais desenhos!',
}
const LEVELS = [
  { pairs: 6, cols: [4, 6] }, { pairs: 8, cols: [4, 8] }, { pairs: 10, cols: [4, 10] },
  { pairs: 12, cols: [4, 8] }, { pairs: 15, cols: [5, 10] },
]
const levelTime = pairs => 20 + pairs * 5

// Baralho: 19 desenhos em pixel
const SPECIES = { sirio: 'Hamster sírio', anao: 'Hamster anão russo', panda: 'Hamster panda' }
let CARDS = null
function cards() {
  if (CARDS) return CARDS
  CARDS = {}
  for (const k of Object.keys(ITEM_ICONS)) CARDS[k] = { url: sprite(ITEM_ICONS[k]).toDataURL(), label: CATALOG[k]?.label, tip: CATALOG[k]?.edu }
  for (const [k, f] of Object.entries(FOODS)) CARDS['f_' + k] = { url: sprite(f.rows).toDataURL(), label: f.label, tip: f.good ? `${f.label} pode, na quantidade certa.` : f.why, bad: !f.good }
  for (const [k, l] of Object.entries(SPECIES)) CARDS['h_' + k] = { url: spriteCanvas(HAMSTER_FRAMES.idle, paletteFor(k)).toDataURL(), label: l, tip: k === 'sirio' ? 'O sírio é solitário: um por terrário!' : k === 'anao' ? 'O anão russo é pequenininho e muito rápido.' : 'O panda é um sírio com pelagem malhada.' }
  return CARDS
}
const BACK = sprite([
  'kkkkkkkkkkkk', 'kAAAAAAAAAAk', 'kAaAAAAAAaAk', 'kAAAAaaAAAAk', 'kAAAaAAaAAAk', 'kAAAAAaAAAAk',
  'kAAAAaAAAAAk', 'kAAAAAAAAAAk', 'kAAAAaAAAAAk', 'kAaAAAAAAaAk', 'kAAAAAAAAAAk', 'kkkkkkkkkkkk',
]).toDataURL()

function deal(pairs) {
  const keys = Object.keys(cards()).sort(() => Math.random() - 0.5).slice(0, pairs)
  return [...keys, ...keys].map((k, i) => ({ id: i, k })).sort(() => Math.random() - 0.5)
}

export default function Memoria({ onEnd, paused }) {
  const C = cards()
  const [lv, setLv] = useState(0)
  const deck = useMemo(() => deal(LEVELS[lv].pairs), [lv])
  const [open, setOpen] = useState([])
  const [found, setFound] = useState([])
  const [moves, setMoves] = useState(0)
  const [left, setLeft] = useState(levelTime(LEVELS[0].pairs))
  const [total, setTotal] = useState(0)
  const [tip, setTip] = useState(null)
  const [banner, setBanner] = useState('Nível 1')
  const lock = useRef(false)
  const done = useRef(false)
  const portrait = typeof window !== 'undefined' && matchMedia('(orientation: portrait)').matches
  const L = LEVELS[lv], cols = portrait ? L.cols[0] : L.cols[1], rows = Math.ceil(L.pairs * 2 / cols)

  // relógio do nível (para enquanto está pausado ou mostrando "Nível X")
  useEffect(() => {
    const id = setInterval(() => {
      if (paused?.current || banner || done.current) return
      setLeft(t => Math.max(0, +(t - 0.25).toFixed(2)))
    }, 250)
    return () => clearInterval(id)
  }, [banner, paused])
  useEffect(() => { if (!banner) return; const t = setTimeout(() => setBanner(null), 1200); return () => clearTimeout(t) }, [banner])
  useEffect(() => {
    if (left > 0 || done.current) return
    done.current = true; lock.current = true
    setBanner('Acabou o tempo!')
    setTimeout(() => onEnd({ score: total, seeds: Math.floor(total / 100) }), 1300)
  }, [left]) // eslint-disable-line react-hooks/exhaustive-deps

  function flip(card) {
    if (lock.current || banner || open.includes(card.id) || found.includes(card.k)) return
    const next = [...open, card.id]
    setOpen(next)
    if (next.length < 2) return
    const m = moves + 1
    setMoves(m)
    const [a, b] = next.map(id => deck.find(c => c.id === id))
    if (a.k !== b.k) { lock.current = true; setTimeout(() => { setOpen([]); lock.current = false }, 700); return }
    const nf = [...found, a.k]
    setFound(nf); setOpen([]); setTip(a.k)
    if (nf.length < L.pairs) return
    // nível completo
    const pts = Math.max(L.pairs * 10, L.pairs * 40 + Math.floor(left) * 3 - Math.max(0, m - L.pairs) * 5)
    const sum = total + pts
    setTotal(sum)
    lock.current = true
    if (lv === LEVELS.length - 1) {
      done.current = true
      setBanner('Você zerou! 🏆')
      setTimeout(() => onEnd({ score: sum, seeds: Math.floor(sum / 100) + 5 }), 1500)
      return
    }
    setTimeout(() => {
      const n = lv + 1
      setLv(n); setFound([]); setOpen([]); setMoves(0); setTip(null)
      setLeft(levelTime(LEVELS[n].pairs)); setBanner(`Nível ${n + 1}`)
      lock.current = false
    }, 900)
  }

  // tamanho das cartas: cabe na tela sem rolar
  const box = useRef(null)
  const [size, setSize] = useState(60)
  useLayoutEffect(() => {
    const el = box.current
    const fit = () => { const r = el.getBoundingClientRect(); setSize(Math.max(28, Math.floor(Math.min((r.width - (cols - 1) * 6) / cols, (r.height - (rows - 1) * 6) / rows)))) }
    fit()
    const ro = new ResizeObserver(fit); ro.observe(el)
    return () => ro.disconnect()
  }, [cols, rows])

  const t = C[tip]
  return (
    <div className="absolute inset-0 flex flex-col items-center gap-2 p-2 select-none">
      <div className="flex items-center gap-3 sm:gap-5 pixel text-[9px] sm:text-[10px] text-[#fbeedd] shrink-0 flex-wrap justify-center">
        <span className="text-[#ffd36b]">NÍVEL {lv + 1}/5</span>
        <span className={left < 10 ? 'text-[#ff8a80]' : ''}>⏱ {Math.ceil(left)}s</span>
        <span>PARES {found.length}/{L.pairs}</span>
        <span className="text-[#c8f0c0]">{total} PTS</span>
      </div>
      <div ref={box} className="relative flex-1 min-h-0 w-full flex items-center justify-center">
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, ${size}px)` }}>
          {deck.map(c => {
            const up = open.includes(c.id) || found.includes(c.k)
            return (
              <button key={`${lv}-${c.id}`} onClick={() => flip(c)} style={{ width: size, height: size }}
                className={`rounded-md border-[3px] border-[#3b2314] flex items-center justify-center ${up ? (C[c.k].bad ? 'bg-[#ffd5d5]' : 'bg-[#fbeedd]') : 'bg-[#c8955a]'} ${found.includes(c.k) ? 'opacity-75' : ''}`}>
                <img src={up ? C[c.k].url : BACK} alt="" className="w-[72%] h-[72%] object-contain" style={{ imageRendering: 'pixelated' }} draggable={false} />
              </button>
            )
          })}
        </div>
        {banner && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="pixel text-base sm:text-lg text-[#ffd36b] bg-[#2b1d14]/90 rounded-md px-5 py-3">{banner}</p>
          </div>
        )}
      </div>
      <div className="min-h-[52px] w-full max-w-lg shrink-0">
        {t && (
          <div className="bg-[#fbeedd] pixel-box rounded-md p-2 flex gap-2 items-center">
            <img src={t.url} alt="" className="w-9 h-9 shrink-0 object-contain" style={{ imageRendering: 'pixelated' }} />
            <p className="text-[12px] leading-snug text-[#3b2314]"><b>{t.label}{t.bad ? ' ⚠️' : ''}:</b> {t.tip}</p>
          </div>
        )}
      </div>
    </div>
  )
}
