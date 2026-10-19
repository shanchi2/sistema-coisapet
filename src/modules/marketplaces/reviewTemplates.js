// Modelos de resposta das avaliações (20/10, pedido do Raphael). A Shopee
// aceita UMA resposta por avaliação, pública no anúncio e sem edição — por
// isso cada modelo é só um ponto de partida: dá pra mexer antes de enviar.
// Variar os textos (botão "outro modelo" / lote sorteado) evita que o
// anúncio fique cheio de respostas idênticas.

export const TEMPLATE_GROUPS = {
  pos: {
    label: 'Positivas (4–5★)',
    items: [
      ['Carinho', 'Que alegria ler isso! 🥰 Nós da Coisa Pet fazemos cada peça com muito carinho, pensando no bem-estar do seu pet. Obrigada pela confiança e pela avaliação! 🤎🐹'],
      ['Feito à mão', 'Ficamos muito felizes que você gostou! Cada produto sai da nossa marcenaria feito à mão, então o seu retorno faz o dia do nosso time. Conte sempre com a gente! 🤎'],
      ['Instagram', 'Obrigada pela avaliação! 🐹✨ Esperamos que o seu pequeno aproveite muito o cantinho novo. Se quiser, marca a gente no Instagram @coisapet, vamos amar ver! 🤎'],
      ['Chegou certinho', 'Uhuul, que bom que chegou tudo certinho! 🎉 Agradecemos de coração por escolher a Coisa Pet. Qualquer coisa, é só chamar no chat. 🤎🐹'],
      ['Time Coisa Pet', 'Ficamos muito felizes com a sua compra e sua avaliação! Obrigada por fazer parte do time Coisa Pet! 🤎🐹'],
      ['4★ — sugestão', 'Obrigada pela avaliação! Ficamos felizes que gostou 🤎 Se tiver alguma sugestão pra gente chegar nas 5 estrelas, chama no chat: adoramos ouvir nossos clientes! 🐹'],
    ],
  },
  negSem: {
    label: 'Negativas só com estrelas',
    items: [
      ['Equipe dedicada', 'Olá! Percebemos que algo não ficou como você esperava e queremos muito entender o que aconteceu. Temos uma equipe 100% dedicada a resolver problemas com nossos produtos e ajudar na montagem. Chama a gente no chat da Shopee? 🤎'],
      ['Produto, entrega ou montagem', 'Poxa, sentimos muito que a sua experiência não foi 5 estrelas 😔 Se teve qualquer dificuldade com o produto, a entrega ou a montagem, fala com a gente pelo chat. Nosso time responde rapidinho e resolve junto com você! 🤎🐹'],
      ['Queremos ouvir', 'Oi! A sua avaliação é muito importante pra nós. Não sabemos exatamente o que aconteceu, mas queremos ajudar: manda uma mensagem no chat contando o que houve que a nossa equipe de suporte cuida de tudo. 🤎'],
      ['Feito à mão', 'Olá! Vimos a sua avaliação e ficamos preocupados. Aqui na Coisa Pet cada peça é feita à mão e queremos que ela chegue perfeita pro seu pet. Se algo veio diferente, chama no chat que a gente resolve! 🐹🤎'],
    ],
  },
  negCom: {
    label: 'Negativas com comentário',
    items: [
      ['Vamos resolver', 'Sentimos muito pelo ocorrido 😔 Já estamos analisando o que você relatou. Nossa equipe de suporte é 100% dedicada a resolver isso com você: chama a gente no chat da Shopee pra cuidarmos do seu caso. 🤎'],
      ['Montagem', 'Poxa, sentimos muito pela dificuldade! Temos vídeos e um time pronto pra te ajudar na montagem, passo a passo. Chama a gente no chat que enviamos tudo e acompanhamos até ficar perfeito. 🐹🤎'],
      ['Chegou com problema', 'Sentimos muito que o produto chegou assim! 😔 Esse não é o padrão Coisa Pet. Fala com a gente no chat, com fotos, que buscamos a melhor solução pra você. 🤎'],
      ['Já falamos com você', 'Obrigada pelo retorno! Já entramos em contato e seguimos à disposição pelo chat para o que precisar. O seu feedback ajuda a gente a melhorar cada vez mais. 🤎🐹'],
      ['Sugestão / dúvida', 'Obrigada pelo seu retorno! A sua opinião ajuda muito a gente a melhorar. Qualquer dúvida, é só chamar no chat. 🤎🐹'],
    ],
  },
}

// Grupo sugerido pra avaliação: 4–5★ → positivas; 1–3★ com/sem texto.
export function groupFor(c) {
  if (c.rating >= 4) return 'pos'
  return (c.text || '').trim() || c.headline ? 'negCom' : 'negSem'
}

// Sorteia um modelo do grupo, evitando repetir o anterior.
export function pickTemplate(group, avoid) {
  const items = TEMPLATE_GROUPS[group].items.filter(([, t]) => t !== avoid)
  return items[Math.floor(Math.random() * items.length)][1]
}

// Janela de edição da Shopee: o comprador edita 1x em até 30 dias (conferido
// na API em 20/10: EDITABLE até o 30º dia, EXPIRED depois, HAVE_EDITED_ONCE
// quando já editou).
export const EDIT_DAYS = 30
export function editWindow(c) {
  if (c.platform !== 'shopee') return null
  if (c.editable === 'HAVE_EDITED_ONCE') return { open: false, kind: 'edited', label: 'cliente já editou (não pode mais)' }
  const end = new Date(new Date(c.at).getTime() + EDIT_DAYS * 86400e3)
  const left = Math.ceil((end - Date.now()) / 86400e3)
  if (c.editable === 'EXPIRED' || left <= 0) return { open: false, kind: 'expired', label: 'prazo de edição encerrado' }
  return { open: true, kind: 'open', left, end, label: `edição fecha em ${left} dia${left === 1 ? '' : 's'} (${end.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })})` }
}
