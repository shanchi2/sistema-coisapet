import { Truck, PackageCheck, Factory, Megaphone, ArrowLeftRight, KanbanSquare, Wrench, ListChecks, Camera, Cake, Siren, CheckCircle2, Clock, AlertTriangle } from 'lucide-react'

// TV da Produção (07/10, fase100) — cada módulo tem uma versão GRANDE
// (destaque / slide) e uma MINI (coluna lateral do modo consultório).
// Os dados vêm prontos da Edge Function `tv-feed` — sem valor em R$.

const TZ = 'America/Sao_Paulo'
export const fmtHour = iso => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
const fmtDayMonth = iso => new Date(iso).toLocaleDateString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' })
const dayOf = iso => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(iso))
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const ddmm = md => `${md.slice(3, 5)}/${md.slice(0, 2)}`

// "Hoje às 18:00", "Amanhã às 14:00", "Sex 10/10 às 09:00"
export function whenLabel(iso, today) {
  const d = dayOf(iso)
  const h = fmtHour(iso)
  if (d === today) return `Hoje às ${h}`
  if (d === addDays(today, 1)) return `Amanhã às ${h}`
  const wd = new Date(iso).toLocaleDateString('pt-BR', { timeZone: TZ, weekday: 'short' }).replace('.', '')
  return `${wd} ${fmtDayMonth(iso)} às ${h}`
}
// "faltam 2h15" / "ATRASADA há 20 min"
export function countdown(iso, now) {
  const diff = Math.round((new Date(iso).getTime() - now) / 60000)
  const abs = Math.abs(diff)
  const txt = abs < 60 ? `${abs} min` : abs < 48 * 60 ? `${Math.floor(abs / 60)}h${String(abs % 60).padStart(2, '0')}` : `${Math.round(abs / 1440)} dias`
  return diff >= 0 ? `faltam ${txt}` : `passou há ${txt}`
}
const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`
const SOURCE = { ml: 'Mercado Livre', shopee: 'Shopee', manual: 'Manual' }

// ── Peças visuais ────────────────────────────────────────────────────
function BigFrame({ icon: Icon, title, tone = 'slate', right, children }) {
  const tones = { slate: 'text-slate-300', rose: 'text-rose-300', amber: 'text-amber-300', emerald: 'text-emerald-300', sky: 'text-sky-300', violet: 'text-violet-300' }
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between gap-4 mb-5">
        <h2 className={`flex items-center gap-3 text-[2.1rem] font-black uppercase tracking-wide ${tones[tone]}`}>
          <Icon className="w-10 h-10" strokeWidth={2.2} /> {title}
        </h2>
        {right}
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  )
}
function Bar({ value, total, color = 'bg-emerald-400' }) {
  const pct = total ? Math.min(100, Math.round((value / total) * 100)) : 0
  return (
    <div className="h-4 rounded-full bg-slate-800 overflow-hidden">
      <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${pct}%` }} />
    </div>
  )
}
function Empty({ children }) {
  return <div className="h-full flex flex-col items-center justify-center text-slate-500 text-3xl gap-4"><CheckCircle2 className="w-16 h-16 text-emerald-500/60" />{children}</div>
}
function Tile({ label, value, tone = 'text-slate-100', sub }) {
  return (
    <div className="rounded-2xl bg-slate-900 border border-slate-800 px-6 py-5">
      <p className="text-lg font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`text-[4.2rem] leading-none font-black mt-2 tabular-nums ${tone}`}>{value}</p>
      {sub && <p className="text-lg text-slate-400 mt-2">{sub}</p>}
    </div>
  )
}
function MiniFrame({ icon: Icon, title, tone = 'text-slate-400', children, alert }) {
  return (
    <div className={`rounded-2xl border px-5 py-4 flex flex-col gap-1.5 min-h-0 ${alert ? 'bg-rose-950/60 border-rose-700' : 'bg-slate-900 border-slate-800'}`}>
      <p className={`flex items-center gap-2 text-base font-bold uppercase tracking-wide ${tone}`}><Icon className="w-5 h-5" />{title}</p>
      {children}
    </div>
  )
}
const MiniBig = ({ children, tone = 'text-slate-100' }) => <p className={`text-[2.6rem] leading-none font-black tabular-nums ${tone}`}>{children}</p>
const MiniTxt = ({ children, className = '' }) => <p className={`text-lg text-slate-300 leading-snug line-clamp-2 ${className}`}>{children}</p>

// ── Módulos ──────────────────────────────────────────────────────────
// key, label/desc (tela de config), has(data) = tem algo pra mostrar,
// Big / Mini = componentes. `alertas` é a faixa vermelha do topo.
export const TV_MODULES = [
  {
    key: 'alertas', label: 'Alertas críticos (faixa no topo)', icon: Siren, stripOnly: true,
    desc: 'Coleta do Full chegando, pedidos atrasados, cancelados depois de separados, revisão de máquina atrasada e avisos urgentes.',
  },
  {
    key: 'coleta_full', label: 'Coleta do Full', icon: Truck,
    desc: 'Data, hora e contagem regressiva da próxima coleta/entrega do Full, com a lista do que vai no lote.',
    has: d => d.coleta_full?.list?.length > 0,
    Big: ({ d, today, now }) => {
      const c = d.coleta_full.list[0]
      const isToday = dayOf(c.at) <= today
      const items = c.items || []
      const stale = c.source === 'ml' && c.synced_at && now - new Date(c.synced_at).getTime() > 24 * 3600e3
      return (
        <BigFrame icon={Truck} title={c.type === 'pickup' || c.source === 'manual' ? 'Coleta do Full' : 'Entrega no Full'} tone={isToday ? 'rose' : 'amber'}
          right={d.coleta_full.list.length > 1 && <span className="text-xl text-slate-400">+{d.coleta_full.list.length - 1} agendada{d.coleta_full.list.length > 2 ? 's' : ''}</span>}>
          <div className="h-full flex flex-col gap-5">
            <div className={`rounded-3xl px-8 py-6 flex items-end justify-between gap-6 ${isToday ? 'bg-rose-600 text-white tv-pulse' : 'bg-amber-400 text-amber-950'}`}>
              <div>
                <p className="text-[4.6rem] leading-none font-black">{whenLabel(c.at, today)}</p>
                <p className="text-2xl font-bold mt-3 opacity-90">
                  {c.source === 'manual' ? (c.title || 'Coleta lançada pela diretoria') : `Envio #${c.id}${c.center ? ` · ${c.center}` : ''}${c.units ? ` · ${c.units} unidades` : ''}`}
                </p>
              </div>
              <p className="text-[3rem] leading-none font-black tabular-nums whitespace-nowrap">{countdown(c.at, now)}</p>
            </div>
            {stale && <p className="text-xl text-amber-300 flex items-center gap-2"><AlertTriangle className="w-6 h-6" />Dados do ML de {fmtDayMonth(c.synced_at)} — confira no painel do ML</p>}
            {c.body && <p className="text-2xl text-slate-200">{c.body}</p>}
            {items.length > 0 && (
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 overflow-hidden content-start">
                {items.slice(0, 14).map((i, k) => (
                  <div key={k} className="flex items-center justify-between gap-3 border-b border-slate-800 py-1.5">
                    <p className="text-xl text-slate-200 truncate">{i.title}{i.variation ? <span className="text-slate-400"> · {i.variation}</span> : ''}</p>
                    <p className="text-2xl font-black tabular-nums text-white shrink-0">{i.qty}</p>
                  </div>
                ))}
                {items.length > 14 && <p className="text-xl text-slate-400 py-1.5">+ {items.length - 14} produtos (veja no sistema)</p>}
              </div>
            )}
          </div>
        </BigFrame>
      )
    },
    Mini: ({ d, today, now }) => {
      const c = d.coleta_full?.list?.[0]
      if (!c) return <MiniFrame icon={Truck} title="Coleta do Full"><MiniTxt className="text-slate-400">Nenhuma nos próximos {d.coleta_full?.warn_days ?? 2} dias</MiniTxt></MiniFrame>
      const isToday = dayOf(c.at) <= today
      return (
        <MiniFrame icon={Truck} title="Coleta do Full" tone={isToday ? 'text-rose-300' : 'text-amber-300'} alert={isToday}>
          <MiniBig tone={isToday ? 'text-white' : 'text-amber-300'}>{whenLabel(c.at, today)}</MiniBig>
          <MiniTxt>{countdown(c.at, now)}{c.units ? ` · ${c.units} un.` : ''}</MiniTxt>
        </MiniFrame>
      )
    },
  },
  {
    key: 'despacho', label: 'Expedição do dia', icon: PackageCheck,
    desc: 'Pedidos a despachar hoje (separados × total) por plataforma, próximo prazo e atrasados.',
    has: d => d.despacho && (d.despacho.total > 0 || d.despacho.overdue > 0),
    Big: ({ d }) => {
      const x = d.despacho
      const left = x.total - x.done
      return (
        <BigFrame icon={PackageCheck} title="Expedição de hoje" tone="sky"
          right={x.next_deadline && left > 0 && <span className="text-2xl text-slate-300 flex items-center gap-2"><Clock className="w-7 h-7" />Prazo: até {fmtHour(x.next_deadline)}</span>}>
          <div className="h-full flex flex-col gap-6">
            <div className="grid grid-cols-3 gap-5">
              <Tile label="Separados" value={x.done} tone="text-emerald-400" />
              <Tile label="Faltam" value={left} tone={left ? 'text-amber-300' : 'text-emerald-400'} />
              <Tile label="Atrasados" value={x.overdue} tone={x.overdue ? 'text-rose-400' : 'text-slate-500'} sub={x.overdue ? Object.entries(x.overdue_by_source || {}).map(([s, n]) => `${SOURCE[s] || s}: ${n}`).join(' · ') : 'de dias anteriores'} />
            </div>
            <div className="flex flex-col gap-5">
              {Object.entries(x.by_source || {}).map(([s, v]) => (
                <div key={s}>
                  <div className="flex items-baseline justify-between mb-2">
                    <p className="text-3xl font-bold text-slate-100">{SOURCE[s] || s}</p>
                    <p className="text-3xl font-black tabular-nums text-slate-100">{v.done}<span className="text-slate-500"> / {v.total}</span></p>
                  </div>
                  <Bar value={v.done} total={v.total} color={v.done === v.total ? 'bg-emerald-400' : 'bg-sky-400'} />
                </div>
              ))}
            </div>
          </div>
        </BigFrame>
      )
    },
    Mini: ({ d }) => {
      const x = d.despacho || { total: 0, done: 0, overdue: 0 }
      return (
        <MiniFrame icon={PackageCheck} title="Expedição" tone="text-sky-300" alert={x.overdue > 0}>
          <MiniBig>{x.done}<span className="text-slate-500 text-[1.8rem]"> / {x.total} separados</span></MiniBig>
          <MiniTxt>{x.overdue ? <span className="text-rose-300 font-bold">{plural(x.overdue, 'atrasado', 'atrasados')}</span> : 'Nenhum atrasado'}{x.next_deadline && x.total > x.done ? ` · até ${fmtHour(x.next_deadline)}` : ''}</MiniTxt>
        </MiniFrame>
      )
    },
  },
  {
    key: 'producao', label: 'Produção do dia', icon: Factory,
    desc: 'Quantidades da esteira de hoje (a produzir, em produção, prontas, enviadas), o que os horistas produziram e o que mais falta.',
    has: d => d.producao && (d.producao.total > 0 || d.producao.produced_today > 0),
    Big: ({ d }) => {
      const p = d.producao
      return (
        <BigFrame icon={Factory} title="Produção de hoje" tone="violet">
          <div className="h-full flex flex-col gap-6">
            <div className="grid grid-cols-4 gap-5">
              <Tile label="A produzir" value={p.pendente} tone={p.pendente ? 'text-amber-300' : 'text-slate-500'} />
              <Tile label="Em produção" value={p.em_producao} tone="text-sky-300" />
              <Tile label="Prontos" value={p.pronto + p.enviado} tone="text-emerald-400" />
              <Tile label="Horistas" value={p.produced_today} tone="text-violet-300" sub="unidades lançadas hoje" />
            </div>
            {p.top_pending?.length > 0 && (
              <div>
                <p className="text-2xl font-bold text-slate-400 uppercase mb-3">O que mais falta produzir</p>
                <div className="flex flex-col gap-2">
                  {p.top_pending.map((t, k) => (
                    <div key={k} className="flex items-center justify-between gap-4 border-b border-slate-800 py-2">
                      <p className="text-2xl text-slate-100 truncate">{t.name}</p>
                      <p className="text-3xl font-black tabular-nums text-amber-300 shrink-0">{t.qty}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </BigFrame>
      )
    },
    Mini: ({ d }) => {
      const p = d.producao || { pendente: 0, total: 0, produced_today: 0 }
      return (
        <MiniFrame icon={Factory} title="Produção" tone="text-violet-300">
          <MiniBig tone={p.pendente ? 'text-amber-300' : 'text-emerald-400'}>{p.pendente}<span className="text-slate-500 text-[1.8rem]"> a produzir</span></MiniBig>
          <MiniTxt>{p.total ? `${p.total} na esteira hoje` : 'Esteira vazia'} · horistas: {p.produced_today}</MiniTxt>
        </MiniFrame>
      )
    },
  },
  {
    key: 'avisos', label: 'Avisos da diretoria', icon: Megaphone,
    desc: 'Avisos lançados aqui pra TV e os avisos do RH marcados "mostrar na TV".',
    has: d => d.avisos?.length > 0,
    Big: ({ d, tick }) => {
      const a = d.avisos[tick % d.avisos.length]
      const tone = a.level === 'critico' ? 'rose' : a.level === 'atencao' ? 'amber' : 'emerald'
      return (
        <BigFrame icon={Megaphone} title="Aviso da diretoria" tone={tone} right={d.avisos.length > 1 && <span className="text-xl text-slate-400">{(tick % d.avisos.length) + 1} de {d.avisos.length}</span>}>
          <div className={`h-full rounded-3xl px-10 py-8 flex flex-col justify-center gap-6 ${a.level === 'critico' ? 'bg-rose-950/70 border-2 border-rose-600' : a.level === 'atencao' ? 'bg-amber-950/40 border-2 border-amber-500/60' : 'bg-slate-900 border border-slate-800'}`}>
            <p className="text-[4rem] leading-tight font-black text-white">{a.title}</p>
            {a.body && <p className="text-[2.2rem] leading-snug text-slate-200 whitespace-pre-line line-clamp-6">{a.body}</p>}
            {a.by && <p className="text-xl text-slate-400">— {a.by}</p>}
          </div>
        </BigFrame>
      )
    },
    Mini: ({ d }) => {
      const list = d.avisos || []
      return (
        <MiniFrame icon={Megaphone} title="Avisos" tone="text-emerald-300" alert={list.some(a => a.level === 'critico')}>
          {list.length ? <><MiniBig>{list.length}</MiniBig><MiniTxt>{list[0].title}</MiniTxt></> : <MiniTxt className="text-slate-400">Nenhum aviso no momento</MiniTxt>}
        </MiniFrame>
      )
    },
  },
  {
    key: 'passagem_turno', label: 'Passagem de turno', icon: ArrowLeftRight,
    desc: 'O último recado deixado pelo turno anterior, com os itens pendentes e urgentes.',
    has: d => !!d.passagem_turno && (d.passagem_turno.items?.length > 0 || !!d.passagem_turno.notes),
    Big: ({ d }) => {
      const p = d.passagem_turno
      return (
        <BigFrame icon={ArrowLeftRight} title={`Passagem de turno · ${p.turno} → ${p.destino}`} tone="amber" right={<span className="text-xl text-slate-400">{fmtDayMonth(p.date + 'T12:00:00Z')}</span>}>
          <div className="flex flex-col gap-3">
            {p.items.map((i, k) => (
              <div key={k} className={`flex items-start gap-4 rounded-2xl px-6 py-4 ${i.done ? 'bg-slate-900/50' : i.urgent ? 'bg-rose-950/70 border-2 border-rose-600' : 'bg-slate-900 border border-slate-800'}`}>
                <span className={`mt-1 w-8 h-8 rounded-lg border-2 shrink-0 flex items-center justify-center ${i.done ? 'border-emerald-500 bg-emerald-500' : 'border-slate-500'}`}>{i.done && <CheckCircle2 className="w-6 h-6 text-white" />}</span>
                <p className={`text-[2rem] leading-snug ${i.done ? 'text-slate-500 line-through' : 'text-slate-100'}`}>{i.urgent && !i.done && <b className="text-rose-300">URGENTE · </b>}{i.text}</p>
              </div>
            ))}
            {p.notes && <p className="text-2xl text-slate-300 mt-2 whitespace-pre-line">{p.notes}</p>}
          </div>
        </BigFrame>
      )
    },
    Mini: ({ d }) => {
      const p = d.passagem_turno
      const pend = p?.items?.filter(i => !i.done) || []
      return (
        <MiniFrame icon={ArrowLeftRight} title="Passagem de turno" tone="text-amber-300" alert={pend.some(i => i.urgent)}>
          {p ? <><MiniBig tone={pend.length ? 'text-amber-300' : 'text-emerald-400'}>{pend.length}<span className="text-slate-500 text-[1.8rem]"> pendente{pend.length === 1 ? '' : 's'}</span></MiniBig><MiniTxt>{pend[0]?.text || `${p.turno} → ${p.destino}, tudo feito`}</MiniTxt></> : <MiniTxt className="text-slate-400">Sem recado</MiniTxt>}
        </MiniFrame>
      )
    },
  },
  {
    key: 'kanban', label: 'Tarefas do Kanban (produção)', icon: KanbanSquare,
    desc: 'Tarefas do Kanban Operacional dos setores Produção e Geral atrasadas, de hoje e de amanhã.',
    has: d => kanbanProd(d).length > 0,
    Big: ({ d }) => {
      const list = kanbanProd(d)
      const W = { atrasada: ['ATRASADA', 'bg-rose-600 text-white'], hoje: ['HOJE', 'bg-amber-400 text-amber-950'], amanha: ['AMANHÃ', 'bg-slate-700 text-slate-100'] }
      return (
        <BigFrame icon={KanbanSquare} title="Tarefas da produção" tone="sky" right={<span className="text-xl text-slate-400">{plural(list.length, 'tarefa', 'tarefas')}</span>}>
          <div className="flex flex-col gap-3">
            {list.slice(0, 8).map((t, k) => (
              <div key={k} className="flex items-center gap-5 rounded-2xl bg-slate-900 border border-slate-800 px-6 py-4">
                <span className={`text-lg font-black px-3 py-1 rounded-lg shrink-0 ${W[t.when][1]}`}>{W[t.when][0]}</span>
                <p className="text-[1.9rem] text-slate-100 truncate flex-1">{t.title}</p>
                {['urgente', 'alta'].includes(t.priority) && <span className="text-lg font-bold text-rose-300 uppercase shrink-0">{t.priority}</span>}
              </div>
            ))}
            {list.length > 8 && <p className="text-xl text-slate-400">+ {list.length - 8} tarefas</p>}
          </div>
        </BigFrame>
      )
    },
    Mini: ({ d }) => {
      const list = kanbanProd(d)
      const late = list.filter(t => t.when === 'atrasada').length
      return (
        <MiniFrame icon={KanbanSquare} title="Kanban produção" tone="text-sky-300">
          <MiniBig tone={late ? 'text-rose-300' : 'text-slate-100'}>{list.length}<span className="text-slate-500 text-[1.8rem]"> tarefa{list.length === 1 ? '' : 's'}</span></MiniBig>
          <MiniTxt>{late ? `${plural(late, 'atrasada', 'atrasadas')}` : list.length ? 'Nenhuma atrasada' : 'Nada pra hoje'}</MiniTxt>
        </MiniFrame>
      )
    },
  },
  {
    key: 'manutencao', label: 'Manutenção', icon: Wrench,
    desc: 'Revisão de máquina atrasada ou vencendo em 7 dias e serviços do barracão em aberto (urgentes primeiro).',
    has: d => (d.manutencao?.machines?.length || 0) + (d.manutencao?.services?.length || 0) > 0,
    Big: ({ d }) => {
      const m = d.manutencao
      const services = [...m.services].sort((a, b) => b.urgent - a.urgent)
      return (
        <BigFrame icon={Wrench} title="Manutenção" tone="amber">
          <div className="flex flex-col gap-3">
            {m.machines.map((x, k) => (
              <div key={'m' + k} className={`flex items-center justify-between gap-4 rounded-2xl px-6 py-4 ${x.late ? 'bg-rose-950/70 border-2 border-rose-600' : 'bg-amber-950/40 border border-amber-600/60'}`}>
                <p className="text-[2rem] font-bold text-white">{x.name}</p>
                <p className={`text-2xl font-bold ${x.late ? 'text-rose-300' : 'text-amber-300'}`}>{x.late ? 'Revisão atrasada' : 'Revisão'} · {fmtDayMonth(x.next + 'T12:00:00Z')}</p>
              </div>
            ))}
            {services.slice(0, 8 - m.machines.length).map((s, k) => (
              <div key={'s' + k} className="flex items-center gap-4 rounded-2xl bg-slate-900 border border-slate-800 px-6 py-3.5">
                {s.urgent && <span className="text-lg font-black px-3 py-1 rounded-lg bg-rose-600 text-white shrink-0">PRIORIDADE</span>}
                <p className="text-[1.8rem] text-slate-100 truncate">{s.title.replace(/;\s*$/, '')}</p>
              </div>
            ))}
            {services.length > 8 - m.machines.length && <p className="text-xl text-slate-400">+ {services.length - (8 - m.machines.length)} serviços em aberto</p>}
          </div>
        </BigFrame>
      )
    },
    Mini: ({ d }) => {
      const m = d.manutencao || { machines: [], services: [] }
      const late = m.machines.filter(x => x.late)
      const urgent = m.services.filter(s => s.urgent).length
      return (
        <MiniFrame icon={Wrench} title="Manutenção" tone="text-amber-300" alert={late.length > 0}>
          <MiniBig tone={urgent ? 'text-amber-300' : 'text-slate-100'}>{m.services.length}<span className="text-slate-500 text-[1.8rem]"> serviço{m.services.length === 1 ? '' : 's'}</span></MiniBig>
          <MiniTxt>{late.length ? <span className="text-rose-300 font-bold">Revisão atrasada: {late.map(x => x.name).join(', ')}</span> : urgent ? `${urgent} com prioridade` : 'Máquinas em dia'}</MiniTxt>
        </MiniFrame>
      )
    },
  },
  {
    key: 'checklist', label: 'Checklist do atendimento', icon: ListChecks,
    desc: 'Quanto do checklist diário cada pessoa do atendimento já marcou hoje.',
    has: d => d.checklist?.people?.length > 0 && d.checklist.total > 0,
    Big: ({ d }) => (
      <BigFrame icon={ListChecks} title="Checklist do atendimento" tone="emerald">
        <div className="flex flex-col gap-7">
          {d.checklist.people.map((p, k) => (
            <div key={k}>
              <div className="flex items-baseline justify-between mb-2">
                <p className="text-3xl font-bold text-slate-100">{p.name}</p>
                <p className="text-3xl font-black tabular-nums">{p.done}<span className="text-slate-500"> / {d.checklist.total}</span></p>
              </div>
              <Bar value={p.done} total={d.checklist.total} color={p.done >= d.checklist.total ? 'bg-emerald-400' : 'bg-amber-400'} />
            </div>
          ))}
        </div>
      </BigFrame>
    ),
    Mini: ({ d }) => {
      const c = d.checklist || { people: [], total: 0 }
      const done = c.people.reduce((t, p) => t + p.done, 0), total = c.people.length * c.total
      return (
        <MiniFrame icon={ListChecks} title="Checklist" tone="text-emerald-300">
          <MiniBig tone={total && done >= total ? 'text-emerald-400' : 'text-slate-100'}>{total ? Math.round((done / total) * 100) : 0}%</MiniBig>
          <MiniTxt>{c.people.map(p => `${p.name} ${p.done}/${c.total}`).join(' · ') || '—'}</MiniTxt>
        </MiniFrame>
      )
    },
  },
  {
    key: 'midia', label: 'Observações de produto', icon: Camera,
    desc: 'Problemas de produto/projeto relatados pelo atendimento (Atualização de Mídia) ainda em aberto.',
    has: d => d.midia?.open > 0,
    Big: ({ d }) => (
      <BigFrame icon={Camera} title="Observações de produto em aberto" tone="amber" right={<span className="text-xl text-slate-400">{d.midia.open} em aberto</span>}>
        <div className="flex flex-col gap-3">
          {d.midia.latest.map((n, k) => (
            <div key={k} className="rounded-2xl bg-slate-900 border border-amber-600/40 px-6 py-4">
              <p className="text-2xl font-bold text-amber-200 truncate">{n.product}</p>
              <p className="text-[1.8rem] text-slate-100 leading-snug line-clamp-2 mt-1">{n.body}</p>
              <p className="text-lg text-slate-500 mt-1">{n.by?.split(' ')[0]} · {fmtDayMonth(n.at)}</p>
            </div>
          ))}
        </div>
      </BigFrame>
    ),
    Mini: ({ d }) => (
      <MiniFrame icon={Camera} title="Observações de produto" tone="text-amber-300">
        <MiniBig tone={d.midia?.open ? 'text-amber-300' : 'text-emerald-400'}>{d.midia?.open || 0}<span className="text-slate-500 text-[1.8rem]"> em aberto</span></MiniBig>
        <MiniTxt>{d.midia?.latest?.[0]?.product || 'Nada pendente'}</MiniTxt>
      </MiniFrame>
    ),
  },
  {
    key: 'aniversariantes', label: 'Aniversariantes', icon: Cake,
    desc: 'Quem faz aniversário hoje e nos próximos 7 dias.',
    has: d => d.aniversariantes?.length > 0,
    Big: ({ d }) => (
      <BigFrame icon={Cake} title="Aniversariantes" tone="violet">
        <div className="h-full flex flex-col justify-center gap-5">
          {d.aniversariantes.map((a, k) => (
            <div key={k} className={`flex items-center justify-between rounded-3xl px-8 py-6 ${a.today ? 'bg-violet-600 text-white' : 'bg-slate-900 border border-slate-800'}`}>
              <p className="text-[3rem] font-black">{a.today ? '🎉 ' : ''}{a.name.split(' ').slice(0, 2).join(' ')}</p>
              <p className="text-[2.4rem] font-bold">{a.today ? 'HOJE!' : ddmm(a.day)}</p>
            </div>
          ))}
        </div>
      </BigFrame>
    ),
    Mini: ({ d }) => {
      const list = d.aniversariantes || []
      const t = list.find(a => a.today)
      return (
        <MiniFrame icon={Cake} title="Aniversariantes" tone="text-violet-300">
          {list.length ? <><MiniBig tone={t ? 'text-violet-300' : 'text-slate-100'}>{t ? `🎉 ${t.name.split(' ')[0]}` : list[0].name.split(' ')[0]}</MiniBig><MiniTxt>{t ? 'Hoje!' : ddmm(list[0].day)}{list.length > 1 ? ` · +${list.length - 1}` : ''}</MiniTxt></> : <MiniTxt className="text-slate-400">Ninguém esta semana</MiniTxt>}
        </MiniFrame>
      )
    },
  },
]

// Kanban na TV da produção: só setores Produção e Geral
function kanbanProd(d) {
  return (d.kanban || []).filter(t => ['producao', 'geral', null, undefined].includes(t.sector))
}

export const TV_MODULE_KEYS = TV_MODULES.map(m => m.key)
export const moduleByKey = Object.fromEntries(TV_MODULES.map(m => [m.key, m]))

// Junta a config salva com a lista atual (módulo novo entra ligado, no fim)
export function normalizeModules(saved) {
  const list = Array.isArray(saved) ? saved.filter(m => moduleByKey[m.key]) : []
  const seen = new Set(list.map(m => m.key))
  return [...list, ...TV_MODULE_KEYS.filter(k => !seen.has(k)).map(key => ({ key, enabled: true }))]
}
