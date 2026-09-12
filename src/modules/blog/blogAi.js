import { supabase } from '../../lib/supabase'

// supabase-js só devolve "Edge Function returned a non-2xx status code"
// no `error` por padrão — a mensagem real que a função devolveu (ex:
// "Higgsfield: not_enough_credits") fica em `error.context`, precisa
// ler o body manualmente. Mesmo problema já resolvido em
// useMlInsights.js (callMlInsights) — replicado aqui pro blog-ai.
export async function callBlogAi(action, params = {}) {
  const { data, error } = await supabase.functions.invoke('blog-ai', { body: { action, ...params } })
  if (error) {
    let msg = error.message
    try {
      const parsed = await error.context?.json?.()
      if (parsed?.error) msg = parsed.error
    } catch { /* mantém a mensagem genérica mesmo */ }
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data
}
