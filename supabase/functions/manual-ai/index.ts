// Chamada sob demanda pelo frontend (Gerador de Manual, aba Links) —
// recebe o nome do produto + um texto bruto (o que o Raphael/equipe
// escrever sobre o produto) e devolve o conteúdo já organizado nos
// blocos do padrão editorial fixo (hero, sobre, benefícios,
// compatibilidade, como usar, quantidade, cuidados) — mesmo layout do
// manual de referência "Aspen Normal" que o Raphael aprovou como
// padrão. O HTML final é montado no front (manualTemplate.js) a
// partir desse JSON — aqui só estrutura o CONTEÚDO.
// Mesmo padrão de blog-ai: OPENAI_API_KEY, gpt-4o-mini,
// response_format json_object. Deploy COM verificação de JWT.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function callOpenAI(systemPrompt: string, userPrompt: string) {
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) throw new Error('Chave da OpenAI não configurada (OPENAI_API_KEY).')

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature: 0.5,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  })
  if (!res.ok) throw new Error(`Erro na API da OpenAI: ${res.status} ${await res.text()}`)
  const data = await res.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('Resposta vazia da OpenAI.')
  return JSON.parse(content)
}

const SYSTEM_PROMPT = `Você é o redator técnico da CoisaPet, fabricante de terrários, gaiolas e acessórios pra pets pequenos (roedores, répteis, aves). Sua tarefa: pegar um texto bruto (às vezes desorganizado, incompleto ou em tópicos soltos) escrito pela equipe sobre um produto, e organizar num guia de uso estruturado, pronto pra virar um manual visual em blocos.

Regras de conteúdo:
- Português do Brasil, tom caloroso mas técnico e confiável — nunca genérico, nunca "enchendo linguiça".
- Use APENAS informação que está no texto bruto fornecido, ou inferência óbvia e segura a partir dele (nunca invente característica técnica, medida ou indicação de uso que não veio do texto e não é de conhecimento geral básico do item).
- Bem-estar animal em primeiro lugar — nunca sugira uso que possa machucar ou estressar o animal.
- Cada seção é OPCIONAL — se o texto bruto não trouxer informação suficiente pra preencher uma seção de forma honesta, devolva null nela em vez de inventar. Não force todas as seções a existirem.

Formato de saída — SOMENTE JSON, exatamente este formato:
{
  "tagline": "categoria curta do produto (2-3 palavras, ex: 'Substrato', 'Casinha para Roedores')",
  "hero_intro": "1-2 frases de abertura, resumindo o que é o produto",
  "tags": ["até 3 palavras/expressões curtas de destaque, ex: 'Baixo pó', 'Fácil montagem'"],
  "about_title": "título curto pra seção 'O que é' (ex: nome técnico/material)",
  "about_text": "1 parágrafo explicando o que é o produto/material",
  "benefits": [ { "title": "...", "desc": "1 frase" } ] (2 a 4 itens, ou null se não houver base no texto),
  "compatibility": [ { "animal": "nome da espécie/porte", "note": "uso recomendado, curto" } ] (lista de pra quem é indicado, ou null),
  "alert": { "title": "...", "text": "aviso importante" } ou null (só se houver uma ressalva/exceção real no texto, ex: não indicado pra tal animal),
  "usage_steps": [ { "title": "...", "desc": "1 frase" } ] (2 a 4 passos de como usar, ou null),
  "amount_formula": { "label": "pergunta curta tipo 'Quanto usar?'", "formula": "fórmula/regra prática se aplicável (ex: dimensões do habitat)", "note": "explicação curta" } ou null — SÓ preencha se o produto for do tipo consumível/a granel onde faz sentido calcular quantidade (substrato, ração etc.), nunca force isso pra produto de peça única,
  "care": {
    "storage": ["dicas de armazenamento, cada item curto"] ou null,
    "maintenance": ["dicas de manutenção no dia a dia"] ou null,
    "discard": ["sinais de quando trocar/descartar"] ou null
  } ou null se nada disso se aplicar
}`

async function generateSections(productName: string, rawText: string) {
  const userPrompt = `Produto: ${productName}\n\nTexto bruto fornecido pela equipe:\n${rawText}`
  return await callOpenAI(SYSTEM_PROMPT, userPrompt)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: any = {}
  try { body = await req.json() } catch { /* ok */ }
  const action = body.action

  try {
    switch (action) {
      case 'generate_sections': {
        if (!body.product_name) return json({ error: 'product_name obrigatório' }, 400)
        if (!body.raw_text?.trim()) return json({ error: 'raw_text obrigatório' }, 400)
        return json(await generateSections(String(body.product_name), String(body.raw_text)))
      }
      default:
        return json({ error: `Ação desconhecida: ${action}` }, 400)
    }
  } catch (err) {
    console.error('[manual-ai] erro:', err)
    return json({ error: String(err) }, 500)
  }
})
