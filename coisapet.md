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
- **Pedidos/Picklist/Expedição**: reformulado em 2026-08-25 — ver entrada
  detalhada no Log. **Picklist Virtual foi descontinuado** (removido do
  sistema); só existem mais "Gerar Picklist" e "Expedição". `batch_id` de
  um pedido agora é definido uma vez (pela data real da venda) e nunca
  mais reatribuído — corrige o corte de 11h e o sumiço de pedidos já
  separados na Expedição. **Pendência real**: ainda falta rodar a
  verificação no banco ao vivo (Fase 0 do plano) pra decidir a correção
  do caso "pedido em pacote do ML" (possível duplicata genuína) — não foi
  mexido ainda, ver pendência no Log.

---

## Log

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
