import { supabase } from './supabase'
import toast from 'react-hot-toast'

// Frases reais que a OpenAI devolve quando acaba o crédito ou bate no
// limite de gastos configurado na conta (achado real, 18/09, testando
// o manual-ai: "organization_spend_limit_exceeded"). Cobre os formatos
// mais comuns pra não deixar passar batido como erro genérico.
const QUOTA_PATTERNS = [
  /insufficient_quota/i,
  /spend limit/i,
  /exceeded your current quota/i,
  /organization_spend_limit_exceeded/i,
  /billing/i,
]

function isQuotaError(msg) {
  return QUOTA_PATTERNS.some(re => re.test(msg || ''))
}

// Chama uma edge function de IA (blog-ai, manual-ai, ...) já com a
// extração correta do erro real — o supabase-js só devolve "Edge
// Function returned a non-2xx status code" por padrão no `error`
// quando a function responde status != 2xx; a mensagem de verdade que
// a nossa própria function mandou fica em `error.context` (precisa ler
// o body manualmente, mesmo problema já resolvido antes em
// useMlInsights.js/blogAi.js — agora compartilhado aqui). Sempre que o
// erro bater com "sem crédito/limite de gasto da OpenAI", dispara um
// toast de alerta bem visível — antes esse tipo de falha só aparecia
// como "erro ao gerar" genérico, fácil de confundir com bug.
export async function callAiFunction(fnName, action, params = {}) {
  const { data, error } = await supabase.functions.invoke(fnName, { body: { action, ...params } })
  if (error) {
    let msg = error.message
    try {
      const parsed = await error.context?.json?.()
      if (parsed?.error) msg = parsed.error
    } catch { /* mantém a mensagem genérica mesmo */ }
    if (isQuotaError(msg)) warnQuota()
    throw new Error(msg)
  }
  if (data?.error) {
    if (isQuotaError(data.error)) warnQuota()
    throw new Error(data.error)
  }
  return data
}

function warnQuota() {
  toast.error('⚠️ Créditos da OpenAI acabaram (ou bateu no limite de gastos da conta) — acesse platform.openai.com/settings/organization/limits pra liberar.', { duration: 9000 })
}
