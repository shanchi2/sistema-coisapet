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

---

## Log

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
