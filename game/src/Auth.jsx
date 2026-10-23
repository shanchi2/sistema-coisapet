import { useEffect, useState } from 'react'
import { HAMSTER_FRAMES, paletteFor, spriteCanvas } from './art'
import { api } from './cloud'

// ─── Entrada obrigatória (0.5, 21/10 — pedido do Raphael) ────────────
// Não dá pra jogar sem conta: e-mail (confirmado por código de 6 dígitos) +
// cadastro com nome e WhatsApp. O pet fica preso a essa conta pra sempre —
// é o que dá valor pro ranking, ofensiva e prêmios (ninguém "recomeça" no topo).
// WhatsApp: só guardado (sem código no WhatsApp); a autorização de novidades
// é separada e opcional (LGPD) — vira o mailing da CoisaPet.

const sprite = (sp, frame = 'idle') => spriteCanvas(HAMSTER_FRAMES[frame], paletteFor(sp)).toDataURL()

export function Shell({ children }) {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-4 bg-[#2b1d14]" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
      <div className="w-full max-w-md bg-[#fbeedd] pixel-box rounded-lg p-5 sm:p-6">{children}</div>
    </div>
  )
}

function Title({ sub }) {
  return (
    <div className="text-center mb-4">
      <div className="flex justify-center gap-3 mb-3">
        {['sirio', 'panda', 'anao'].map((s, i) => <img key={s} src={sprite(s, i === 1 ? 'walk' : 'idle')} alt="" className="w-14 h-[42px]" style={{ imageRendering: 'pixelated' }} />)}
      </div>
      <h1 className="pixel text-[#c0392b] text-lg sm:text-xl leading-relaxed">MinhaCoisaPet</h1>
      {sub && <p className="text-sm text-[#6b4a32] mt-2">{sub}</p>}
    </div>
  )
}

const input = 'w-full pixel-box rounded-md px-3 py-2.5 text-base font-bold bg-white outline-none'
const btn = 'pixel-btn w-full rounded-md py-3 bg-[#2ecc71] text-white pixel text-xs disabled:opacity-50'

// ── 1. E-mail → código ──────────────────────────────────────────────
export function LoginScreen({ onDone, hasLocal }) {
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
    catch (x) { setErr(x.message); setBusy(false) }
  }
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())

  return (
    <Shell>
      <Title sub={step === 'email' ? 'Adote um hamster, cuide dele todo dia, jogue, suba de nível e dispute o ranking!' : null} />
      {step === 'email' ? (
        <form onSubmit={sendCode} className="flex flex-col gap-3">
          <p className="pixel text-[10px] text-[#3b2314]">Entrar pra jogar</p>
          <p className="text-[13px] text-[#6b4a32] -mt-1">Sem senha: mandamos um código pro seu e-mail. Seu pet fica salvo na sua conta e você joga no celular ou no computador.</p>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" autoComplete="email" className={input} />
          <label className="flex items-start gap-2 text-[12px] text-[#3b2314] cursor-pointer">
            <input type="checkbox" checked={ageOk} onChange={e => setAgeOk(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#2ecc71]" />
            <span>Tenho 12 anos ou mais — <b>ou</b> um adulto responsável está me ajudando.</span>
          </label>
          {err && <p className="text-[12px] font-bold text-rose-600">{err}</p>}
          <button disabled={!emailOk || !ageOk || busy} className={btn}>{busy ? 'Enviando…' : 'Receber código'}</button>
          {/* 23/10: e-mail do código fora do ar (cota do Resend) — a Diretoria gera o código no sistema */}
          <button type="button" disabled={!emailOk || !ageOk || busy} onClick={() => { setErr(null); setStep('code'); setWait(0) }}
            className="text-[12px] text-[#8a6a52] underline disabled:opacity-40">Já tenho um código</button>
          {hasLocal && <p className="text-[11px] text-[#2e8b57] font-bold text-center">🐹 O pet que já está neste aparelho vai junto pra sua conta.</p>}
        </form>
      ) : (
        <form onSubmit={verify} className="flex flex-col gap-3">
          <p className="text-[13px] text-[#6b4a32]">Digite o código de 6 números de <b>{email.trim()}</b>. Se pediu por e-mail, olhe também a caixa de spam.</p>
          <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" autoFocus
            className="pixel-box rounded-md px-3 py-2.5 text-2xl tracking-[0.4em] text-center font-bold bg-white outline-none" />
          {err && <p className="text-[12px] font-bold text-rose-600">{err}</p>}
          <button disabled={code.length !== 6 || busy} className={btn}>{busy ? 'Conferindo…' : 'Entrar'}</button>
          <div className="flex items-center justify-between text-[12px]">
            <button type="button" onClick={() => { setStep('email'); setCode(''); setErr(null) }} className="text-[#8a6a52] underline">trocar e-mail</button>
            <button type="button" disabled={wait > 0 || busy} onClick={() => sendCode()} className="text-[#c0392b] font-bold disabled:text-[#a88a70]">{wait > 0 ? `reenviar em ${wait}s` : 'reenviar código'}</button>
          </div>
        </form>
      )}
    </Shell>
  )
}

// (11) 91234-5678
export function maskWhats(v) {
  let d = String(v || '').replace(/\D/g, '')
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2)
  d = d.slice(0, 11)
  if (d.length <= 2) return d ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}
const whatsOk = v => { const d = v.replace(/\D/g, ''); return (d.length === 10 || (d.length === 11 && d[2] === '9')) && +d.slice(0, 2) >= 11 }

// ── 2. Cadastro (primeira vez) / editar dados ────────────────────────
export function ProfileForm({ token, initial, onDone, onCancel, onLogout, editing }) {
  const [name, setName] = useState(initial?.tutor_name || '')
  const [whats, setWhats] = useState(maskWhats(initial?.whatsapp || ''))
  const [terms, setTerms] = useState(!!editing)
  const [mk, setMk] = useState(!!initial?.marketing_ok)
  const [showTerms, setShowTerms] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const valid = name.trim().length >= 2 && whatsOk(whats) && terms

  async function submit(e) {
    e.preventDefault()
    setErr(null); setBusy(true)
    try { const r = await api('profile', { token, tutor_name: name, whatsapp: whats, marketing_ok: mk, terms }); onDone(r.me) }
    catch (x) { setErr(x.message); setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {!editing && <p className="pixel text-[10px] text-[#3b2314]">Quase lá! Quem é o tutor?</p>}
      <label className="text-[12px] font-bold text-[#3b2314]">Seu nome
        <input value={name} onChange={e => setName(e.target.value.slice(0, 60))} placeholder="Ex.: Ana Souza" autoComplete="name" className={input + ' mt-1'} />
        <span className="block text-[10px] font-semibold text-[#a88a70] mt-0.5">No ranking aparece só o primeiro nome.</span>
      </label>
      <label className="text-[12px] font-bold text-[#3b2314]">WhatsApp
        <input value={whats} onChange={e => setWhats(maskWhats(e.target.value))} placeholder="(11) 91234-5678" inputMode="tel" autoComplete="tel-national" className={input + ' mt-1'} />
        <span className="block text-[10px] font-semibold text-[#a88a70] mt-0.5">Fica ligado à sua conta (uma conta por WhatsApp). Ninguém no jogo vê.</span>
      </label>
      <label className="flex items-start gap-2 text-[12px] text-[#3b2314] cursor-pointer bg-white/60 rounded-md p-2">
        <input type="checkbox" checked={mk} onChange={e => setMk(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#2ecc71] shrink-0" />
        <span>Quero receber novidades, cupons e lembretes do meu hamster da <b>CoisaPet</b> pelo WhatsApp. <span className="text-[#8a6a52]">(opcional — dá pra mudar quando quiser)</span></span>
      </label>
      {!editing && (
        <label className="flex items-start gap-2 text-[12px] text-[#3b2314] cursor-pointer">
          <input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#2ecc71] shrink-0" />
          <span>Li e aceito <button type="button" onClick={() => setShowTerms(s => !s)} className="underline font-bold text-[#c0392b]">como o jogo usa meus dados</button>.</span>
        </label>
      )}
      {showTerms && (
        <div className="text-[11px] leading-snug text-[#6b4a32] bg-white/70 rounded-md p-2.5 flex flex-col gap-1.5">
          <p><b>O que guardamos:</b> e-mail, nome, WhatsApp e o progresso do seu pet.</p>
          <p><b>Pra quê:</b> entrar no jogo, salvar o pet, mostrar o ranking (só primeiro nome e nome do pet) e entregar prêmios das metas.</p>
          <p><b>Mensagens:</b> só mandamos novidades no WhatsApp se você marcar a caixinha acima.</p>
          <p><b>Seus direitos (LGPD):</b> você pode mudar seus dados ou apagar a conta quando quiser, no menu ☰ do jogo.</p>
          <p>Prêmios são por mérito (metas e ranking), sem sorteio. Responsável: CoisaPet · coisapet.com.br</p>
        </div>
      )}
      {err && <p className="text-[12px] font-bold text-rose-600">{err}</p>}
      <button disabled={!valid || busy} className={btn}>{busy ? 'Salvando…' : editing ? 'Salvar' : 'Continuar'}</button>
      {onCancel && <button type="button" onClick={onCancel} className="text-[12px] text-[#8a6a52] underline">cancelar</button>}
      {onLogout && <button type="button" onClick={onLogout} className="text-[12px] text-[#8a6a52] underline">sair desta conta</button>}
    </form>
  )
}

export function ProfileScreen(props) {
  return <Shell><Title /><ProfileForm {...props} /></Shell>
}

export function Splash({ text = 'Carregando…' }) {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-4 bg-[#2b1d14] text-[#fbeedd]">
      <img src={sprite('sirio', 'walk')} alt="" className="w-20 h-[60px] animate-bounce" style={{ imageRendering: 'pixelated' }} />
      <p className="pixel text-[10px]">{text}</p>
    </div>
  )
}
