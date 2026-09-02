# CoisaPet — Log de trabalho entre terminais

Este arquivo existe pra manter os diferentes terminais/sessões do Claude
Code trabalhando neste projeto sincronizados sobre o que já foi feito.

**Convenção**: sempre que fechar algo importante (feature, decisão de
arquitetura, bug corrigido, pendência aberta), adiciona uma entrada nova
no topo da seção "Log", com data. Não precisa detalhar código — o
código já está no repo; aqui é o *porquê* e o *estado atual*, pra quem
chegar depois (outro terminal, ou você mesmo em outro dia) não ter que
reconstruir o raciocínio do zero.

---

## Estado atual (resumo rápido)

- **Integração com a API do Mercado Livre**: no ar, funcionando, conectada
  (conta real da CoisaPet autorizada via OAuth).
- **Sincronização automática de pedidos do ML**: pedido novo entra sozinho
  no sistema em tempo real, via webhook — sem precisar mais do upload
  manual do `.xlsx` (que continua existindo como plano B).
- **Importação manual do `.xlsx`** (ML e Shopee): continua funcionando
  exatamente como sempre funcionou, sem mudanças de comportamento.
- **Shopee**: ainda 100% manual — a API da Shopee não foi integrada
  (só a do ML, até agora).
- **Projeto Supabase**: `lcybmdiqxmbqeuyeuhdj` (região Ohio/East US). CLI já
  linkado nessa pasta.
- **Kanban Operacional**: qualquer usuário vê a task de qualquer um (decisão
  do Raphael + sócio) — inclusive tasks com os diretores. Filtro por setor
  (barra de botões lá em cima) só aparece pra `admin` (diretoria); os
  demais só têm o filtro por responsável, que já abre em "eu mesmo".
- **Pedidos/Picklist/Expedição**: reformulado em 2026-08-25 e 2026-08-26 —
  ver entradas detalhadas no Log (mais recente primeiro). **Picklist
  Virtual foi descontinuado**; só existem mais "Gerar Picklist" e
  "Expedição". **`orders.ship_date`** (desde 26/08) é agora a ÚNICA fonte
  de verdade pra "que dia esse pedido pertence" — calculado uma vez, num
  trigger no banco, nunca mais recalculado. ML usa o prazo de envio REAL
  que a própria API do ML manda (`shipment.lead_time.buffering.date` —
  desde 26/08, confirmado no painel deles), com corte de horário
  configurável (default 11h, tela de Pedidos → aba Histórico → ⚙️) só
  como reserva pra quando esse prazo não vem (ex: importado por `.xlsx`);
  Shopee usa a própria "Data prevista de envio" do arquivo. Expedição/
  Picklist/Histórico todos leem por `ship_date` agora, não mais por
  `batch_id`. Aviso permanente de "Atrasados" na Expedição, independente
  de qual dia está aberto na tela. **Pedido em pacote do ML agora vira 1
  pedido só** (era N, um por produto — corrigido 26/08). Constraint
  `UNIQUE(source,num_venda)` confirmada existente em produção. Pedido
  Full confirmado excluído do picklist (só aparece na aba Pedidos).
  **26/08 (3ª parte)**: todos os pedidos ML antigos foram arquivados
  (`orders.archived`, nunca DELETE) e reimportados do zero via API —
  Expedição de hoje bate 100% com o painel real do ML (7 pedidos).
  Shopee intocado. Ver Log pra detalhes.
- **Otimização ML (28/08 a 01/09)**: módulo "Otimização ML" no sidebar,
  todo em cima da edge function `ml-insights` — Saúde dos Anúncios,
  Tráfego, Perguntas & Reputação, Promoções, Oportunidades de Venda,
  Sugestão de IA de título/descrição, Anúncios (Fase 36: gestão +
  criação do zero com upload de foto), e agora (Fase 37, 01/09) Campanhas
  & Promoções de verdade: indicar item pra campanha tradicional (tipo
  `DEAL`, ex: a 9.9, que a conta já tem rodando) com preço sugerido pelo
  próprio ML. **Importante já confirmado por pesquisa**: impulsionar
  Ads (Product Ads) NÃO é possível via API pública, só leitura — não
  vale tentar de novo sem achado novo. Sempre atrás de `ConfirmWriteModal`
  — regra permanente do Raphael, nenhuma gravação de 1 clique. Módulo
  todo commitado (`0c0690b` Fases 28-35, `0254099` Fases 36-38) — ainda
  só local, push bloqueado nesta máquina (ver entrada de 09/01 2ª parte).
- **Shopee (26/08, 5ª parte)**: fluxo revisado, sem bug estrutural
  (parser já agrupa pacote e protege item de pedido já existente —
  diferente do ML, não precisou de correção de código). 723 pedidos
  antigos arquivados (`ship_date < 15/08/2026`); badge de Atrasados caiu
  de ~673+ pra 34 no total (7 Shopee + 23 ML + 4 manual).
- **Produção (02/09, Fase 40)**: módulo redesenhado do zero — a equipe
  de produção começa a usar de verdade a partir de agora. Bug real
  corrigido: achar item na "Feira" (`FeiraCombinadaModal` ou a feira
  single-platform da Expedição) agora de fato reduz o que a Esteira pede
  pra produzir (antes as duas coisas eram desconectadas — ver Log pra
  detalhes). Esteira virou "hoje por padrão", agrupada por
  plataforma→produto (não mais por lote de importação). Backlog de 3.173
  itens "pendente" desde maio (nunca operado) foi arquivado — não é
  DELETE, status `arquivado`, dado continua no banco. Ver
  `supabase/fase40-producao-reconciliacao-feira.sql`.

## ⏭️ Próximos passos imediatos (pra continuar de onde parou)

1. **`npm run build` + subir `dist/` pra Hostinger** — o código (ship_date,
   Atrasados, config de corte, filtro de `archived`) já está no GitHub
   (buildado localmente e testado nesta sessão) mas ainda não foi subido
   pro site. A parte do banco já está ativa em produção independente disso.
3. **Fase 3 (não urgente)**: consolidar `import_batches` pra ficar exato
   por `(source, ship_date)` — hoje um `batch_id` ainda pode conter
   pedidos de vários dias (resíduo do bug antigo, confirmado indo até
   maio/2025). Não afeta o que aparece na tela (isso já foi corrigido),
   só a "canalização" por trás (histórico de lotes, Fechar o Dia, Meta de
   Sábado usam um `batch_id` "resolvido na hora" como workaround —
   ver `resolveBatchId` em `useShipping.js`). Ver `fase21` no plano.
4. **Acesso ao Supabase é por máquina**: nesta máquina (escritório), o
   Claude Code ganhou acesso de leitura/escrita ao banco via
   `supabase link --project-ref lcybmdiqxmbqeuyeuhdj` (rodado pelo
   Raphael) + `supabase db query --linked "<sql>"`. Numa máquina nova
   (casa, notebook), isso provavelmente NÃO está disponível de cara —
   se precisar, rodar `supabase link` de novo lá (mesmo processo).
   Ações destrutivas (`DELETE`) são sempre bloqueadas pelo classificador
   de segurança do Claude Code, mesmo com esse acesso — precisa ser
   manual ou aprovado explicitamente na hora.

---

### 2026-09-02 (11ª parte) — Fase 40: Produção redesenhada + bug real da Feira corrigido

**Motivação:** Raphael avisou que a partir de agora a equipe de produção
vai usar este módulo de verdade, e pediu visual limpo/entendível — e
descreveu um comportamento que parecia errado: achar 3 de 5 unidades na
"Feira" (checagem física de estoque antes de produzir) não tirava as 5
unidades da lista de "precisa produzir".

**Investigação (antes de mexer em qualquer coisa — entrei em modo de
planejamento dado o tamanho):** confirmado que é um bug real, não
achismo. `FeiraCombinadaModal.jsx` (Feira Combinada ML+Shopee, aberta em
`OrdersPage.jsx` → Histórico de Importações) e a feira single-platform
embutida em `ExpedicaoPage.jsx` só gravavam a diferença (faltante) numa
tabela separada (`picklist_shortage_reports`, lida pela aba "Itens
Faltando") — **nunca tocavam `production_order_items`**, a tabela que a
aba "Esteira" lê. Achar estoque na feira nunca reduzia o que a Esteira
pedia pra produzir. Confirmado também ao vivo no banco: **3.173 itens em
status "pendente" acumulados desde maio/2026**, só 5 no total já tinham
avançado de status alguma vez — a esteira nunca foi de fato operada, era
um despejo histórico sem filtro de data, agrupado por "lote de
importação" (data que o sistema importou, sem significado nenhum pro
chão de fábrica).

**Decisões tomadas com o Raphael antes de implementar:**
- Item coberto pela feira continua visível na Esteira, esmaecido/riscado
  com "✓ já tem em estoque" — não some.
- Backlog de itens antigos "pendente" (antes de hoje) foi arquivado
  agora — não é `DELETE`, é um novo status `arquivado`, reversível, dado
  continua no banco.

**Implementado** (`supabase/fase40-producao-reconciliacao-feira.sql`,
aplicada em produção):
- Novos status em `production_order_items`: `coberto_estoque` (achado na
  feira) e `arquivado` (backlog antigo).
- RPC `reconcile_stock_found(p_sku, p_found_qty)` — idempotente (recebe
  o total encontrado, não um delta), casa por SKU contra `pendente`/
  `coberto_estoque` numa janela estreita (ontem/hoje, protege o backlog
  arquivado de ser mexido por engano), ordena por mais antigo primeiro.
  Chamada em `useCombinedGathering.js` e `usePicklistGathering.js`
  (os dois fluxos de feira) toda vez que o "achei X" muda.
- **Bug de sintaxe encontrado e corrigido durante o teste ao vivo**:
  escrevi `await supabase.rpc(...).catch(() => {})` — nessa versão do
  supabase-js, `.rpc()` não devolve uma Promise comum encadeável direto
  com `.catch`, isso jogava um erro síncrono que a própria função
  engolia silenciosamente (a chamada real nunca acontecia, sem nenhum
  aviso). Corrigido pra `try { await supabase.rpc(...) } catch {}` nos
  dois arquivos. Só descobri porque testei clicando de verdade na
  interface e conferindo o banco depois — não bastava só o build passar.
- Statement de limpeza rodado uma vez: arquivou os 3.105 itens pendente
  de antes de hoje (os 68 já pendentes de hoje ficaram intactos).

**Redesign de `ProductionPage.jsx`** (com a skill `ui-ux-pro-max`):
- Esteira agora é "hoje por padrão" (navegação por dia, mesmo padrão já
  usado na Expedição) em vez de listar todo o histórico.
- Agrupada por plataforma primeiro (🛒 ML, 🛍️ Shopee, ✍️ Avulso — era
  "Manual"), depois por produto dentro de cada uma (soma a quantidade
  entre pedidos/lotes diferentes do mesmo dia) — não mais por "lote de
  importação". Avançar o status de um produto avança todas as linhas por
  trás juntas, cada uma pro seu PRÓPRIO próximo status
  (`advanceStatusBulk` em `useProduction.js`).
- Aviso de urgência quando é antes das 11h e tem pendência de ML.
- KPIs viraram 3 números diretos: Precisa produzir hoje / Em produção /
  Pronto pra despachar.
- Modal "Novo Lote" virou "Lançar produção avulsa" — default de
  plataforma trocado pra "Avulso" (era Shopee), com aviso pra não
  reimportar XLSX do ML por engano (o webhook já cria sozinho).

**Testado ao vivo de ponta a ponta** com dado real: cliquei em "+" na
Feira Combinada de hoje pra um item real, confirmei no banco que o
`production_order_items` correspondente virou `coberto_estoque`, voltei
pra `/producao` e vi o produto aparecer esmaecido com "já tem em
estoque" e a quantidade cair a zero — fechou o ciclo completo do bug,
não só a lógica isolada. Testado também "Avançar etapa" (com modal de
confirmação mostrando a transição exata) e os KPIs atualizando
corretamente. **Todos os dados de teste foram revertidos** depois
(3 itens marcados como cobertos de teste voltaram pra `pendente`, 1 item
avançado de teste voltou também, linhas de teste em
`picklist_gathering_combined` apagadas) — a fila de hoje está limpa pra
uso real.

**Fora de escopo, confirmado durante a investigação**: `BaixaDiariaPage.jsx`
(baixa de matéria-prima), `PassagemTurnoPage.jsx` (recados de turno) e
`ProductionEntriesPage.jsx` (apontamento por horista, fica em Diretoria)
são telas completamente separadas, sem nenhuma relação com
`production_order_items` — não foram tocadas.

---

### 2026-09-02 (2ª parte) — Redesign de Visão Geral e Saúde dos Anúncios (skill UI/UX Pro Max)

**Motivação:** Raphael instalou a skill `ui-ux-pro-max` (globalmente, via
`npx ui-ux-pro-max-cli init --ai claude --global` — não sincroniza pelo
OneDrive, precisa repetir nas outras máquinas) e pediu pra redesenhar as
duas telas, que usavam um container estreito (`max-w-5xl`) com cards
genéricos empilhados numa coluna só — não preenchiam bem telas largas.

**O que foi feito:**
- Container mais largo (`max-w-[1600px]`) nas duas telas, com layout em
  grid de verdade em vez de coluna única — mantida a paleta existente
  (emerald do módulo ML + slate/rose/âmbar semânticos, nada de cor nova).
- **Visão Geral** (`MlAccountDashboardPage.jsx`): narrativa em destaque
  (fundo gradiente emerald sutil), faixa de 5 KPIs lado a lado, e um
  grid principal de 3 colunas — 2/3 pra tendências (gráfico de receita
  maior, vendas por dia, frequência, top produtos, reclamações) e 1/3
  numa coluna lateral fixa pra Reputação ML + link pra Saúde dos
  Anúncios.
- **Saúde dos Anúncios** (`MlHealthPage.jsx`): nova barra de proporção
  (`unhealthy/warning/healthy`) dando visão instantânea do catálogo
  inteiro, tiles de status com ícone colorido, lista de anúncios virou
  grid de 2 colunas (era 1 coluna cheia, desperdiçava espaço em tela
  larga) com **foto real do produto** em cada card.
- **Fotos dos produtos**: `attributesAudit` (`ml-insights/index.ts`)
  agora pede `thumbnail` na chamada que já fazia pra cada item — campo
  novo, sem custo extra de chamada. Frontend corrige `http://` pra
  `https://` (a API do ML às vezes devolve sem TLS, viraria mixed
  content bloqueado pelo navegador).
- Testado ao vivo (dev server + Chrome, sessão já logada como Raphael)
  em 1920×1080 — as duas telas renderizam com dado real da conta, sem
  erro de console. `npm run build` limpo. Deploy feito
  (`supabase functions deploy ml-insights`).

**Achado à parte, corrigido na sessão seguinte (mesmo dia):** ver
"Fix: bug real no diagnóstico de saúde" abaixo.

---

### 2026-09-02 (10ª parte) — Redesign completo da Criação de Anúncio (wizard)

Última tela do módulo. Era um wizard de 7 passos empilhado num `max-w-3xl`
com só uma fileira de pílulas no topo como indicador. Reestruturado em
`MlCreateListingPage.jsx` em 3 colunas (`max-w-[1400px]`, telas grandes):

- **Trilha de passos lateral** (esquerda): cada passo com ícone, os já
  concluídos ficam clicáveis pra voltar direto (sem perder o que já foi
  preenchido — testado ao vivo: voltar pra Categoria com Ficha
  técnica/Preço já preenchidos manteve tudo). Os que ainda não chegaram
  ficam bloqueados (a ordem importa — não dá pra pular ficha técnica sem
  categoria carregada).
- **Painel de resumo ao vivo** (direita, `sticky`): foto do produto (a
  1ª foto enviada), título, categoria, preço/estoque/fotos e uma
  checklist de progresso — tudo atualiza em tempo real conforme
  preenche, sem precisar chegar no passo de Revisão pra ver como o
  anúncio está ficando. Novo, não existia antes.
- Em telas pequenas, a trilha lateral e o resumo somem (`lg:hidden`) e
  volta a fileira de pílulas compacta original — o formulário continua
  sendo o mesmo em qualquer tamanho de tela.
- Nenhuma lógica de categoria/atributos/preço/foto/publicação mudou — só
  a organização visual. Testado ao vivo com modelo real (pulou direto
  pra Ficha Técnica com Marca/Modelo pré-preenchidos, categoria "Gaiolas
  para Animais"), preenchimento de preço refletindo no resumo em tempo
  real, navegação de volta preservando dados. Não cheguei a publicar de
  verdade (ação real e irreversível no Mercado Livre — não faz sentido
  testar isso). `npm run build` limpo, sem erro de console.

**Módulo Otimização ML: as 9 telas todas redesenhadas.** Fica pendente
só subir o `dist/` pra Hostinger quando o Raphael quiser.

---

### 2026-09-02 (9ª parte) — Fix: vão feio na barra de abas fixa (Detalhe do Anúncio)

Raphael reportou espaço estranho entre a barra de abas (sticky) e o
topo da tela quando ela gruda ao rolar. Medido ao vivo
(`getBoundingClientRect`) antes de mexer: a causa é que `<main>` (o
container de rolagem do `Layout.jsx` da aplicação inteira) já tem
`padding-top: 24px` — `position: sticky` calcula o "colar" a partir da
borda do padding do ancestral com scroll, não da borda real da tela, e
`top-0` fica colado 24px ABAIXO do topo visível, sobrando aquele vão.
Corrigido trocando `top-0` por `-top-6` (-24px) na barra
(`MlItemDetailPage.jsx`) — cancela exatamente o padding do `<main>`.
Confirmado com medição antes/depois: `sticky.top === main.top` exato,
zero vão. `npm run build` limpo.

---

### 2026-09-02 (8ª parte) — Pendências do ML viram links de ação, não só texto

Raphael perguntou sobre custo/limite da API do ML e da OpenAI (respondido
sem mexer em código — API do ML é grátis com limite de 1.500 req/min por
vendedor, sem cache hoje então cada "Atualizar" busca tudo de novo; só a
OpenAI custa de verdade, e só quando clica em "Gerar sugestão" ou na
1ª vez de cada categoria pro hint de campo, que fica em cache). Isso
levou à ideia boa: cada pendência da "Qualidade do anúncio" virar um
link direto pro lugar que resolve, em vez de só texto.

**Investigação ao vivo** (console do navegador, varredura dos 223
anúncios): existem **22 chaves distintas** de pendência na resposta real
da API (`raw.buckets[].variables[].key`, às vezes com prefixo `UP_`,
às vezes sem, pro mesmo conceito). Cruzando com o que o sistema
consegue de fato gravar hoje:
- **5 mapeadas pro nosso sistema**: ficha técnica
  (`TECHNICAL_SPECIFICATIONS_MAIN`, `PYMES` — medidas/peso da embalagem)
  → troca pra aba Ficha Técnica; preço e estoque (`PRICE`,
  `STOCK_DEPOSITO`) → rola até Ações Rápidas com destaque temporário
  (`ring` verde, 1.8s); campanhas (`PROMOTIONS`) → navega pra
  `/ml/promocoes`.
- **As outras 8** (frete grátis, Envios Flex, vídeo, parcelamento, dados
  fiscais, disponibilidade de estoque, Ads) são configuração de conta ou
  logística que a API do ML nem deixa a gente gravar — pra essas, o
  botão vira "Ajustar no Mercado Livre ↗" (link pro `permalink` real do
  anúncio, mesmo padrão já usado no resto do app) em vez de fingir uma
  ação que não funcionaria.

Testado ao vivo nos 3 tipos de ação (troca de aba, scroll+destaque,
navegação entre telas) com anúncios reais que tinham cada tipo de
pendência. `npm run build` limpo, sem erro de console. Nenhuma edge
function mudou (só o mapeamento no frontend).

---

### 2026-09-02 (7ª parte) — Redesign completo do Detalhe do Anúncio (hero + abas)

Raphael pediu pra caprichar nessa — é a maior tela do módulo (692 linhas,
9 seções empilhadas numa coluna só de `max-w-4xl`, rolagem enorme).
Reestruturado do zero em `MlItemDetailPage.jsx`:

- **Hero fixo no topo** (`max-w-[1600px]`): foto real do anúncio (novo —
  `detail.item.pictures` agora vem preenchido do backend, antes só o
  `count` chegava no frontend) + tira de miniaturas das outras fotos,
  título grande com link, badges (Ativo/Pausado, Full, frete grátis),
  histórico de atualização, preço em destaque.
- **Ações rápidas sempre visível** logo abaixo do hero, fora das abas —
  é a ação mais frequente (preço/estoque/status), não devia exigir
  navegar pra achar.
- **4 abas** dividindo o resto do conteúdo (padrão de painel de produto
  tipo Shopify/Stripe — reduz uma rolagem gigante pra navegação
  objetiva): **Visão Geral** (nota do título, imagens, preço, estoque em
  grid de 4 + qualidade do anúncio ML), **Conteúdo & IA** (sugestão de
  título/descrição), **Ficha Técnica** (formulário completo, agora em 2
  colunas — obrigatórios e extras lado a lado), **Desempenho** (visitas/
  vendas/conversão + Mercado Ads na coluna principal, Avaliações na
  lateral).
- Aba "Ficha Técnica" ganha **badge vermelho com a contagem de
  obrigatórios faltando** — dá pra saber que tem pendência sem precisar
  clicar. Barra de abas fica **fixa (sticky)** ao rolar, útil numa aba
  como Ficha Técnica que pode ter dezenas de campos.
- Nenhuma lógica de gravação/confirmação mudou — só a organização visual.
  Testado ao vivo nas 4 abas com anúncio real (MLB3328467471, sticky tab
  funcionando, sem erro de console). `npm run build` limpo, deploy da
  `ml-insights` feito.

---

### 2026-09-02 (6ª parte) — Redesign das 3 últimas telas do módulo (lista completa)

Raphael pediu pra seguir até terminar o módulo. Aplicado o mesmo padrão
largo (`max-w-[1600px]`, header com badge gradiente, `rounded-2xl`) nas
3 telas restantes que tinham layout de lista/gallery:

- **Perguntas & Reputação** (`MlQuestionsReputationPage.jsx`): virou
  split 2/3 (perguntas sem resposta, coluna única — texto de pergunta
  não combina com grid, cada card tem altura bem diferente) + 1/3
  (Reputação + Impacto de responder rápido, antes soltos lado a lado no
  topo). Testado ao vivo com pergunta real (inclusive uma pergunta-spam
  de golpe que apareceu na lista — é conteúdo real do comprador vindo da
  API, a tela só mostra como texto puro, sem risco).
- **Campanhas & Promoções** (`MlPromotionsPage.jsx`): convites +
  candidatos a relâmpago viraram 2 colunas lado a lado (antes
  empilhados). A visão de "dentro de uma campanha" (checkbox + preço
  editável por item) ficou como estava — é fluxo de seleção/tabela, não
  galeria, não fazia sentido virar grid de card.
- **Oportunidades de Venda** (`MlOpportunitiesPage.jsx`): as 5 abas
  (Impulsionar/Frete grátis/Baixa conversão/Parado/Preço) + Combos
  viraram grid de 2 colunas — `ItemRow` ganhou visual de card
  (`bg-white border rounded-xl`, antes era linha cinza chapada
  `bg-slate-50`). Testado ao vivo: 15 candidatos a impulsionar, 15 sem
  frete grátis, 2 perdendo buy box.

Todas testadas com dado real da conta, sem erro de console. `npm run
build` limpo. Nenhuma edge function mudou nessas 3 (só frontend).

**Módulo Otimização ML: todas as 7 telas de lista redesenhadas** no
padrão largo. Únicas duas que ainda ficaram no formato antigo (`max-w-
5xl`) são as duas telas grandes e muito mais complexas — detalhe do
anúncio (`MlItemDetailPage.jsx`) e criação de anúncio
(`MlCreateListingPage.jsx`, 535 linhas, wizard de várias etapas) — essas
merecem uma sessão dedicada só pra elas.

---

### 2026-09-02 (5ª parte) — Redesign da tela Tráfego & Conversão

Mesmo padrão largo (`max-w-[1600px]`) em `MlTrafficPage.jsx`: os 3
"baldes" resumo ganharam ícone colorido (mesmo estilo dos tiles da Saúde
dos Anúncios), grid de 2 colunas na lista principal com foto do produto,
e "Palavras-chave em alta por categoria" virou uma coluna lateral fixa
(era um bloco full-width solto no meio da página). Fotos vieram de um
campo `thumbnail` novo no multiget de `trafficAudit` (mesmo padrão do
`attributesAudit` na sessão anterior). Testado ao vivo (223 anúncios
reais, scan completo), sem erro de console. `npm run build` limpo,
deploy da `ml-insights` feito.

---

### 2026-09-02 (4ª parte) — Redesign da tela Anúncios (mesmo padrão visual)

Raphael deu sinal verde pra continuar o redesign pelas outras telas do
módulo. Apliquei o mesmo padrão das duas anteriores em
`MlActiveListingsPage.jsx` (`/ml/anuncios`): container largo
(`max-w-[1600px]`), header com ícone em badge gradiente, lista virou
grid de 2 colunas (era 1 coluna cheia com linhas finas) com foto maior.
Testado ao vivo (108 anúncios reais, 100 ativos/8 pausados), sem erro de
console, `npm run build` limpo. Não fiz deploy de function (só frontend
— `updateItemFields`/`fetchActiveListings` não mudaram).

**Faltam no módulo** (mesmo padrão largo, ainda não aplicado): Tráfego &
Conversão, Perguntas & Reputação, Promoções, Oportunidades de Venda —
essas têm formatos de conteúdo bem diferentes entre si (gráficos, threads
de perguntas, cards de campanha), cada uma merece pensar o layout
específico em vez de copiar o mesmo grid de cards. Também ainda não
mexi nas telas grandes (`MlItemDetailPage.jsx` e `MlCreateListingPage.jsx`,
535 linhas).

---

### 2026-09-02 (3ª parte) — Fix: bug real no diagnóstico de saúde por anúncio

**O que era:** Raphael perguntou por que tantos anúncios apareciam
"Não informado" na Saúde dos Anúncios. Investigado ao vivo (console do
navegador, chamando `ml-insights` direto com a sessão logada) contra os
223 anúncios reais da conta: **não era falta de dado, era bug**.
`normalizePerformance` (`ml-insights/index.ts`, escrita na Fase 28 sem
nunca ter visto uma resposta real — tinha até um aviso `⚠️ formato a
confirmar` no código) procurava `raw.status`/`raw.health`/`item_health` e
pendências em `raw.results`/`actions` — nenhum desses campos existe na
resposta real. O formato de verdade é `raw.level` (`"good"|"medium"|
"bad"`, ausente só quando o ML genuinamente ainda não calculou — item
novo) e as pendências ficam em `raw.buckets[].variables[]` (cada uma já
com `title` pronto, tipo "Crie um vídeo para não perder vendas").

**Correção:** `normalizePerformance` reescrita pra ler os campos certos
e mapear `level` pro nosso vocabulário (`good→healthy, medium→warning,
bad→unhealthy`). Testado ao vivo depois do deploy: **47 healthy / 144
warning / 21 unhealthy / 11 null (legítimo — item sem cálculo ainda)**,
bate com os 223 anúncios ativos. Tela de Saúde dos Anúncios e a Qualidade
do Anúncio (detalhe do item) passam a mostrar diagnóstico real em vez de
"Não informado" pra quase tudo. Removida também a legenda "formato a
confirmar" da tela de detalhe (`MlItemDetailPage.jsx`), já resolvida.
Deploy feito (`supabase functions deploy ml-insights`).

---

### 2026-09-02 — Fase 39: corrige corrida entre webhooks que duplicava order_items

**Motivação:** Raphael reportou pedido com item duplicado (01/09). Causa
raiz confirmada: `ml-process-webhook` fazia SELECT (esse produto já
existe nesse pedido?) e só depois INSERT — sem trava real no banco, então
2 webhooks quase simultâneos pro mesmo pedido (comum, o ML manda mais de
1 notificação quando o status muda rápido) podiam os dois "ver" que não
existia e os dois inserirem. Confirmado no pedido reportado: os 2
`order_items` foram criados com 53ms de diferença.

**O que foi feito** (`supabase/fase39-order-items-dedup-race-fix.sql`,
já aplicada em produção via `supabase db query --linked`):
- Índice único em `order_items` por `order_id` + sku + variação
  normalizada (mesma chave que o código já usava pra comparar).
- RPC `insert_order_items_safe(p_items jsonb)` — mesmo padrão já usado
  pra `orders` (`upsert_orders_safe`): INSERT em lote com
  `ON CONFLICT ... DO NOTHING`, atômico de verdade. `ml-process-webhook/
  index.ts` foi reescrito pra chamar esse RPC em vez do SELECT-depois-
  INSERT antigo — `RETURNING` devolve só o que foi realmente inserido
  agora, não precisa mais pré-filtrar "item novo" no código. Deploy
  feito (`supabase functions deploy ml-process-webhook`).
- **Limpeza retroativa**: antes de criar o índice único, precisou apagar
  7 pares de `order_items` duplicados que já existiam (e as 7 ordens de
  produção/itens duplicados que cada um gerou) — todas ainda `pendente`,
  nada embalado/enviado, seguro de limpar. Confirmado com o Raphael antes
  de rodar o DELETE. **Essas eram as mesmas 7 linhas que já tinham sido
  auditadas na Fase 19** (`fase19-cleanup-duplicate-items.sql`, query 1)
  mas nunca tinham sido de fato apagadas — a explicação de causa daquela
  fase (bug de corte de dia) provavelmente estava errada; a causa real
  era essa corrida de webhook. Confirmado depois da limpeza: **zero**
  grupos de item duplicado restantes no banco (pedidos ML ativos).
- Itens 0 e 2 da lista de "Próximos passos" (limpezas pendentes das
  Fases 19 e 24) removidos daqui — ambos resolvidos: a verificação final
  não achou nenhum duplicado restante de nenhuma das duas origens.

**Pendências conhecidas:** nenhuma nova. `npm run build` não é necessário
pra esta fase (só backend/edge function).

---

### 2026-09-01 (5ª parte) — Fase 38: log de alterações, Tráfego menos vago, Dashboard com dado real do ML

**Motivação:** usando os módulos novos, Raphael apontou 3 problemas
reais — sem "última atualização" na Saúde do Anúncio, Tráfego & Conversão
vaga (card de palavra-chave só mostrava `category_id` cru, tipo
"plaquinha de bebida festa" parecendo vinda do nada), e a Visão Geral
não batendo com o painel real do ML (mandou print: 543 unidades/
R$46.173 em 30 dias).

**Investigação do Dashboard (a mais importante)**: comparei direto no
banco via `supabase db query --linked` — nosso total real de pedidos ML
nos últimos 30 dias é 338 unidades/R$27.179 (233 sem contar arquivados),
bem abaixo do real. Quebra por dia mostrou a causa: **antes de 24/08**
(quando a integração automática com a API entrou no ar) a captura de
pedido era só manual e claramente incompleta (1-5 pedidos/dia, contra
10-30/dia depois) — não é bug de cálculo, é histórico incompleto de
antes da integração, mas qualquer janela de 30/90 dias cruza esse
período. **Corrigido de vez**: `fetchAccountRevenueFromMl` troca a
fonte — em vez de somar o nosso banco, escaneia
`GET /orders/search?seller=...&order.date_created.from/to=...`
(confirmado ao vivo, paginado, `total_amount` já vem pronto por pedido,
dedup de "quantidade de vendas" por `pack_id` igual ao `ml-process-webhook`).
**Resultado real testado**: R$43.960/514 unidades/**12 canceladas
(bateu EXATO com o print)** contra os R$46.173/543/12 do painel —
diferença de ~5% (provavelmente só o corte exato de "30 dias"), muito
melhor que os 42% de erro de antes. 2 cards novos (Vendas canceladas,
Compradores distintos) + nota deixando claro que agora vem da API, não
do banco.

**Log de "última atualização" por anúncio**: tabela nova
`ml_item_updates` (`supabase/fase38-ml-item-updates-log.sql`, já
aplicada em produção via `supabase db query --linked`) — toda gravação
que o sistema já fazia (ficha técnica, título/descrição, preço/estoque,
criação, entrar/sair de campanha) agora loga 1 linha (`logItemUpdate`,
nunca derruba a gravação principal se o log falhar). Mostrado na Saúde
do Anúncio: "Última atualização: {data/hora}" + histórico expansível
dos últimos 10.

**Tráfego & Conversão menos vaga**: `trafficAudit` agora busca também
`/categories/{id}` (mesmo padrão de `categoryAttributesForCreate`) e
devolve `category_names`. A tela mostra nome da categoria + até 3
títulos de exemplo dos seus próprios anúncios naquela categoria, em vez
do `category_id` cru. Achado ao vivo: `MLB186421` = "Placas
Decorativas" — categoria bem genérica, provável origem da palavra-chave
"plaquinha de bebida festa" que intrigou o Raphael (não é bug nosso, é
categorização abrangente da própria categoria no ML).

**Bônus rápido**: botão "Ajustar" nas 5 listas de Oportunidades de
Venda, levando direto pra Saúde do Anúncio daquele item.

**Tudo testado ao vivo** (leitura: `account_dashboard`,
`item_update_history`, `traffic_audit` com `category_names`).
`npm run build` limpo, `ml-insights` redeployada 2x. Migration da Fase
38 já ativa em produção (não é destrutiva — só `CREATE TABLE`). Nada
commitado ainda.

---

### 2026-09-01 (4ª parte) — Fase 37: Campanhas & Promoções vira acionável (indicar item pra campanha de verdade) + fix no "Impulsionar"

**Motivação:** Raphael pediu ajuda pra impulsionar os melhores itens —
sugestões melhores de Ads, e principalmente ajuda pra decidir/entrar em
campanhas sazonais tipo a 9.9, que estavam chegando.

**Pesquisa antes de construir** (doc oficial do ML, acessada pelo
navegador logado como Raphael — o bloqueio de antes era só contra fetch
automatizado, manual funciona normal):
- **Product Ads (impulsionar anúncio) é SÓ LEITURA na API pública** —
  nunca existiu endpoint de criar campanha/ativar anúncio, nem na
  versão legada (descontinuada 27/05/2026). Confirmado ao vivo: a conta
  tem 2 campanhas e 237 "ad groups" (1 por produto,
  IDLE/ACTIVE/PAUSED/HOLD) — dá pra saber quem tá promovido, não dá pra
  mudar por aqui. **Não é possível impulsionar Ads pelo sistema.**
- **`/seller-promotions` (campanhas tradicionais) É gravável** —
  `POST /seller-promotions/items/{id}` com `{deal_price, promotion_id,
  promotion_type}` indica item pra campanha, `PUT` edita, `DELETE`
  remove. Confirmado ao vivo contra a conta real: a CoisaPet tem a
  campanha **"9.9" rodando agora** (`P-MLB17923006`, tipo DEAL, prazo
  até 09/09) com **223 candidatos reais**, cada um já com
  `suggested_discounted_price`/`min`/`max` calculados pelo próprio ML.
- **Bug achado e corrigido**: o `promotionsOverview` antigo chamava
  `GET /seller-promotions/candidates` sem ID — testei ao vivo, dá 404.
  Nunca funcionou (a própria tela já avisava "endpoint novo, ainda não
  testado"). Trocado por `GET /seller-promotions/users/{id}`
  (documentado, testado ao vivo, é de lá que veio a campanha 9.9 real).

**Construído** (`ml-insights/index.ts` + `MlPromotionsPage.jsx`
reescrita):
1. **Fix na aba "Impulsionar" de Oportunidades**: `adsCoverage()`
   contava item com Ads `status: "idle"` (no "pool" mas não promovido
   de verdade) como "já tem Ads" — agora só conta `status: "active"`.
   Sem UI nova, só o cruzamento existente ficou mais preciso (25 itens
   ativos de verdade vs. o número inflado de antes).
2. **Campanhas & Promoções** (tela reescrita): lista os convites reais
   (`promotion_invites`), campanha `DEAL` (tipo da 9.9) tem botão "Ver
   candidatos" → cruza os 223 candidatos com venda real dos últimos 30
   dias (mesmo hook de Tráfego já usado em Oportunidades), ordena por
   quem mais vende, mostra preço sugerido pelo ML pré-preenchido e
   editável (dentro do min/max), checkbox pra selecionar quem indicar.
   "Indicar selecionados" → `ConfirmWriteModal` → grava de verdade
   (`promotion_join_item`), sucesso parcial por item (mesmo espírito de
   `applyContent`/`create_item` — item com preço não crível falha
   isolado, os outros continuam). Item já participando aparece
   separado, com "Sair da campanha" (`promotion_leave_item`, também
   confirmado). **v1 só cobre tipo `DEAL`** — os outros 9 tipos de
   campanha (`SMART`, `LIGHTNING`, `PRICE_MATCHING` etc., a conta
   também tem convite ativo desses) aparecem na lista mas são só
   consulta por enquanto — cada um tem regra de aceite própria, fica
   pra confirmar ao vivo quando for a vez de mexer neles.

**Tudo de leitura testado ao vivo** (`promotion_invites`,
`promotion_candidates` contra a 9.9 real — 223 itens confirmados,
paginação por `search_after` funcionando —, `ads_coverage` com o fix).
Escrita (`promotion_join_item`/`promotion_leave_item`) não testada
sozinho — é gravação real numa campanha de verdade, fica pro Raphael
testar pela tela. `npm run build` limpo, `ml-insights` redeployada 3x
nesta sessão. Nada commitado ainda.

**Plano completo desta fase**: `C:\Users\User\.claude\plans\radiant-jingling-blanket.md`
(só existe localmente nesta máquina — sobrescreveu o plano da Fase 36).

---

### 2026-09-01 (3ª parte) — Fase 36: módulo de Criação & Gestão de Anúncios ML

**Motivação:** Raphael perguntou se dava pra criar/gerenciar anúncio ML
direto pelo sistema. Topou construir com a mesma regra de sempre: nenhuma
gravação sem confirmação explícita (nada de pausar/reativar/editar/criar
com 1 clique).

**Gestão de anúncios ativos** (`/ml/anuncios`, tela nova
`MlActiveListingsPage.jsx`): lista todo mundo (ativo + pausado, thumbnail/
preço/estoque/status), busca por título, pausar/reativar direto na lista
(atrás de `ConfirmWriteModal`). Preço/estoque agora também editáveis no
detalhe do anúncio (`MlItemDetailPage.jsx` → card novo "Ações rápidas") —
1 botão só, manda pro ML SÓ os campos que mudaram (`update_item_fields`,
mesmo espírito do save da Ficha Técnica).

**Criação de anúncio novo** (`/ml/anuncios/novo`, tela nova
`MlCreateListingPage.jsx`, wizard de 7 passos): nome → categoria
(sugestão por IA via `domain_discovery`, testado ao vivo antes de
construir a UI — ou digitar o ID manualmente) → ficha técnica (mesmo
`AttributeRow`, agora extraído pra componente próprio e reaproveitado
nas duas telas) → preço/estoque/frete → fotos (upload direto na tela,
multipart repassado pro ML pela edge function) → descrição (manual —
a Sugestão de IA existente continua só pra anúncio já criado) →
revisão + publicar. Dá pra usar um anúncio já existente como "modelo"
(pré-preenche categoria + ficha técnica com os valores reais dele —
preço/estoque/foto NUNCA vêm do modelo).

**Detalhe técnico que vale registrar**: os campos "estruturais" da
criação que a API valida sem dar erro claro se estiver errado
(`listing_type_id`, `buying_mode`, `currency_id`, `shipping.mode`) são
copiados de um anúncio real já ativo do vendedor em vez de chutados —
`structural_defaults`, cai num default fixo (`gold_special`/
`buy_it_now`/`BRL`/`me2`) só se não achar nenhum anúncio ativo pra
copiar.

**Bug pego e corrigido durante o teste ao vivo**: `item_detail` já
buscava `status` da API mas esquecia de repassar no `return` — corrigido
antes de virar problema real (o card "Ações rápidas" dependia disso pra
saber se o anúncio tá ativo/pausado).

**Todas as actions novas testadas ao vivo (as de LEITURA, via curl —
`category_predict_debug`, `predict_category`, `category_attributes_for_create`,
`structural_defaults`, `active_listings`, `item_detail`)** antes de
liberar. `upload_picture` e `create_item` são escrita real — não testei
sozinho via terminal, ficam pro Raphael testar pela tela (pode pausar o
anúncio de teste logo depois, se quiser). `npm run build` limpo,
`ml-insights` redeployada 3x nesta sessão. Nada commitado ainda.

**Plano completo desta fase**: `C:\Users\User\.claude\plans\radiant-jingling-blanket.md`
(só existe localmente nesta máquina).

---

### 2026-09-01 (2ª parte) — Commit do trabalho acumulado (Fases 28-35) + push bloqueado nesta máquina

**O que foi feito:** todo o trabalho acumulado desde 28/08 (módulo de
otimização ML inteiro — Saúde dos Anúncios, Tráfego, Oportunidades de
Venda, Sugestão de IA — mais as correções desta mesma sessão de
número_unit/read_only) finalmente foi pro git, commit `0c0690b`.
Checado antes de commitar: nenhuma chave/segredo hardcoded nos arquivos
novos.

**`git push` falhou nesta máquina**: `Permission to
shanchi2/sistema-coisapet.git denied to shanchi-mtz` (403) — a
credencial do GitHub salva no Gerenciador de Credenciais do Windows
desta máquina é de uma conta diferente da dona do repo. Combinado com
o Raphael de deixar assim por enquanto (não é urgente).

**Pendente**: commit `0c0690b` está só local nesta máquina, **ainda não
chegou no GitHub**. Se abrir uma sessão em outra máquina (a que sincroniza
`.git` via OneDrive), ela pode já ter esse commit via OneDrive mesmo sem
push — mas não confiar nisso como método (ver aviso no `CLAUDE.md` sobre
sync de `.git` via OneDrive). Quando for resolver a credencial nesta
máquina: limpar a entrada do GitHub no Gerenciador de Credenciais do
Windows e fazer login como `shanchi2` no próximo `git push`.

---

### 2026-09-01 — Corrige erro ao salvar dimensão/peso da embalagem + remove campos read_only da Ficha Técnica

**Motivação:** Raphael tentou salvar atualização de produto e recebeu
erro 400 da API: `seller_package_height/length/weight/width` "in the
wrong format — Only integers... with cm as unit... Examples: 10 cm,
100 g".

**Causa raiz confirmada** — puxei a definição completa de atributos da
categoria (`item_raw_debug` ganhou `with_category_attrs`, novo parâmetro
opcional): `SELLER_PACKAGE_WIDTH/HEIGHT/LENGTH/WEIGHT` são
`value_type: "number_unit"` — o ML exige o número JUNTO com a unidade
no texto ("20 cm", nunca só "20"). Nosso campo de texto livre não sabia
disso, mandava só o número puro.

**Achado bônus, explica a confusão de campo desconhecido de antes**:
boa parte dos campos estranhos que apareciam na Ficha Técnica (Número
da DI, IEPS, Origem do dado do pacote de fábrica, Chave SAT, unidade de
medida, imposto de importação, etc.) são marcados pelo próprio ML como
`read_only` — **a API rejeita qualquer tentativa de gravar nesses
campos**, mesmo que ela devolva o valor atual numa consulta. A tela
mostrava um monte de campo "editável" que nunca poderia ser salvo de
verdade.

**Corrigido, os 2 problemas de uma vez** (`buildFullAttributes`,
`ml-insights`):
1. `catAttrs.filter(a => !a.tags?.read_only)` — atributo read_only nunca
   mais aparece na Ficha Técnica editável (resolve a causa, não só
   explica com tooltip um campo que nunca ia funcionar mesmo — o
   trabalho de tooltip da Fase 32/33 continua útil pros campos que
   sobraram e são editáveis de verdade).
2. `allowed_units`/`default_unit` (vem direto da API de categoria)
   agora exposto por atributo `number_unit`. `MlItemDetailPage.jsx`:
   campo novo pra esse tipo — input de número + unidade (dropdown se
   tiver mais de 1 opção válida, ex: Comprimento/Largura/Altura do
   produto aceitam cm/mm/m; só texto fixo se tiver 1 só, ex: embalagem
   sempre cm/g) — monta "número unidade" sozinho antes de mandar pro ML.
3. `fallbackDefault()` (botão "Usar padrão") também corrigido — não
   sugere mais "Não informado" pra campo `number`/`number_unit` (isso
   causaria o MESMO erro de formato).

**`npm run build` limpo, `ml-insights` redeployada.** Testado ao vivo
via `item_detail`: `SELLER_PACKAGE_WIDTH` confirmado com
`allowed_units`/`default_unit` corretos, Número da DI e IEPS confirmados
fora da lista. Nada commitado.

### 2026-08-31 (11ª parte) — Causa raiz corrigida: não é "família", é venda já feita

**Motivação:** o fallback via `family_name` da 10ª parte também falhou
("The field family name is invalid") quando Raphael testou de verdade
— minha hipótese de pesquisa da rodada anterior estava incompleta.

**Causa raiz REAL, confirmada com pesquisa mais direcionada (fontes
BR: ecommercenapratica.com, Bling, Real Trends) + teste ao vivo**: não
é sobre o anúncio "ser uma família de variações" — é que **o Mercado
Livre trava edição de título (e do `family_name`, que faz esse papel
no formato novo de anúncio) de QUALQUER item que já teve pelo menos 1
venda**, pra impedir o vendedor de trocar o título depois que o
comprador já avaliou em cima dele. Confirmado direto na API: o item de
teste tem `sold_quantity: 13` — bate exatamente com a regra encontrada
("you can only edit family_name when none of the conditions have sales
yet"). **Isso é uma regra de plataforma do próprio ML, não um bug
nosso, e não tem workaround por API** — vale pra praticamente todo
anúncio "estabelecido" (que já vendeu), não só os migrados pro formato
de família.

**Corrigido**: `friendlyContentError()` agora explica a causa real
(venda já feita, não "família") nos dois pontos onde pode falhar
(tentativa de `title` direto, e o fallback de `family_name`). O
fallback em si continua tentando — pesquisa indica que funciona
normalmente pra anúncio que NUNCA vendeu, só falha mesmo quando já tem
venda no histórico.

**Importante pro Raphael saber, já que vão fazer isso em vários
produtos**: pra anúncio que já vendeu, só a **descrição** é editável
por aqui — o título fica travado pelo próprio ML, provavelmente até
pelo painel deles também (não confirmado com certeza). Pra anúncio
NUNCA vendido, título deve continuar editável normal.

**`ml-insights` redeployada.** Uma tentativa de teste ao vivo (mesmo
valor de `family_name`, sem mudar nada) foi corretamente **bloqueada
pelo classificador de segurança do Claude Code** (é escrita real, deve
passar pela confirmação do Raphael na tela, não por mim testando via
terminal) — não contornei, expliquei e segui pesquisando por outro
caminho. Nada commitado.

### 2026-08-31 (10ª parte) — Corrige erro ao aplicar título de anúncio com família de variações

**Motivação:** Raphael tentou aplicar título+descrição sugeridos e
recebeu o erro cru da API: `"You cannot modify the title if the item
has a family_name"`, 400 BODY_INVALID_FIELDS.

**Causa raiz confirmada direto na API** — ação de diagnóstico nova
`item_raw_debug` (`ml-insights`, mesmo padrão do `order_shipment_debug`
de antes, fica permanente): o anúncio
(`Plaquinha Personalizada Para Terrários Casinhas Pet Nome`) tem
`family_name` preenchido — faz parte de uma família de variações do ML
(ex: mesma peça em cores/desenhos diferentes agrupada). Nesse caso o ML
trava edição de título por item individual — título é compartilhado
entre as variações da família, só edita pelo painel deles.

**2 bugs reais corrigidos** (`applyContent`, `ml-insights`):
1. Título e descrição eram escritas em SEQUÊNCIA — se o título falhasse
   (qualquer motivo), a descrição nunca chegava a ser tentada, mesmo
   sendo uma chamada totalmente independente sem nenhum problema.
   Corrigido: cada uma tenta e falha por conta própria agora
   (try/catch separado), só lança erro de verdade se as DUAS falharem.
2. Erro cru da API (JSON técnico em inglês) agora vira mensagem em
   português explicando a restrição de família de variações —
   `friendlyContentError()` novo, casa por texto do erro (só esse caso
   conhecido por enquanto; erro desconhecido continua mostrando o texto
   original, sem esconder informação).

**Frontend** (`MlItemDetailPage.jsx`): `confirmApplyContent` agora
trata sucesso parcial — toast de sucesso separado por campo que deu
certo, toast de erro (8s, tempo pra ler) pro campo que falhou, e
desmarca só o checkbox do que falhou (evita tentar de novo a mesma
restrição). Só fecha a sugestão inteira se tudo que foi marcado deu
certo.

**`npm run build` limpo, `ml-insights` redeployada.** Não testei
aplicando de verdade via curl (seria escrita real no anúncio ao vivo,
sem confirmação explícita do Raphael na tela) — pedido pro Raphael
tentar de novo pela tela mesma (a descrição, que não tinha problema
nenhum, deve aplicar normal agora; o título desse anúncio específico só
dá pra mudar direto no painel do ML). Nada commitado.

### 2026-08-31 (9ª parte) — Sugestão de IA vira editável antes de aplicar

**Motivação:** Raphael pediu pra poder editar o título/descrição
sugeridos pela IA antes de aplicar — adicionar, remover ou ajustar algo
que a IA não acertou, sem precisar gerar de novo do zero.

**O que foi feito** (`MlItemDetailPage.jsx`, só frontend — nenhuma
mudança no backend/prompt):
- O bloco "Sugerido" virou campo editável de verdade: `<input>` pro
  título (com contador de caracteres, fica vermelho passando de 60) e
  `<textarea>` pra descrição — pré-preenchidos com a sugestão da IA.
- Botão "Restaurar sugestão da IA" aparece só quando o texto foi editado
  (compara com o valor original da IA) — desfaz a edição sem precisar
  gerar de novo.
- O que vai pro Mercado Livre ao aplicar é o texto EDITADO, não mais o
  original da IA (`confirmApplyContent` e o modal de confirmação usam
  `editedTitle`/`editedDescription`) — o modal de confirmação mostra
  exatamente o texto final antes de gravar.
- Botão "Aplicar" bloqueado se o campo marcado ficar vazio depois de
  editado (evita mandar título/descrição em branco pro ML por engano).

**`npm run build` limpo.** Não precisou redeploy da edge function (é só
UI). Nada commitado.

### 2026-08-31 (8ª parte) — Ajustes finos no prompt de IA: filtro de campo interno, tom mais fofo

**Motivação:** depois de testar a v2 do prompt, Raphael pediu 4
ajustes: trocar "Desenho" por "Cor/Variação", tirar "Condição do item"
(sempre novo), tirar SKU (interno), tirar dimensão/peso da EMBALAGEM
(diferente da dimensão do PRODUTO, que continua) — e deixar o tom mais
fofo/carinhoso/vendável (produtos pra pets pequenos), não só
"profissional e direto" como ficou na v2.

**Filtro feito no CÓDIGO, não só pedido pra IA** (mais confiável — IA
pode esquecer uma instrução de "não mencionar"): `sanitizeAttrsForContent()`
novo em `ml-insights` — remove `SELLER_SKU` e atributos de dimensão/peso
de embalagem (`PACKAGE_*` + padrão de nome) da lista ANTES dela chegar
no prompt, e renomeia atributo "Desenho" pra "Cor/Variação". Reforçado
também no próprio prompt (defesa dupla).

**Tom**: reescrita a seção de regras da descrição — carinho/fofura nos
blocos de abertura, uso e fechamento; o bloco "Especificações técnicas"
(título literal obrigatório) continua objetivo e completo, sem perder
informação por causa do tom. Isso resolveu um problema encontrado no
1º teste desta rodada: a IA tinha ficado menos completa (pulou
Marca/Modelo) e escapou `**negrito**` mesmo proibido — corrigido com
regra mais explícita (exemplo errado/certo) e estrutura obrigatória em
5 blocos nessa ordem fixa.

**Testado ao vivo 3x nesta rodada** (mesmo anúncio, gaiola de hamster)
até fechar: resultado final sem negrito, sem SKU/condição/embalagem,
bloco de especificações completo (11 atributos, incluindo os com valor
"0"/"Não" — completo de verdade, não só os "bonitos"), abertura e
fechamento fofos, meio técnico objetivo.

**`ml-insights` redeployada 3x** (1 delas quebrou o deploy por um erro
de sintaxe meu — usei crase dentro de outra crase no template string do
prompt, corrigido na hora). Nada commitado.

### 2026-08-31 (7ª parte) — Reescreve o prompt de IA (título/descrição) — Raphael achou a v1 fraca

**Motivação:** Raphael testou a Sugestão de IA (agora que a chave da
OpenAI foi configurada) e achou a descrição curta/genérica demais
("propaganda" tipo "transforme seu cantinho") — pediu mais informação e
tom mais profissional, e perguntou se precisava configurar prompt em
algum lugar da própria OpenAI. **Esclarecido**: não, o prompt mora
inteiro no nosso código (`ml-insights`), nada pra configurar do lado da
OpenAI além da chave — dá pra melhorar só ajustando o prompt aqui.

**Causa do resultado fraco**: a v1 do prompt já mandava a ficha técnica
inteira, mas nunca EXIGIA usar tudo, nem dava a estrutura real de SEO
de título que o buscador do ML pondera (produto → atributos em ordem
de relevância de busca) — só pedia "priorizar termos que o comprador
busca", vago demais.

**`OPENAI_SYSTEM_PROMPT` reescrito** (mantém a mesma regra dura contra
inventar fato, só ficou mais explícita):
- Título: estrutura explícita (produto primeiro, atributos em ordem de
  relevância), lista de palavras proibidas por serem promocionais/
  subjetivas ("grátis", "promoção", "imperdível", "o melhor" etc. — o
  ML despriorizada isso).
- Descrição: EXIGE usar TODOS os atributos da ficha técnica (não só
  1-2), organizada em blocos por quebra de linha dupla (o que é →
  especificações completas → personalização/uso → cuidados), tom
  "fabricante profissional" em vez de "propaganda emocional exagerada"
  (deu até exemplos do que evitar: "transforme seu cantinho", "toque
  especial"). `buildContentPrompt` reforça a mesma exigência na mensagem
  do usuário, não só no system prompt (reforço duplo ajuda o modelo a
  seguir).
- Ajuste fino depois do 1º teste: liberado usar linha com "- " pra
  listar especificações (proibido na v1, mas testado ao vivo e
  confirmado que só vira lista legível, o campo do ML é texto puro sem
  parser de markdown — não quebra nada).

**Testado ao vivo, resultado bem melhor** (anúncio real, gaiola de
hamster): descrição foi de 1 parágrafo curto genérico pra texto
estruturado com seção própria de "Especificações técnicas" (todos os
atributos) e "Cuidados e observações", tom direto sem "enfeite". Título
ficou objetivo, com dimensão+material, dentro do limite de 60
caracteres, sem palavra promocional.

**`ml-insights` redeployada 2x** (prompt + ajuste do "- "). Nada
commitado. Fica pro Raphael testar mais alguns anúncios reais e me
dizer se a qualidade já está boa ou se precisa calibrar mais.

### 2026-08-31 (6ª parte) — Corrige link quebrado do anúncio (bug desde a Fase 1, em TODO o módulo ML) + abas em Oportunidades

**Motivação:** Raphael reportou que clicar no anúncio em Oportunidades
abria `vendedores.mercadolivre.com.br/anuncios/...`, que não leva a
lugar nenhum. Também pediu pra trocar as 6 seções empilhadas por abas.

**Causa raiz — não era só dessa tela nova**: toda tela de listagem do
módulo ML (`MlHealthPage`, `MlTrafficPage`, `MlPromotionsPage`,
`MlQuestionsReputationPage`, e o fallback de `MlItemDetailPage`)
sempre construiu o link "chutando" o formato
`https://www.mercadolivre.com.br/anuncios/{id}` — nunca foi o formato
real, só nunca tinha sido reportado antes agora. O jeito certo é usar
o campo `permalink` que a própria API do item já devolve (já era usado
certo só no card principal do detalhe do anúncio).

**Corrigido em TODAS as telas** (backend + frontend):
- `attributesAudit`, `trafficAudit`, `unansweredQuestions`,
  `promotionsOverview` (`ml-insights`) — todas passaram a pedir/repassar
  `permalink` no multiget que já faziam (sem chamada extra à API).
- Todo `<a href>` do módulo trocado pra `r.permalink || fallback` — o
  fallback (só usado se `permalink` vier vazio por algum erro pontual)
  também corrigido pra `https://produto.mercadolivre.com.br/{id}` (o
  formato real, testado ao vivo — antes até o fallback estava errado).

**Oportunidades de Venda virou abas** — as 6 seções (Impulsionar, Frete
grátis, Baixa conversão, Parado, Preço, Combos) agora são abas com
contador, não mais empilhadas uma embaixo da outra.

**`npm run build` limpo, `ml-insights` redeployada.** Testado ao vivo
via curl: `permalink` confirmado vindo certo
(`https://produto.mercadolivre.com.br/MLB-...`). Nada commitado.

### 2026-08-31 (5ª parte) — Fase 35: "Oportunidades de Venda" — 6 sugestões pra alavancar vendas no ML

**Motivação:** Raphael pediu sugestões de melhoria pro módulo ML focadas
em vendas (não só diagnóstico técnico) — discutimos 6 ideias e ele
pediu pra construir todas.

**Tela nova** (`/ml/oportunidades`, sidebar "Oportunidades de Venda"):
1. **Candidatos a impulsionar** — vende de verdade (30d) + tem estoque +
   ainda NÃO tem Ads ativo (cruza `traffic_audit` com `ads_coverage`,
   os 2 já existiam).
2. **Quase lá pro frete grátis** — vende mas não tem frete grátis
   (cruza `traffic_audit` com o `shipping` que adicionei ontem).
3. **Alto tráfego, baixa conversão + causa provável** — mesmo critério
   já usado em Tráfego & Conversão (visits≥10, conv<1%), mas agora
   sugere ONDE mexer primeiro (nota de título baixa / sem frete grátis /
   perdendo buy box / sem estoque), cruzando os outros scans.
4. **Anúncio parado** — estoque disponível, ZERO venda em 30d, anunciado
   há 60+ dias (`date_created` novo no scan) — diferente do "candidato a
   relâmpago" que já existe em Promoções (aquele é "vende pouco", este é
   "não vende nada").
5. **Prioridade de ajuste de preço** — perdendo buy box (`price_scan`,
   já existia) E COM venda de verdade — ajustar preço de quem já vende
   bem tem retorno mais imediato que de quem quase não vende.
6. **Produtos comprados juntos (kit)** — ação nova `combo_suggestions`,
   única que não usa a API do ML — só cruza `order_items` (últimos 180
   dias): pares de SKU que apareceram juntos no mesmo pedido 3+ vezes.
   Testado ao vivo: 257 pedidos analisados, 0 pares bateram o limite de
   3 — não é bug (confirmei a query rodando limpo), CoisaPet
   aparentemente não tem padrão forte de recompra conjunta nesse
   período ainda.

**Custo de API mantido baixo**: os itens 1-5 não pedem nenhuma chamada
nova à API — só reaproveitam os 3 scans que já existiam
(`traffic_audit`, `price_scan`, `ads_coverage`), mesclados no
frontend por `item_id`. `traffic_audit` ganhou 2 campos novos no
multiget que já fazia (`shipping`, `date_created`) e passou a calcular
`title_analysis`/`days_listed` em memória (sem chamada extra) — quem já
usa essa ação (Tráfego & Conversão) só ganha campos extras que ignora,
nada mudou pra tela existente.

**`npm run build` limpo, `ml-insights` redeployada.** Testado ao vivo
via curl direto na function (traffic_audit com shipping/title_analysis
populados corretos, combo_suggestions rodando sem erro). Não testado
na tela pelo Raphael ainda. Nada commitado.

### 2026-08-31 (4ª parte) — Corrige pedido volumoso com prazo real capturado tarde demais (condição de corrida)

**Motivação:** Raphael reportou um pedido (`#2000018182112956`, gaiola
grande 100x50x50) que apareceu no picklist de HOJE mas o painel do ML
mostrava "Para enviar no dia 16 de setembro".

**Causa raiz confirmada direto na API (não suposição)** — criei uma
ação de diagnóstico nova, `order_shipment_debug` (`ml-insights`, fica
permanente, útil pra próximas investigações desse tipo), que busca
pedido + shipment reais na hora. `shipping_deadline` desse pedido
estava `NULL` no banco; o shipment real tem
`lead_time.buffering.date = 2026-09-16` — bate exatamente com o painel.
Esse pedido é volumoso (108x56x23cm, 20kg, `tracking_method: "MEL
Voluminoso"`, `logistic.type: xd_drop_off`) — o ML demora mais pra
calcular o prazo desse tipo de envio, e nosso webhook processou o
pedido com **menos de 10 segundos** de diferença da criação (rápido
demais pro prazo já estar pronto). Como `shipping_deadline` veio vazio
na hora, `compute_ship_date()` caiu no corte de horário padrão
(assumiu "amanhã"), e como o `ship_date` só é calculado 1x na criação
(Fase 20, nunca recalculado), ficou errado até agora.

**Verificado que NÃO é bug sistêmico**: conferi os outros 23 pedidos
ativos de hoje que também estavam com `shipping_deadline NULL` — 4
confirmaram o próprio dia 31/08 (bate com o que já estava certo), os
outros 19 genuinamente não têm esse campo na API (frete padrão sem
prazo especial, comportamento normal — a maioria dos pedidos nunca tem
`buffering`, só esse tipo de envio volumoso/cross-dock). Não tem outro
pedido de hoje escondido com prazo real diferente.

**Corrigido**: `UPDATE` pontual no pedido — `ship_date` e
`shipping_deadline` agora `2026-09-16`. Saiu do picklist de hoje.

**Observação à parte, não mexida agora**: a mesma consulta mostrou
várias dezenas de pedidos ML ativos (`archived=false`) com
`shipping_deadline NULL` e `ship_date` de MESES atrás (alguns de
2025) — parecem ser pedidos sob encomenda de prazo muito longo nunca
resolvidos, ou lixo de reimportação antiga. Não investiguei fundo
(fora do escopo do que foi pedido agora) — vale uma auditoria separada
se o Raphael quiser.

**Raphael confirmou que vale montar a reconferência automática** —
feito na sequência, mesma sessão:

**Fase 34 — cron de reconferência automática:**
- `orders.shipping_deadline_checked_at` (coluna nova) — marca quando um
  pedido já foi rechecado, pra não ficar tentando pra sempre pedido que
  genuinamente nunca teve prazo especial.
- Edge Function nova `ml-shipping-deadline-recheck` (deploy
  `--no-verify-jwt`, só cron chama) — pega pedidos ML ativos, sem pack
  (`pack_id IS NULL` — pack tem vários `order.id`, nenhum bate com
  `num_venda`, fica de fora por ora, caso raro dentro de um caso já
  raro), `shipping_deadline` ainda NULL, criados entre 2h e 48h atrás
  (dá tempo do ML terminar de calcular, mas não perde tempo com pedido
  velho demais) e ainda não rechecados. Rebusca pedido+shipment na API;
  se aparecer prazo real diferente do que já está, corrige `ship_date`
  + `shipping_deadline` e notifica admin/administrativo (reaproveita
  `NotificationBell.jsx`). Se não tem prazo especial mesmo, só marca
  como checado.
- `supabase/fase34-ml-shipping-deadline-recheck-cron.sql` — agenda via
  `pg_cron`/`pg_net`, a cada 3h (`cron.schedule`, jobid 2, confirmado
  ativo). Testada manualmente via curl: rechecou 9 pedidos elegíveis,
  0 precisaram de correção (bate com a checagem manual desta sessão).

### 2026-08-31 (3ª parte) — Fase 33: explicação de campo por IA (escala o dicionário), valor padrão sugerido, tooltip fecha clicando fora

**Motivação:** Raphael achou inviável ir listando campo por campo da
Ficha Técnica pra eu adicionar no dicionário manual (Fase 32) — tem
categoria com dezenas de campos desconhecidos. Também pediu valor
padrão pra preencher quando a CoisaPet não tem aquela informação, e o
tooltip fechar clicando fora (não só clicando de novo no "?").

**1. Explicação de campo por IA, cacheada por categoria (escala o
dicionário):**
- Tabela nova `ml_attribute_hints_cache` (`category_id, attribute_id →
  hint`), só acessada pela edge function via service role (sem GRANT
  pra `anon` — não é usada direto pelo frontend).
- `itemDetail`: pros campos que NEM a API do ML (`a.hint`) NEM o
  dicionário fixo da Fase 32 souberam explicar, pergunta pra OpenAI
  (mesma chave `OPENAI_API_KEY` da Sugestão de IA) — 1 chamada só,
  todos os campos desconhecidos daquela categoria de uma vez, resultado
  gravado no cache. Próximo produto da MESMA categoria reaproveita sem
  gastar de novo. Prompt exige "Provavelmente..." quando a IA não tiver
  certeza, e proíbe conselho jurídico/fiscal definitivo — mesmo cuidado
  já usado na Sugestão de título/descrição.
- **Ainda não funciona de verdade**: `OPENAI_API_KEY` continua sem
  configurar (confirmado via `supabase secrets list` agora, mesma
  pendência da Fase 4) — até o Raphael configurar, esses campos
  simplesmente não mostram "?" (falha silenciosa, não quebra a página).
- Tooltip agora mostra de onde veio a explicação (itálico, dentro do
  próprio balão): "gerado por IA" ou "da nossa equipe, não é oficial do
  ML" — só quando não é o `hint` oficial do Mercado Livre.

**2. Valor padrão sugerido ("Usar padrão"):** `buildFullAttributes`
ganhou `default_value` por atributo, só quando o campo está vazio:
- Lista fechada: só sugere se existir de verdade uma opção tipo "Não
  especificado"/"Outros" NA PRÓPRIA API — nunca inventa um valor real
  (não sugere uma cor ou material que a gente não sabe).
- Campo livre/booleano: "Não aplicável" pros casos já mapeados (DI,
  IEPS), "Não informado" genérico pros demais.
- `MlItemDetailPage.jsx`: botão `Usar padrão: "X"` abaixo do nome do
  campo (só aparece se ele está vazio) — preenche o formulário com um
  clique, mas ainda passa pelo fluxo normal de confirmação antes de
  gravar no ML de verdade (nada novo é escrito sozinho).

**3. Tooltip fecha clicando fora:** `InfoTooltip` ganhou listener de
`mousedown` fora do próprio balão (`ref` + `useEffect`) — antes só
fechava clicando de novo no "?".

**`npm run build` limpo, `ml-insights` redeployada.** Não testado com
dado real ainda. Nada commitado (junto com o resto do módulo ML).

### 2026-08-31 (2ª parte) — Fase 32: filtro de frete grátis/Full, tooltip na ficha técnica, dropdown Sim/Não/Outro

**Motivação:** Raphael trouxe 4 melhorias pro módulo de Otimização ML:
filtrar anúncios por frete grátis (com/sem Full), ver a pontuação real
do ML com as ponderações, tooltip explicando campo técnico confuso
(Número da DI, IEPS, Origem do dado do pacote etc.), e trocar campo
booleano de texto livre por dropdown Sim/Não/Outro. Implementados 3 dos
4 agora (item da pontuação ponderada fica pendente — ver abaixo).

**1. Filtro de frete grátis/Full (Saúde dos Anúncios):**
- `attributesAudit`/`itemDetail` (`ml-insights`) passam a pedir o campo
  `shipping` no `/items/{id}` (já incluído na mesma chamada que já
  buscava atributos — sem chamada extra à API). `extractShippingInfo()`
  novo — `logistic_type === 'fulfillment'` = Full, `free_shipping` é
  independente disso (dá pra ter frete grátis sem ser Full).
- `MlHealthPage.jsx`: barra de filtro (Todos / Frete grátis qualquer /
  Frete grátis sem Full / Full) + badge por card (🏷️ Full em âmbar, 🚚
  Frete grátis em azul, mutuamente exclusivos no badge mesmo podendo
  coexistir no dado). Mesmo badge no cabeçalho do detalhe do anúncio.

**2. Pontuação real do ML com ponderações — PENDENTE:** o endpoint
`/item/{id}/performance` nunca teve o formato exato confirmado (mesma
limitação já registrada nas Fases 1-2, doc bloqueou pesquisa direta).
Pedido ao Raphael pra colar aqui o JSON de "ver dados brutos" da seção
Qualidade do Anúncio de um anúncio real — só assim dá pra parsear os
grupos/pesos de verdade em vez de continuar só mostrando o bruto.

**3. Tooltip "?" na Ficha Técnica:** `buildFullAttributes()` agora
inclui `hint` por atributo — prioriza o `hint` oficial que a própria API
de categorias às vezes manda; quando vem vazio, cai num dicionário de
reserva nosso (`ATTR_HINT_FALLBACK`) só pros 3 exemplos que o Raphael
deu (DI, IEPS, Origem do dado do pacote) — casado por trecho do NOME do
atributo, texto deixa claro que não é explicação oficial do ML. Campos
sem hint nenhum (nem da API, nem no dicionário) simplesmente não mostram
"?" — nada inventado. Se aparecer outro campo confuso, é só pedir que eu
acrescento no dicionário.

**4. Dropdown Sim/Não/Outro pra atributo booleano:** `buildFullAttributes`
agora também popula `values` pra `value_type === 'boolean'` (antes só
`'list'`) — quando a própria API manda essas 2 opções, vira `<select>`
igual lista fechada. Quando a API NÃO manda `values` pro booleano (não
garantido em toda categoria), `MlItemDetailPage.jsx` sintetiza um select
Sim/Não/Outro na hora — escolher "Outro" libera um campo de texto
abaixo. Escopo só nos atributos de `value_type: 'boolean'` — texto livre
(string/number) continua como estava, de propósito (não faz sentido
Sim/Não pra um campo numérico, por ex.).

**`npm run build` limpo, `ml-insights` redeployada.** Não testado com
dado real ainda pelo Raphael. Nada commitado (junto com o resto do
módulo ML, que já estava aguardando confirmação — ver pendências no
topo do arquivo).

### 2026-08-31 — Fase 31: ML não atende fim de semana — picklist de sábado/domingo concentrado na segunda

**Motivação:** Raphael notou, olhando o painel do ML numa segunda-feira,
20 produtos pendentes de envio contra só 13 no picklist do sistema —
suspeitou que o sistema tinha gerado picklist separado pra sábado e
domingo, mesmo sem expediente/coleta do ML nesses dias (só a Shopee
atende fim de semana, com a regra dos 20%+1).

**Confirmado no banco antes de mexer:** `compute_ship_date()` (Fase 22)
usa o prazo real que a API do ML manda
(`shipment.lead_time.buffering.date`, ou o corte de horário como
fallback) sem nunca checar se esse prazo caía em sábado/domingo. 4
pedidos ML ativos estavam presos com `ship_date` de sábado (29/08) e 10
com `ship_date` de domingo (30/08) — invisíveis no picklist de hoje.

**Corrigido** (`supabase/fase31-ml-fim-de-semana-para-segunda.sql`,
rodada em produção):
- `compute_ship_date()`: pra ML (só ML — Shopee e manual intocados), se
  o prazo calculado cair em sábado ou domingo, rola pra segunda-feira
  seguinte, como último passo depois do cálculo normal (prazo real da
  API ou corte de horário).
- `UPDATE` retroativo: os 14 pedidos ML já presos em 29/08 e 30/08
  passaram a `ship_date = 2026-08-31`, consolidando no picklist de hoje
  junto com os que já estavam lá.

**Confirmado após rodar**: nenhum pedido ML ativo restou com
`ship_date` em sábado/domingo (25/08–01/09 checado); segunda passou a
concentrar tudo. Não precisa reprocessar nada — é só o campo `ship_date`
sendo corrigido, o pedido em si (itens, valores) não muda.

**Escopo explicitamente fora**: calendário de feriados (só a regra
sábado/domingo → segunda, sem checar feriado na própria segunda) — não
pedido, não implementado.

### 2026-08-29 (8ª parte) — Fase 7: módulo Promoções (candidatos + relâmpago)

**Pesquisa antes de codar** (mesmo aprendizado de Ads): o endpoint que
o roteiro original citava exigia um `promotion_id` já conhecido —
achado o recurso real, `/seller-promotions/candidates` (formato de 1
candidato confirmado: `{id, item_id, promotion_id, type, status:{id}}`),
mas **não achei confirmação do formato de listagem em massa** — menor
confiança do painel, implementado com `try/catch` isolado + "ver dados
brutos", avisado ao Raphael antes de codar.

**Achado ao explorar:** `products` (produtos finalizados) da CoisaPet
não tem campo de estoque — produção é sob demanda. "Estoque parado" só
faz sentido usando `available_quantity` do próprio anúncio no ML. Por
isso o card de candidatos a relâmpago **reaproveita `traffic_audit`**
(de ontem) em vez de criar uma varredura nova — só adicionei
`available_quantity` no multiget que ele já fazia.

**O que foi feito:**
- `traffic_audit` ganhou `available_quantity` por item (sem chamada
  extra).
- Ação nova `promotions_overview` — tenta `/seller-promotions/candidates`,
  agrupa por `type`.
- `MlPromotionsPage.jsx` (novo, `/ml/promocoes`): card "Convites e
  candidatos pendentes" (botão manual, "ver dados brutos" se o formato
  não bater) + card "Candidatos a campanha relâmpago" (reaproveita o
  botão/scan de Tráfego & Conversão, ordena por estoque parado ÷ vendas).

**Fora do escopo de propósito:** criar/aceitar/deletar promoção pela
API — é escrita real que muda o que o cliente vê como "oferta", mais
uma camada de risco. O pedido foi só monitorar/sugerir/lembrar.
Lembrete de campanha expirando também ficou de fora — depende da parte
de "campanhas ativas" ainda não confirmada.

`npm run build` limpo, `ml-insights` redeployada. Não testado com dado
real ainda.

### 2026-08-29 (7ª parte) — Ads: nomes certos de métrica + destaque de anúncios com campanha ativa

**Progresso real:** depois da correção anterior (rota + header), o erro
virou 400 "Metrics ... is not valid" — ou seja, a ROTA já está certa
agora, só o nome de 2 métricas estava errado. Confirmado por pesquisa: o
certo é `direct_amount`/`indirect_amount`, não `direct_units_amount`/
`indirect_units_amount` (não existem). Corrigido em
`fetchAccountAdsSummary`.

**Novo, a pedido do Raphael** (facilitar achar um anúncio com campanha
ativa pra testar): ação `ads_coverage` — lista todos os `item_id` com
algum anúncio patrocinado (pagina `ads/search` sem filtro de item, só
`Api-Version: 2` + limit/offset). Botão **"Ver quem tem Ads"** na Saúde
dos Anúncios sobe esses itens pro topo da lista com selo roxo "📢
Campanha ativa".

`npm run build` limpo, `ml-insights` redeployada. Ainda aguardando
Raphael confirmar que o card "Ads (aprox.)" da Visão Geral mostra dado
real agora (sem o 400).

### 2026-08-29 (6ª parte) — Correção real do endpoint de Mercado Ads (faltava `/search` e header `Api-Version: 2`)

**Motivação:** Raphael pediu explicitamente pra fazer o módulo de
Publicidade Paga (Mercado Ads) funcionar de verdade — a Visão Geral e o
detalhe do anúncio já tinham tentativas desde ontem, mas o card de Ads
da conta dava 404 "No static resource".

**Causa raiz encontrada por pesquisa nova (não é permissão, é rota
errada):**
1. Faltava o sufixo **`/search`** no endpoint de listar campanhas — o
   certo é `.../product_ads/campaigns/search`, não
   `.../product_ads/campaigns`. Confirmado por 2 fontes de pesquisa
   independentes hoje.
2. Faltava o header **`Api-Version: 2`**, obrigatório nessa família de
   endpoints — nenhuma chamada de Ads até agora incluía isso.
3. Formato de filtro é `filters[campo]=valor` (não `campo=valor` solto)
   — corrigido no filtro `item_id` do card por anúncio.

**Corrigido:** `fetchAccountAdsSummary` (Visão Geral) e `fetchAdsMetrics`
(detalhe do anúncio) — extraído `findMlAdvertiser()` compartilhado pra
não duplicar a busca do advertiser. `ml-insights` redeployada.

**Pendência imediata:** pedido pro Raphael testar os 2 cards que já
existem (Visão Geral → "Ads (aprox.)" e detalhe de um anúncio com
campanha ativa → "Mercado Ads") pra confirmar que agora vem dado real,
**antes** de construir a tela dedicada completa (lista de campanhas,
alerta de ACOS, produtos sem campanha, orgânico×pago por anúncio) —
evita repetir o padrão de construir UI grande em cima de endpoint ainda
não validado ao vivo.

### 2026-08-29 (5ª parte) — Fase 6: módulo dedicado "Tráfego & Conversão" + regra de confirmação de escrita

**Confirmação de escrita (antes do módulo novo):** Raphael foi
explícito — nenhuma escrita no Mercado Livre pode acontecer com 1
clique só, nunca. Trocado o `confirm()` nativo do navegador (fácil de
clicar sem ler) por um modal de verdade (`ConfirmWriteModal.jsx`) nos 2
pontos de escrita que já existiam (ficha técnica, título/descrição via
IA) — mostra o valor exato que vai mudar antes do botão de confirmar.
**Regra salva na memória do Claude** (`coisapet_ml_write_confirmation.md`)
pra valer automaticamente em qualquer escrita nova nesse módulo, mesmo
em outra sessão/máquina.

**Tráfego & Conversão — módulo novo:** Raphael tratou isso como peça
importante do roteiro original (visitas × vendas real, separar "muito
tráfego + pouca conversão" de "pouco tráfego", cruzar com tendências de
busca) — decisão: em vez de deixar enterrado como botão secundário em
Saúde dos Anúncios (como ficou ontem), virou **página própria**.

- Backend: `conversion_audit` (de ontem) evoluiu pra `traffic_audit` —
  ganhou parâmetro `days` (7/15/30, mesmo padrão da Visão Geral) e
  passou a resolver também `category_id` no mesmo multiget que já
  buscava `SELLER_SKU` (sem chamada extra). Tendências por categoria
  cacheadas por `category_id` dentro da própria varredura — 1 chamada
  de `/trends` por categoria DISTINTA no lote, não por item.
- `MlHealthPage.jsx`: removido o botão "Analisar Conversão" (só
  "Atualizar" + "Analisar Preço" continuam lá) — não fica mais
  duplicado em 2 lugares.
- `MlTrafficPage.jsx` (novo, rota `/ml/trafego`, sidebar entre Visão
  Geral e Saúde dos Anúncios): 3 baldes de resumo (alto tráfego+baixa
  conversão / baixo tráfego / sem problema, clicáveis como filtro),
  seção de palavras-chave em alta ausentes agrupadas por categoria, e
  lista completa ordenada por visitas.

`npm run build` limpo, `ml-insights` redeployada. Ainda não testado com
dado real pelo Raphael. Nada commitado.

### 2026-08-29 (4ª parte) — Fase 5: alerta de reputação (cron), conversão real, preço/buy box, reclamações por produto

**Motivação:** Raphael pediu pra atacar mais 4 itens do roteiro original
de uma vez: alerta preventivo de reputação, conversão real por anúncio,
preço vs. mercado, reclamações por produto.

**1. Alerta preventivo de reputação — primeira infraestrutura de cron
do projeto:**
- Edge Function nova `ml-reputation-check` (deploy `--no-verify-jwt`,
  só cron chama). Checa taxa de cancelamento; se ≥80% do limite (3%, ou
  2% Mercado Líder), insere notificação em `notifications` pra
  admin/administrativo (reaproveita `NotificationBell.jsx` — sem UI
  nova). Dedupe: não repete alerta se já tem um das últimas 24h (sem
  tabela nova, só checa a própria `notifications`).
- `supabase/fase30-reputation-alert-cron.sql` — habilita `pg_cron`/
  `pg_net` e agenda `cron.schedule('ml-reputation-check-diario', '0 11
  * * *', ...)`. **Rodou direto sem bloqueio** (não tinha DELETE) —
  confirmado com `select * from cron.job` (jobid 1, ativo). Function
  testada manualmente via curl — respondeu "taxa 0.0%, longe do
  limite" (comportamento correto, sem cancelamento recente).

**2. Conversão real por anúncio (estende Saúde dos Anúncios):**
- Ação `conversion_audit` — usa multiget em lotes de 20 (`/items?ids=`
  pra achar `SELLER_SKU`, `/items/visits?ids=` pra visitas) em vez de
  1 chamada por item — bem mais barato que os scans de ontem. Vendas
  vêm do nosso banco (mesma lógica de `fetchSalesFromDb`).
- Botão novo "Analisar Conversão" na Saúde dos Anúncios — badge de
  visitas/vendas/conversão por card + toggle de ordenação "mais
  tráfego, menos conversão" (o sinal mais acionável: anúncio popular
  que não converte).

**3. Preço vs. mercado / buy box (estende Saúde dos Anúncios):**
- Ação `price_scan` — `suggested_price` (já usado no detalhe) +
  `price_to_win` (novo — status `winning`/`competing`, só existe pra
  item de catálogo compartilhado).
- Botão "Analisar Preço" — badge "Perdendo buy box" quando
  `competing`, badge com preço sugerido.

**4. Reclamações por produto (novo card na Visão Geral):**
- Ação `claims_by_product` — `GET /post-purchase/v1/claims/search`
  (API nunca usada antes, pesquisada agora: `resource_id` = pedido no
  ML). Resolve `resource_id` → SKU usando o NOSSO banco
  (`orders.num_venda` → `order_items.sku`), sem chamar a API de novo
  por claim. Agrupa por SKU + motivo. **Menor confiança das 4** —
  parâmetros de filtro por vendedor/data não confirmados ao vivo,
  implementado com `try/catch` isolado + "ver dados brutos" pra ajuste
  rápido se precisar (mesmo padrão que funcionou bem pra Ads/
  performance).

`npm run build` limpo, `ml-insights` redeployada, `ml-reputation-check`
deployada e testada. Cron confirmado ativo em produção. Conversão/
Preço/Reclamações ainda não testadas com dado real pelo Raphael. Nada
commitado ainda.

### 2026-08-29 (3ª parte) — Ajustes de UX na página do anúncio: tooltips "?" + confirmação de que Ads da conta é API interna do ML

**Ads da conta:** Raphael capturou a URL real via DevTools
(`ads.mercadolivre.com.br/advertiser-hub/api/advertiser/134318/product/PADS/metrics`)
— confirmado: é API **interna** do painel do ML (domínio diferente,
autenticada por cookie de sessão do navegador, sem `Authorization`), não
a API pública de desenvolvedor. Não dá pra chamar isso do nosso backend.
**Decisão:** parar de tentar adivinhar esse endpoint — o card "Ads
(aprox.)" da Visão Geral já lida bem com a ausência do dado, fica assim
por enquanto. `advertiserId=134318` da URL bate com o que a API pública
já retorna pra gente, confirmando que essa parte está correta.

**UX — `MlItemDetailPage.jsx`:** Raphael testou a tela ao vivo (ficou
com boa cara) e trouxe 2 pontos:
- Dúvida se "Gerar sugestão" (Sugestão de IA) aplicava algo sozinho —
  não aplica, é só prévia. Deixado isso explícito na própria tela agora
  (não só na conversa).
- Pediu bolinha "?" explicando cada seção pra quem não é da área
  técnica. Componente novo `InfoTooltip` (clique pra abrir, não hover —
  funciona em celular também), adicionado nos 10 cards da página
  (Nota do título, Imagens, Preço, Estoque, Sugestão de IA, Visitas/
  Vendas/Conversão, Avaliações, Qualidade do Anúncio, Ficha técnica,
  Mercado Ads), cada um com explicação em linguagem simples.

`npm run build` limpo — mudança só de frontend, nenhum deploy de edge
function necessário nesta parte. Nada commitado ainda.

### 2026-08-29 (2ª parte) — Fase 4: sugestão de IA (OpenAI) pra título e descrição + correções de Ads/termômetro

**Motivação:** depois de ver o "Agente de Descrições" do concorrente,
Raphael quis a mesma coisa de verdade — IA reescrevendo título e
descrição, não só apontando o que falta. Esclarecido com ele que a
assinatura do ChatGPT Plus não dá acesso à API (é produto separado,
cobrado por uso à parte) — confirmado preço atual (GPT-4o-mini:
$0,15/$0,60 por milhão de tokens entrada/saída, irrelevante pro volume
daqui). Decidido: **OpenAI GPT-4o-mini**, escopo título+descrição juntos
já nessa rodada. Chave `OPENAI_API_KEY` configurada por ele via
`supabase secrets set` direto (nunca passou pelo chat).

**O que foi feito** (`ml-insights`, 2 ações novas):
- `suggest_content` — busca contexto real do anúncio (título/descrição
  atuais via `GET /items/{id}/description`, ficha técnica preenchida,
  palavras-chave em alta da categoria) e chama a OpenAI
  (`gpt-4o-mini`, JSON mode) com um prompt que **proíbe explicitamente
  inventar característica/medida/garantia que não esteja nos dados
  fornecidos** — risco real de propaganda enganosa num anúncio de venda
  de verdade, não é só estilo.
- `apply_content` — escreve no ML só depois de confirmação explícita:
  título via `PUT /items/{id}`, descrição via
  `PUT /items/{id}/description?api_version=2` (endpoint SEPARADO do
  item, `{ plain_text }` — confirmado na pesquisa). Cada campo é
  opcional, dá pra aplicar só um dos dois.
- `MlItemDetailPage.jsx`: card novo "Sugestão de IA" com botão manual
  "Gerar sugestão" (não dispara sozinho — cada chamada tem custo, mesmo
  que baixo), mostra atual × sugerido lado a lado com checkbox por
  campo, sempre com `confirm(...)` antes de aplicar.

**Correções da mesma sessão:**
- **Ads da conta (404 corrigido)**: o card "Ads (aprox.)" da Visão Geral
  usava um caminho de API diferente do que já funciona na tela por
  anúncio — faltava o prefixo `/marketplace/advertising/MLB/advertisers/...`.
  **Segundo teste ainda deu 404** ("No static resource..." — erro típico
  de rota que não existe de verdade, não é permissão) — pedido pro
  Raphael capturar a URL real que o painel de Ads do próprio ML usa
  (via DevTools → Network) em vez de eu continuar chutando às cegas.
  **Ainda pendente essa URL.**
- **Termômetro de reputação visual**: trocado o badge de cor única por
  uma barra com os 5 níveis reais do ML (vermelho→laranja→amarelo→
  verde-claro→verde) com marcador — componente novo
  `ReputationThermometer.jsx`, reaproveitado na Visão Geral e em
  Perguntas & Reputação.

**`npm run build` limpo, `ml-insights` redeployada.** `OPENAI_API_KEY`
ainda não configurada (confirmado via `supabase secrets list`) — a
função dá erro claro até o Raphael configurar. Nada commitado ainda.

### 2026-08-29 — Fase 3: Visão Geral da conta (receita, orgânico×ads, reputação, top produtos)

**Motivação:** Raphael mostrou o dashboard de CONTA do concorrente
(diferente das telas por anúncio das rodadas anteriores) — receita
total, saúde geral, reputação, melhores produtos, padrão de vendas.
Decidido: **sem gamificação** (conquistas/streak — faz mais sentido pra
vendedor sozinho numa plataforma pública que pro nosso time interno) e
**narrativa em texto por template**, não IA de verdade (evita custo e
complexidade extra por agora). "Ferramentas do seu time" (gerador de
EAN, agentes de conteúdo) ficou de fora — escopo bem diferente, conversa
separada se/quando fizer sentido.

**Achado importante ao explorar antes de codar:** a tabela `orders` tem
colunas `total_brl` E `total_value`, mas **nenhuma das duas é usada**
pelo relatório que já existe (`useOrdersReports.js` → `/relatorios`) —
o faturamento real ali é `order_items.preco_unit × qty`. A Visão Geral
nova segue exatamente essa mesma conta, pra nunca mostrar um número de
receita diferente do relatório que já existe.

**O que foi feito:**
- Nova ação `account_dashboard` (recebe `period`: 7/30/90 dias) no
  `ml-insights`:
  - Receita/vendas/ticket médio do período + variação vs. período
    anterior — tudo do nosso banco (`order_items`+`orders`,
    `source='ml'`), não da API do ML.
  - Série diária, padrão por dia da semana, top 5 produtos, calendário
    de frequência de vendas (30 dias) — tudo derivado da mesma consulta.
  - Reputação ML — reaproveita `reputation()` já existente.
  - **Ads agregado da conta** (melhor esforço) — soma métricas de todas
    as campanhas do período via `/advertising/advertisers/{id}/product_ads/campaigns`.
    **Orgânico × Ads é aproximado** (receita total − receita atribuída
    ao Ads), não por pedido individual — deixado claro na tela.
  - Narrativa em texto — função `buildNarrative()`, só template com os
    números reais (faturamento, melhor dia, variação %), nunca IA.
- **Saúde da conta não dispara o scan pesado** (~800 chamadas) sozinha
  — esse card só tem um link pra tela dedicada de Saúde dos Anúncios,
  onde o "Atualizar" já é manual desde ontem.
- Sidebar: novo item **"Visão Geral"** no topo da seção Otimização ML,
  rota `/ml` (vira a entrada do módulo). Corrigido também um bug latente
  de destaque de menu: só `/rh` tinha a checagem `end` no `NavLink`
  (rota-prefixo article causava dois itens "ativos" ao mesmo tempo) —
  `/ml` precisava da mesma correção agora que virou prefixo de
  `/ml/saude` e `/ml/perguntas`.
- `npm run build` limpo, `ml-insights` redeployada.

**Não testado com dado real ainda.** Ads agregado da conta tem a mesma
incerteza de formato já avisada ontem (doc bloqueada nas pesquisas) —
se os números não baterem, é só avisar. Nada commitado (Raphael
confirmando tudo antes).

### 2026-08-28 (3ª parte) — Fase 2: análise completa por anúncio (título, imagens, vendas reais, avaliações, ficha técnica inteira, Ads)

**Motivação:** Raphael mostrou o print de um concorrente ("Marketfacil")
com análise bem mais profunda por anúncio — pediu a mesma profundidade
(não o visual, que ele achou ruim) dentro do nosso sistema. Decidiu
incluir Mercado Ads nesta rodada também (habilitou a permissão
"Publicidade de um produto" no painel do app, mesmo lugar de antes).

**Mudança de arquitetura:** o modal de detalhe da rodada anterior
(`MlItemDetailModal.jsx`) virou **página própria**
(`/ml/saude/:itemId`) — conteúdo demais pra um modal, e permite
compartilhar link de um anúncio específico. `MlHealthPage.jsx` agora
navega em vez de abrir modal.

**O que foi adicionado em `item_detail` (`ml-insights`):**
- **Nota de título** — heurística nossa (tamanho vs. limite 60, palavra
  repetida, maiúscula excessiva, termo em alta via `/trends`) —
  deixado claro na própria tela que não é nota oficial do ML.
- **Imagens** — contagem vs. faixa ideal (6-10) + cobertura por variação.
- **Visitas/vendas/conversão (7/15/30d)** — visitas via
  `/items/{id}/visits/time_window` (1 chamada, série diária, com
  gráfico); **vendas vêm do NOSSO banco** (`order_items`/`orders`,
  cruzando pelo atributo `SELLER_SKU` do item), não da API do ML — o
  `sold_quantity` de lá é cumulativo desde a criação, não dá pra fatiar
  por período. Mais preciso, sem chamada extra.
- **Estoque restante em dias** — `available_quantity ÷ (vendas 30d/30)`.
- **Avaliações** — `/reviews/item/{id}` (endpoint novo).
- **Ficha técnica completa** — agora TODOS os atributos (obrigatórios +
  extras), não só os faltando, cada um com valor atual e editável
  (exceto os controlados por variação — só informativo, link pro ML).
- **Mercado Ads** — `/advertising/advertisers?product_id=PADS` (confirmado
  na pesquisa) + `.../product_ads/ads/search` filtrado por item
  (**não confirmado ao vivo** — doc bloqueou fetch direto nas duas
  pesquisas de ontem, igual aconteceu com `/performance`). Card sempre
  aparece, nunca quebra o resto da página, com "ver dados brutos" pra
  facilmente comparar com o que a tela mostra.
- Qualidade do Anúncio (`/performance`, já existia desde a Fase 1)
  ganhou o mesmo "ver dados brutos" — ainda não confirmamos o formato
  real (percentual + grupos, como no print do concorrente).

**`npm run build` limpo, `ml-insights` redeployada.** Não testado com
dado real ainda.

**Pendência clara pro próximo teste real:** as duas seções com "ver
dados brutos" (Qualidade do Anúncio e Ads) são as que mais provavelmente
precisam de 1 rodada de ajuste — se o formato não bater, copiar o JSON
bruto da tela e mandar aqui que eu ajusto o parser. Nada commitado ainda
(Raphael pediu pra esperar confirmar tudo antes).

### 2026-08-28 (2ª parte) — Painel de Saúde do Anúncio: detalhe + aplicar ficha técnica direto no ML

**Motivação:** confirmado o funcionamento da Fase 1 (ver entrada abaixo,
com 2 bugs reais resolvidos no caminho), o Raphael pediu o próximo passo:
não só listar o que falta em cada anúncio, mas um painel de análise
completa por anúncio, com sugestão de melhoria — e aplicar essas
sugestões direto pelo sistema quando der. Decisão tomada junto: **preço
fica só como comparação (atual vs. sugerido pela API), sem botão de
aplicar** — mexe direto em quanto o cliente paga, decisão adiada de
propósito. O que passou a ser aplicável de verdade é **ficha técnica**.

**O que foi feito:**
- `_shared/mercadolivre.ts`: novo helper `mlWrite()` (PUT/POST
  autenticado) — `mlFetch` continua só leitura.
- `ml-insights`: 2 ações novas —
  - `item_detail` — ficha técnica completa (não só o que falta),
    `/item/{id}/performance`, e `/suggestions/items/{id}/details`
    (preço sugerido, em `Promise.allSettled` isolado porque nem todo
    item tem sugestão disponível).
  - `update_item_attributes` — `PUT /items/{id}` só com os atributos que
    o usuário preencheu no formulário (ML faz merge, não sobrescreve o
    resto da ficha).
- `MlItemDetailModal.jsx` (novo) — abre ao clicar num card da Saúde dos
  Anúncios. Atributo de lista fechada (cor, material, etc.) vira
  `<select>` com as opções reais da API (nunca texto livre nesses
  casos, pra não mandar valor inválido). Botão "Salvar no Mercado Livre"
  sempre pede confirmação (`confirm(...)`) antes de escrever — **regra
  dura do projeto: nenhuma escrita no ML acontece sem clique explícito
  por item, nunca em lote/automático**.
- `MlHealthPage.jsx`: cards viram clicáveis; depois de salvar no modal,
  só a linha afetada é atualizada na lista (não re-escaneia os ~400
  anúncios de novo).
- `npm run build` limpo, `ml-insights` redeployada.

**Não testado com dado real ainda** — só quem tem login admin consegue
confirmar contra um anúncio de verdade. Plano completo (com o raciocínio
de cada decisão) em
`C:\Users\User\.claude\plans\shimmering-sparking-engelbart.md`.

**Pendência:** nada commitado ainda (Raphael pediu pra esperar ele
confirmar tudo primeiro, Fase 1 + esta parte, antes de qualquer commit
ou deploy do frontend pra Hostinger).

### 2026-08-28 — Nova categoria "Otimização ML" (Fase 1): Saúde dos Anúncios + Perguntas & Reputação

**Motivação:** depois de uma pesquisa aprofundada sobre o que a API do
Mercado Livre expõe além de pedidos (publicada como Artifact "Raio-X dos
Anúncios" — qualidade/catálogo + analytics/ads/reputação, 18 recursos
mapeados), o Raphael pediu pra começar a construir ainda no mesmo dia:
uma categoria nova no sidebar dedicada a análise/otimização de anúncios.
Plano completo salvo em
`C:\Users\User\.claude\plans\shimmering-sparking-engelbart.md` (só nesta
máquina, não está no repo).

**Escopo de hoje (Fase 1 do roteiro de 5 fases):** as 2 telas de maior
impacto × menor esforço, só leitura (nenhuma escrita no ML, nenhum
cron/tabela nova):
- **Saúde dos Anúncios** (`/ml/saude`) — status `healthy`/`warning`/
  `unhealthy` via `GET /item/{id}/performance` (sucessor do antigo
  `/health`, descontinuado) + auditoria de ficha técnica obrigatória
  (cruza `GET /items/{id}` com `GET /categories/{id}/attributes`).
- **Perguntas & Reputação** (`/ml/perguntas`) — perguntas sem resposta
  (`/questions/search`), impacto projetado de responder rápido
  (`/users/{id}/questions/response_time` → `sales_percent_increase`) e
  termômetro de reputação com alerta preventivo de taxa de cancelamento
  perto do limite (3%, ou 2% Mercado Líder).

**O que foi feito:**
- Edge Function nova `supabase/functions/ml-insights/index.ts` — **primeira
  function do projeto invocada diretamente pelo frontend**
  (`supabase.functions.invoke`), não por webhook/trigger. Reaproveita
  `getValidIntegration`/`mlFetch` de `_shared/mercadolivre.ts`. Deploy
  **com verificação de JWT ativa** (diferente de `ml-webhook`/
  `ml-oauth-callback`, que usam `--no-verify-jwt` por serem chamadas pelo
  próprio ML). Já deployada em produção.
- `src/modules/ml-insights/` — hook `useMlInsights.js` (pagina os
  anúncios ativos em lotes de 50 pra não estourar 1 chamada gigante) +
  `MlHealthPage.jsx` + `MlQuestionsReputationPage.jsx`.
- Sidebar: seção nova "Otimização ML" (cor emerald, nova — as outras 5
  seções já usavam rose/amber/violeta/azul/magenta), roles `admin` +
  `marketplace`.
- `AccessControlPage.jsx`: módulo `ml-insights` adicionado à lista, e a
  role **`marketplace` foi adicionada ao array `ROLES`** — não existia
  lá antes (só administrativo/atendimento/produção eram geridas por essa
  tela, mesmo `marketplace` já sendo usada em vários `moduleKey` do
  Sidebar). Sem isso, não teria como o Raphael liberar a categoria nova
  pra essa role pela própria tela de Controle de Acesso.
- `npm run build` limpo (só os warnings de chunk size já existentes,
  nada novo). Deploy da function testado (`supabase functions deploy
  ml-insights`, sucesso). **Não testado com dado real ainda** — só quem
  tem login admin de verdade consegue confirmar contra o painel do ML.

**Pendências imediatas:**
- Como só `admin` enxerga módulo novo por padrão (sem linha em
  `role_permissions`), falta o Raphael ir em Controle de Acesso e ligar
  `ml-insights` pra `marketplace` se quiser que esse perfil veja a
  categoria.
- Clicar em "Atualizar" nas duas telas com um usuário real logado e
  conferir contra o painel do ML — o formato exato de `/item/{id}/
  performance` não pôde ser confirmado na pesquisa (fetch direto à doc
  bloqueado), o código normaliza algumas variações plausíveis mas pode
  precisar de ajuste depois do primeiro teste ao vivo.
- `npm run build` + subir `dist/` pra Hostinger — **ainda não subido**
  (só buildado localmente pra validar). Continua pendente também o
  build anterior (ship_date/Atrasados da Fase 20, ver pendência mais
  antiga abaixo).
- Nada commitado ainda — aguardando o Raphael revisar antes do commit.
- Fases 2-5 do roteiro (conversão por anúncio, preço/buy box, Mercado
  Ads, promoções) ficam pra depois — registradas no plano salvo.

### 2026-08-27 (2ª parte) — Corrige botões de Picklist/Expedição sumidos no Histórico da Shopee

**Motivação:** Raphael confirmou o ML "perfeito" e pediu pra revisar a
Shopee — mas ao abrir o Histórico de Importações, o cartão da Shopee
tinha perdido os botões "Ver pedidos"/"Gerar Picklist"/"Expedição" e
mostrava "— pedidos no total" (travessão em vez de número).

**Causa raiz (não era bug da Shopee):** o Histórico resolve os botões de
cada cartão buscando o lote (`import_batches`) dentro da lista dos
**50 mais recentes** (`fetchBatches()`). O reprocessamento em massa do
ML de ontem (Fase 26, 345+ pedidos com datas de venda espalhadas de
13/08 até hoje) criou **637 lotes novos do ML nas últimas 24h** — um
lote novo pra cada dia-de-venda distinto que ainda não tinha lote,
porque o reprocessamento tocou pedidos de dias muito diferentes de uma
vez. Isso lotou os 50 slots inteiros com lotes do ML, empurrando os
lotes reais da Shopee (que só teve 1 lote tocado nas últimas 24h) pra
fora da janela — o cartão simplesmente não achava o lote dela pra
resolver os botões, mesmo o lote existindo normalmente no banco.

**Corrigido** (`useOrders.js` + `OrdersPage.jsx`, só frontend, nenhuma
mudança de banco/edge function):
- Nova função `fetchBatchesByIds(ids)` — busca lote por id específico,
  sem limite de 50.
- Histórico agora complementa `batches` (os 50 mais recentes) com uma
  busca direcionada por qualquer `batch_id` referenciado nos uploads
  exibidos que não estava nessa lista — resolve o cartão certo
  independente de quantos lotes outra fonte tenha criado recentemente.
- **Efeito colateral esperado e bom**: também corrige a mesma contagem
  zerada que aparecia no cartão do ML (mesmo bug, mesma causa) — não é
  uma mudança de comportamento do ML, só o mesmo conserto de exibição.

**Não precisa reimportar nada** — é só build + deploy do frontend pra
ver o conserto; os lotes da Shopee sempre estiveram corretos no banco.

### 2026-08-27 — Corrige detecção de Full (campo errado na API) + pedido antigo esquecido

**Motivação:** Raphael reportou dois problemas concretos com print do
painel do ML ao lado do nosso Expedição: 4 pedidos **Full** apareceram
no picklist de amanhã (mesmo já existindo a regra de exclusão!), e um
pedido de envio padrão de verdade pra amanhã (`#2000014512651529`) **não
apareceu em lugar nenhum**.

**Bug 1 — Full vazando pro picklist, causa raiz real:** o código lia
`shipment.logistic_type` pra decidir `is_full`. Confirmei direto na API
(fiz `GET /orders/{id}` + `GET /shipments/{id}` com o header
`x-format-new: true`, o mesmo que usamos): nesse formato, `logistic_type`
no nível raiz do shipment vem **sempre `null`** — o valor real está
aninhado em `shipment.logistic.type`. Ou seja, `is_full` nunca dava
`true` desde que foi criado (Fase 17/22) — só ficou visível agora porque
esses 4 pedidos entraram pela primeira vez direto pela API (antes vinham
majoritariamente por `.xlsx`, importado com outra lógica de Full).
**Não era um bug de ontem, era um bug latente desde o início da
integração**, mascarado até agora.

**Bug 2 — pedido antigo "esquecido":** confirmado na API — pedido real,
criado em 13/08 (item sob encomenda/prazo longo), fora da janela dos
últimos 5 dias que a Fase 23 cobriu (ela só pegou desde 21/08). Qualquer
pedido criado antes disso mas ainda em aberto (prazo de fabricação longo,
etc.) ficaria invisível pro sistema.

**Corrigido:**
- `mapOrderToCommon()`: `is_full` agora checa `shipment.logistic?.type`
  primeiro (caminho real), mantém o campo antigo como reserva. Deployado.
- Reprocessamento usando `tags=not_delivered` na busca da API (não mais
  uma janela de datas) — pega QUALQUER pedido ainda em aberto,
  independente de quando foi criado, sem risco de re-arquivar pedido já
  resolvido (`not_delivered` já exclui isso por definição). 345 pedidos
  encontrados e reenfileirados via `ml_webhook_events` (mesmo mecanismo
  da Fase 23).
- **Achado no meio do processo**: o Database Webhook trigger empacou
  num lote grande (345 de uma vez) — só ~66 processaram sozinhos em
  vários minutos, o resto ficou parado (`status='pending'`, sem erro).
  Confirmado que a função em si funciona bem quando chamada direto
  (invoquei manualmente, respondeu em ~10s) — o gargalo é a fila do
  trigger em lote grande, não o código. Contornado processando o
  restante manualmente via `Invoke-RestMethod` em lotes de 8 concorrentes
  (script `drain_webhook_queue.ps1`, temporário, não faz parte do repo).
  **Pendência técnica**: investigar por que o Database Webhook não dá
  conta de lote grande sozinho — pra próxima reimportação em massa,
  considerar já processar em lotes menores de propósito, ou usar esse
  mesmo contorno manual direto.
- Confirmados corrigidos os 5 pedidos do relato original: os 4 Full
  agora com `is_full=true`; o pedido da Adriely (`#2000014512651529`)
  já está no banco com `ship_date=2026-08-27`, batendo com o painel.
- **Resultado final do reprocessamento** (410 pedidos tocados, 0 erro
  real — os 22 "error" restantes são identificadores inválidos da minha
  primeira tentativa falha, sem pedido de verdade por trás, inofensivos):
  **58 pedidos Full** identificados corretamente entre os 329 ativos do
  ML — confirma que o bug não era só os 4 relatados, era sistêmico desde
  a criação da checagem. Atrasados do ML caiu de 23 pra **12**.

**Também esclarecido (pergunta do Raphael): botão "Fechar o Dia"** —
confirmado no código (`close_shipping_day` + `handleCloseDay` em
`ExpedicaoPage.jsx`) que é **só um registro histórico** (grava uma foto
de quantos pedidos fecharam completos/incompletos, pra auditoria). Não
move `ship_date`, não desmarca nada, não faz pedido incompleto "sumir"
nem pular de dia — o mecanismo real que evita esquecimento é o
"Atrasados" (pedido com `ship_date` passado e item não separado
continua aparecendo lá, dia após dia, até ser resolvido ou arquivado).

### 2026-08-26 (5ª parte) — Alinhamento da Shopee: revisão do fluxo + arquivamento do histórico morto

**Motivação:** com o ML confirmado funcionando perfeitamente (Raphael:
"aparentemente deu tudo certo, está perfeito"), partimos pra Shopee —
mesmo pedido de "vamos alinhar" que abriu o trabalho do ML.

**Revisão do fluxo Shopee (`parseShopeeXlsx`/`saveImportedOrders` em
`useOrders.js`) — boa notícia, sem bug estrutural:**
- O parser já agrupa itens de um mesmo pedido pelo "ID do pedido" DENTRO
  do próprio arquivo, antes de qualquer insert — não existe o problema
  de fragmentação que o ML tinha (pack virando N pedidos).
- Item só é inserido quando o PEDIDO é genuinamente novo
  (`wasInsertedByNum`) — pedido que já existia nunca tem os itens
  retocados, mesmo reimportando um arquivo com intervalo de datas
  sobreposto. Isso evita o exato bug de duplicação que achamos no ML
  (Fase 24): lá o problema era um pedido já existente sendo "re-tocado"
  por uma segunda fonte com id diferente; aqui isso não acontece porque
  o gate é por pedido inteiro, não por sub-identificador. **Nenhuma
  mudança de código necessária.**
- `ship_date`/corte: já correto desde a Fase 20/22 — Shopee usa
  `shipping_deadline` (a "Data prevista de envio" do próprio arquivo),
  nunca corte de horário.

**Achado real: 673 "atrasados" da Shopee eram quase todos históricos,
mas não uniformemente** — distribuição por `ship_date`:
- 465 de julho/2025 (mais de 1 ano).
- 29 de 30-31/07/2026.
- 172 concentrados entre 06/08 e 14/08/2026 (cluster incomum — só
  8 pedidos entre 17/08 e 24/08, bem menor).

Perguntei ao Raphael se a equipe marca "separado" (picked) pra Shopee do
mesmo jeito que faz pro ML — confirmou que sim. Mesmo assim, decidiu
arquivar tudo com `ship_date < 2026-08-15` (Fase 23 usa arquivamento
igual — flag, nunca `DELETE`).

**`supabase/fase25-arquivar-shopee-antigo.sql`** (rodada, é `UPDATE`,
não bloqueada pro Claude Code): arquivou 723 pedidos Shopee (`ship_date
< 2026-08-15`), deixou 348 ativos. Badge de Atrasados caiu de ~673+
pra **7 (Shopee) + 23 (ML) + 4 (manual) = 34 no total**.

**Observação registrada, não é bug novo:** os 23 "atrasados" do ML são
esperados — são pedidos dos dias 21-25/08 que a Fase 23 recriou do zero
via API (fisicamente já enviados na vida real), mas cujos itens nascem
com `picked = false` por padrão, já que o sistema não tem como saber que
já foram separados fisicamente antes de hoje. Não precisa de ação —
vai sumir sozinho conforme a equipe for revisando/marcando, ou pode ser
arquivado manualmente se quiser encerrar mais rápido.

### 2026-08-26 (4ª parte) — Corrige duplicação de item causada pela própria reimportação da Fase 23

**Motivação:** Raphael testou a Fase 23 e confirmou que a contagem bateu
certinho com o painel do ML (7 hoje, dia 28 certo) — "acho que achamos o
caminho" — mas reportou itens duplicados em alguns pedidos (ex: Camilla
Fernandes mostrando 10 itens quando deveriam ser 5 produtos distintos,
cada um aparecendo 2x).

**Causa raiz (confirmada direto no banco, não suposição):** a
reimportação via API tocou pedidos que JÁ EXISTIAM antes (importados por
`.xlsx`, ou criados pelo webhook de antes da Fase 22). Pra esses
pedidos, `order_items.source_order_id` tinha sido preenchido
retroativamente na Fase 22 com o `num_venda` do pedido — só que pra
pedido desse tipo, `num_venda` é o número da VENDA (pack_id), não o
`order.id` individual que a API devolve pra cada produto. O gate "esse
produto já entrou?" comparava exatamente por esse id, nunca batia, e
reinseria o item de novo — 1 duplicata por produto já tocado.

**Segundo achado, durante a limpeza:** nem todo par duplicado tinha
`sku+variação` idênticos em string — o `.xlsx` antigo grava a variação
como `"Cor : Amadeirado"` (espaço antes do `:`) e a API grava
`"Cor: Amadeirado"` (sem espaço) pro MESMO produto. Comparação exata de
string deixaria passar 11 dos 32 pares reais (confirmado: par do Caio
Raváglia, sku `TER-60-C-AMD`). ML controla os dois formatos (xlsx e API)
de jeitos diferentes e sem aviso — por isso a normalização usada é ampla
(espaço + caixa), não uma lista de casos específicos.

**Corrigido** (`ml-process-webhook/index.ts`, já reimplantada 3x hoje —
2 iterações até fechar a normalização certa):
- Gate de duplicidade trocado de "esse `source_order_id` já foi visto"
  pra "esse produto (`sku`+`variação`, normalizado sem espaço e em minúsculo)
  já foi gravado nesse pedido" — identidade que não muda dependendo de
  como o pedido entrou no sistema (xlsx vs webhook vs API).
- `supabase/fase24-limpa-itens-duplicados-reimport.sql` (criada, **ainda
  não rodada** — ação destrutiva bloqueada pro Claude Code, precisa ser
  manual no SQL Editor do Supabase): limpa os 32 pares já duplicados pela
  Fase 23 (mantém a linha mais antiga de cada par, apaga a duplicata mais
  nova), e recalcula `total_items` dos lotes ML afetados.

**Pendência imediata:** rodar `fase24-limpa-itens-duplicados-reimport.sql`
manualmente — sem isso, os 32 pares continuam duplicados na tela (a
correção do código só impede duplicata NOVA daqui pra frente, não limpa
a que já foi criada pela Fase 23).

### 2026-08-26 (3ª parte) — Arquiva todos os pedidos ML e reimporta do zero via API

**Motivação:** mesmo depois da Fase 22 (pacote + prazo real), Raphael
mandou print do painel real do ML: **7 envios pra hoje**, nada mais. O
Expedição do sistema mostrava **17 pedidos + badge "603 atrasados"**.
Diagnóstico: pedidos-pacote fragmentados de ANTES da Fase 22 continuavam
na base como cartões-fantasma separados (ex: Camilla Fernandes duplicada
em 5 cartões), e o badge de atrasados — feature nova, funcionando como
projetado — estava corretamente expondo um acúmulo histórico nunca
limpo (maioria Shopee antigo, que nem é o escopo de hoje). Raphael
decidiu: não vale consertar pedido por pedido do passado — **arquivar
tudo que é ML e recomeçar do zero puxando da API**, já que a equipe de
produção está usando o próprio painel do ML como plano B enquanto isso.

**O que foi feito** (`supabase/fase23-arquivar-pedidos-ml.sql`):
- Nova coluna `orders.archived BOOLEAN DEFAULT false` — arquivar é só
  uma flag, **nunca DELETE** (ação destrutiva sempre bloqueada pro
  Claude Code rodar sozinho, e de todo jeito preserva dado/histórico).
- `UPDATE orders SET archived = true WHERE source = 'ml'` — os 174
  pedidos ML existentes (fragmentados ou não) saem das telas
  operacionais de uma vez.
- `upsert_orders_safe()`: `DO UPDATE SET archived = false` — qualquer
  pedido tocado de novo (reimport ou webhook normal futuro) desarquiva
  sozinho, sem precisar de passo manual extra daqui pra frente.
- `useShipping.js`: `fetchShippingOrders`/`fetchShippingDayCounts`/
  `fetchOverdueOrders`/`resolveBatchId` agora filtram `archived = false`.
  **Reporting (`useOrdersReports.js`) e a aba Pedidos principal NÃO
  filtram archived** — de propósito, pra não afetar relatório mensal de
  vendas nem esconder histórico.

**Reimportação via API** (sem escrever lógica nova de processamento):
peguei o `access_token` de `ml_integration`, busquei via
`/orders/search?seller=...&order.date_created.from=...` os pedidos reais
dos últimos 5 dias (89 no total, paginado), e inseri um evento sintético
por pedido em `ml_webhook_events` (`topic: 'orders_v2', resource:
'/orders/{id}'`) — o Database Webhook já existente disparou o
`ml-process-webhook` (já corrigido na Fase 22) pra cada um sozinho, sem
precisar duplicar nenhuma lógica de merge/prazo. 88/89 processaram
automaticamente em ~30s; 1 ficou "pending" sem erro (a chamada do
Database Webhook parece ter falhado silenciosamente pra esse) — invoquei
a function manualmente pra esse único caso e completou normal.

**Resultado confirmado:**
- Hoje (26/08) mostra **exatamente 7 pedidos** — bate 100% com o painel
  do ML. Camilla Fernandes agora é 1 pedido só com 10 itens (era 5
  cartões fragmentados).
- Nenhum pedido `is_full` entre os 7 (regra de excluir Full do picklist
  confirmada intacta).
- Shopee **intocado**: 1065 pedidos, contagem idêntica à de antes —
  escopo era só ML, por pedido explícito do Raphael.
- ML: 69 pedidos ativos (não-arquivados, todos vindos da reimportação) +
  128 arquivados (o total cresceu de 174 pro combinado porque pedidos-
  pacote fragmentados viraram novas linhas consolidadas por `pack_id`,
  as antigas ficam arquivadas como histórico morto).

**Pendência que fica pra trás:** a partir de agora, todo pedido novo ML
chega por webhook normal — já correto (Fase 22) e já desarquivado
(`upsert_orders_safe`). Não é preciso repetir esse processo de novo.

### 2026-08-26 (2ª parte) — Pacote do ML vira 1 pedido só + prazo de envio real (não mais estimado)

**Motivação:** Raphael mostrou um caso real — uma venda com 3 produtos
(pacote) tinha virado 3 "pedidos" separados no sistema, cada um com 1
item, todos "Pendente" e escalados pra hoje. No painel real do ML, essa
venda tem prazo de envio pra **28/08** (3 dias, não hoje). Investiguei
direto na API do ML (usando o token já conectado, sem precisar pedir pro
Raphael nada) e confirmei dois campos reais que nunca tínhamos capturado.

**Achados confirmados na API (não é suposição):**
- `order.pack_id` = `2000014711473185` — bate exatamente com o número da
  venda no painel do ML. É o identificador real que une os produtos de
  uma mesma venda; `order.id` (o que usávamos como num_venda) é só o id
  de cada PRODUTO dentro do pacote.
- `shipment.lead_time.buffering.date` = `2026-08-28` — bate exatamente
  com "Para enviar no dia 28" do painel. Comparei com 2 pedidos normais
  (não-pacote) pra confirmar o padrão: prazo normal costuma bater com o
  corte de 11h, mas pacote/envio mais lento pode dar vários dias — o ML
  já sabe disso, a gente só nunca tinha capturado.

**O que foi corrigido** (`supabase/fase22-ml-pacote-e-prazo-real.sql` +
`ml-process-webhook/index.ts`, já reimplantada):
- `compute_ship_date()` agora prioriza esse prazo real do ML também
  (antes só priorizava pra Shopee) — só cai pro corte de horário quando
  não vem (pedido importado por `.xlsx`, que não tem esse dado).
- `mapOrderToCommon()`: quando `order.pack_id` existe, usa ele (não
  `order.id`) como `num_venda` — todos os produtos do mesmo pacote caem
  no MESMO pedido.
- Trocado o gate de "insere item só se o pedido é novo" por "insere item
  só se **esse produto específico** ainda não tinha entrado" (nova coluna
  `order_items.source_order_id`, guarda o `order.id` individual de cada
  produto) — sem isso, só o 1º produto do pacote entraria, os outros 2
  seriam descartados por "pedido já existe".
- **Backfill retroativo obrigatório**: todo item já existente ganhou
  `source_order_id` preenchido (= `num_venda` do próprio pedido) — sem
  isso, o PRÓXIMO webhook em QUALQUER pedido normal (não só pacote)
  reinseriria os itens do zero, reproduzindo a duplicação corrigida ontem
  por um caminho diferente. Rodado ANTES do deploy da function.
- Conserto pontual: os 3 pedidos já quebrados da venda `2000014711473185`
  foram consolidados em 1 só (`num_venda`/`pack_id` = o pack_id real,
  `shipping_deadline`/`ship_date` = 28/08, os 3 itens juntos, cada um
  marcado com seu `source_order_id` original).
- Confirmado (não mudou, só reforcei): pedido Full continua excluído do
  picklist em `useShipping.js`/`PickListShopee.jsx` — aparece só na aba
  Pedidos, pra saber que vendeu.

**Pendências conhecidas:**
- **Não testado ao vivo ainda** com um pacote novo de verdade (nenhum
  chegou depois do deploy) — testado só via chamada direta à API antes
  de codar. Confirmar no próximo pacote real que vira 1 pedido só.
- **Outros pedidos-pacote antigos NÃO foram consolidados** (só o da
  Marirhem) — pra fazer isso precisaria chamar a API do ML de novo pra
  cada um e descobrir o pack_id real (não temos isso salvo
  retroativamente). Menor urgência, pedidos já mais antigos.
- Shopee: nada mexido ainda — combinado com o Raphael de arrumar o ML
  primeiro.

---

### 2026-08-26 — `ship_date`: reconstrução da regra de "que dia é esse pedido", fim das 5 implementações divergentes

**Motivação:** mesmo depois de tudo que foi corrigido em 25/08, surgiu
MAIS um bug do mesmo tipo: um pedido Shopee foi pro dia errado na
Expedição (arquivo `Order.toship...` de hoje, pedido caiu em "ontem").
Raphael cogitou refazer o Picklist/Expedição do zero — a investigação
mostrou que não precisava reescrever a tela, só trocar uma peça
específica: "que dia esse pedido pertence" era decidido em pelo menos 5
lugares diferentes do código (duas cópias de `mlBatchDayStart()`, o
`pickDayKey()` do Histórico, e o filtro de `shipping_deadline`/`isToday`
da Expedição, cada um calculando por conta própria). A causa exata de
hoje: o pedido Shopee foi guardado num `batch_id` calculado pela DATA DE
COMPRA, mas a Expedição filtrava por `shipping_deadline` (campo
diferente) — nunca iam bater.

**Regra confirmada com o Raphael:**
- **ML**: corte configurável (default 11h de Brasília) sobre a hora real
  da compra (`data_venda`).
- **Shopee**: usa literalmente a "Data prevista de envio" que a própria
  Shopee manda no arquivo (`shipping_deadline`) — SEM corte de horário
  nenhum. Confirmado explicitamente (não é suposição) — Raphael escolheu
  essa opção quando perguntado diretamente.
- Manual: dia da própria criação.

**O que foi feito** (`supabase/fase20-ship-date-corte-unico.sql`, já
rodado em produção via `supabase db query --linked`):
- Tabela `platform_cutoff_settings (source, cutoff_hour)` — só a linha
  `ml` importa hoje (Shopee não usa corte, mas a tabela já é genérica
  pra quando ela tiver API própria).
- Coluna `orders.ship_date DATE NOT NULL` — a fonte única de verdade.
- Função `compute_ship_date(source, data_venda, shipping_deadline)` — a
  regra escrita **uma vez só, no banco**, não em JS/TS.
- Trigger `BEFORE INSERT ON orders` que preenche `ship_date` sozinho em
  QUALQUER jeito de inserir pedido (`upsert_orders_safe` — cobre xlsx e
  webhook — e `createManualOrder`), sem precisar editar essas funções.
  **Confirmado funcionando ao vivo**: pedido Shopee inserido depois da
  migração já saiu com `ship_date` certo, sem precisar redeployar a
  `ml-process-webhook`.
- Backfill: todo pedido já existente (ML desde jun/2025, Shopee desde
  jul/2025, ~1250 pedidos) ganhou `ship_date` calculado pela própria data
  real de cada um.
- `useShipping.js` (`fetchShippingOrders`, `fetchShippingDayCounts`):
  agora filtram por `(source, ship_date)` direto — removido o filtro
  antigo de `shipping_deadline`/`isToday` que causava o bug de hoje.
- Nova `fetchOverdueOrders()` + badge permanente "⚠️ N atrasados" na
  Expedição, **independente** de qual dia/lote está aberto — pedido com
  `ship_date` passado e ainda não separado nunca mais fica invisível só
  porque ninguém voltou a olhar um dia antigo.
- `ExpedicaoPage.jsx`: resolve a plataforma do lote da URL uma vez, e a
  navegação por dia (setas/data) busca direto por `source + ship_date` —
  não fica mais presa a um único `batch_id`. Nova `resolveBatchId()`
  (workaround temporário, ver Fase 3) resolve o lote "mais provável" pra
  ações que ainda dependem de `batch_id` (Fechar o Dia, Meta de Sábado).
- `OrdersPage.jsx`: Histórico agora agrupa pelo `ship_date` real dos
  pedidos de cada lote (nova `fetchBatchShipDates()` em `useOrders.js`),
  não mais pela hora do upload/criação do lote. `pickDayKey()` apagado.
- Novo botão ⚙️ (só admin) na aba Histórico → `CutoffSettingsModal.jsx`,
  pra trocar o corte do ML sem precisar de deploy. Deixa claro na própria
  tela que a mudança **não é retroativa**.
- `PickListShopee.jsx` — conferido, não precisou mudar nada (já filtrava
  só por `batch_id`, sem lógica de data própria).

**Pendências conhecidas:**
- **Fase 3 (não urgente)**: `import_batches` ainda não é exato por
  `(source, ship_date)` — um lote antigo pode ter pedido de vários dias
  (resíduo indo até maio/2025, confirmado ontem). Isso não afeta mais o
  que aparece na tela (já corrigido), só a precisão de `batch_id` usado
  em Fechar o Dia/Meta de Sábado/histórico de fechamentos (usam
  `resolveBatchId()` como workaround por enquanto). Ponto de atenção pra
  quando fizer essa fase: `picklist_gathering` tem chave única
  `(batch_id, item_key, target_date)` — consolidar lotes duplicados pode
  colidir, precisa checar antes de rodar.
- **Ainda falta rebuildar e subir o site pra Hostinger** — o banco já
  está correto e funcionando (confirmado com pedido real), mas a
  interface nova (badge de Atrasados, config de corte, Histórico
  agrupado certo) só aparece depois do deploy do frontend.
- **Não mexi** em `ml-process-webhook/index.ts` nem em `useOrders.js` —
  `mlBatchDayStart()`/`dayStartForOrder()` continuam lá e continuam
  rodando, ainda são usados pra decidir o `batch_id` (agrupamento de
  upload/produção), só não são mais usados pra decidir o que aparece na
  Expedição/Picklist (isso agora é só `ship_date`). Viram de fato código
  morto só depois da Fase 3, quando `import_batches` passar a ser exato
  por `(source, ship_date)` e o `batch_id` puder ser resolvido direto por
  esse par em vez de uma janela de tempo calculada.

---

### 2026-08-25 — Acesso ao Supabase liberado + causa raiz #2 (janela sem limite superior) + consolidação manual de hoje/ontem

**Mudança de ferramental importante:** o Raphael rodou `supabase link
--project-ref lcybmdiqxmbqeuyeuhdj` na máquina dele, e a partir daí o
Claude Code (rodando na mesma máquina) passou a ter acesso de leitura/
escrita ao banco de produção via `supabase db query --linked "<sql>"`
(usa a API de gerenciamento, não precisa de Docker nem senha direta).
Isso permitiu investigar e corrigir tudo abaixo direto no banco, em vez
de pedir pro Raphael rodar SQL manualmente. **Atenção**: ações
destrutivas (`DELETE`) são bloqueadas automaticamente pelo classificador
de segurança do Claude Code — precisa ser rodado manualmente pelo
usuário nesse caso (não é uma limitação do acesso em si, é uma trava de
segurança). `UPDATE` passou sem bloqueio.

**Descoberta — auditoria dos itens duplicados confirmou a causa:** rodei
a query de auditoria do `fase19` — só existiam 7 pares de item duplicado
em todo o banco, todos com exatamente 2 cópias. Raphael confirmou:
são bug de importação mesmo (ML nunca manda o mesmo item 2x quando o
cliente compra 2 unidades — manda com `qty=2`, nunca 2 linhas de
`qty=1`). Bate exatamente com a condição de corrida que a correção de
hoje (RPC atômica `upsert_orders_safe`) já elimina daqui pra frente.
**Ainda não apaguei os 7 duplicados** — o `DELETE` foi bloqueado pelo
classificador; o Raphael precisa rodar manualmente a query 2 do
`supabase/fase19-cleanup-duplicate-items.sql`.

**Causa raiz #2 encontrada (bug novo, introduzido pela minha própria
correção de hoje mais cedo — não existia antes):** a busca por "lote já
existe pra esse dia" (`useOrders.js` e `ml-process-webhook/index.ts`)
filtrava só `imported_at >= início_da_janela`, **sem limite superior**.
Isso significa que um lote criado há pouco pra hoje era encontrado e
reaproveitado por engano por um pedido de DIAS atrás (qualquer
`imported_at` recente sempre bate num filtro só de "maior ou igual").
Corrigido adicionando `.lt('imported_at', fim_da_janela)` nos dois
lugares. Já buildado, commitado, e a function `ml-process-webhook` já
foi reimplantada com a correção.

**Consolidação manual do estrago já feito (achado ao vivo, direto no
banco):** o picklist de HOJE estava espalhado em 3 `batch_id` diferentes
(um deles — `67a1b8b3` — um "lote-caixote" que vinha acumulando pedidos
desde **11 de agosto**; outro — `a83c4f6b` — desde **3 de maio**!). Por
isso os pedidos que a Carol já tinha separado sumiam do link de
Expedição de hoje: eles estavam num `batch_id` diferente do que o link
abria. O mesmo aconteceu com ONTEM (pedidos espalhados em 2 lotes).
Movi manualmente (via `UPDATE orders SET batch_id=...` direto no banco,
só os pedidos cuja `data_venda` realmente cai na janela de cada dia) e
recalculei os totais dos lotes afetados:
- **Hoje** (`data_venda` entre 24/08 11h e 25/08 11h UTC): consolidado
  em `d4dcb6b1-da10-4fdf-90cb-1f144707197a` — 19 pedidos, 12/21 itens já
  separados (preservado).
- **Ontem** (23/08 11h a 24/08 11h UTC): consolidado em
  `67a1b8b3-69d0-4bbb-8b42-023b6cae3814` — 30 pedidos, 25/37 itens já
  separados (preservado).

**Bug relacionado também corrigido:** os botões "Gerar Picklist"/
"Expedição"/"Ver pedidos" em `OrdersPage.jsx` escolhiam o lote do
**evento de importação cronologicamente mais antigo do dia**
(`sorted[0].batch_id`), não o lote que de fato tinha os pedidos —
então mesmo depois de eu consolidar tudo, o botão podia continuar
apontando pro lote errado (agora vazio). Corrigido pra escolher, entre
os lotes candidatos do dia, o que tem mais `total_orders` de verdade.

**Pendências conhecidas:**
- Rodar o `DELETE` do `fase19` manualmente (7 itens duplicados, já
  auditados e confirmados como bug).
- **Contaminação histórica mais antiga NÃO foi limpa** (fora do escopo
  de hoje/ontem): `67a1b8b3` ainda tem pedidos de 11/08 a 22/08
  misturados; a antiga `a83c4f6b` e a `d37d300c` também têm pedidos
  avulsos de datas variadas (maio, início de agosto). Não deve afetar a
  operação do dia a dia (pedidos antigos presumivelmente já
  resolvidos/enviados), mas fica sujo pra quem for auditar. Um
  faxina completa exigiria reprocessar TODOS os pedidos ML antigos,
  recalculando o `batch_id` correto de cada um pela própria
  `data_venda` — não fiz isso hoje por ser um volume grande de dado de
  produção pra mexer de uma vez sem necessidade operacional imediata.
- **Ainda falta rodar `npm run build` + subir `dist/` pra Hostinger**
  com a correção do botão de Gerar Picklist/Expedição (a consolidação
  no banco já vale independente disso, mas o botão só escolhe o lote
  certo sozinho depois do novo build estar no ar — até lá, usar os
  links diretos acima).
- Segue pendente a Fase 0 do pedido em pacote ML (Design A/B) e a
  constraint `UNIQUE(source,num_venda)` já **confirmada existente**
  em produção (`orders_source_num_venda_key`) — isso já não é mais
  incerteza, só falta decidir o caso do pacote.

---

### 2026-08-25 — Histórico de importações agrupava pela hora do upload (bug separado, corrigido) + itens duplicados dentro do pedido (residual, aguardando limpeza)

**O que aconteceu:** depois da correção de causa raiz (entrada abaixo),
Raphael testou em produção e reportou dois problemas novos:
1. Um upload feito às 16h27 (depois das 11h) apareceu inteiro na seção
   "QUARTA-FEIRA, 26 DE AGOSTO" (amanhã) no Histórico de Importações,
   mesmo contendo pedidos comprados antes das 11h de hoje.
2. Duas tasks/pedidos (`#2000018111839528`, `#2000018111841230`)
   mostraram o MESMO item duas vezes na Expedição.

**Problema 1 — causa raiz encontrada e corrigida:** era um bug
DIFERENTE do que já tinha sido corrigido, num trecho de código que eu
ainda não tinha tocado. `OrdersPage.jsx` agrupa os cards do Histórico
por dia usando `pickDayKey(ev.imported_at, ev.source)` — só que
`ev.imported_at` é a hora do UPLOAD (evento de importação), não a hora
da venda dos pedidos daquele upload. Um upload às 16h27 sempre caía na
seção de amanhã, mesmo que a maioria dos pedidos dentro dele fosse de
antes das 11h (e já estivesse corretamente no lote de hoje, graças à
correção da causa raiz). Ou seja: o `batch_id`/picklist real dos
pedidos já podia estar certo — só a ETIQUETA visual do card no
Histórico é que mentia. Corrigido: agora agrupa pela data de criação do
**lote** (`import_batches.imported_at`), que — depois da correção da
causa raiz — reflete corretamente o dia real daquele lote.

**Problema 2 — provavelmente resíduo de ANTES da correção, não
confirmado ainda:** a correção de hoje impede um pedido de ter seus
itens inseridos duas vezes daqui pra frente (só insere item pra pedido
genuinamente novo). Itens duplicados numa task específica hoje são
consistentes com terem sido criados ANTES do fix, quando um pedido
podia ter o `batch_id` reatribuído e — dependendo da sequência exata —
seus itens reinseridos. Criado `supabase/fase19-cleanup-duplicate-items.sql`
com (1) uma query de auditoria pra ver o tamanho real do problema, e
(2) um script de limpeza comentado de propósito (só roda se alguém
descomentar conscientemente) que mantém a cópia já separada (`picked`)
ou a mais antiga, e apaga o resto.

**Pendências:**
- Rodar a query de auditoria do `fase19` e decidir se roda a limpeza.
- Ainda falta confirmar se `ml-process-webhook` foi reimplantado
  (`supabase functions deploy ml-process-webhook`) — sem isso, pedidos
  que chegam pela API continuam usando a lógica antiga.
- Segue pendente a Fase 0 (constraint `UNIQUE(source,num_venda)`,
  contagem de duplicatas em `orders`, caso do pedido em pacote do ML) —
  ver entrada anterior.

---

### 2026-08-25 — Pedidos/Picklist/Expedição: causa raiz do sumiço/duplicação corrigida, histórico de expedição criado, Picklist Virtual descontinuado

**Motivação:** Raphael reportou três problemas no mesmo dia: pedido do ML
duplicado (`#2000018101859182`), pedido comprado antes das 11h "pulando"
pro picklist do dia seguinte, e o mais grave — pedidos já marcados como
"pronto" sumindo inteiramente da tela de Expedição, sem histórico nenhum
pra provar que existiram. Pedido explícito: máxima prioridade em
correção, mesmo que demore, "um deslize aqui pode afetar nossa reputação
nas plataformas de venda". Também decidido: parar de usar/manter o
Picklist Virtual, focar só em "Gerar Picklist" + "Expedição".

**Investigação** (3 agentes de exploração + 1 de design, todos read-only,
antes de qualquer mudança de código): achada a causa raiz ÚNICA dos três
sintomas.

**Causa raiz:** em `useOrders.js` (import manual) e
`ml-process-webhook/index.ts` (webhook do ML), a função que calcula o
"dia de picklist" (corte às 11h de Brasília) era sempre chamada **sem
argumento** — usava a hora de AGORA (hora do upload / hora em que o
webhook processa), nunca a hora real da venda, que já estava disponível
mas nunca era passada adiante. Pior: o `batch_id` do pedido era
regravado **sem condição** em todo upsert, inclusive pra pedido que já
existia. Resultado: pedido comprado às 9h podia ser corretamente
colocado no lote certo na 1ª vez, e depois "pulado" pro lote de amanhã
quando um novo status do ML chegava à tarde (ou numa reimportação do
xlsx depois das 11h) — e como Expedição/Picklist filtram por `batch_id`
exato, o pedido literalmente sumia da tela antiga.

**O que foi corrigido:**
- `supabase/fase18-shipping-history.sql` (migração nova, só aditiva):
  - `orders.pack_id` (agrupamento visual de pacote ML) e
    `orders.needs_attention` (pedido cancelado depois de já ter item
    separado — não esconde mais, mostra com aviso).
  - Função `upsert_orders_safe(p_orders jsonb)` — substitui o
    `.upsert()` direto nos dois caminhos de gravação. **Protege**
    `batch_id`/`data_venda` de pedido que já existe (nunca mais
    reatribui o dia dele numa reimportação/re-sync); atualiza status,
    rastreio, dados do comprador normalmente. Devolve `was_inserted`
    (via `xmax=0`), eliminando a corrida que existia entre um SELECT de
    pré-checagem e o upsert em si.
  - Tabelas `shipping_day_closures` + `shipping_order_closures` —
    histórico de expedição de verdade, append-only/versionado (fechar o
    dia de novo cria nova versão, nunca sobrescreve). Função
    `close_shipping_day(...)` grava tudo em transação.
- `useOrders.js`: pedidos de um mesmo arquivo agora são agrupados pelo
  DIA DA PRÓPRIA VENDA de cada um (não mais um lote único pro arquivo
  inteiro) — upload feito à tarde não joga mais pedido da manhã pro dia
  seguinte.
- `ml-process-webhook/index.ts`: corte de dia agora usa
  `order.date_created` (data real da venda) em vez da hora de
  processamento do webhook.
- `useShipping.js` + `ExpedicaoPage.jsx`: pedido cancelado com item já
  separado (`needs_attention`) não some mais da tela — aparece com aviso
  vermelho "CANCELADO APÓS SEPARADO — VERIFICAR" e um botão "Marcar como
  revisado". Botão novo "Fechar o Dia" grava o histórico (quantos
  fecharam, quantos ficaram incompletos, quais itens faltaram em cada
  um) e botão "Histórico" mostra os fechamentos anteriores.
- Picklist Virtual removido por completo (`PicklistVirtualPage.jsx`,
  rota `/pick-list/virtual`, botão na tela de Pedidos). As 3 funções de
  controle de embalagem que ele continha (`fetchPackagingBoxes`,
  `fetchOrderPackaging`, `confirmOrderPackaging`) — que a Expedição usa
  de verdade e não tinham nada a ver com a página removida — foram
  movidas pra `src/modules/shipping/hooks/usePackaging.js`.

**Pendências conhecidas (não mexidas ainda, de propósito):**
- **Falta rodar a "Fase 0" de verificação no banco ao vivo** (não tenho
  acesso de leitura ao Supabase de produção desta máquina — MCP e CLI
  aqui estão logados em outras contas). Precisa: confirmar se a
  constraint `UNIQUE (source, num_venda)` existe mesmo em produção
  (nenhum `.sql` commitado cria ela, só o código depende dela via
  `onConflict`); contar duplicatas `(source, num_venda)` existentes;
  contar quantos pedidos estão hoje com `batch_id` errado; puxar o
  pedido `#2000018101859182` (banco + API do ML) pra decidir a correção
  do caso "pacote" (ver abaixo).
- **Caso "pedido em pacote do ML" NÃO foi corrigido ainda**: o parser do
  `.xlsx` junta os itens de um pacote numa única linha de pedido usando
  o número da linha-resumo; a API trata cada pedido do pacote
  separadamente com o próprio id. Se esses números não baterem pro mesmo
  pacote, pode gerar uma duplicata de verdade em `orders` — precisa dos
  dados reais (Fase 0) pra decidir se o certo é o `.xlsx` passar a gerar
  uma linha por item (como a API já faz) ou o contrário.
- Depois que a Fase 0 confirmar os números: limpar duplicatas existentes
  caso a caso, só então criar a constraint `UNIQUE (source, num_venda)`
  de fato, e corrigir o `batch_id` dos pedidos hoje mal-alocados
  (restrito a pedidos ainda não totalmente separados).
- **Ainda não testado em produção** — precisa rodar
  `supabase/fase18-shipping-history.sql` no SQL Editor do Supabase e
  fazer o deploy de `ml-process-webhook` (`supabase functions deploy
  ml-process-webhook`) antes do código novo funcionar de verdade.

Plano completo (7 fases, todas as decisões técnicas justificadas) salvo
localmente em `C:\Users\User\.claude\plans\iridescent-fluttering-frost.md`
nesta máquina — não está no repo (é específico da sessão do Claude Code).

---

### 2026-08-25 — Bug: co-responsável não era salvo no Kanban Operacional

**O que era:** ao editar uma task no Kanban Operacional, definir/trocar o
co-responsável e salvar, ao reabrir a task o co-responsável tinha sumido.
Raphael notou isso testando a mudança de visibilidade (item acima) já em
produção.

**Causa raiz:** os dois pontos de salvar do modal (`handleSave` e
`ensureTaskSaved`, em `KanbanOperacionalPage.jsx`) chamavam
`onSave(dados)` sem passar o estado `assignees` como segundo argumento.
A função `saveTask(data, assigneeIds=[])` do componente pai sempre
**apaga** os `task_assignees` da task antes de reinserir — como
`assigneeIds` chegava `[]` (valor default, nunca o estado real), a
reinserção nunca acontecia. O Kanban da Diretoria (`KanbanPage.jsx`) já
fazia isso corretamente (`onSave(dados, assignees)`) — foi só o
Operacional que ficou faltando esse argumento.

**Corrigido:** os dois `onSave(...)` em `KanbanOperacionalPage.jsx` agora
passam `assignees` como segundo argumento, igual ao board da Diretoria.

**Pendência de teste:** corrigido e buildado, mas ainda não confirmado
manualmente em produção (o Raphael reportou o bug depois do deploy
anterior) — testar: colocar co-responsável, salvar, reabrir a task,
confirmar que continua lá.

---

### 2026-08-25 — Kanban Operacional: visibilidade total, filtro de setor restrito à diretoria

**Motivação:** co-responsáveis de setores diferentes (ex: alguém do
administrativo/escritório com alguém da produção na mesma task) perdiam a
task da própria lista, porque a visibilidade era travada por setor —
quem não era do setor da task simplesmente não a via, mesmo estando
atribuído como responsável ou co-responsável. Decisão do Raphael com o
sócio: simplificar — todo mundo vê a task de todo mundo no Kanban
Operacional (inclusive as que estão com a diretoria em QA/aprovação), e
quem restringe por setor lá em cima é só a diretoria mesmo.

**O que foi feito** (`src/modules/kanban/KanbanOperacionalPage.jsx`):
- Removida a restrição de visibilidade por setor no `load()` — antes,
  papel `escritorio` só via o próprio setor, `marketplace` só via
  marketplaces/geral, e quem não tinha `canSeeAtendimento` não via
  atendimento/marketplaces. Agora todo mundo carrega todas as tasks do
  Kanban Operacional. `mySector`/`escritorioSector` continuam existindo,
  mas só pra permissão de edição (`canEdit`, `assignableUsers`), não pra
  esconder task da lista.
- Barra de filtro por setor (Produção/Atendimento/Marketplaces/
  Administrativo/Advocacia/Marcas e Patentes) agora só aparece pra
  `user.role === 'admin'` (era `canSeeAtendimento`, que incluía
  administrativo e atendimento também). Pra todo mundo mais, some a
  barra — fica só o filtro por responsável.
- Filtro por responsável agora começa com o próprio usuário selecionado
  (`filter.assigned` default `user.id`, antes era `''`/"Todos"). Pra ver
  tudo ou de outra pessoa, troca manualmente no filtro.
- O filtro por responsável agora também considera co-responsável
  (`task_assignees`), não só `assigned_to` — a query do `load()` passou a
  trazer `assignees:task_assignees(user_id)` junto com cada task.

**Testado**: build de produção limpo e conferido manualmente no navegador
pelo Raphael (`npm run dev`) — comportamento confirmado ok antes do commit.

**Pendências conhecidas:**
- Mudança feita só no Kanban **Operacional**. O Kanban da Diretoria
  (`KanbanPage.jsx`) não tinha essa restrição de setor pra começo de
  conversa, então não foi mexido.
- Permissões de **edição** (mover status, editar, apagar) continuam
  travadas por setor como antes (`canEdit`, guards de `moveTask`/
  `dropTask`/`deleteTask`) — só a *visibilidade* mudou. Se no futuro
  quiserem que qualquer um também possa mexer em task de outro setor,
  isso é uma decisão separada, ainda não tomada.

---

### 2026-08-25 — Projeto entrou pro git, repositório no GitHub, chave vazada removida

**O que foi feito:**
- Repositório git inicializado localmente (não existia versionamento antes
  disso). `.env.local`, `.claude/` (config/estado local do Claude Code) e a
  pasta `jogar fora/` (backups) ficam fora do versionamento.
- Criado `CLAUDE.md` na raiz — lido automaticamente por qualquer sessão do
  Claude Code aberta nesta pasta, com contexto de stack/estrutura e um
  aviso apontando pra este arquivo (`coisapet.md`) como o log de "onde
  paramos".
- Repositório remoto criado no GitHub: `shanchi2/sistema-coisapet` (privado).
  Push feito com sucesso via HTTPS (autenticação pelo Credential Manager do
  Windows) — branch `main` já rastreando `origin/main`.
- **Bloqueio de segurança do GitHub (push protection)** no primeiro push:
  o commit inicial tinha uma **chave da API da Resend** e o anon key do
  Supabase hardcoded em `supabase/functions/send-notification-email/index.ts`.
  Corrigido trocando os dois por `Deno.env.get(...)` (mesmo padrão já usado
  em `_shared/mercadolivre.ts`), e o **histórico local foi reescrito**
  (`git filter-branch`) pra remover a chave de todos os commits antes do
  push — nada disso chegou a ir pro GitHub (o push protection barrou antes).

**Pendências conhecidas:**
- A função `send-notification-email` vai quebrar no próximo deploy até
  rodar `supabase secrets set RESEND_KEY=<chave>` (a chave antiga continua
  funcionando, só precisa virar secret em vez de hardcoded).
- Recomendado rotacionar a chave da Resend no painel deles, já que ficou em
  texto puro no histórico local por um tempo (risco baixo — nunca foi
  pro GitHub — mas é boa prática).
- Ainda falta configurar SSH ou credencial fixa nas outras 2 máquinas (casa
  e notebook) pra `git push`/`git pull` funcionarem sem fricção — só o PC
  do escritório foi autenticado até agora.
- Fluxo combinado com o Raphael: no início de uma sessão, ler este arquivo
  e o `CLAUDE.md`; no fim, atualizar este log antes de fechar o terminal.

---

### 2026-08-25 — Corte de dia (11h), Histórico de pedidos redesenhado, pedidos Full

**O que foi feito:**
- Descoberto e corrigido: pedido **Full** (`logistic_type=fulfillment` na
  API) entrava indevidamente no picklist. Causa raiz: **3 telas diferentes**
  buscam pedido direto da tabela `orders` (Expedição, Picklist Virtual,
  Gerar Picklist/PDF) — corrigir só a criação de `production_orders` não
  bastava, precisou excluir `is_full=true` nas 3 queries.
  - Nova coluna `orders.is_full` (`supabase/fase17-pedidos-full.sql`).
  - Tarja visual "📫 Pedido Full — ML despacha" na tela de Pedidos.
  - **Importante**: o `.xlsx` do ML **não tem** informação de Full — só a
    API sabe disso (via `shipment.logistic_type`). Pedido importado só
    pelo `.xlsx` nunca vai ter `is_full` correto.
- Corrigido o **corte do "dia" do ML**: não é meia-noite, é **11h de
  Brasília**. Pedido que chega às 23h já conta pro picklist do dia
  seguinte. Aplicado nos dois caminhos (API e importação manual), pra não
  ficarem inconsistentes enquanto rodam em paralelo.
  - Ver `mlBatchDayStart()` em `ml-process-webhook/index.ts` (calcula em
    UTC porque a Edge Function roda em UTC, não em horário de Brasília —
    11h BRT = 14h UTC) e em `useOrders.js` (roda no navegador, já em
    horário local, mais direto).
- **Aba "Histórico de importações" (tela Pedidos) redesenhada**: mostra
  raio-x real de cada lote (quantos vão pro picklist / cancelados / Full
  / sem SKU), distingue visualmente 🔄 Automático (API) vs 📄 Arquivo
  (`.xlsx`), e agrupa por dia respeitando o corte das 11h.
- Confirmado (não é achismo): **duplicidade não acontece** — upsert por
  `(source, num_venda)`; itens só são inseridos na primeira vez que o
  pedido aparece (API ou manual, o que chegar primeiro), a segunda
  entrada só atualiza campos cadastrais (status, endereço), nunca duplica
  nem recria itens.

**Pendências conhecidas:**
- Aba Histórico ainda não tem indicador de "0 lotes duplicados" — a
  prevenção é garantida no banco (constraint), mas não existe uma
  verificação visual ativa disso na tela (decidi não fingir uma
  verificação que não seria real).
- Se algum dia voltar a usar o upload direto de `.xlsx` em `/pick-list`
  (sem passar por Pedidos), esse caminho específico não tem proteção
  contra Full — mas segundo o Rapha, a aba "Envio" do ML já exporta sem
  pedidos Full mesmo, então o risco na prática é baixo.

---

### 2026-08-24 — Integração ML: setup, conexão, avisos em tempo real

**O que foi feito:**
- Arquitetura completa da integração (ver plano salvo em
  `C:\Users\Shanchi\.claude\plans\staged-floating-cloud.md` nessa máquina —
  só existe localmente, não está no repo).
- 3 Edge Functions no ar: `ml-oauth-callback`, `ml-webhook`,
  `ml-process-webhook` (fila assíncrona: `ml-webhook` só enfileira em
  `ml_webhook_events`, que dispara `ml-process-webhook` via Database
  Webhook do Supabase — mesmo padrão de `notifications` →
  `send-notification-email`).
- Tabelas novas: `ml_integration` (token OAuth, sem GRANT a anon — só
  service_role acessa), `ml_webhook_events` (fila).
  Ver `supabase/fase16-ml-integracao.sql`.
- Secrets configurados no Supabase: `ML_CLIENT_ID`, `ML_CLIENT_SECRET`,
  `APP_ORDERS_URL`.
- Conta ML da CoisaPet conectada e validada — token salvo, refresh
  automático implementado (`_shared/mercadolivre.ts`).
- **Bug corrigido**: `ml-oauth-callback` calculava o `redirect_uri` a
  partir da URL que o Deno via *internamente* (reescrita pelo gateway do
  Supabase) em vez da URL pública real — causava erro
  `redirect_uri does not match the original` do ML. Corrigido pra usar
  `SUPABASE_URL` fixo.
- **Aviso de venda nova em tempo real**: card no canto inferior direito
  (`MLSaleToast.jsx`), sino de notificações reage (chacoalha), som próprio
  (Web Audio, "cha-ching" — diferente do beep do chat), título da aba
  pisca quando a aba não está em foco. Testável via console:
  `testMLToast()` (não grava nada no banco).
- Tela de Pedidos: selo de plataforma redesenhado, lista atualiza sozinha
  em tempo real (sem precisar recarregar), filtro "Precisa de atenção"
  (Cancelados / Sem SKU / Não separado).
- Mockup de redesign visual da tela de Pedidos foi feito e iterado — a
  primeira versão (paleta escura, tipo "central de operações") foi
  **rejeitada** por mudar a cor sem melhorar o UX. Lição: **manter a
  paleta atual do sistema (rosa/âmbar/slate, Nunito) em qualquer redesign
  — o pedido de "mais bonito" é sobre hierarquia/organização, não cor.**
  (Isso já está registrado na memória do Claude também, não só aqui.)

**Decisões importantes:**
- Sincronização por **webhook em tempo real** (não polling) — decisão do
  Rapha, sabendo que isso significa perder uma notificação pontual é
  possível (raro) se o endpoint cair; o `.xlsx` manual cobre esse buraco.
- Importação manual do `.xlsx` **continua ativa como fallback** — decisão
  deliberada, não é código legado esquecido.

---

## Referências úteis

- Projeto Supabase: `lcybmdiqxmbqeuyeuhdj` — [Dashboard](https://supabase.com/dashboard/project/lcybmdiqxmbqeuyeuhdj)
- Guia passo a passo da integração ML (setup, publicado como Artifact):
  https://claude.ai/code/artifact/c83f0486-b080-43f6-88cb-22aefb5c15a5
- App do Mercado Livre (client_id): `6261065807913264`
- Migrations relevantes: `supabase/fase16-ml-integracao.sql`,
  `supabase/fase17-pedidos-full.sql`
- Edge Functions: `supabase/functions/ml-oauth-callback/`,
  `ml-webhook/`, `ml-process-webhook/`, `_shared/mercadolivre.ts`
- Deploy de function: `supabase functions deploy <nome>` (as duas que
  recebem chamada direta do ML — `ml-oauth-callback` e `ml-webhook` —
  precisam de `--no-verify-jwt`; `ml-process-webhook` não, porque é
  chamada de dentro do próprio Supabase)
