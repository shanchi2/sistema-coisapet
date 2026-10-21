import { useEffect, useMemo, useRef, useState } from 'react'
import { HAMSTER_FRAMES, paletteFor, spriteCanvas } from './art'
import { api } from './cloud'
import { CATALOG, CATALOG_KEYS, SPECIES, daily, isDaytime, weatherOn } from './sim'
import { createGame, newBus } from './scene'
import { now } from './clock'

// ─── Painéis do 0.5 (21/10): progresso, ranking/amigos/concurso, álbum ──
const sprite = (sp, frame = 'idle') => spriteCanvas(HAMSTER_FRAMES[frame], paletteFor(sp)).toDataURL()
const Px = ({ sp, frame, className = 'w-10 h-[30px]' }) => <img src={sprite(sp, frame)} alt="" className={className} style={{ imageRendering: 'pixelated' }} />

export const TITLES = [[1, 'Tutor iniciante'], [3, 'Tutor cuidadoso'], [5, 'Tutor dedicado'], [8, 'Tutor expert'], [10, 'Mestre dos hamsters'], [15, 'Lenda CoisaPet']]
export const titleOf = lvl => [...TITLES].reverse().find(([l]) => lvl >= l)[1]

export const ACH_INFO = {
  primeiros_passos: { icon: '🐣', label: 'Primeiros passos', desc: 'Criou sua conta de tutor' },
  ofensiva_3:  { icon: '🔥', label: 'Pegando o ritmo', desc: '3 dias seguidos cuidando' },
  ofensiva_7:  { icon: '🔥', label: 'Uma semana!', desc: '7 dias seguidos cuidando' },
  ofensiva_30: { icon: '🌟', label: 'Tutor de verdade', desc: '30 dias seguidos cuidando' },
  nivel_5:     { icon: '⭐', label: 'Nível 5', desc: 'Chegou ao nível 5 de tutor' },
  nivel_10:    { icon: '🏅', label: 'Nível 10', desc: 'Chegou ao nível 10 de tutor' },
  corredor_500:  { icon: '🏃', label: 'Corredor', desc: '500 pontos na Corrida' },
  corredor_1500: { icon: '⚡', label: 'Velocista', desc: '1500 pontos na Corrida' },
  sabichao_10: { icon: '🎓', label: 'Sabichão', desc: 'Acertou 10 perguntas do dia' },
  lar_doce_lar: { icon: '🏡', label: 'Lar doce lar', desc: 'Montou o terrário' },
  colecionador: { icon: '🎁', label: 'Colecionador', desc: 'Tem todos os itens CoisaPet' },
  amigo:       { icon: '🤝', label: 'Fez um amigo', desc: 'Adicionou um amigo no jogo' },
  visitante:   { icon: '👋', label: 'Visitante', desc: 'Fez carinho no pet de alguém' },
  concurso:    { icon: '📸', label: 'Concorrente', desc: 'Inscreveu o terrário no concurso' },
  explorador:  { icon: '🕹️', label: 'Explorador', desc: 'Jogou todos os minijogos' },
  estrategista: { icon: '❌', label: 'Estrategista', desc: '900 pontos no Jogo da Velha' },
  sementeiro:  { icon: '🌻', label: 'Comilão', desc: '400 pontos na Chuva de Sementes' },
  labirinteiro: { icon: '🕳️', label: 'Tatu', desc: '600 pontos no Labirinto' },
  maratonista: { icon: '🎡', label: 'Maratonista', desc: '250 m na Rodinha Turbo' },
  memoria_boa: { icon: '🧠', label: 'Memória de elefante', desc: '1500 pontos na Memória' },
}

const GAME_TABS = [['corrida', '🏃', 'Corrida'], ['sementes', '🌻', 'Sementes'], ['labirinto', '🕳️', 'Labirinto'], ['rodinha', '🎡', 'Rodinha'], ['memoria', '🧠', 'Memória'], ['velha', '❌', 'Velha']]
const CARE_COUNTER = { feed2: 'feed', water1: 'water', clean1: 'clean', pet5: 'pet', treat1: 'treat' }

export function Sheet({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-40 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className={`w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'} max-h-[92dvh] overflow-y-auto bg-[#fbeedd] pixel-box rounded-t-xl sm:rounded-lg p-4 sm:p-5`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3 gap-2">
          <h2 className="pixel text-xs sm:text-sm text-[#3b2314] leading-relaxed">{title}</h2>
          <button onClick={onClose} className="text-2xl leading-none px-2 text-[#8a6a52]" aria-label="Fechar">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Bar({ v, max, color = '#2ecc71' }) {
  return <div className="h-3 bg-[#3b2314] rounded-sm p-[2px]"><div className="h-full rounded-[1px] transition-all duration-500" style={{ width: `${Math.max(3, Math.min(100, (v / Math.max(1, max)) * 100))}%`, background: color }} /></div>
}

export function LevelCard({ me }) {
  return (
    <div className="bg-white pixel-box rounded-md p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="pixel text-[10px] text-[#c0392b]">Nível {me.level}</p>
          <p className="text-[13px] font-extrabold">{titleOf(me.level)}</p>
        </div>
        <div className="text-right">
          <p className="text-[22px] leading-none">🔥<span className="font-extrabold text-[18px] align-middle"> {me.streak}</span></p>
          <p className="text-[10px] font-bold text-[#8a6a52]">{me.streak === 1 ? 'dia' : 'dias'} seguidos</p>
        </div>
      </div>
      <div className="mt-2"><Bar v={me.xp - me.from} max={me.to - me.from} color="#f1c40f" /></div>
      <p className="text-[11px] text-[#6b4a32] mt-1 font-bold">{me.xp} XP · faltam {me.to - me.xp} pro nível {me.level + 1} · hoje +{me.xp_today}</p>
      {!me.cared_today && <p className="text-[11px] font-extrabold text-[#c0392b] mt-1">Cuide do seu pet hoje pra não perder a ofensiva!</p>}
    </div>
  )
}

// ── Progresso: nível, ofensiva, missões, pergunta do dia, metas ─────
export function ProgressPanel({ me, pet, token, onMe, onClose, onPlay }) {
  const [busy, setBusy] = useState(null)
  const [err, setErr] = useState(null)
  const d = daily(pet)
  const progress = m => m.progress != null ? m.progress : (d.c[CARE_COUNTER[m.id]] || 0)

  async function claim(id) {
    setBusy(id); setErr(null)
    try { const r = await api('claim_mission', { token, id }); onMe(r.me, r.gained ? `+${r.gained} XP` : null) }
    catch (e) { setErr(e.message) } finally { setBusy(null) }
  }
  const done = me.missions.filter(m => m.claimed).length

  return (
    <Sheet title="🎯 Meu progresso" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <LevelCard me={me} />

        <div className="bg-white pixel-box rounded-md p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="pixel text-[10px] text-[#3b2314]">Missões de hoje</p>
            <span className="text-[11px] font-extrabold text-[#8a6a52]">{done}/3 {me.all_bonus && '· bônus ✓'}</span>
          </div>
          <div className="flex flex-col gap-2">
            {me.missions.map(m => {
              const p = Math.min(progress(m), m.target)
              const ok = p >= m.target
              return (
                <div key={m.id} className={`rounded-md p-2 border-2 ${m.claimed ? 'border-[#2ecc71] bg-[#eafaf0]' : 'border-[#e2cdb0] bg-[#fffaf2]'}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{m.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-extrabold leading-tight">{m.label}</p>
                      <div className="mt-1"><Bar v={p} max={m.target} /></div>
                    </div>
                    {m.claimed ? <span className="text-[11px] font-extrabold text-[#2e8b57] whitespace-nowrap">✓ +20 XP</span>
                      : ok ? <button onClick={() => claim(m.id)} disabled={busy === m.id} className="pixel-btn rounded px-2.5 py-1 bg-[#f1c40f] text-[11px] font-extrabold whitespace-nowrap">{busy === m.id ? '…' : 'Pegar +20'}</button>
                      : (['run300', 'run3', 'games2', 'sementes200'].includes(m.id) ? <button onClick={() => onPlay(m.id)} className="text-[11px] font-extrabold text-[#c0392b] whitespace-nowrap underline">jogar</button>
                        : <span className="text-[11px] font-bold text-[#8a6a52] tabular-nums">{p}/{m.target}</span>)}
                  </div>
                </div>
              )
            })}
          </div>
          <p className="text-[10px] text-[#a88a70] mt-2">Completou as 3? Ganha +20 XP de bônus. Missões novas todo dia à meia-noite.</p>
          {err && <p className="text-[12px] font-bold text-rose-600 mt-1">{err}</p>}
        </div>

        <Quiz token={token} onMe={onMe} />

        {me.goals.length > 0 && (
          <div className="bg-white pixel-box rounded-md p-3">
            <p className="pixel text-[10px] text-[#3b2314] mb-2">🎁 Metas com prêmio</p>
            <div className="flex flex-col gap-2">
              {me.goals.map(g => (
                <div key={g.key} className={`rounded-md p-2 border-2 ${g.earned ? 'border-[#f1c40f] bg-[#fff8dc]' : 'border-[#e2cdb0]'}`}>
                  <p className="text-[13px] font-extrabold">{g.earned ? '🏆' : '🎯'} {g.label}</p>
                  <p className="text-[11px] text-[#6b4a32]">{g.descr} Prêmio: <b>{g.reward}</b></p>
                  {g.earned && <RewardCode r={g.earned} />}
                </div>
              ))}
            </div>
            <p className="text-[10px] text-[#a88a70] mt-2">Prêmios por mérito, sem sorteio. Pra usar, mande o código pra CoisaPet.</p>
          </div>
        )}
      </div>
    </Sheet>
  )
}

export function RewardCode({ r }) {
  return (
    <div className="mt-1.5 flex items-center gap-2 flex-wrap">
      <code className="pixel text-[10px] bg-[#3b2314] text-[#ffd36b] rounded px-2 py-1">{r.code}</code>
      <button onClick={() => navigator.clipboard?.writeText(r.code)} className="text-[11px] font-bold underline text-[#3b2314]">copiar</button>
      {r.used_at && <span className="text-[10px] font-bold text-[#8a6a52]">já usado</span>}
    </div>
  )
}

function Quiz({ token, onMe }) {
  const [q, setQ] = useState(undefined)
  const [busy, setBusy] = useState(false)
  useEffect(() => { api('quiz_today', { token }).then(r => setQ(r.quiz)).catch(() => setQ(null)) }, [token])
  async function answer(i) {
    setBusy(true)
    try {
      const r = await api('quiz_answer', { token, choice: i })
      setQ(x => ({ ...x, choice: i, correct: r.correct, answer: r.answer, explain: r.explain }))
      onMe(r.me, `${r.correct ? 'Acertou!' : 'Quase!'} +${r.gained} XP`)
    } catch (e) { alert(e.message) } finally { setBusy(false) }
  }
  if (q === undefined) return <div className="bg-white pixel-box rounded-md p-3 text-[12px] text-[#8a6a52]">Carregando pergunta do dia…</div>
  if (!q) return null
  const answered = q.choice != null
  return (
    <div className="bg-white pixel-box rounded-md p-3">
      <p className="pixel text-[10px] text-[#3b2314] mb-1.5">❓ Pergunta do dia</p>
      <p className="text-[14px] font-extrabold leading-snug mb-2">{q.question}</p>
      <div className="flex flex-col gap-1.5">
        {q.options.map((o, i) => {
          const cls = !answered ? 'bg-[#fffaf2] hover:bg-[#fff1d6]'
            : i === q.answer ? 'bg-[#c8f0c0] border-[#2ecc71]' : i === q.choice ? 'bg-[#ffd5d5] border-[#e74c3c]' : 'bg-[#fffaf2] opacity-60'
          return <button key={i} disabled={answered || busy} onClick={() => answer(i)} className={`text-left rounded-md border-2 border-[#e2cdb0] px-2.5 py-2 text-[13px] font-bold ${cls}`}>{o}</button>
        })}
      </div>
      {answered
        ? <p className="text-[12px] text-[#3b2314] mt-2 leading-snug"><b>{q.correct ? '✅ Acertou!' : '💡 Quase!'}</b> {q.explain}</p>
        : <p className="text-[10px] text-[#a88a70] mt-2">Acertou: +15 XP · errou: +5 XP (aprender também vale!). Uma por dia.</p>}
    </div>
  )
}

// ── Cena do pet de outra pessoa (visita/concurso) ───────────────────
export function setupFromPublic(pub) {
  const placed = new Set(pub?.placed || [])
  const ter = placed.has('terrario')
  const on = k => placed.has(k) && (!CATALOG[k]?.needs || ter)
  return {
    habitat: ter ? 'terrario' : 'gaiola',
    substrato: on('substrato'), roda: on('roda'), toca: on('toca'), bebedouro: on('bebedouro'),
    banheira: on('banheira'), pedra: on('pedra'), plaquinha: on('plaquinha') ? pub.name : null,
  }
}
export function PetView({ pub, className = '' }) {
  const ref = useRef(null)
  const setupKey = JSON.stringify(setupFromPublic(pub))
  useEffect(() => {
    const t = now()
    const state = { asleep: pub.status === 'dormindo', statusKey: pub.status || 'ok', fome: 80, sede: 80, poops: 0, night: !isDaytime(t), weather: weatherOn(t).key }
    const g = createGame(ref.current, { species: pub.species || 'sirio', state, setup: JSON.parse(setupKey), bus: newBus() })
    return () => g.destroy(true)
  }, [pub.species, pub.status, setupKey]) // eslint-disable-line react-hooks/exhaustive-deps
  return <div ref={ref} className={`w-full aspect-[4/3] ${className}`} />
}

export function VisitPanel({ code, token, onMe, onClose }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const load = (cheer = false) => api('visit', { token, code, cheer }).then(r => { setData(r); if (r.me) onMe(r.me, r.gained ? `Carinho enviado! +${r.gained} XP` : null) }).catch(e => setErr(e.message))
  useEffect(() => { load() }, [code]) // eslint-disable-line react-hooks/exhaustive-deps
  async function cheer() { setBusy(true); await load(true); setBusy(false) }
  async function addFriend() {
    setBusy(true)
    try { const r = await api('friend_add', { token, code }); onMe(r.me, 'Amigo adicionado! 🤝'); setData(d => ({ ...d, host: { ...d.host, is_friend: true } })) }
    catch (e) { alert(e.message) } finally { setBusy(false) }
  }
  const h = data?.host
  return (
    <Sheet title={h ? `🏡 Casa do ${h.pet?.name || 'pet'}` : 'Visitando…'} onClose={onClose} wide>
      {err && <p className="text-[13px] font-bold text-rose-600">{err}</p>}
      {!h && !err && <p className="text-[13px] text-[#8a6a52]">Chegando lá…</p>}
      {h && (
        <div className="flex flex-col gap-3">
          {h.pet?.species ? <PetView pub={h.pet} className="pixel-box rounded-md overflow-hidden bg-[#2b1d14]" /> : null}
          <div className="bg-white pixel-box rounded-md p-3 flex items-center gap-3">
            <Px sp={h.pet?.species || 'sirio'} className="w-14 h-[42px]" />
            <div className="flex-1 min-w-0">
              <p className="font-extrabold text-[15px] leading-tight">{h.pet?.name} <span className="text-[12px] text-[#8a6a52] font-bold">de {h.tutor}</span></p>
              <p className="text-[12px] text-[#6b4a32] font-bold">Nível {h.level} · {titleOf(h.level)} · 🔥 {h.streak} · 🏃 {h.best_run} · 💛 {h.cheers}</p>
            </div>
          </div>
          {h.achievements?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {h.achievements.filter(k => ACH_INFO[k]).map(k => <span key={k} title={ACH_INFO[k].label} className="text-[11px] font-bold bg-white rounded px-1.5 py-0.5 border-2 border-[#e2cdb0]">{ACH_INFO[k].icon} {ACH_INFO[k].label}</span>)}
            </div>
          )}
          {!h.is_me && (
            <div className="flex gap-2 flex-wrap">
              <button onClick={cheer} disabled={busy || data.cheered_today} className="pixel-btn flex-1 rounded-md py-2.5 bg-[#ffc2cf] text-[13px] font-extrabold">{data.cheered_today ? '💛 Carinho de hoje enviado' : '🤚 Fazer carinho (+5 XP)'}</button>
              {!h.is_friend && <button onClick={addFriend} disabled={busy} className="pixel-btn rounded-md px-4 py-2.5 bg-[#2ecc71] text-white text-[13px] font-extrabold">🤝 Adicionar amigo</button>}
            </div>
          )}
        </div>
      )}
    </Sheet>
  )
}

// ── Ranking · Amigos · Concurso ─────────────────────────────────────
function useCountdown(endsAt) {
  const [t, setT] = useState(now())
  useEffect(() => { const id = setInterval(() => setT(now()), 30000); return () => clearInterval(id) }, [])
  if (!endsAt) return ''
  const ms = Math.max(0, endsAt - t), d = Math.floor(ms / 86400e3), h = Math.floor(ms % 86400e3 / 3600e3), m = Math.floor(ms % 3600e3 / 60e3)
  return d ? `${d}d ${h}h` : `${h}h ${m}min`
}

function Row({ i, r, value, onOpen }) {
  const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}º`
  return (
    <button onClick={() => r.code && onOpen(r.code)} className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left border-2 ${r.me ? 'border-[#f1c40f] bg-[#fff8dc]' : 'border-transparent bg-white hover:bg-[#fffaf2]'}`}>
      <span className="w-8 text-center font-extrabold text-[13px]">{medal}</span>
      <Px sp={r.species} className="w-8 h-6" />
      <span className="flex-1 min-w-0">
        <span className="block font-extrabold text-[13px] truncate">{r.pet} {r.me && <span className="text-[10px] text-[#c0392b]">(você)</span>}</span>
        <span className="block text-[11px] text-[#8a6a52] font-bold truncate">de {r.tutor} · nível {r.level}{r.streak ? ` · 🔥${r.streak}` : ''}</span>
      </span>
      <span className="font-extrabold text-[13px] tabular-nums">{value}</span>
    </button>
  )
}

export function SocialPanel({ me, token, pet, pub, onMe, onClose, onVisit, initialTab = 'liga' }) {
  const [tab, setTab] = useState(initialTab)
  const [rank, setRank] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => { api('ranking', { token }).then(setRank).catch(e => setErr(e.message)) }, [token])
  const left = useCountdown(rank?.ends_at)
  const [game, setGame] = useState('corrida')
  const [runs, setRuns] = useState(null)
  useEffect(() => {
    if (tab !== 'corrida') return
    setRuns(null)
    api('ranking', { token, game }).then(r => setRuns(r.runs)).catch(e => setErr(e.message))
  }, [tab, game, token])
  const TABS = [['liga', '🏆 Liga'], ['corrida', '🕹️ Recordes'], ['amigos', '🤝 Amigos'], ['concurso', '📸 Concurso']]
  return (
    <Sheet title="🏆 Ranking e amigos" onClose={onClose} wide>
      <div className="grid grid-cols-4 gap-1 sm:gap-1.5 mb-3">
        {TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`pixel-btn rounded-md py-1.5 px-0.5 truncate text-[10.5px] min-[400px]:text-[12px] font-extrabold ${tab === k ? 'bg-[#ffd36b]' : 'bg-white'}`}>{l}</button>)}
      </div>
      {err && <p className="text-[13px] font-bold text-rose-600">{err}</p>}
      {tab === 'liga' && (rank ? (
        <div className="flex flex-col gap-2">
          <div className="bg-white pixel-box rounded-md p-3">
            <p className="font-extrabold text-[15px]">{rank.league.icon} Liga {rank.league.label}</p>
            <p className="text-[12px] text-[#6b4a32]">A semana fecha em <b>{left}</b>. Quem faz mais XP na semana sobe de liga: a liga da semana que vem depende da sua XP desta semana.</p>
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {rank.leagues.map(l => <span key={l.key} className={`text-[10px] font-extrabold rounded px-1.5 py-0.5 border-2 ${l.key === rank.league.key ? 'border-[#f1c40f] bg-[#fff8dc]' : 'border-[#e2cdb0]'}`}>{l.icon} {l.label} {l.min ? `${l.min}+` : ''}</span>)}
            </div>
            {me.league.next && <p className="text-[11px] font-bold text-[#2e8b57] mt-1.5">Faça {me.league.next.min} XP nesta semana pra jogar na Liga {me.league.next.label} na próxima.</p>}
          </div>
          {rank.board.map((r, i) => <Row key={r.code || i} i={i} r={r} value={`${r.xp_week} XP`} onOpen={onVisit} />)}
          {!rank.board.length && <p className="text-[12px] text-[#8a6a52]">Ninguém pontuou nesta liga ainda — seja o primeiro!</p>}
        </div>
      ) : <p className="text-[13px] text-[#8a6a52]">Carregando…</p>)}
      {tab === 'corrida' && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {GAME_TABS.map(([k, ic, l]) => <button key={k} onClick={() => setGame(k)} className={`shrink-0 rounded-md px-2.5 py-1.5 text-[12px] font-extrabold border-2 ${game === k ? 'border-[#3b2314] bg-[#ffd36b]' : 'border-[#e2cdb0] bg-white'}`}>{ic} {l}</button>)}
          </div>
          <p className="text-[12px] text-[#6b4a32]">Melhores pontuações da semana (todas as ligas).{rank ? <> Fecha em <b>{left}</b>.</> : null}</p>
          {runs ? runs.map((r, i) => <Row key={r.code || i} i={i} r={r} value={r.best_run} onOpen={onVisit} />) : <p className="text-[13px] text-[#8a6a52]">Carregando…</p>}
          {runs && !runs.length && <p className="text-[12px] text-[#8a6a52]">Ninguém jogou esse nesta semana ainda!</p>}
        </div>
      )}
      {tab === 'amigos' && <Friends me={me} token={token} onMe={onMe} onVisit={onVisit} />}
      {tab === 'concurso' && <Contest token={token} pet={pet} pub={pub} onMe={onMe} />}
    </Sheet>
  )
}

function Friends({ me, token, onMe, onVisit }) {
  const [list, setList] = useState(null)
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState(null)
  const load = () => api('friends', { token }).then(setList).catch(e => setMsg({ ok: false, t: e.message }))
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  async function add(e) {
    e.preventDefault()
    try { const r = await api('friend_add', { token, code }); onMe(r.me, 'Amigo adicionado! 🤝'); setCode(''); setMsg({ ok: true, t: 'Amigo adicionado!' }); load() }
    catch (x) { setMsg({ ok: false, t: x.message }) }
  }
  const myCode = list?.my_code || me.profile.friend_code
  const share = () => {
    const text = `Bora jogar MinhaCoisaPet comigo! Me adiciona com o código ${myCode} 🐹 ${location.origin}${location.pathname}`
    if (navigator.share) navigator.share({ text }).catch(() => {})
    else { navigator.clipboard?.writeText(text); setMsg({ ok: true, t: 'Convite copiado!' }) }
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="bg-white pixel-box rounded-md p-3">
        <p className="text-[12px] font-bold text-[#6b4a32]">Seu código de amigo</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <code className="pixel text-sm bg-[#3b2314] text-[#ffd36b] rounded px-3 py-1.5 tracking-widest">{myCode || '…'}</code>
          <button onClick={share} className="pixel-btn rounded-md px-3 py-1.5 bg-[#2ecc71] text-white text-[12px] font-extrabold">📤 Convidar</button>
        </div>
        <form onSubmit={add} className="flex gap-2 mt-3">
          <input value={code} onChange={e => setCode(e.target.value.toUpperCase().slice(0, 8))} placeholder="Código do amigo" className="flex-1 min-w-0 pixel-box rounded-md px-2.5 py-2 text-sm font-bold uppercase bg-[#fffaf2] outline-none" />
          <button disabled={code.length < 6} className="pixel-btn rounded-md px-3 bg-[#ffd36b] text-sm font-extrabold">Adicionar</button>
        </form>
        {msg && <p className={`text-[12px] font-bold mt-2 ${msg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{msg.t}</p>}
      </div>
      <p className="text-[12px] text-[#6b4a32]">Visite seus amigos e faça carinho no pet deles: <b>+5 XP</b> pra você e <b>+3 XP</b> pra eles (1 vez por dia cada).</p>
      {list?.friends.map(f => (
        <button key={f.code} onClick={() => onVisit(f.code)} className="w-full flex items-center gap-2 rounded-md px-2 py-2 bg-white border-2 border-[#e2cdb0] text-left">
          <Px sp={f.pet?.species || 'sirio'} className="w-10 h-[30px]" />
          <span className="flex-1 min-w-0">
            <span className="block font-extrabold text-[13px] truncate">{f.pet?.name} <span className="text-[11px] text-[#8a6a52]">de {f.tutor}</span></span>
            <span className="block text-[11px] text-[#8a6a52] font-bold">nível {f.level} · 🔥 {f.streak}</span>
          </span>
          <span className="text-[11px] font-extrabold whitespace-nowrap">{f.visited ? '💛 hoje' : '🤚 visitar'}</span>
        </button>
      ))}
      {list && !list.friends.length && <p className="text-[12px] text-[#8a6a52]">Você ainda não tem amigos no jogo. Mande seu código pra alguém!</p>}
    </div>
  )
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const monthLabel = m => m ? MONTHS[+m.slice(5, 7) - 1] : ''

function Contest({ token, pet, pub, onMe }) {
  const [data, setData] = useState(null)
  const [open, setOpen] = useState(null)
  const [msg, setMsg] = useState(null)
  const load = () => api('contest', { token }).then(setData).catch(e => setMsg(e.message))
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const mine = data?.entries.find(e => e.mine)
  async function enter() {
    setMsg(null)
    try { const r = await api('contest_enter', { token }); onMe(r.me, r.gained ? `Inscrito! +${r.gained} XP` : 'Inscrição atualizada!'); load() }
    catch (e) { setMsg(e.message) }
  }
  async function vote(id) {
    try { const r = await api('contest_vote', { token, entry_id: id }); setData(d => ({ ...d, entries: d.entries.map(e => e.id === id ? { ...e, voted: true, votes: r.votes } : e) })); setOpen(o => o && { ...o, voted: true, votes: r.votes }) }
    catch (e) { alert(e.message) }
  }
  if (!data) return <p className="text-[13px] text-[#8a6a52]">{msg || 'Carregando…'}</p>
  return (
    <div className="flex flex-col gap-3">
      <div className="bg-white pixel-box rounded-md p-3">
        <p className="font-extrabold text-[15px]">📸 Terrário do mês de {monthLabel(data.month)}</p>
        <p className="text-[12px] text-[#6b4a32]">Inscreva o terrário do {pet.name} e vote nos mais bonitos. Cada pessoa vota 1 vez em cada terrário (não vale votar no seu). O mais votado do mês ganha destaque aqui!</p>
        <button onClick={enter} className="pixel-btn mt-2 rounded-md px-3 py-2 bg-[#2ecc71] text-white text-[12px] font-extrabold">{mine ? '🔄 Atualizar meu terrário' : '✨ Inscrever meu terrário'}</button>
        {pub?.habitat !== 'terrario' && <p className="text-[11px] font-bold text-[#c0392b] mt-1">Precisa estar no terrário (não vale gaiola).</p>}
        {msg && <p className="text-[12px] font-bold text-rose-600 mt-1">{msg}</p>}
      </div>
      {data.winners.length > 0 && (
        <div className="bg-[#fff8dc] pixel-box rounded-md p-3">
          <p className="pixel text-[10px] text-[#3b2314] mb-1">🏆 Vencedores de {monthLabel(data.prev_month)}</p>
          {data.winners.map((w, i) => <p key={i} className="text-[13px] font-extrabold">{['🥇', '🥈', '🥉'][i]} {w.snapshot.name} <span className="text-[11px] text-[#8a6a52]">de {w.snapshot.tutor} · {w.votes} votos</span></p>)}
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {data.entries.map((e, i) => (
          <button key={e.id} onClick={() => setOpen(e)} className={`rounded-md p-2 text-left border-2 ${e.mine ? 'border-[#f1c40f] bg-[#fff8dc]' : 'border-[#e2cdb0] bg-white'}`}>
            <div className="flex items-center gap-1.5"><Px sp={e.snapshot.species} className="w-8 h-6" /><span className="font-extrabold text-[12px] truncate">{e.snapshot.name}</span></div>
            <p className="text-[10px] text-[#8a6a52] font-bold">de {e.snapshot.tutor}{e.mine ? ' (você)' : ''}</p>
            <p className="text-[12px] mt-0.5 leading-none">{(e.snapshot.placed || []).map(k => CATALOG[k]?.icon).join('')}</p>
            <p className="text-[11px] font-extrabold mt-1">{i < 3 && e.votes ? ['🥇', '🥈', '🥉'][i] : '❤️'} {e.votes} {e.voted && <span className="text-[#2e8b57]">· votou</span>}</p>
          </button>
        ))}
      </div>
      {!data.entries.length && <p className="text-[12px] text-[#8a6a52]">Ninguém se inscreveu ainda este mês. Seja o primeiro!</p>}
      {open && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3" onClick={() => setOpen(null)}>
          <div className="w-full max-w-xl bg-[#fbeedd] pixel-box rounded-lg p-3" onClick={ev => ev.stopPropagation()}>
            <p className="pixel text-[10px] mb-2">{open.snapshot.name} <span className="text-[#8a6a52]">de {open.snapshot.tutor}</span></p>
            <PetView pub={open.snapshot} className="pixel-box rounded-md overflow-hidden bg-[#2b1d14]" />
            <div className="flex gap-2 mt-2">
              {!open.mine && <button onClick={() => vote(open.id)} disabled={open.voted} className="pixel-btn flex-1 rounded-md py-2.5 bg-[#ffc2cf] text-[13px] font-extrabold">{open.voted ? `❤️ Votado (${open.votes})` : `❤️ Votar (${open.votes})`}</button>}
              <button onClick={() => setOpen(null)} className="pixel-btn rounded-md px-4 py-2.5 bg-white text-[13px] font-extrabold">Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Álbum: itens CoisaPet + figurinhas de conquistas ────────────────
export function AlbumPanel({ me, pet, onClose, onItems }) {
  const items = CATALOG_KEYS
  const owned = items.filter(k => pet.owned[k]).length
  const ach = Object.keys(ACH_INFO)
  const got = ach.filter(k => me?.achievements?.[k]).length
  return (
    <Sheet title="📒 Álbum" onClose={onClose} wide>
      <div className="flex flex-col gap-4">
        <section>
          <div className="flex items-center justify-between mb-2">
            <p className="pixel text-[10px] text-[#3b2314]">Coleção CoisaPet</p>
            <span className="text-[12px] font-extrabold">{owned}/{items.length}</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {items.map(k => {
              const it = CATALOG[k], has = !!pet.owned[k]
              return (
                <div key={k} className={`rounded-md p-2 flex flex-col items-center text-center border-2 ${has ? 'bg-white border-[#c8955a]' : 'bg-[#efe3d1] border-dashed border-[#c9b88a]'}`}>
                  <span className={`text-2xl ${has ? '' : 'grayscale opacity-40'}`}>{it.icon}</span>
                  <span className="text-[10px] font-extrabold leading-tight mt-1">{has ? it.label : '???'}</span>
                </div>
              )
            })}
          </div>
          <p className="text-[11px] text-[#6b4a32] mt-2">Cada produto CoisaPet vem com um código que libera a figurinha e o item no jogo. <button onClick={onItems} className="underline font-bold text-[#c0392b]">Resgatar código</button></p>
        </section>
        <section>
          <div className="flex items-center justify-between mb-2">
            <p className="pixel text-[10px] text-[#3b2314]">Figurinhas de conquista</p>
            <span className="text-[12px] font-extrabold">{got}/{ach.length}</span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {ach.map(k => {
              const a = ACH_INFO[k], when = me?.achievements?.[k]
              return (
                <div key={k} className={`rounded-md p-2 flex flex-col items-center text-center border-2 ${when ? 'bg-[#fff8dc] border-[#f1c40f]' : 'bg-[#efe3d1] border-dashed border-[#c9b88a]'}`}>
                  <span className={`text-2xl ${when ? '' : 'grayscale opacity-40'}`}>{a.icon}</span>
                  <span className="text-[10px] font-extrabold leading-tight mt-1">{a.label}</span>
                  <span className="text-[9px] text-[#8a6a52] leading-tight">{a.desc}</span>
                </div>
              )
            })}
          </div>
        </section>
        <section>
          <p className="pixel text-[10px] text-[#3b2314] mb-2">Raças</p>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(SPECIES).map(([k, s]) => (
              <div key={k} className={`rounded-md p-2 flex flex-col items-center border-2 ${pet.species === k ? 'bg-white border-[#c8955a]' : 'bg-[#efe3d1] border-dashed border-[#c9b88a]'}`}>
                <Px sp={k} className={`w-14 h-[42px] ${pet.species === k ? '' : 'opacity-40'}`} />
                <span className="text-[10px] font-extrabold mt-1 text-center leading-tight">{s.label}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </Sheet>
  )
}

// ── Celebração: conquista nova / prêmio ─────────────────────────────
export function Celebrate({ items, onClose }) {
  const it = items[0]
  const a = it.type === 'ach' ? ACH_INFO[it.key] : null
  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-xs bg-[#fbeedd] pixel-box rounded-lg p-5 text-center" onClick={e => e.stopPropagation()}>
        {a ? <>
          <p className="pixel text-[10px] text-[#c0392b]">Figurinha nova!</p>
          <p className="text-5xl my-3 animate-bounce">{a.icon}</p>
          <p className="font-extrabold text-[16px]">{a.label}</p>
          <p className="text-[12px] text-[#6b4a32]">{a.desc} · +25 XP</p>
        </> : <>
          <p className="pixel text-[10px] text-[#c0392b]">Meta cumprida! 🏆</p>
          <p className="font-extrabold text-[16px] mt-3">{it.label}</p>
          <p className="text-[13px] text-[#3b2314] mt-1">Prêmio: <b>{it.reward}</b></p>
          <div className="flex justify-center"><RewardCode r={it} /></div>
          <p className="text-[11px] text-[#6b4a32] mt-2">O código fica guardado em 🎯 Progresso.</p>
        </>}
        <button onClick={onClose} className="pixel-btn mt-4 w-full rounded-md py-2.5 bg-[#2ecc71] text-white pixel text-[10px]">Oba!</button>
      </div>
    </div>
  )
}

export function useStable(v) { return useMemo(() => v, [JSON.stringify(v)]) } // eslint-disable-line react-hooks/exhaustive-deps
