import { useEffect, useMemo, useRef, useState } from 'react'
import { ITEM_ICONS, sprite } from './common'
import { CATALOG } from '../sim'

// 🧠 Memória CoisaPet (0.6) — 6 pares com os produtos da loja (desenhados em
// pixel). A cada par achado aparece pra que serve o produto. Pontos: 1000,
// menos 40 por jogada a mais que o mínimo e 4 por segundo (mínimo 100).
export const meta = {
  key: 'memoria', label: 'Memória CoisaPet', icon: '🧠', color: '#d7c8f5',
  how: 'Vire duas cartas por vez e ache os 6 pares de produtos CoisaPet. Quanto menos jogadas e mais rápido, mais pontos!',
}
const icons = {}
const iconURL = k => icons[k] || (icons[k] = sprite(ITEM_ICONS[k]).toDataURL())
const BACK = sprite([
  'kkkkkkkkkkkk', 'kAAAAAAAAAAk', 'kAaAAAAAAaAk', 'kAAAAaaAAAAk', 'kAAAaAAaAAAk', 'kAAAAAaAAAAk',
  'kAAAAaAAAAAk', 'kAAAAAAAAAAk', 'kAAAAaAAAAAk', 'kAaAAAAAAaAk', 'kAAAAAAAAAAk', 'kkkkkkkkkkkk',
]).toDataURL()

export default function Memoria({ onEnd }) {
  const deck = useMemo(() => {
    const keys = Object.keys(ITEM_ICONS).sort(() => Math.random() - 0.5).slice(0, 6)
    return [...keys, ...keys].map((k, i) => ({ id: i, k })).sort(() => Math.random() - 0.5)
  }, [])
  const [open, setOpen] = useState([])     // ids virados agora (máx. 2)
  const [found, setFound] = useState([])   // chaves achadas
  const [moves, setMoves] = useState(0)
  const [secs, setSecs] = useState(0)
  const [tip, setTip] = useState(null)
  const lock = useRef(false)
  const t0 = useRef(performance.now())
  useEffect(() => { const id = setInterval(() => setSecs(Math.floor((performance.now() - t0.current) / 1000)), 250); return () => clearInterval(id) }, [])

  function flip(card) {
    if (lock.current || open.includes(card.id) || found.includes(card.k)) return
    const next = [...open, card.id]
    setOpen(next)
    if (next.length < 2) return
    setMoves(m => m + 1)
    const [a, b] = next.map(id => deck.find(c => c.id === id))
    if (a.k === b.k) {
      const nf = [...found, a.k]
      setFound(nf); setOpen([])
      setTip({ k: a.k, text: CATALOG[a.k]?.edu || CATALOG[a.k]?.desc })
      if (nf.length === 6) {
        const s = Math.floor((performance.now() - t0.current) / 1000)
        const score = Math.max(100, 1000 - Math.max(0, moves + 1 - 6) * 40 - s * 4)
        lock.current = true
        setTimeout(() => onEnd({ score, seeds: 6 }), 1200)
      }
    } else {
      lock.current = true
      setTimeout(() => { setOpen([]); lock.current = false }, 750)
    }
  }

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-3 select-none">
      <div className="flex items-center gap-4 pixel text-[10px] text-[#fbeedd]">
        <span>JOGADAS {moves}</span><span>⏱ {secs}s</span><span>PARES {found.length}/6</span>
      </div>
      <div className="grid grid-cols-4 landscape:grid-cols-6 gap-2 w-full max-w-md landscape:max-w-2xl">
        {deck.map(c => {
          const up = open.includes(c.id) || found.includes(c.k)
          return (
            <button key={c.id} onClick={() => flip(c)}
              className={`aspect-square rounded-md pixel-box flex items-center justify-center transition-transform duration-150 ${up ? 'bg-[#fbeedd]' : 'bg-[#c8955a] hover:scale-[1.03]'} ${found.includes(c.k) ? 'opacity-80 ring-4 ring-[#2ecc71]' : ''}`}>
              <img src={up ? iconURL(c.k) : BACK} alt="" className="w-3/4 h-3/4" style={{ imageRendering: 'pixelated' }} />
            </button>
          )
        })}
      </div>
      <div className="min-h-[64px] w-full max-w-md">
        {tip && (
          <div className="bg-[#fbeedd] pixel-box rounded-md p-2 flex gap-2 items-start">
            <img src={iconURL(tip.k)} alt="" className="w-10 h-10 shrink-0" style={{ imageRendering: 'pixelated' }} />
            <p className="text-[12px] leading-snug text-[#3b2314]"><b>{CATALOG[tip.k]?.label}:</b> {tip.text}</p>
          </div>
        )}
      </div>
    </div>
  )
}
