import { useEffect, useMemo, useState } from 'react'
import { Gamepad2, Users, Gift, Ticket, Download, Search, Copy, Check, MessageCircle, RefreshCw, KeyRound } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { sessionToken } from '../../lib/sessionToken'

// MinhaCoisaPet — painel da Diretoria (21/10). Jogadores (mailing de WhatsApp
// de quem autorizou), metas com prêmio (liga/desliga e define o prêmio),
// prêmios ganhos (marcar como entregue) e códigos de compra pros cartõezinhos.
// Tudo por funções com p_token que conferem no banco se é admin (fase120).
const ITEMS = [
  ['terrario', '🏡 Terrário'], ['substrato', '🪵 Substrato Aspen'], ['roda', '🎡 Roda 25 cm'], ['toca', '🛖 Toca'],
  ['bebedouro', '🚰 Bebedouro'], ['banheira', '🛁 Banheira de areia'], ['pedra', '🪨 Pedra de resfriamento'], ['plaquinha', '🏷️ Plaquinha'],
]
const ITEM_LABEL = Object.fromEntries(ITEMS)
const SPECIES = { sirio: 'Sírio', anao: 'Anão russo', panda: 'Panda' }
const levelOf = xp => { let l = 1; while (50 * (l + 1) * l <= xp) l++; return l }
const fmtWhats = w => { const d = String(w || '').replace(/^55/, ''); return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : w || '—' }
const fmtDate = d => d ? new Date(d).toLocaleDateString('pt-BR') : '—'
const ago = d => {
  if (!d) return '—'
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 864e5)
  return days <= 0 ? 'hoje' : days === 1 ? 'ontem' : `há ${days} dias`
}

function csv(rows) {
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`
  return rows.map(r => r.map(esc).join(';')).join('\n')
}
function download(name, text) {
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export function GameAdminPage() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [tab, setTab] = useState('jogadores')
  const load = async () => {
    const { data: d, error } = await supabase.rpc('game_admin_overview', { p_token: sessionToken() })
    if (error) setErr(error.message); else { setData(d); setErr(null) }
  }
  useEffect(() => { load() }, [])

  const players = data?.players || []
  const active7 = players.filter(p => p.last_seen_at && Date.now() - new Date(p.last_seen_at).getTime() < 7 * 864e5).length
  const optIn = players.filter(p => p.marketing_ok && p.whatsapp).length
  const pendingRewards = (data?.rewards || []).filter(r => !r.used_at).length

  const TABS = [
    ['jogadores', 'Jogadores', Users], ['premios', 'Metas e prêmios', Gift], ['codigos', 'Códigos de compra', Ticket],
  ]

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="rounded-2xl bg-gradient-to-br from-amber-700 via-orange-600 to-rose-600 text-white p-5 sm:p-6 shadow-lg">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center"><Gamepad2 className="w-7 h-7" /></div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold">MinhaCoisaPet</h1>
              <p className="text-white/80 text-sm">Jogadores, mailing de WhatsApp, metas com prêmio e códigos dos cartõezinhos</p>
            </div>
          </div>
          <div className="flex gap-2">
            <a href="https://www.coisapet.com.br/game/" target="_blank" rel="noreferrer" className="px-3 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-sm font-semibold">Abrir o jogo ↗</a>
            <button onClick={load} className="px-3 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-sm font-semibold flex items-center gap-1.5"><RefreshCw className="w-4 h-4" />Atualizar</button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          {[['Jogadores', players.length], ['Ativos (7 dias)', active7], ['Aceitam WhatsApp', optIn], ['Prêmios a entregar', pendingRewards]].map(([l, v]) => (
            <div key={l} className="rounded-xl bg-white/10 px-4 py-3"><p className="text-2xl font-bold tabular-nums">{data ? v : '…'}</p><p className="text-xs text-white/80">{l}</p></div>
          ))}
        </div>
      </div>

      {err && <div className="mt-4 p-4 rounded-xl bg-rose-50 text-rose-700 text-sm">{err}</div>}

      <LoginCodeCard />

      <div className="flex gap-2 mt-5 mb-4 flex-wrap">
        {TABS.map(([k, l, Icon]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 border ${tab === k ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}><Icon className="w-4 h-4" />{l}</button>
        ))}
      </div>

      {data && tab === 'jogadores' && <Players players={players} />}
      {data && tab === 'premios' && <Rewards data={data} reload={load} />}
      {data && tab === 'codigos' && <Codes codes={data.codes} reload={load} />}
    </div>
  )
}

// Código de acesso sem e-mail (23/10): o Resend estourou a cota do mês e o
// código de login não chega. A Diretoria gera aqui o código de 6 números pro
// e-mail da pessoa (vale 15 min, 5 tentativas — o mesmo do e-mail) e, no
// jogo, ela toca em "Já tenho um código". Só admin (fase126).
function LoginCodeCard() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [made, setMade] = useState(null)
  const [copied, setCopied] = useState(false)
  async function gen(e) {
    e.preventDefault()
    setBusy(true)
    const { data, error } = await supabase.rpc('game_admin_login_code', { p_token: sessionToken(), p_email: email })
    setBusy(false)
    if (error) { toast.error(error.message); return }
    setMade({ email: email.trim().toLowerCase(), code: data, until: Date.now() + 15 * 60e3 })
  }
  return (
    <div className="mt-4 bg-white rounded-2xl border border-amber-200 shadow-sm p-4 flex flex-col sm:flex-row gap-4 sm:items-center">
      <div className="flex items-start gap-3 sm:w-80 shrink-0">
        <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0"><KeyRound className="w-4 h-4 text-amber-600" /></div>
        <div>
          <p className="text-sm font-bold text-gray-800">Código de acesso sem e-mail</p>
          <p className="text-xs text-gray-500">Enquanto o e-mail do código está fora do ar: gere aqui e, no jogo, toque em <b>"Já tenho um código"</b>. Vale 15 minutos.</p>
        </div>
      </div>
      {made ? (
        <div className="flex-1 flex flex-wrap items-center gap-3">
          <div>
            <p className="text-[11px] text-gray-500">Código pra <b>{made.email}</b></p>
            <p className="text-3xl font-black tracking-[0.3em] tabular-nums text-gray-900">{made.code}</p>
          </div>
          <button onClick={() => { navigator.clipboard?.writeText(made.code); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold flex items-center gap-1.5 hover:bg-gray-50">
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}Copiar
          </button>
          <button onClick={() => { setMade(null); setEmail('') }} className="text-sm font-semibold text-gray-500 hover:text-gray-800">Gerar outro</button>
        </div>
      ) : (
        <form onSubmit={gen} className="flex-1 flex flex-wrap gap-2">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="e-mail da pessoa no jogo"
            className="flex-1 min-w-[200px] border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          <button disabled={busy || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())}
            className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold disabled:opacity-40">{busy ? 'Gerando…' : 'Gerar código'}</button>
        </form>
      )}
    </div>
  )
}

function Players({ players }) {
  const [q, setQ] = useState('')
  const [onlyOpt, setOnlyOpt] = useState(false)
  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return players.filter(p => (!onlyOpt || p.marketing_ok) && (!s || [p.email, p.tutor_name, p.whatsapp, p.pet_name].some(v => String(v || '').toLowerCase().includes(s))))
  }, [players, q, onlyOpt])
  const exportCsv = () => {
    const rows = players.filter(p => p.marketing_ok && p.whatsapp)
    download(`mailing-minhacoisapet-${new Date().toISOString().slice(0, 10)}.csv`,
      csv([['Nome', 'WhatsApp', 'E-mail', 'Pet', 'Cadastro', 'Último acesso'], ...rows.map(p => [p.tutor_name, p.whatsapp, p.email, p.pet_name, fmtDate(p.created_at), fmtDate(p.last_seen_at)])]))
    toast.success(`${rows.length} contatos exportados (só quem autorizou)`)
  }
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
      <div className="p-4 flex items-center gap-3 flex-wrap border-b border-gray-100">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nome, e-mail, WhatsApp ou pet" className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm" />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={onlyOpt} onChange={e => setOnlyOpt(e.target.checked)} />Só quem aceita WhatsApp</label>
        <button onClick={exportCsv} className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold flex items-center gap-1.5"><Download className="w-4 h-4" />Exportar mailing (CSV)</button>
      </div>
      <p className="px-4 pt-3 text-xs text-gray-500">O mailing exporta só quem marcou "quero receber novidades pelo WhatsApp" (LGPD). Os demais aparecem aqui, mas não entram no arquivo.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-gray-500 text-xs uppercase tracking-wide">
            <th className="px-4 py-3">Tutor</th><th className="px-4 py-3">WhatsApp</th><th className="px-4 py-3">Pet</th><th className="px-4 py-3">Nível</th><th className="px-4 py-3">Ofensiva</th><th className="px-4 py-3">Cadastro</th><th className="px-4 py-3">Último acesso</th>
          </tr></thead>
          <tbody>
            {list.map(p => (
              <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2.5"><p className="font-semibold text-gray-900">{p.tutor_name || <span className="text-amber-600">cadastro incompleto</span>}</p><p className="text-xs text-gray-500">{p.email}</p></td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  {p.whatsapp ? <a href={`https://wa.me/${p.whatsapp}`} target="_blank" rel="noreferrer" className="text-gray-800 hover:text-emerald-700 inline-flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" />{fmtWhats(p.whatsapp)}</a> : '—'}
                  <p className={`text-[11px] font-semibold ${p.marketing_ok ? 'text-emerald-600' : 'text-gray-400'}`}>{p.marketing_ok ? '✓ aceita novidades' : 'não aceitou'}</p>
                </td>
                <td className="px-4 py-2.5">{p.pet_name || '—'}<p className="text-xs text-gray-500">{SPECIES[p.pet_species] || ''}</p></td>
                <td className="px-4 py-2.5 tabular-nums">{levelOf(p.xp)} <span className="text-xs text-gray-400">({p.xp} XP)</span></td>
                <td className="px-4 py-2.5 tabular-nums">🔥 {p.streak} <span className="text-xs text-gray-400">(máx. {p.best_streak})</span></td>
                <td className="px-4 py-2.5 whitespace-nowrap">{fmtDate(p.created_at)}</td>
                <td className="px-4 py-2.5 whitespace-nowrap">{ago(p.last_seen_at)}</td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Nenhum jogador encontrado.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Rewards({ data, reload }) {
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
        <h2 className="font-bold text-gray-900 mb-1">Metas com prêmio</h2>
        <p className="text-xs text-gray-500 mb-3">Prêmio por mérito, sem sorteio (Lei 5.768/71). Só aparecem no jogo as metas <b>ligadas</b>. Quem cumpre recebe um código único (PET-XXXX-XXXX) que mostra pra vocês.</p>
        <div className="flex flex-col gap-3">{data.goals.map(g => <GoalRow key={g.key} g={g} reload={reload} />)}</div>
      </div>
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
        <h2 className="font-bold text-gray-900 mb-3">Prêmios ganhos</h2>
        <div className="flex flex-col gap-2">
          {data.rewards.map(r => <RewardRow key={r.id} r={r} goal={data.goals.find(g => g.key === r.goal_key)} reload={reload} />)}
          {!data.rewards.length && <p className="text-sm text-gray-400 py-6 text-center">Ninguém ganhou prêmio ainda.</p>}
        </div>
      </div>
    </div>
  )
}

function GoalRow({ g, reload }) {
  const [reward, setReward] = useState(g.reward)
  const [busy, setBusy] = useState(false)
  const save = async active => {
    if (active && (!reward.trim() || reward.startsWith('Defina'))) { toast.error('Escreva o prêmio antes de ligar'); return }
    setBusy(true)
    const { error } = await supabase.rpc('game_admin_goal_save', { p_token: sessionToken(), p_key: g.key, p_reward: reward, p_active: active })
    setBusy(false)
    if (error) toast.error(error.message); else { toast.success(active ? 'Meta ligada no jogo' : 'Salvo'); reload() }
  }
  return (
    <div className={`rounded-xl border p-3 ${g.active ? 'border-emerald-300 bg-emerald-50/50' : 'border-gray-200'}`}>
      <div className="flex items-center justify-between gap-2">
        <div><p className="font-semibold text-gray-900 text-sm">{g.label}</p><p className="text-xs text-gray-500">{g.descr}</p></div>
        <button disabled={busy} onClick={() => save(!g.active)} className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap ${g.active ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700'}`}>{g.active ? '● Ligada' : 'Desligada'}</button>
      </div>
      <div className="flex gap-2 mt-2">
        <input value={reward} onChange={e => setReward(e.target.value)} placeholder="Ex.: Cupom de 10% na loja" className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 text-sm" />
        {reward !== g.reward && <button disabled={busy} onClick={() => save(g.active)} className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-bold">Salvar</button>}
      </div>
    </div>
  )
}

function RewardRow({ r, goal, reload }) {
  const toggle = async () => {
    const { error } = await supabase.rpc('game_admin_reward_use', { p_token: sessionToken(), p_id: r.id, p_used: !r.used_at })
    if (error) toast.error(error.message); else reload()
  }
  return (
    <div className="rounded-xl border border-gray-200 p-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900">{r.tutor_name} <span className="text-gray-400 font-normal">· {r.pet_name}</span></p>
        <p className="text-xs text-gray-500">{goal?.label || r.goal_key} → <b>{r.reward}</b> · {fmtDate(r.created_at)}</p>
        <p className="text-xs font-mono text-gray-700 mt-0.5">{r.code} · {fmtWhats(r.whatsapp)}</p>
      </div>
      <button onClick={toggle} className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap ${r.used_at ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>{r.used_at ? `✓ Entregue (${r.used_by})` : 'Marcar entregue'}</button>
    </div>
  )
}

function Codes({ codes, reload }) {
  const [items, setItems] = useState([])
  const [qty, setQty] = useState(10)
  const [note, setNote] = useState('')
  const [made, setMade] = useState(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const create = async () => {
    setBusy(true)
    const { data, error } = await supabase.rpc('game_admin_codes_create', { p_token: sessionToken(), p_items: items, p_qty: Number(qty), p_note: note })
    setBusy(false)
    if (error) { toast.error(error.message); return }
    setMade(data); toast.success(`${data.length} códigos gerados`); reload()
  }
  const copyAll = () => { navigator.clipboard.writeText(made.join('\n')); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  const used = codes.filter(c => c.used_at).length
  return (
    <div className="grid lg:grid-cols-[380px_1fr] gap-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 h-fit">
        <h2 className="font-bold text-gray-900 mb-1">Gerar códigos</h2>
        <p className="text-xs text-gray-500 mb-3">Cada código vale 1 vez e libera os itens escolhidos no jogo (vai no cartãozinho da embalagem).</p>
        <div className="grid grid-cols-2 gap-1.5 mb-3">
          {ITEMS.map(([k, l]) => (
            <label key={k} className={`text-xs px-2 py-1.5 rounded-lg border cursor-pointer ${items.includes(k) ? 'border-orange-400 bg-orange-50 font-semibold' : 'border-gray-200'}`}>
              <input type="checkbox" className="hidden" checked={items.includes(k)} onChange={e => setItems(s => e.target.checked ? [...s, k] : s.filter(x => x !== k))} />{l}
            </label>
          ))}
        </div>
        <div className="flex gap-2 mb-2">
          <input type="number" min={1} max={500} value={qty} onChange={e => setQty(e.target.value)} className="w-24 px-3 py-2 rounded-lg border border-gray-200 text-sm" />
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Observação (ex.: lote terrário out/26)" className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm" />
        </div>
        <button disabled={busy || !items.length} onClick={create} className="w-full py-2.5 rounded-lg bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-sm font-bold">{busy ? 'Gerando…' : 'Gerar códigos'}</button>
        {made && (
          <div className="mt-3 rounded-xl bg-gray-50 border border-gray-200 p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold">{made.length} códigos novos</p>
              <button onClick={copyAll} className="text-xs font-bold flex items-center gap-1 text-gray-700">{copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}{copied ? 'Copiado' : 'Copiar todos'}</button>
            </div>
            <pre className="text-xs font-mono max-h-48 overflow-y-auto">{made.join('\n')}</pre>
          </div>
        )}
      </div>
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="p-4 flex items-center justify-between border-b border-gray-100">
          <h2 className="font-bold text-gray-900">Últimos códigos</h2>
          <span className="text-xs text-gray-500">{used} usados de {codes.length}</span>
        </div>
        <div className="overflow-x-auto max-h-[560px]">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-500 text-xs uppercase tracking-wide"><th className="px-4 py-2">Código</th><th className="px-4 py-2">Itens</th><th className="px-4 py-2">Obs.</th><th className="px-4 py-2">Usado por</th></tr></thead>
            <tbody>
              {codes.map(c => (
                <tr key={c.code} className="border-t border-gray-100">
                  <td className="px-4 py-2 font-mono text-xs">{c.code}</td>
                  <td className="px-4 py-2 text-xs">{c.items.map(i => ITEM_LABEL[i] || i).join(', ')}</td>
                  <td className="px-4 py-2 text-xs text-gray-500">{c.note || '—'}</td>
                  <td className="px-4 py-2 text-xs">{c.used_at ? <span className="text-emerald-700">{c.used_by} · {fmtDate(c.used_at)}</span> : <span className="text-gray-400">livre</span>}</td>
                </tr>
              ))}
              {!codes.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">Nenhum código gerado ainda.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
