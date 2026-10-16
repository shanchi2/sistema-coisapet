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

// Ambientes: a gaiola de ferro é o começo "ruim" — o pet se estressa mais
// e se diverte menos. Os terrários (vindos dos produtos reais) melhoram isso.
export const HABITATS = {
  gaiola: { label: 'Gaiola de ferro', funDecay: 1.6, cleanDecay: 1.3, comfort: 0.6 },
}

// Quanto cada necessidade cai por hora (antes dos multiplicadores)
// Calibrado pra quem entra 1–2x por dia: 1 dia fora = tristinho; 3 dias = doente
const DECAY = { fome: 2.6, sede: 3, limpeza: 1.8, energia: 6, diversao: 2.4 }
const SLEEP_RECOVER = 14 // energia/h dormindo

export const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v))

export function newPet({ name, species }) {
  const now = Date.now()
  return {
    v: 1,
    name, species,
    habitat: 'gaiola',
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

// Hamster é NOTURNO: de dia (7h–18h) ele tende a dormir
export function isDaytime(t) {
  const h = new Date(t).getHours()
  return h >= 7 && h < 18
}

// Avança a simulação `ms` milissegundos a partir de `pet.lastTick`.
// Faz em passos de até 10 min pra o sono/acordar acontecer no meio.
export function advance(pet, toTime = Date.now()) {
  const p = structuredClone(pet)
  let t = p.lastTick
  const end = Math.min(toTime, t + 14 * 86400000) // no máximo 14 dias de uma vez
  const hab = HABITATS[p.habitat] || HABITATS.gaiola
  while (t < end) {
    const step = Math.min(10 * 60000, end - t)
    const h = step / 3600000
    const n = p.needs
    n.fome = clamp(n.fome - DECAY.fome * h)
    n.sede = clamp(n.sede - DECAY.sede * h)
    n.limpeza = clamp(n.limpeza - DECAY.limpeza * hab.cleanDecay * h)
    n.diversao = clamp(n.diversao - DECAY.diversao * hab.funDecay * (p.asleep ? 0.3 : 1) * h)
    if (p.asleep) n.energia = clamp(n.energia + SLEEP_RECOVER * hab.comfort * h)
    else n.energia = clamp(n.energia - DECAY.energia * h)

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
  const hab = HABITATS[pet.habitat] || HABITATS.gaiola
  return clamp(avg * 0.8 + pet.health * 0.2 - (1 - hab.comfort) * 15)
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
export const poopCount = pet => Math.max(0, Math.floor((100 - pet.needs.limpeza) / 12))

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
  p.needs.limpeza = clamp(p.needs.limpeza + 12)
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
  const today = dayKey(Date.now())
  if (p.treatsToday.day !== today) p.treatsToday = { day: today, n: 0 }
  if (p.treatsToday.n >= 2) return { pet: p, msg: 'Chega de petisco por hoje!', tip: 'Petisco (como semente de girassol) é gordurosinho: no máximo 1 ou 2 por dia.' }
  if (p.asleep) return { pet: p, msg: `${p.name} está dormindo. Deixa pra depois 😴` }
  p.treatsToday.n++
  p.needs.diversao = clamp(p.needs.diversao + 15)
  p.needs.fome = clamp(p.needs.fome + 5)
  earn(p)
  return { pet: p, msg: 'Uma sementinha de girassol! 🌻', anim: 'eat' }
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
