// Prompts padrão por slot — ponto de partida editável, não texto fixo.
// Só cobre os slots onde IA image-to-image faz sentido de verdade
// (cenário/contexto em cima da foto real). Slot 06 (detalhes
// construtivos) fica de fora de propósito: exigiria a IA "inventar"
// como são os encaixes/acabamento reais em close-up, o que fere direto
// a regra de nunca alterar/inventar característica do produto — esse
// slot continua sendo só foto macro de verdade. Slots 03/04 também
// ficam de fora: já são gerados sem IA nenhuma (ver generateSlotImage.js).
export const AI_SLOTS = [1, 2, 7, 9]

export function defaultPromptForSlot(slot, product) {
  const name = product?.name || 'o produto'
  switch (slot) {
    case 1:
      return `Isole ${name} sobre um fundo branco puro de estúdio, iluminação suave e uniforme, com uma sombra leve e realista embaixo do produto, em perspectiva 3/4. Remova qualquer fundo/ambiente da foto original. Não adicione nenhum acessório, pet ou elemento extra — só o produto isolado.`
    case 2:
      return `Coloque ${name} dentro de um ambiente residencial realista, bonito e aconchegante (ex: um canto de sala ou quarto), com luz natural suave, como se estivesse organizado na casa de um tutor de pet. Não adicione nenhum animal na imagem — só o produto no ambiente.`
    case 7:
      return `Mostre ${name} sendo usado por um hamster de verdade, de forma realista e em proporção correta com o produto, entrando/explorando/usando o produto exatamente como ele foi projetado para ser usado. Fundo simples e neutro, foco no produto e no animal.`
    case 9:
      return `Crie uma imagem educativa e comparativa envolvendo ${name}, em um fundo simples e limpo, destacando visualmente por que essa é uma boa escolha para o pet (sem citar concorrentes).`
    default:
      return ''
  }
}

export const AI_SLOT_NOTE = {
  2: 'Cuidado: nenhum pet foi realmente fotografado com o produto — é uma imagem sintética. Revise com atenção antes de publicar.',
  7: 'Cuidado: o pet nesta imagem é gerado pela IA, não é uma foto real — revise a proporção e o realismo antes de publicar.',
}
