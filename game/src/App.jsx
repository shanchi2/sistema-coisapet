import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  NEEDS, NEED_INFO, SPECIES, HABITATS, CATALOG, CATALOG_KEYS, TIPS, newPet, advance, status, poopCount, isDaytime,
  feed, water, cleanOne, cleanAll, pet_, treat, wheelRun, sandBath, chillStone, migrate, habitatOf, isPlaced, togglePlace, redeem, mods,
} from './sim'
import { HAMSTER_FRAMES, paletteFor, spriteCanvas } from './art'
import { createGame, bridge } from './scene'
import { now } from './clock'
import { api, getAuth, setAuth, clearAuth } from './cloud'

// MinhaCoisaPet — protótipo (16/10).
// 0.2: inventário (terrário, substrato, roda, toca) + resgate de código.
// 0.4 (17/10): login opcional por código no e-mail → o pet fica salvo na
// nuvem (troca de celular/PC sem perder) e o tempo passa a vir do servidor.
// O aparelho continua guardando uma cópia (abre sem internet).
const SAVE_KEY = 'minhacoisapet_v1'
const PUSH_EVERY = 20000 // manda o save pra nuvem no máx. a cada 20 s (e ao sair)

function load() {
  try { const p = JSON.parse(localStorage.getItem(SAVE_KEY)); return p?.v === 1 ? migrate(p) : null } catch { return null }
}
function save(p) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(p)) } catch { /* sem storage */ } }

function spriteURL(species, frame = 'idle') {
  return spriteCanvas(HAMSTER_FRAMES[frame], paletteFor(species)).toDataURL()
}

// Mesmo pet? (nasceu no mesmo instante com o mesmo nome)
const samePet = (a, b) => a && b && a.born === b.born && a.name === b.name

export default function App() {
  // Hora do último cuidado GRAVADA no aparelho (antes de avançar o tempo) —
  // é ela que compara com a nuvem pra saber qual cópia é mais recente
  const storedTick = useRef(null)
  const [pet, setPet] = useState(() => {
    const p = load()
    storedTick.current = p?.lastTick ?? null
    return p ? advance(p) : null
  })
  const [auth, setAuthState] = useState(getAuth)
  const [loginOpen, setLoginOpen] = useState(false)
  const [conflict, setConflict] = useState(null) // { local, cloud }
  const [syncState, setSyncState] = useState(auth ? 'sync' : 'local') // local | sync | ok | offline
  const petRef = useRef(pet); petRef.current = pet
  const authRef = useRef(auth); authRef.current = auth

  useEffect(() => { if (pet) save(pet) }, [pet])

  // Junta o save da nuvem com o do aparelho depois de entrar / ao abrir o jogo
  const reconcile = useCallback((cloudSave, localTick) => {
    const local = petRef.current
    const cloud = cloudSave?.pet ? migrate(cloudSave.pet) : null
    if (!cloud) { if (local) pushNow(); return }               // conta nova: sobe o pet daqui
    if (!local || samePet(local, cloud)) {
      // mesmo pet: fica com o que foi cuidado por último
      const pick = !local || (cloud.lastTick || 0) >= (localTick ?? local.lastTick ?? 0) ? cloud : local
      setPet(advance(pick))
      if (pick === local) pushNow()
      return
    }
    setConflict({ local, cloud })                               // dois pets diferentes: a pessoa escolhe
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Ao abrir: acerta o relógio pelo servidor e, se tiver conta, baixa o save
  useEffect(() => {
    if (auth) {
      api('load', { token: auth.token })
        .then(r => { setSyncState('ok'); reconcile(r.save, storedTick.current) })
        .catch(e => { if (e.status === 401) { clearAuth(); setAuthState(null); setSyncState('local') } else setSyncState('offline') })
    } else {
      api('time').then(() => setPet(p => p && advance(p))).catch(() => {})
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Sobe o save pra nuvem: no máx. a cada 20 s e quando o jogo é escondido/fechado
  const pushTimer = useRef(null)
  function pushNow(keepalive = false) {
    clearTimeout(pushTimer.current); pushTimer.current = null
    const a = authRef.current, p = petRef.current
    if (!a || !p) return
    api('save', { token: a.token, pet: p }, { keepalive })
      .then(() => setSyncState('ok'))
      .catch(e => { if (e.status === 401) { clearAuth(); setAuthState(null); setSyncState('local') } else setSyncState('offline') })
  }
  useEffect(() => {
    if (!auth || !pet || conflict || pushTimer.current) return
    pushTimer.current = setTimeout(() => pushNow(), PUSH_EVERY)
  }, [pet, auth, conflict]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') pushNow(true) }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function onLoggedIn(r) {
    const a = { token: r.token, email: r.email }
    setAuth(a); setAuthState(a); authRef.current = a
    setLoginOpen(false); setSyncState('ok')
    reconcile(r.save)
  }
  async function logout() {
    const a = authRef.current
    pushNow()
    clearAuth(); setAuthState(null); setSyncState('local')
    if (a) api('logout', { token: a.token }).catch(() => {})
  }
  async function deleteAccount() {
    const a = authRef.current
    if (!a || !confirm('Apagar sua conta? O pet salvo na nuvem some (a cópia deste aparelho continua aqui).')) return
    try { await api('delete_account', { token: a.token }); clearAuth(); setAuthState(null); setSyncState('local'); alert('Conta apagada.') }
    catch (e) { alert(e.message) }
  }
  function chooseConflict(which) {
    const { local, cloud } = conflict
    setConflict(null)
    setPet(advance(which === 'local' ? local : cloud))
    if (which === 'local') setTimeout(() => pushNow(), 0)
  }

  const account = { auth, syncState, openLogin: () => setLoginOpen(true), logout, deleteAccount }
  return (
    <>
      {pet
        ? <Game pet={pet} setPet={setPet} account={account} onReset={() => { localStorage.removeItem(SAVE_KEY); setPet(null) }} />
        : <Onboarding onStart={p => setPet(p)} account={account} />}
      {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} onDone={onLoggedIn} hasLocal={!!pet} />}
      {conflict && <ConflictModal {...conflict} onChoose={chooseConflict} />}
    </>
  )
}

// ─── Entrar: e-mail → código de 6 dígitos ───────────────────────────
function LoginModal({ onClose, onDone, hasLocal }) {
  const [step, setStep] = useState('email')
  const [email, setEmail] = useState('')
  const [ageOk, setAgeOk] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [wait, setWait] = useState(0)
  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait(w => w - 1), 1000); return () => clearTimeout(t) }, [wait])

  async function sendCode(e) {
    e?.preventDefault()
    setErr(null); setBusy(true)
    try { await api('request_code', { email: email.trim(), age_ok: ageOk }); setStep('code'); setWait(60) }
    catch (x) { setErr(x.message) } finally { setBusy(false) }
  }
  async function verify(e) {
    e.preventDefault()
    setErr(null); setBusy(true)
    try { onDone(await api('verify_code', { email: email.trim(), code })) }
    catch (x) { setErr(x.message) } finally { setBusy(false) }
  }
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-sm bg-[#fbeedd] pixel-box rounded-t-xl sm:rounded-lg p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="pixel text-sm text-[#3b2314]">☁️ Entrar</h2>
          <button onClick={onClose} className="text-2xl leading-none px-2 text-[#8a6a52]" aria-label="Fechar">×</button>
        </div>
        {step === 'email' ? (
          <form onSubmit={sendCode} className="flex flex-col gap-3">
            <p className="text-[13px] text-[#6b4a32]">Com uma conta, seu pet fica salvo e você pode jogar no celular e no computador. Sem senha: a gente manda um código pro seu e-mail.</p>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" autoComplete="email"
              className="pixel-box rounded-md px-3 py-2.5 text-base font-bold bg-white outline-none" />
            <label className="flex items-start gap-2 text-[12px] text-[#3b2314] cursor-pointer">
              <input type="checkbox" checked={ageOk} onChange={e => setAgeOk(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#2ecc71]" />
              <span>Tenho 12 anos ou mais — <b>ou</b> um adulto responsável está me ajudando.</span>
            </label>
            {err && <p className="text-[12px] font-bold text-rose-600">{err}</p>}
            <button disabled={!emailOk || !ageOk || busy} className="pixel-btn rounded-md py-3 bg-[#2ecc71] text-white pixel text-xs disabled:opacity-50">{busy ? 'Enviando…' : 'Receber código'}</button>
            <p className="text-[10px] text-[#a88a70] leading-snug">Guardamos só o seu e-mail, pra salvar o jogo. Não mandamos propaganda. Dá pra apagar a conta quando quiser, no menu ☰.{hasLocal ? ' O pet deste aparelho vai junto pra sua conta.' : ''}</p>
          </form>
        ) : (
          <form onSubmit={verify} className="flex flex-col gap-3">
            <p className="text-[13px] text-[#6b4a32]">Mandamos um código de 6 números pra <b>{email.trim()}</b>. Olhe também a caixa de spam.</p>
            <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" autoFocus
              className="pixel-box rounded-md px-3 py-2.5 text-2xl tracking-[0.4em] text-center font-bold bg-white outline-none" />
            {err && <p className="text-[12px] font-bold text-rose-600">{err}</p>}
            <button disabled={code.length !== 6 || busy} className="pixel-btn rounded-md py-3 bg-[#2ecc71] text-white pixel text-xs disabled:opacity-50">{busy ? 'Conferindo…' : 'Entrar'}</button>
            <div className="flex items-center justify-between text-[12px]">
              <button type="button" onClick={() => { setStep('email'); setCode(''); setErr(null) }} className="text-[#8a6a52] underline">trocar e-mail</button>
              <button type="button" disabled={wait > 0 || busy} onClick={() => sendCode()} className="text-[#c0392b] font-bold disabled:text-[#a88a70]">{wait > 0 ? `reenviar em ${wait}s` : 'reenviar código'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ─── Dois pets diferentes (conta × aparelho): qual continua? ────────
function ConflictModal({ local, cloud, onChoose }) {
  const Card = ({ p, label, which }) => (
    <button onClick={() => onChoose(which)} className="pixel-btn bg-white rounded-md p-3 flex flex-col items-center gap-1 flex-1">
      <img src={spriteURL(p.species)} alt="" className="w-16 h-12" style={{ imageRendering: 'pixelated' }} />
      <span className="font-extrabold text-[14px]">{p.name}</span>
      <span className="text-[11px] text-[#8a6a52]">{label}</span>
    </button>
  )
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-[#fbeedd] pixel-box rounded-lg p-5">
        <h2 className="pixel text-sm text-[#3b2314] mb-2">Qual pet continua?</h2>
        <p className="text-[13px] text-[#6b4a32] mb-4">Sua conta já tem um pet salvo, e este aparelho tem outro. Escolha qual fica — o outro é substituído.</p>
        <div className="flex gap-3">
          <Card p={cloud} label="salvo na conta" which="cloud" />
          <Card p={local} label="deste aparelho" which="local" />
        </div>
      </div>
    </div>
  )
}

// ─── Boas-vindas: escolher espécie e nome ────────────────────────────
function Onboarding({ onStart, account }) {
  const [species, setSpecies] = useState('sirio')
  const [name, setName] = useState('')
  const valid = name.trim().length >= 2
  return (
    <div className="min-h-full flex items-center justify-center p-4 bg-[#2b1d14]">
      <div className="w-full max-w-md bg-[#fbeedd] pixel-box rounded-lg p-5 sm:p-6">
        <h1 className="pixel text-[#c0392b] text-lg sm:text-xl text-center leading-relaxed">MinhaCoisaPet</h1>
        <p className="text-center text-sm text-[#6b4a32] mt-2">Você agora é tutor de um hamster! Cuide bem dele: comida, água, limpeza e muito carinho.</p>

        <p className="pixel text-[10px] text-[#3b2314] mt-6 mb-2">1. Escolha seu pet</p>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(SPECIES).map(([k, s]) => (
            <button key={k} onClick={() => setSpecies(k)}
              className={`pixel-btn rounded-md p-2 flex flex-col items-center gap-1 ${species === k ? 'bg-[#ffd36b]' : 'bg-white'}`}>
              <img src={spriteURL(k)} alt="" className="w-16 h-12" style={{ imageRendering: 'pixelated' }} />
              <span className="text-[11px] font-bold leading-tight text-center">{s.label.replace('Hamster ', '')}</span>
            </button>
          ))}
        </div>

        <p className="pixel text-[10px] text-[#3b2314] mt-6 mb-2">2. Dê um nome</p>
        <input value={name} onChange={e => setName(e.target.value.slice(0, 16))} placeholder="Ex.: Bolinha"
          className="w-full pixel-box rounded-md px-3 py-2.5 text-base font-bold bg-white outline-none" />

        <button disabled={!valid} onClick={() => onStart(newPet({ name: name.trim(), species }))}
          className="pixel-btn w-full mt-6 rounded-md py-3 bg-[#2ecc71] text-white pixel text-xs">
          Começar a cuidar
        </button>
        <p className="text-[11px] text-center text-[#8a6a52] mt-3">Ele começa numa gaiolinha de ferro simples… com o tempo você pode dar um lar melhor pra ele 😉</p>
        {!account.auth
          ? <button onClick={account.openLogin} className="w-full mt-4 text-[13px] font-bold text-[#c0392b] underline">Já tenho conta — entrar</button>
          : <p className="text-[11px] text-center text-[#2e8b57] mt-4">☁️ Conectado como {account.auth.email} — o pet novo fica salvo na sua conta.</p>}
      </div>
    </div>
  )
}

// ─── Jogo ────────────────────────────────────────────────────────────
function Game({ pet, setPet, onReset, account }) {
  const [toast, setToast] = useState(null)
  const [tip, setTip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)])
  const [menu, setMenu] = useState(false)
  const [inv, setInv] = useState(false)
  const st = status(pet)
  const night = !isDaytime(now())

  // Relógio: avança a simulação a cada 5 s e quando a aba volta a aparecer
  useEffect(() => {
    const tick = () => setPet(p => advance(p))
    const id = setInterval(tick, 5000)
    const vis = () => document.visibilityState === 'visible' && tick()
    document.addEventListener('visibilitychange', vis)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', vis) }
  }, [setPet])

  // Troca a dica do rodapé de tempos em tempos
  useEffect(() => {
    const id = setInterval(() => setTip(TIPS[Math.floor(Math.random() * TIPS.length)]), 25000)
    return () => clearInterval(id)
  }, [])

  const say = useCallback((msg, t) => {
    if (msg) { setToast(msg); clearTimeout(say.t); say.t = setTimeout(() => setToast(null), 2600) }
    if (t) setTip(t)
  }, [])

  const act = useCallback(fn => {
    setPet(p => {
      const r = fn(advance(p))
      if (r.anim) bridge.emit('anim', r.anim)
      queueMicrotask(() => say(r.msg, r.tip))
      return r.pet
    })
  }, [setPet, say])

  // Eventos vindos da cena (tocar no hamster / na sujeirinha)
  useEffect(() => {
    const onPet = () => act(pet_)
    const onClean = () => act(cleanOne)
    const onWheel = secs => act(p => wheelRun(p, secs))
    const onBath = () => act(sandBath)
    const onChill = () => act(chillStone)
    bridge.on('tap-pet', onPet); bridge.on('clean-one', onClean); bridge.on('wheel-run', onWheel)
    bridge.on('sand-bath', onBath); bridge.on('chill', onChill)
    return () => {
      bridge.off('tap-pet', onPet); bridge.off('clean-one', onClean); bridge.off('wheel-run', onWheel)
      bridge.off('sand-bath', onBath); bridge.off('chill', onChill)
    }
  }, [act])

  const sceneState = useMemo(() => ({
    asleep: pet.asleep, statusKey: st.key, fome: pet.needs.fome, sede: pet.needs.sede, poops: poopCount(pet), night,
  }), [pet, st.key, night])

  const days = Math.max(1, Math.ceil((now() - pet.born) / 86400000))

  // O que está montado no ambiente (muda o desenho da cena)
  const setup = useMemo(() => ({
    habitat: habitatOf(pet),
    substrato: isPlaced(pet, 'substrato'), roda: isPlaced(pet, 'roda'), toca: isPlaced(pet, 'toca'), bebedouro: isPlaced(pet, 'bebedouro'),
    banheira: isPlaced(pet, 'banheira'), pedra: isPlaced(pet, 'pedra'),
    plaquinha: isPlaced(pet, 'plaquinha') ? pet.name : null, // nome gravado na plaquinha
  }), [pet])
  const setupKey = JSON.stringify(setup)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableSetup = useMemo(() => setup, [setupKey])

  return (
    <div className="min-h-[100dvh] landscape:h-[100dvh] bg-[#2b1d14] flex flex-col">
      {/* Cabeçalho */}
      <header className="flex items-center gap-2 px-3 sm:px-5 py-2 text-[#fbeedd]" style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}>
        <img src={spriteURL(pet.species)} alt="" className="w-8 h-6" style={{ imageRendering: 'pixelated' }} />
        <div className="min-w-0 flex-1">
          <p className="pixel text-[11px] sm:text-xs truncate">{pet.name}</p>
          <p className="text-[11px] text-[#d9bfa0] truncate">dia {days} · {HABITATS[habitatOf(pet)].label}<span className="hidden sm:inline"> · {SPECIES[pet.species].label}</span></p>
        </div>
        <span className="pixel text-[9px] sm:text-[10px] bg-[#fbeedd] text-[#3b2314] rounded px-2 py-1.5 whitespace-nowrap">{st.emoji} {st.label}</span>
        <span className="pixel text-[9px] sm:text-[10px] bg-[#ffd36b] text-[#3b2314] rounded px-2 py-1.5 whitespace-nowrap" title="Sementinhas: você ganha cuidando do seu pet">🌻 {pet.seeds}</span>
        <button onClick={() => setInv(true)} className="pixel-btn pixel text-[9px] sm:text-[10px] bg-[#c8955a] text-white rounded px-2 py-1.5 whitespace-nowrap" title="Itens e resgate de código">🎁<span className="hidden sm:inline"> Itens</span></button>
        <button onClick={() => setMenu(m => !m)} className="relative text-[#fbeedd] text-xl px-1" aria-label="Menu">☰
          {!account.auth && <span className="absolute top-0.5 right-0 w-2 h-2 rounded-full bg-[#ffd36b]" title="Seu pet ainda não está salvo na nuvem" />}
        </button>
      </header>

      {menu && (
        <div className="mx-3 sm:mx-5 mb-2 bg-[#fbeedd] pixel-box rounded-md p-3 text-sm flex flex-col gap-2.5">
          {account.auth ? (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="min-w-0">☁️ <b className="break-all">{account.auth.email}</b><br />
                <span className="text-[12px] text-[#6b4a32]">{{ ok: 'Salvo na nuvem', sync: 'Sincronizando…', offline: 'Sem internet — salvo neste aparelho, sobe quando voltar' }[account.syncState] || 'Salvo na nuvem'}</span>
              </span>
              <span className="flex gap-3 text-[13px] font-bold">
                <button onClick={account.logout} className="text-[#3b2314]">Sair</button>
                <button onClick={account.deleteAccount} className="text-[#c0392b]">Apagar conta</button>
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-[13px]">Seu pet está salvo <b>só neste aparelho</b>. Entre pra não perder e jogar em qualquer lugar.</span>
              <button onClick={account.openLogin} className="pixel-btn rounded-md px-3 py-1.5 bg-[#2ecc71] text-white text-[12px] font-extrabold whitespace-nowrap">☁️ Entrar</button>
            </div>
          )}
          <div className="flex items-center justify-between gap-3 border-t border-[#e2cdb0] pt-2">
            <span className="text-[11px] text-[#8a6a52]">MinhaCoisaPet · versão 0.4</span>
            <button onClick={() => { if (confirm(`Recomeçar do zero? ${pet.name} vai ser substituído${account.auth ? ' (também na sua conta)' : ''}.`)) onReset() }} className="text-[#c0392b] font-bold whitespace-nowrap text-[13px]">Recomeçar</button>
          </div>
        </div>
      )}

      {/* Corpo: em pé = coluna; deitado/PC = cena à esquerda, painel à direita */}
      <main className="flex-1 flex flex-col landscape:flex-row gap-3 px-3 sm:px-5 pb-3 min-h-0">
        <div className="relative w-full portrait:aspect-[4/3] portrait:max-h-[58dvh] landscape:flex-1 landscape:min-h-0 flex items-center justify-center">
          <GameCanvas species={pet.species} state={sceneState} setup={stableSetup} />
          {toast && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-[#fbeedd] pixel-box rounded-md px-3 py-1.5 text-sm font-bold whitespace-nowrap shadow-lg">{toast}</div>
          )}
          {pet.asleep && (
            <div className="absolute bottom-2 left-2 text-[11px] bg-black/50 text-white rounded px-2 py-1">Shhh… {pet.name} está com soninho 😴</div>
          )}
        </div>

        <aside className="landscape:w-[300px] xl:landscape:w-[340px] shrink-0 flex flex-col gap-3 landscape:overflow-y-auto">
          {/* Necessidades */}
          <div className="bg-[#fbeedd] pixel-box rounded-md p-3 grid grid-cols-2 landscape:grid-cols-1 [@media(orientation:landscape)_and_(max-height:520px)]:grid-cols-2 [@media(orientation:landscape)_and_(max-height:520px)]:p-2 gap-x-4 gap-y-2">
            {NEEDS.map(k => <NeedBar key={k} k={k} v={pet.needs[k]} />)}
            <NeedBar k="saude" v={pet.health} label="Saúde" icon="❤️" />
          </div>

          {/* Ações */}
          <div className="grid grid-cols-5 landscape:grid-cols-3 gap-2">
            <ActionBtn icon="🌾" label="Ração" color="#ffd36b" onClick={() => act(feed)} />
            <ActionBtn icon="💧" label="Água" color="#9fd8f5" onClick={() => act(water)} />
            <ActionBtn icon="🧹" label="Limpar" color="#c8f0c0" onClick={() => act(cleanAll)} />
            <ActionBtn icon="🤚" label="Carinho" color="#ffc2cf" onClick={() => act(pet_)} />
            <ActionBtn icon="🌻" label="Petisco" color="#ffe2a8" onClick={() => act(treat)} />
          </div>

          {/* Dica educativa */}
          <div className="bg-[#fff7e6] pixel-box rounded-md p-3 text-[13px] leading-snug text-[#3b2314] [@media(orientation:landscape)_and_(max-height:520px)]:hidden">
            <p className="pixel text-[9px] text-[#c0392b] mb-1.5">Dica do tutor</p>
            {tip}
          </div>
          <p className="text-[10px] text-[#a88a70] text-center">Toque no {pet.name} pra fazer carinho · toque na sujeirinha pra limpar</p>
        </aside>
      </main>
      {inv && <Inventory pet={pet} onClose={() => setInv(false)}
        onToggle={k => act(p => togglePlace(p, k))}
        onRedeem={code => { const r = redeem(advance(pet), code); setPet(r.pet); return r }} />}
    </div>
  )
}

// ─── Itens: inventário + resgate de código ──────────────────────────
function Inventory({ pet, onClose, onToggle, onRedeem }) {
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState(null)
  const m = mods(pet)
  const submit = e => {
    e.preventDefault()
    if (!code.trim()) return
    const r = onRedeem(code)
    setMsg(r ? { ok: r.ok, text: r.msg } : null)
    if (r?.ok) setCode('')
  }
  return (
    <div className="fixed inset-0 z-40 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto bg-[#fbeedd] pixel-box rounded-t-xl sm:rounded-lg p-4 sm:p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="pixel text-sm text-[#3b2314]">🎁 Itens do {pet.name}</h2>
          <button onClick={onClose} className="text-2xl leading-none px-2 text-[#8a6a52]" aria-label="Fechar">×</button>
        </div>

        {/* Resgatar código */}
        <form onSubmit={submit} className="bg-white pixel-box rounded-md p-3 mb-4">
          <p className="text-[13px] font-bold mb-1">Comprou um produto CoisaPet?</p>
          <p className="text-[12px] text-[#6b4a32] mb-2">Digite o código que veio no cartãozinho da embalagem pra liberar o item aqui no jogo.</p>
          <div className="flex gap-2">
            <input value={code} onChange={e => { setCode(e.target.value); setMsg(null) }} placeholder="Ex.: CP-XXXX-XXXX"
              className="flex-1 min-w-0 pixel-box rounded-md px-2.5 py-2 text-sm font-bold uppercase bg-[#fffaf2] outline-none" autoCapitalize="characters" />
            <button className="pixel-btn rounded-md px-3 bg-[#2ecc71] text-white text-sm font-extrabold">Resgatar</button>
          </div>
          {msg && <p className={`text-[12px] font-bold mt-2 ${msg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{msg.text}</p>}
          <p className="text-[10px] text-[#a88a70] mt-2">Modo teste: TESTE-TERRARIO · TESTE-ASPEN · TESTE-RODA · TESTE-TOCA · TESTE-BANHEIRA · TESTE-PEDRA · TESTE-PLAQUINHA · TESTE-TUDO</p>
        </form>

        {/* Conforto do ambiente */}
        <div className="flex items-center gap-2 mb-3 text-[12px] font-bold">
          <span>Conforto do lar:</span>
          <div className="flex-1 h-3 bg-[#3b2314] rounded-sm p-[2px]"><div className="h-full rounded-[1px] bg-[#c8955a] transition-all" style={{ width: `${Math.round(m.comfort * 100)}%` }} /></div>
          <span className="tabular-nums">{Math.round(m.comfort * 100)}%</span>
        </div>

        <div className="flex flex-col gap-2">
          {CATALOG_KEYS.map(k => {
            const it = CATALOG[k]
            const owned = !!pet.owned[k]
            const placed = isPlaced(pet, k)
            const blocked = owned && it.needs && !pet.placed[it.needs]
            return (
              <div key={k} className={`pixel-box rounded-md p-3 flex gap-3 ${owned ? 'bg-white' : 'bg-[#efe3d1]'}`}>
                <div className={`w-12 h-12 shrink-0 rounded-md flex items-center justify-center text-2xl ${owned ? 'bg-[#fff1d6]' : 'bg-[#e2d4bf] grayscale opacity-60'}`}>{owned ? it.icon : '🔒'}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-extrabold text-[14px] leading-tight">{it.label}</p>
                    {owned ? (
                      <button onClick={() => onToggle(k)} disabled={blocked}
                        className={`pixel-btn rounded px-2.5 py-1 text-[11px] font-extrabold whitespace-nowrap ${placed ? 'bg-[#ffd36b]' : 'bg-[#2ecc71] text-white'}`}>
                        {placed ? 'Guardar' : 'Colocar'}
                      </button>
                    ) : <span className="text-[10px] font-bold text-[#8a6a52] whitespace-nowrap">bloqueado</span>}
                  </div>
                  <p className="text-[12px] text-[#6b4a32] mt-0.5 leading-snug">{it.desc}</p>
                  {blocked && <p className="text-[11px] text-rose-600 font-bold mt-1">Precisa do {CATALOG[it.needs].label} colocado.</p>}
                  {!owned && <p className="text-[11px] text-[#c0392b] font-bold mt-1">Compre na CoisaPet e resgate o código 😉</p>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function NeedBar({ k, v, label, icon }) {
  const info = NEED_INFO[k] || { label, icon }
  const color = v >= 60 ? '#2ecc71' : v >= 30 ? '#f1c40f' : '#e74c3c'
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between text-[12px] font-bold">
        <span className="truncate">{info.icon} {info.label}</span>
        <span className="tabular-nums text-[#8a6a52]">{Math.round(v)}</span>
      </div>
      <div className="h-3 mt-0.5 bg-[#3b2314] rounded-sm p-[2px]">
        <div className="h-full rounded-[1px] transition-all duration-500" style={{ width: `${Math.max(3, v)}%`, background: color }} />
      </div>
    </div>
  )
}

function ActionBtn({ icon, label, color, onClick }) {
  return (
    <button onClick={onClick} className="pixel-btn rounded-md py-2 flex flex-col items-center gap-0.5" style={{ background: color }}>
      <span className="text-xl leading-none">{icon}</span>
      <span className="text-[11px] font-extrabold">{label}</span>
    </button>
  )
}

// Monta o Phaser uma vez e repassa o estado pela ponte
function GameCanvas({ species, state, setup }) {
  const ref = useRef(null)
  const gameRef = useRef(null)
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    // Recria a cena quando muda a espécie ou o que está montado no ambiente
    gameRef.current = createGame(ref.current, { species, state: stateRef.current, setup })
    return () => { gameRef.current?.destroy(true); gameRef.current = null }
  }, [species, setup])

  useEffect(() => { bridge.emit('state', state) }, [state])

  return <div ref={ref} className="w-full h-full min-h-[200px]" />
}
