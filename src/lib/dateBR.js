// "Hoje"/"este mês" calculados pelo horário de Brasília de VERDADE
// (America/Sao_Paulo via Intl), nunca pelo fuso do navegador/SO nem por
// `new Date().toISOString()` (que é sempre UTC) — o padrão antigo
// espalhado pelo código fazia "hoje" virar errado por ~3h todo fim de
// tarde/noite (21h-23h59 BRT já é "amanhã" em UTC). Achado 18/09 depois
// do Raphael notar horário estranho num log de webhook da Shopee.
// Formata qualquer Date (não só "agora") como YYYY-MM-DD no horário de
// Brasília — útil pra `subDays`/`addDays` e afins, que fazem aritmética
// em cima de um Date e depois formatavam com toISOString() (UTC).
export function toISODateBR(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(date)
}

export function todayISO() {
  return toISODateBR(new Date())
}

export function currentMonthISO() {
  return todayISO().slice(0, 7)
}

// % do dia já decorrido em Brasília (0-100), pra barra de progresso tipo
// "quanto falta do turno" — mesmo motivo acima, não dá pra tirar a hora
// direto de um toISOString() (viria em UTC).
export function dayProgressPercent(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  const get = type => Number(parts.find(p => p.type === type)?.value || 0)
  const totalSeconds = get('hour') * 3600 + get('minute') * 60 + get('second')
  return (totalSeconds / 86400) * 100
}
