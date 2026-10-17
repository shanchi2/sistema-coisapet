import { now as clockNow } from './clock'
// ─── Simulação do pet (regras puras, sem nada visual) ─────────────────
// Necessidades vão de 0 a 100 (100 = tudo ótimo) e caem com o tempo REAL,
// inclusive com o jogo fechado: ao abrir, calculamos quanto tempo passou.
// O pet nunca morre — no máximo fica triste e doente, e se recupera
// quando volta a ser bem cuidado.

export const NEEDS = ['fome', 'sede', 'limpeza', 'energia', 'diversao']

export const NEED_INFO = {
  fome:     { label: 'Barriguinha', icon: '🌾' },
  sede:     { label: 'Água',        icon: '💧' },
  limpeza:  { label: 'Limpeza',     icon: '🧹' },
  energia:  { label: 'Energia',     icon: '💤' },
  diversao: { label: 'Diversão',    icon: '🎾' },
}

export const SPECIES = {
  sirio: { label: 'Hamster sírio', coat: 'dourado' },
  anao:  { label: 'Hamster anão russo', coat: 'cinza' },
  panda: { label: 'Hamster sírio panda', coat: 'panda' },
}

// ─── Ambientes e itens (os produtos da CoisaPet) ─────────────────────
// A gaiola de ferro é o começo "ruim": o pet cansa mais rápido, se diverte
// menos e se suja mais. Cada produto real melhora a vida dele.
// Itens são DESBLOQUEIOS: comprou (qualquer tamanho/quantidade) → fica no
// inventário pra sempre; o tutor só escolhe se coloca ou guarda.
export const HABITATS = {
  gaiola:   { label: 'Gaiola de ferro' },
  terrario: { label: 'Terrário CoisaPet' },
}

export const CATALOG = {
  terrario: {
    label: 'Terrário CoisaPet', icon: '🏡', kind: 'habitat',
    desc: 'Muito mais espaço de chão, sem grades e com visão de tudo. Ele cansa e se entedia bem menos.',
    edu: 'Hamster precisa de espaço: quanto mais chão, melhor. Terrários evitam que ele roa grades e se machuque.',
  },
  substrato: {
    label: 'Substrato Aspen', icon: '🪵', kind: 'item', needs: 'terrario',
    desc: 'Camada funda pra cavar túneis. Segura o cheiro e a sujeira por mais tempo.',
    edu: 'Na natureza o hamster vive em tocas subterrâneas — substrato fundo (15–20 cm) deixa ele cavar à vontade.',
  },
  roda: {
    label: 'Roda Silenciosa 25 cm', icon: '🎡', kind: 'item',
    desc: 'Ele corre de madrugada: cada corrida dá muita diversão, mas cansa — depois ele precisa descansar.',
    edu: 'Hamster corre quilômetros por noite! A roda precisa ser grande pra ele correr com as costas retas.',
  },
  toca: {
    label: 'Toca de madeira', icon: '🛖', kind: 'item',
    desc: 'Um esconderijo pra dormir seguro: descansa mais rápido e fica menos estressado.',
    edu: 'Hamster é presa na natureza: sem esconderijo ele vive assustado. A toca dá segurança.',
  },
  bebedouro: {
    label: 'Bebedouro com suporte', icon: '🚰', kind: 'item',
    desc: 'Fica em pé no chão, com o bico na altura certa. Água limpa por mais tempo.',
    edu: 'Bebedouro de bico mantém a água limpa (sem sujeira do substrato) — e no suporte ele fica firme, sem furar o terrário.',
  },
}
export const CATALOG_KEYS = Object.keys(CATALOG)

// Multiplicadores do ambiente atual (gaiola × terrário + itens colocados)
export function habitatOf(pet) { return pet.placed?.terrario ? 'terrario' : 'gaiola' }
export function isPlaced(pet, key) {
  const it = CATALOG[key]
  if (!pet.placed?.[key]) return false
  return !it?.needs || !!pet.placed[it.needs]
}
export function mods(pet) {
  const m = habitatOf(pet) === 'terrario'
    ? { fun: 1.0, clean: 0.9, energy: 1.0, sleep: 1.0, thirst: 1.0, comfort: 0.85 }
    : { fun: 1.6, clean: 1.3, energy: 1.3, sleep: 0.75, thirst: 1.0, comfort: 0.6 }  // gaiola: cansa e entristece mais
  if (isPlaced(pet, 'substrato')) { m.clean *= 0.65; m.fun *= 0.9; m.comfort += 0.04 }
  // Roda: diverte (diversão cai mais devagar) mas CANSA (energia cai mais rápido)
  if (isPlaced(pet, 'roda'))      { m.fun *= 0.65; m.energy *= 1.15; m.comfort += 0.03 }
  if (isPlaced(pet, 'toca'))      { m.sleep *= 1.3; m.comfort += 0.05 }
  if (isPlaced(pet, 'bebedouro')) { m.thirst *= 0.85; m.comfort += 0.03 }
  m.comfort = Math.min(1, m.comfort)
  return m
}

// Saves antigos (0.1) não tinham inventário
export function migrate(p) {
  if (!p) return p
  if (!p.owned) p.owned = {}
  if (!p.placed) p.placed = {}
  if (!p.redeemed) p.redeemed = []
  return p
}

// Quanto cada necessidade cai por hora (antes dos multiplicadores)
// Calibrado pra quem entra 1–2x por dia: 1 dia fora = tristinho; 3 dias = doente
const DECAY = { fome: 2.6, sede: 3, limpeza: 2.6, energia: 6, diversao: 2.4 }
const SLEEP_RECOVER = 14 // energia/h dormindo

export const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v))

export function newPet({ name, species }) {
  const now = clockNow()
  return {
    v: 1,
    name, species,
    owned: {},    // itens desbloqueados (por compra real / código)
    placed: {},   // itens colocados no ambiente
    redeemed: [], // códigos já usados neste save
    born: now,
    lastTick: now,
    needs: { fome: 70, sede: 70, limpeza: 80, energia: 80, diversao: 50 },
    health: 100,
    asleep: false,
    seeds: 5, // moedinha do jogo (sementinhas)
    treatsToday: { day: dayKey(now), n: 0 },
    log: [],
  }
}

export function dayKey(t) {
  const d = new Date(t)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

// Hamster é NOTURNO. Dia/noite segue o RELÓGIO DO APARELHO (hora local de
// quem joga): das 7h às 19h é dia (ele tende a dormir); das 19h às 7h é noite.
export const DAY_START = 7, NIGHT_START = 19
export function isDaytime(t) {
  const h = new Date(t).getHours()
  return h >= DAY_START && h < NIGHT_START
}

// Avança a simulação `ms` milissegundos a partir de `pet.lastTick`.
// Faz em passos de até 10 min pra o sono/acordar acontecer no meio.
export function advance(pet, toTime = clockNow()) {
  const p = structuredClone(pet)
  let t = p.lastTick
  const end = Math.min(toTime, t + 14 * 86400000) // no máximo 14 dias de uma vez
  const m = mods(p)
  while (t < end) {
    const step = Math.min(10 * 60000, end - t)
    const h = step / 3600000
    const n = p.needs
    n.fome = clamp(n.fome - DECAY.fome * h)
    n.sede = clamp(n.sede - DECAY.sede * m.thirst * h)
    n.limpeza = clamp(n.limpeza - DECAY.limpeza * m.clean * h)
    n.diversao = clamp(n.diversao - DECAY.diversao * m.fun * (p.asleep ? 0.3 : 1) * h)
    if (p.asleep) n.energia = clamp(n.energia + SLEEP_RECOVER * m.sleep * h)
    else n.energia = clamp(n.energia - DECAY.energia * m.energy * h)

    // Dorme quando está cansado ou quando é dia e já descansou pouco;
    // acorda quando recuperou (à noite acorda mais fácil)
    const day = isDaytime(t)
    if (!p.asleep && (n.energia < 25 || (day && n.energia < 70))) p.asleep = true
    else if (p.asleep && (n.energia >= 95 || (!day && n.energia >= 60))) p.asleep = false

    // Saúde: cai se alguma necessidade está muito baixa, sobe se está tudo bem
    const low = NEEDS.filter(k => n[k] < 20).length
    if (low > 0) p.health = clamp(p.health - 0.9 * low * h, 5)
    else if (NEEDS.every(k => n[k] >= 45)) p.health = clamp(p.health + 6 * h)
    t += step
  }
  p.lastTick = toTime
  return p
}

// Humor geral (0–100) e um "estado" pra mostrar
export function mood(pet) {
  const n = pet.needs
  const avg = NEEDS.reduce((s, k) => s + n[k], 0) / NEEDS.length
  return clamp(avg * 0.8 + pet.health * 0.2 - (1 - mods(pet).comfort) * 25)
}

export function status(pet) {
  if (pet.health < 40) return { key: 'doente', label: 'Doentinho', emoji: '🤒', tone: 'rose' }
  const m = mood(pet)
  if (pet.asleep) return { key: 'dormindo', label: 'Dormindo', emoji: '😴', tone: 'indigo' }
  if (m >= 70) return { key: 'feliz', label: 'Feliz', emoji: '😊', tone: 'emerald' }
  if (m >= 45) return { key: 'ok', label: 'De boa', emoji: '🙂', tone: 'amber' }
  return { key: 'triste', label: 'Tristinho', emoji: '😢', tone: 'rose' }
}

// Quantas sujeirinhas aparecem no chão (derivado da limpeza)
// Uma sujeirinha a cada 7 pontos de limpeza (gaiola ~2 h, terrário ~3 h, terrário com Aspen ~4–5 h)
export const POOP_STEP = 7
export const poopCount = pet => Math.min(12, Math.max(0, Math.floor((100 - pet.needs.limpeza) / POOP_STEP)))

// ─── Ações do tutor ──────────────────────────────────────────────────
// Cada uma devolve { pet, msg, tip? } — `tip` é uma dica educativa.
function earn(p, n = 1) { p.seeds += n }

export function feed(pet) {
  const p = structuredClone(pet)
  if (p.needs.fome > 90) return { pet: p, msg: `${p.name} está de barriga cheia!`, tip: 'Comida demais engorda. Hamster precisa de ração própria todo dia, em quantidade certinha — não precisa encher o pote toda hora.' }
  p.needs.fome = clamp(p.needs.fome + 35)
  earn(p)
  return { pet: p, msg: 'Ração no potinho! 🌾', anim: 'eat' }
}

export function water(pet) {
  const p = structuredClone(pet)
  if (p.needs.sede > 95) return { pet: p, msg: 'O bebedouro já está cheio.' }
  p.needs.sede = 100
  earn(p)
  return { pet: p, msg: 'Água fresquinha! 💧', anim: 'drink', tip: p.needs.sede < 30 ? undefined : 'Troque a água todo dia, mesmo que ainda tenha no bebedouro — água parada estraga.' }
}

export function cleanOne(pet) {
  const p = structuredClone(pet)
  p.needs.limpeza = clamp(p.needs.limpeza + POOP_STEP)
  earn(p)
  return { pet: p }
}

export function cleanAll(pet) {
  const p = structuredClone(pet)
  if (p.needs.limpeza > 92) return { pet: p, msg: 'Já está limpinho!' }
  p.needs.limpeza = 100
  earn(p, 2)
  return { pet: p, msg: 'Tudo limpinho! ✨', tip: 'Limpe a sujeira todo dia, mas troque o substrato inteiro só de vez em quando: o cheiro do ninho dá segurança pro hamster.' }
}

export function pet_(pet) {
  const p = structuredClone(pet)
  if (p.asleep) {
    p.asleep = false
    p.needs.diversao = clamp(p.needs.diversao - 8)
    return { pet: p, msg: `Ops! ${p.name} acordou assustado.`, anim: 'scared', tip: 'Hamster é noturno: dorme de dia e brinca à noite. Evite acordar ele — isso estressa o bichinho.' }
  }
  p.needs.diversao = clamp(p.needs.diversao + 10)
  p.needs.energia = clamp(p.needs.energia - 2)
  earn(p)
  return { pet: p, msg: `${p.name} adorou o carinho! 💛`, anim: 'happy' }
}

export function treat(pet) {
  const p = structuredClone(pet)
  const today = dayKey(clockNow())
  if (p.treatsToday.day !== today) p.treatsToday = { day: today, n: 0 }
  if (p.treatsToday.n >= 2) return { pet: p, msg: 'Chega de petisco por hoje!', tip: 'Petisco (como semente de girassol) é gordurosinho: no máximo 1 ou 2 por dia.' }
  if (p.asleep) return { pet: p, msg: `${p.name} está dormindo. Deixa pra depois 😴` }
  p.treatsToday.n++
  p.needs.diversao = clamp(p.needs.diversao + 15)
  p.needs.fome = clamp(p.needs.fome + 5)
  earn(p)
  return { pet: p, msg: 'Uma sementinha de girassol! 🌻', anim: 'eat' }
}

// Uma corrida na roda (vem da cena quando ele sai da roda): diverte e cansa
export function wheelRun(pet, seconds) {
  const p = structuredClone(pet)
  const s = Math.max(0, Math.min(20, seconds))
  p.needs.diversao = clamp(p.needs.diversao + s * 0.6)
  p.needs.energia = clamp(p.needs.energia - s * 0.4)
  p.needs.sede = clamp(p.needs.sede - s * 0.15)
  return { pet: p }
}

// ─── Inventário ──────────────────────────────────────────────────────
export function togglePlace(pet, key) {
  const p = structuredClone(pet)
  const it = CATALOG[key]
  if (!p.owned[key]) return { pet: p, msg: 'Você ainda não tem esse item.' }
  if (it.needs && !p.placed[it.needs] && !p.placed[key]) {
    return { pet: p, msg: `Precisa do ${CATALOG[it.needs].label} primeiro.`, tip: it.edu }
  }
  p.placed[key] = !p.placed[key]
  // Guardou o terrário → o que depende dele volta pro inventário
  if (!p.placed[key]) for (const [k, i] of Object.entries(CATALOG)) if (i.needs === key) p.placed[k] = false
  if (p.placed[key]) {
    if (key === 'terrario') p.needs.diversao = clamp(p.needs.diversao + 20)
    return { pet: p, msg: key === 'terrario' ? `${p.name} ganhou um lar novo! 🏡` : `${it.label} colocado! ✨`, tip: it.edu, anim: 'happy' }
  }
  return { pet: p, msg: `${it.label} guardado.` }
}

// Códigos de resgate. Por enquanto (sem login) só existem CÓDIGOS DE TESTE;
// os reais (únicos, 1 uso, vindos do pedido) serão validados no servidor.
const TEST_CODES = {
  'TESTE-TERRARIO': ['terrario'], 'TESTE-ASPEN': ['substrato'], 'TESTE-RODA': ['roda'],
  'TESTE-TOCA': ['toca'], 'TESTE-BEBEDOURO': ['bebedouro'],
  'TESTE-TUDO': ['terrario', 'substrato', 'roda', 'toca', 'bebedouro'],
}
export function redeem(pet, raw) {
  const p = structuredClone(pet)
  const code = String(raw || '').trim().toUpperCase().replace(/\s+/g, '')
  const items = TEST_CODES[code]
  if (!items) return { pet: p, ok: false, msg: 'Código inválido. Confira e tente de novo.' }
  if (p.redeemed.includes(code)) return { pet: p, ok: false, msg: 'Esse código já foi usado.' }
  p.redeemed.push(code)
  const got = items.filter(k => !p.owned[k])
  items.forEach(k => { p.owned[k] = true })
  p.seeds += 10
  return { pet: p, ok: true, items: got, msg: got.length ? `Desbloqueado: ${got.map(k => CATALOG[k].label).join(', ')} 🎉` : 'Você já tinha esses itens — ganhou 10 sementinhas!' }
}

// ─── Dicas educativas (rodam no rodapé) ─────────────────────────────
export const TIPS = [
  'Gaiolas de grade pequenas estressam o hamster. Terrários amplos, com bastante espaço de chão, são muito melhores.',
  'Hamster adora cavar: um substrato fundo (uns 15–20 cm, como o Aspen) deixa ele fazer túneis como na natureza.',
  'A roda precisa ser grande o bastante pra ele correr com as costas retas — pra hamster sírio, 25 cm ou mais.',
  'Tocas e esconderijos dão segurança: hamster é presa na natureza e precisa de lugar pra se esconder.',
  'Hamster sírio é solitário: deixar dois juntos causa brigas sérias.',
  'Evite rodas e brinquedos de grade, onde as patinhas podem prender.',
  'Banho de água não! Hamster se limpa sozinho — no máximo um banho de areia própria.',
  'Os dentes do hamster nunca param de crescer: objetos de madeira pra roer ajudam a gastar.',
  'Mudanças de temperatura fazem mal: deixe o terrário longe de sol direto, ar-condicionado e correntes de vento.',
]
