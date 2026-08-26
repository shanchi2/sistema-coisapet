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
- **Shopee (26/08, 5ª parte)**: fluxo revisado, sem bug estrutural
  (parser já agrupa pacote e protege item de pedido já existente —
  diferente do ML, não precisou de correção de código). 723 pedidos
  antigos arquivados (`ship_date < 15/08/2026`); badge de Atrasados caiu
  de ~673+ pra 34 no total (7 Shopee + 23 ML + 4 manual).

## ⏭️ Próximos passos imediatos (pra continuar de onde parou)

0. **Rodar `supabase/fase24-limpa-itens-duplicados-reimport.sql` manualmente**
   (SQL Editor do Supabase) — limpa os 32 pares de item duplicado que a
   reimportação da Fase 23 criou (bug já corrigido no código, mas o
   estrago retroativo continua na tela até rodar isso).
1. **`npm run build` + subir `dist/` pra Hostinger** — o código (ship_date,
   Atrasados, config de corte, filtro de `archived`) já está no GitHub
   (buildado localmente e testado nesta sessão) mas ainda não foi subido
   pro site. A parte do banco já está ativa em produção independente disso.
2. **Rodar o `DELETE` do `supabase/fase19-cleanup-duplicate-items.sql`**
   (query 2, comentada de propósito) — 7 itens duplicados já auditados e
   confirmados como bug pelo Raphael, só falta apagar. Bloqueado pro
   Claude Code rodar sozinho (ação destrutiva), precisa ser manual (SQL
   Editor do Supabase) ou aprovado explicitamente na hora, se pedido de novo.
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

## Log

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
