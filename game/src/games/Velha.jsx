import { useEffect, useRef, useState } from 'react'
import { HAMSTER_FRAMES, paletteFor, spriteCanvas } from '../art'
import { CAT_HEAD, sprite } from './common'

// ❌⭕ Jogo da Velha (22/10, pedido do Raphael) — o hamster da pessoa contra o
// gato. 5 rodadas; quem começa alterna. Dificuldade multiplica os pontos:
// vitória 100 × (1 fácil, 2 médio, 3 difícil), empate 30, derrota 0.
// O gato difícil joga perfeito (minimax): contra ele, empatar já é bom!
export const meta = {
  key: 'velha', label: 'Jogo da Velha', icon: '❌', color: '#fff1a8',
  how: 'Você é o hamster, o adversário é o gato! Faça 3 em linha antes dele. São 5 rodadas — escolha a dificuldade: quanto mais difícil, mais pontos.',
}
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]]
const LEVELS = [
  { key: 'facil', label: 'Fácil', mult: 1, smart: 0.25 },
  { key: 'medio', label: 'Médio', mult: 2, smart: 0.7 },
  { key: 'dificil', label: 'Difícil', mult: 3, smart: 1 },
]
const ROUNDS = 5
function winner(b) {
  for (const l of LINES) if (b[l[0]] && b[l[0]] === b[l[1]] && b[l[0]] === b[l[2]]) return { who: b[l[0]], line: l }
  return b.every(Boolean) ? { who: 'empate', line: [] } : null
}
// minimax: 'g' = gato (maximiza), 'h' = hamster
function best(b, turn) {
  const w = winner(b)
  if (w) return { score: w.who === 'g' ? 10 : w.who === 'h' ? -10 : 0 }
  let pick = null
  for (let i = 0; i < 9; i++) {
    if (b[i]) continue
    b[i] = turn
    const r = best(b, turn === 'g' ? 'h' : 'g')
    b[i] = null
    const sc = r.score - Math.sign(r.score) // vence mais rápido / perde mais devagar
    if (!pick || (turn === 'g' ? sc > pick.score : sc < pick.score)) pick = { score: sc, i }
  }
  return pick
}
function catMove(b, smart) {
  const free = b.map((v, i) => v ? null : i).filter(i => i !== null)
  if (Math.random() < smart) return best([...b], 'g').i
  return free[Math.floor(Math.random() * free.length)]
}

export default function Velha({ pet, onEnd, paused }) {
  const hamster = useRef(spriteCanvas(HAMSTER_FRAMES.idle, paletteFor(pet.species)).toDataURL()).current
  const cat = useRef(sprite(CAT_HEAD).toDataURL()).current
  const [lvl, setLvl] = useState(null)
  const [round, setRound] = useState(1)
  const [board, setBoard] = useState(Array(9).fill(null))
  const [turn, setTurn] = useState('h')
  const [res, setRes] = useState(null)       // resultado da rodada
  const [tally, setTally] = useState({ v: 0, e: 0, d: 0, pts: 0 })
  const ended = useRef(false)

  // vez do gato
  useEffect(() => {
    if (!lvl || res || turn !== 'g') return
    const t = setInterval(() => {
      if (paused?.current) return
      clearInterval(t)
      setBoard(b => { const n = [...b]; n[catMove(b, lvl.smart)] = 'g'; return n })
      setTurn('h')
    }, 450)
    return () => clearInterval(t)
  }, [turn, lvl, res, paused])

  // fim da rodada
  useEffect(() => {
    if (res) return
    const w = winner(board)
    if (!w) return
    const pts = w.who === 'h' ? 100 * lvl.mult : w.who === 'empate' ? 30 : 0
    const nt = { v: tally.v + (w.who === 'h'), e: tally.e + (w.who === 'empate'), d: tally.d + (w.who === 'g'), pts: tally.pts + pts }
    setRes({ ...w, pts }); setTally(nt)
    setTimeout(() => {
      if (round >= ROUNDS) {
        if (!ended.current) { ended.current = true; onEnd({ score: nt.pts, seeds: nt.v * 2 + nt.e }) }
        return
      }
      const r = round + 1
      setRound(r); setBoard(Array(9).fill(null)); setRes(null)
      setTurn(r % 2 ? 'h' : 'g') // rodadas pares: o gato começa
    }, 1500)
  }, [board]) // eslint-disable-line react-hooks/exhaustive-deps

  function play(i) {
    if (!lvl || res || turn !== 'h' || board[i]) return
    const n = [...board]; n[i] = 'h'
    setBoard(n); setTurn('g')
  }

  if (!lvl) return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex items-center gap-4">
        <img src={hamster} alt="" className="w-20 h-[60px]" style={{ imageRendering: 'pixelated' }} />
        <span className="pixel text-sm text-[#ffd36b]">VS</span>
        <img src={cat} alt="" className="w-[60px] h-12" style={{ imageRendering: 'pixelated' }} />
      </div>
      <p className="pixel text-xs leading-relaxed">Escolha a dificuldade</p>
      <div className="flex flex-col gap-2 w-full max-w-xs">
        {LEVELS.map(l => (
          <button key={l.key} onClick={() => setLvl(l)} className="pixel-btn rounded-md py-3 bg-[#fbeedd] text-[#3b2314] font-extrabold text-[14px]">
            {l.label} <span className="text-[12px] text-[#8a6a52]">· vitória vale {100 * l.mult}</span>
          </button>
        ))}
      </div>
    </div>
  )

  const msg = res ? (res.who === 'h' ? `Você venceu! +${res.pts}` : res.who === 'g' ? 'O gato venceu 😼' : 'Deu velha! +30')
    : turn === 'h' ? 'Sua vez!' : 'O gato está pensando…'
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-3 select-none">
      <div className="flex items-center gap-4 pixel text-[9px] sm:text-[10px] flex-wrap justify-center">
        <span className="text-[#ffd36b]">RODADA {round}/{ROUNDS}</span>
        <span>🏆 {tally.v} · 🤝 {tally.e} · 😼 {tally.d}</span>
        <span className="text-[#c8f0c0]">{tally.pts} PTS</span>
      </div>
      <p className={`pixel text-[11px] min-h-[16px] ${res?.who === 'g' ? 'text-[#ff8a80]' : 'text-[#fbeedd]'}`}>{msg}</p>
      <div className="grid grid-cols-3 gap-2 p-2 bg-[#3b2314] rounded-lg" style={{ width: 'min(86vw, 58vh, 420px)' }}>
        {board.map((v, i) => {
          const hot = res?.line?.includes(i)
          return (
            <button key={i} onClick={() => play(i)} className={`aspect-square rounded-md flex items-center justify-center ${hot ? 'bg-[#ffd36b]' : 'bg-[#fbeedd]'} ${!v && turn === 'h' && !res ? 'hover:bg-[#fff8e6]' : ''}`}>
              {v && <img src={v === 'h' ? hamster : cat} alt="" className={v === 'h' ? 'w-[78%]' : 'w-[62%]'} style={{ imageRendering: 'pixelated' }} draggable={false} />}
            </button>
          )
        })}
      </div>
      <p className="text-[11px] text-[#d9bfa0]">Dificuldade: {lvl.label} · {round % 2 ? 'você começa' : 'o gato começa'}</p>
    </div>
  )
}
