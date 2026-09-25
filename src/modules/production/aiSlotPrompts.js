// Prompts prontos por slot — ponto de partida editável, nunca texto fixo.
// Pedido do Raphael, 26/09: liberar a IA (Gemini) em TODOS os 9 slots,
// com vários modelos de prompt por slot, e a opção de subir uma imagem
// pra usar como composição (referência de layout) ou como base pra
// melhorar. A regra de fidelidade ao produto continua valendo sempre
// (FIDELITY_PREFIX na edge function product-image-ai) — os prompts
// abaixo só controlam o que muda AO REDOR do produto.
//
// Slots 03/04 continuam tendo também o gerador sem IA (generateSlotImage.js),
// que usa os dados reais do cadastro — a IA ali é uma alternativa.
export const AI_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9]

// ─── Dados do produto usados nos prompts ────────────────────────────
function productName(p) {
  return p?.name || 'o produto'
}
function speciesText(p) {
  return p?.compatible_species?.length ? p.compatible_species.join(', ') : 'hamster'
}
function firstSpecies(p) {
  return p?.compatible_species?.[0] || 'hamster'
}
function accessoriesText(p) {
  if (p?.accessories_included?.trim()) return p.accessories_included.trim()
  if (p?.includes_wheel) return `rodinha${p.wheel_diameter_cm ? ` de ${p.wheel_diameter_cm}cm de diâmetro` : ''}`
  return null
}
function dimensionsText(p) {
  const parts = []
  if (p?.width_cm)  parts.push(`largura ${p.width_cm} cm`)
  if (p?.height_cm) parts.push(`altura ${p.height_cm} cm`)
  if (p?.depth_cm)  parts.push(`profundidade ${p.depth_cm} cm`)
  return parts.length ? parts.join(', ') : null
}

// Regras que valem pra qualquer imagem com texto (slots 4, 5, 8, 9)
const TEXT_RULES = 'Todo texto da imagem em português do Brasil, curto, sem erros de ortografia, fonte sem serifa moderna e bem legível, alto contraste. Nada de parágrafos longos.'
const FORMAT = 'Formato vertical 4:5 (1080×1350px), estilo clean & natural.'

// Modelo universal — disponível em todos os slots: melhorar uma foto real
// (normalmente a que o usuário sobe como "imagem base").
const IMPROVE_PRESET = {
  id: 'melhorar',
  label: 'Melhorar esta foto',
  build: p => `Melhore esta foto de ${productName(p)} como um retoque profissional de fotografia de produto: corrija a iluminação (mais uniforme e suave), o balanço de branco e a nitidez, limpe sujeiras/poeira e distrações do fundo, e deixe as cores fiéis ao real. Mantenha o mesmo enquadramento, ângulo e cenário — não troque o ambiente, só deixe a foto com qualidade de catálogo. ${FORMAT}`,
}

export const SLOT_PRESETS = {
  1: [
    { id: 'fundo-branco', label: 'Fundo branco 3/4', build: p => `Isole ${productName(p)} sobre fundo branco puro (#FFFFFF) de estúdio, em perspectiva 3/4, iluminação suave e uniforme de softbox, com uma sombra de contato leve e realista embaixo. Produto centralizado ocupando cerca de 80% da imagem. Remova todo o fundo/ambiente original. Não adicione acessório, pet ou qualquer elemento extra. ${FORMAT}` },
    { id: 'fundo-branco-frontal', label: 'Fundo branco frontal', build: p => `Isole ${productName(p)} sobre fundo branco puro, em vista frontal reta, iluminação de estúdio uniforme, sombra suave logo abaixo. Produto centralizado ocupando cerca de 80% da imagem, sem nenhum outro elemento. ${FORMAT}` },
    { id: 'fundo-suave', label: 'Fundo neutro suave', build: p => `Coloque ${productName(p)} sobre um fundo de estúdio em tom neutro bem claro (off-white/bege muito suave), com gradiente sutil e sombra natural, perspectiva 3/4. Visual premium e minimalista, sem nenhum outro elemento. ${FORMAT}` },
    IMPROVE_PRESET,
  ],
  2: [
    { id: 'sala', label: 'Sala aconchegante', build: p => `Coloque ${productName(p)} em um canto de sala residencial realista e aconchegante, sobre um móvel baixo de madeira clara, com luz natural suave entrando pela janela, plantas e decoração discreta em tons neutros ao fundo (desfocado). O produto é o protagonista, montado e organizado. ${FORMAT}` },
    { id: 'quarto', label: 'Quarto / escritório', build: p => `Coloque ${productName(p)} em um quarto ou home office clean, sobre uma bancada ou estante, com luz natural do dia, paleta clara e tons de madeira, fundo levemente desfocado. Ambiente de tutor organizado e caprichoso. ${FORMAT}` },
    { id: 'com-pet', label: 'Ambiente + pet', build: p => `Coloque ${productName(p)} em um ambiente residencial realista e acolhedor, com luz natural suave, e inclua um(a) ${firstSpecies(p)} de verdade próximo ou dentro do produto, em proporção realista e correta em relação ao tamanho do produto. Apenas essa espécie, nenhum outro animal. ${FORMAT}` },
    IMPROVE_PRESET,
  ],
  3: [
    { id: 'kit-flatlay', label: 'Kit organizado (flat lay)', build: p => `Mostre ${productName(p)} junto de todos os itens que acompanham${accessoriesText(p) ? ` (${accessoriesText(p)})` : ''}, organizados lado a lado como um kit, vistos de cima (flat lay), sobre fundo branco limpo, com espaçamento uniforme. Cada item com uma etiqueta curta de identificação. Não invente itens que não estão na lista. ${TEXT_RULES} ${FORMAT}` },
    { id: 'kit-3d', label: 'Kit em perspectiva', build: p => `Mostre ${productName(p)} em perspectiva 3/4 sobre fundo branco, com os itens que acompanham${accessoriesText(p) ? ` (${accessoriesText(p)})` : ''} dispostos à frente dele de forma organizada, com legendas curtas apontando cada item. Não invente itens que não estão na lista. ${TEXT_RULES} ${FORMAT}` },
    IMPROVE_PRESET,
  ],
  4: [
    { id: 'medidas', label: 'Linhas de medida', build: p => `Mostre ${productName(p)} isolado sobre fundo branco em perspectiva 3/4, com linhas técnicas finas de cota indicando ${dimensionsText(p) || 'largura, altura e profundidade (use exatamente as medidas que eu informar)'}. Valores em cm ao lado de cada linha. Layout extremamente limpo, sem parágrafos. ${TEXT_RULES} ${FORMAT}` },
    { id: 'medidas-escala', label: 'Medidas + escala do pet', build: p => `Mostre ${productName(p)} sobre fundo branco com linhas de cota indicando ${dimensionsText(p) || 'largura, altura e profundidade'}, e ao lado a silhueta simples de um(a) ${firstSpecies(p)} em escala real, pra dar noção de tamanho. Visual técnico e limpo. ${TEXT_RULES} ${FORMAT}` },
    IMPROVE_PRESET,
  ],
  5: [
    { id: 'beneficios-icones', label: 'Headline + 3 benefícios', build: p => `Crie uma imagem de benefícios para ${productName(p)}: o produto em destaque sobre fundo claro e limpo, uma headline curta no topo e 3 benefícios reais ao lado, cada um com um ícone simples de linha. Benefícios (edite se precisar): 1) Material resistente e seguro para o pet; 2) Fácil de montar e limpar; 3) Estimula o comportamento natural. ${TEXT_RULES} ${FORMAT}` },
    { id: 'beneficios-callouts', label: 'Callouts no produto', build: p => `Mostre ${productName(p)} grande e centralizado sobre fundo claro, com 3 ou 4 setas/callouts finos apontando partes do produto e um texto curto de benefício em cada (edite: "MDF resistente", "Encaixes sem parafuso", "Fácil de limpar"). ${TEXT_RULES} ${FORMAT}` },
    IMPROVE_PRESET,
  ],
  6: [
    { id: 'macro', label: 'Close de acabamento', build: p => `Faça um close fotográfico (estilo macro) de ${productName(p)} destacando o acabamento, o material e os encaixes EXATAMENTE como aparecem na foto — apenas aproxime/recorte e melhore luz e nitidez, sem inventar nenhum detalhe que não existe no produto real. Fundo desfocado suave. ${FORMAT}` },
    { id: 'mosaico', label: 'Mosaico de detalhes', build: p => `Monte um mosaico com 3 ou 4 recortes em close de ${productName(p)} (acabamento, encaixes, material, ventilação), cada recorte tirado da própria foto, com uma legenda curta em cada. Não invente partes que não aparecem na foto. ${TEXT_RULES} ${FORMAT}` },
    IMPROVE_PRESET,
  ],
  7: [
    { id: 'uso', label: 'Pet usando', build: p => `Mostre ${productName(p)} sendo usado por um(a) ${firstSpecies(p)} de verdade, de forma realista e em proporção correta com o tamanho do produto, usando exatamente como ele foi projetado (entrando, explorando, correndo, comendo). Fundo simples e neutro, foco no produto e no animal. ${FORMAT}` },
    { id: 'uso-habitat', label: 'Dentro do habitat', build: p => `Mostre ${productName(p)} montado dentro de um habitat/gaiola bem cuidado, com substrato natural, e um(a) ${firstSpecies(p)} interagindo com ele de forma natural e realista, em proporção correta. Luz suave, foco no produto. ${FORMAT}` },
    IMPROVE_PRESET,
  ],
  8: [
    { id: 'indicado', label: 'Indicado para', build: p => `Crie uma imagem de compatibilidade para ${productName(p)}: o produto de um lado sobre fundo claro e, do outro, o título "Indicado para" com ${speciesText(p)} — cada espécie com uma ilustração/foto pequena e um ✓ verde. ${TEXT_RULES} ${FORMAT}` },
    { id: 'indicado-nao', label: 'Indicado × não indicado', build: p => `Crie uma imagem de orientação para ${productName(p)} com duas colunas: "Indicado para" (${speciesText(p)}, com ✓ verde) e "Não indicado para" (edite: espécies que não devem usar, com ✗ vermelho). Produto pequeno no topo, fundo claro, visual limpo. ${TEXT_RULES} ${FORMAT}` },
    IMPROVE_PRESET,
  ],
  9: [
    { id: 'educativo', label: 'Educativo', build: p => `Crie uma imagem educativa envolvendo ${productName(p)}, em fundo simples e limpo, explicando com um título curto e 2 ou 3 pontos visuais por que ele ajuda no comportamento natural do(a) ${firstSpecies(p)} (edite o tema: esconder, cavar, roer, correr...). ${TEXT_RULES} ${FORMAT}` },
    { id: 'antes-depois', label: 'Com × sem o produto', build: p => `Crie uma comparação lado a lado: à esquerda um habitat vazio/sem enriquecimento com o texto "Sem", à direita o mesmo habitat com ${productName(p)} e o texto "Com", mostrando o ganho de enriquecimento para o(a) ${firstSpecies(p)}. Sem citar concorrentes. ${TEXT_RULES} ${FORMAT}` },
    IMPROVE_PRESET,
  ],
}

export function presetsForSlot(slot) {
  return SLOT_PRESETS[slot] || [IMPROVE_PRESET]
}

export function defaultPromptForSlot(slot, product) {
  return presetsForSlot(slot)[0].build(product)
}

export const AI_SLOT_NOTE = {
  2: 'Se incluir pet: ele é gerado pela IA, não é foto real — revise proporção e realismo antes de publicar.',
  4: 'A IA pode errar número/traço — confira TODAS as medidas contra o cadastro antes de usar (o botão "Gerar" sem IA usa as medidas exatas).',
  5: 'Revise os benefícios e a ortografia: só use benefício que o produto realmente tem.',
  6: 'Detalhe construtivo precisa ser real: descarte qualquer resultado em que a IA inventou encaixe/acabamento que o produto não tem.',
  7: 'O pet nesta imagem é gerado pela IA, não é uma foto real — revise a proporção e o realismo antes de publicar.',
  8: 'Confira se as espécies indicadas/não indicadas estão corretas antes de publicar.',
}
