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
- **Estoque Full (03/09)**: tela nova `/ml/full` — consulta (só leitura)
  do estoque físico no centro de distribuição do ML por produto/
  variação. Confirmado ao vivo: **não existe API pra agendar/enviar
  reposição** pro Full, isso é sempre manual no painel do vendedor —
  a tela só avisa cedo quando algo tá acabando lá.
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
- **Blog (09/09, Fases 47-49)**: módulo novo `/blog` — CMS interno pra
  substituir o WordPress (que está degradando), com geração de conteúdo
  por IA (OpenAI), painel de SEO tipo Yoast, categorias, link manual
  pra produto, importador de WXR do WordPress e re-hospedagem de
  imagem externa. **Já tem conteúdo real em produção** (~21 posts
  publicados). Analytics de visualização por post em `/cliques` (aba
  Blog) — falta só colar o snippet de tracking no `coisapet-site` (ver
  Próximos Passos). Só o CMS por enquanto — quem exibe pro público
  ainda é decisão futura (provavelmente o site principal lendo esta
  tabela). Ver Log pra detalhes.
- **Atualização de Mídia (15/09, refeito)**: módulo `/producao/midia`
  trocou o status manual por um checklist real de 9 fotos + 1 vídeo por
  produto/variação, com upload de verdade (não só marcar status) —
  reaproveita `product_images` (mesma galeria de `ProductFormModal.jsx`),
  então já é a galeria oficial do produto. Página de lista + página nova
  de detalhe (`/producao/midia/:productId`) com o guia completo (Manual
  de Marketplace, enviado 15/09) anexado em cada box: categoria
  (Comercial/Emocional/Educacional), tags, objetivo, pergunta do cliente
  e o "cuidado" de cada foto. **Objetivo declarado vai além do site**:
  melhorar aos poucos as fotos de TODOS os produtos pra alimentar também
  o Mercado Livre (já tem API) e futuramente a Shopee (quando tiver API)
  — ver [[coisapet_media_checklist_ml_shopee_goal]] na memória do Claude.
  **Ainda não testado clique-a-clique ao vivo** (ver Próximos Passos).
- **Manuais de produto (15/09)**: nova aba "Manuais" em `/bio-links` pra
  cadastrar manual de montagem/instruções/vídeo por produto, público em
  `coisapet.com.br/doc/<slug>`, achável a partir de `/links` → "Manuais e
  Dicas de Uso" → hub com busca. Banco pronto e testado via REST; **as
  páginas estáticas novas (`doc/`, `links/manuais/`) ainda não foram
  subidas pro Hostinger** e o fluxo ainda não foi clicado no navegador de
  verdade. Ver Log e Próximos Passos.
- **API da Shopee (15/09-16/09)**: Raphael conseguiu acesso à API oficial
  da Shopee (Open Platform v2). **Fase 1 (sync de pedido em tempo real)
  VALIDADA de ponta a ponta com pedido de teste real** — conexão OAuth,
  Push Mechanism, Database Webhook, mapeamento de status/campos, toast
  visual (`ShopeeSaleToast.jsx`), tudo funcionando contra a loja de
  teste sandbox (`shop_id 227914440`). Mesmo nível de confiança que a
  integração ML hoje. Ver Log 16/09 (8ª parte) +
  [[coisapet_shopee_api_research]]. Só sandbox por enquanto — produção
  ainda depende da aprovação da Shopee (app enviado pra revisão em
  16/09).

## ⏭️ Próximos passos imediatos (pra continuar de onde parou)

0e. **Estoque de produto + Kits — construído, precisa teste real do
   Raphael/produção**: `/kits` (novo módulo) e coluna "Estoque" em
   `/produtos`, ver Log 17/09. RPCs (`log_chapa_production`,
   `adjust_product_stock`) validadas direto no banco com dado real, mas
   ninguém ainda clicou nas telas de verdade. Também: hoje estoque só
   sobe (produção/ajuste manual) — venda não desconta ainda, decisão
   consciente do Raphael, retomar quando ele quiser fechar esse ciclo.
0. **Shopee Fase 1 — validada, só falta confirmar o toast ao vivo**:
   pedido de teste real (`2609178967T17D`) processado 100% certo
   (status, comprador, cidade, item). Falta só confirmar com o Raphael
   se o `ShopeeSaleToast.jsx` apareceu ao vivo no navegador dele via
   Realtime quando a notificação foi criada. Depois disso, Fase 1 pode
   ser considerada fechada — próxima fase (Estoque Full via SBS ou Ads
   API, ver [[coisapet_shopee_api_research]]) fica pra quando o Raphael
   quiser priorizar. Ver Log 16/09 (8ª parte).
0d. **Cupons e Flash Sale da Shopee — construídos**: `/shopee/cupons`
   (CRUD completo, testado de ponta a ponta) e `/shopee/flash-sale`
   (criação/gestão implementada a partir do schema documentado, mas
   `add/update/delete_shop_flash_sale_items` **não testados contra a API
   real** — a loja de teste não atende ao critério de elegibilidade da
   Shopee pra Flash Sale de loja. Testar de verdade quando a loja real
   (ou uma de teste que atenda ao critério) conseguir passar de
   `get_time_slot_id`. Ver Log 16/09 (15ª parte).
0c. **Estoque Full da Shopee (SBS) — construído, ainda não tem o que
   mostrar**: `/shopee/full`, ver Log 16/09 (14ª parte). Endpoints
   confirmados contra a API real (sign OK). **CoisaPet ainda NÃO usa o
   fulfillment físico da Shopee hoje** (fabrica/embala/despacha na mão)
   — pretende começar em breve, essa API é um dos facilitadores pra
   isso. Até lá a tela fica vazia mesmo na loja real (não é só sandbox),
   com aviso claro disso. Quando entrarem de fato no programa, testar de
   novo e conferir se os nomes de campo do SDK comunitário batem com a
   resposta real.
0b. **Detalhe do anúncio da Shopee — completo** (`/shopee/item/:itemId`):
   Visão Geral, Conteúdo & IA, Imagens & IA, Ficha Técnica e Desempenho,
   ver Log 16/09 (12ª e 13ª partes). Todas as escritas testadas contra a
   API real do sandbox antes de virar tela (preço/estoque com valor
   igual ao atual; título/descrição/peso/dimensão/foto com mudança de
   verdade, depois conferidas). Ainda não clicado na tela real (login
   pede credencial que o Claude não tem) — Raphael testa depois do
   deploy. Fora de escopo por enquanto: edição de marca, edição por
   variação/modelo, Ads/tráfego por anúncio.
1. **`npm run build` + subir `dist/` pra Hostinger** — o código (ship_date,
   Atrasados, config de corte, filtro de `archived`) já está no GitHub
   (buildado localmente e testado nesta sessão) mas ainda não foi subido
   pro site. A parte do banco já está ativa em produção independente disso.
2. **Blog: decidir como o site principal vai ler os posts publicados**
   (`blog_posts.status='published'`) — API própria, leitura direta do
   Supabase, ou outra coisa. Ainda não decidido (Raphael disse "depois eu
   faço o site ler daqui"). Quando isso for construído, o hyperlink de
   produto já sai pronto apontando pra `coisapet.com.br/<slug-do-produto>`.
2b. **Blog: snippet de tracking de visualização** — já colado pelo
   Copilot no `footer.php:254` do `coisapet-site` e confirmado
   funcionando ao vivo (09/09-09/10). Snippet de clique em produto
   também no ar; os 8 posts publicados que tinham link de produto sem
   `data-product-link` já foram retrofitados via SQL (10/09) — falta só
   alguém clicar de verdade num link de produto no site pra confirmar
   que `blog_product_clicks` grava (view já confirmado gravando).
2c. **Atualização de Mídia — testar ao vivo**: subir foto num check,
   trocar variação, subir vídeo, confirmar que a foto do checklist
   aparece na galeria normal do produto (`ProductFormModal.jsx`) — feito
   só via build/SQL nesta sessão, não clicado na tela real. Quando o
   Raphael mandar o guia escrito definitivo, ajustar os textos em
   `src/modules/production/mediaChecklist.js`.
2d. **Manuais de produto — subir pro Hostinger + testar**: as pastas
   `doc/` (com `.htaccess` de rewrite e o `ver.html` novo, 16/09) e
   `links/manuais/` são novas e só existem no repo local — precisam ser
   upadas pro `public_html` junto do resto (mesmo processo manual de
   sempre pra `links/`/`equipe/`). Confirmado ao vivo em 16/09 que hoje
   dá 404 (nunca foi subido). Depois de subir, testar
   `coisapet.com.br/doc/<slug>` e `/links/manuais/` — inclusive abrir um
   recurso `.html` de verdade pra confirmar que o `ver.html` renderiza
   certo (ver [[coisapet_supabase_html_serving_gotcha]]).
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

### 2026-09-17 (5ª parte) — Correção: "lançar produção" era sobre o `/equipe` (PWA), não o painel principal

Raphael corrigiu firmemente a 4ª parte: "para de sair fazendo, me
pergunte" — o pedido era sobre o **`/equipe`** (PWA estático separado,
`equipe/index.html`, onde Daniel/Diovani já fazem ponto etc.), não
sobre o painel administrativo principal que eu tinha investigado e
mexido. Registrado como memória de feedback pra não repetir — perguntar
QUAL app antes de investigar/mexer quando o pedido for sobre "área do
usuário".

Achado ao investigar o `/equipe`: já existe "Lançar Produção" lá
(escreve em `production_entries` — **mesma tabela** que
`ProductionEntriesPage.jsx` do painel principal lê, então os dois já
conversam), mas só aparecia pra `role==='horista'` (`if` fixo no JS,
linha ~689). Daniel é `role='producao'`, por isso não via o botão.
**Perguntei antes de mexer** se a liberação devia valer pra role
inteira (Daniel + Jaime Norberto + o usuário genérico "Produção -
CoisaPet", todos `role='producao'`) ou só o Daniel individualmente —
Raphael confirmou: role inteira. Alterado
`if(me.role==='horista')` → `if(me.role==='horista'||me.role==='producao')`
em `equipe/index.html` — única mudança, nenhum outro gate duplicado
(conferido: `qa-lancamento`/`nb-lancamento` só são revelados ali, sem
checagem de role em nenhuma outra função).

**Pendência levantada**: a permissão `role_permissions
('horista','producao-horistas')` que inseri na 4ª parte (painel
principal) não era o que resolvia o pedido — fica registrada como
achado real válido (a role `horista` realmente não tinha NENHUMA
permissão no painel principal, o que é verdade independente desse
pedido), mas perguntei ao Raphael se quer que eu reverta já que não foi
o que ele pediu.

**Lembrete de deploy**: `equipe/index.html` é pasta estática separada
do build React — precisa subir esse arquivo específico pro
`public_html` do Hostinger (mesmo processo manual de sempre pra
`equipe/`/`links/`/`doc/`), não basta rodar `npm run build`.

---

### 2026-09-17 (4ª parte) — Acesso do Daniel e do Diovani à "Produção dos Horistas"

Raphael pediu pra liberar, pro Daniel (e mencionou o Diovani também),
a área de lançar a produção do dia. Investigando achei que **não é o
mesmo problema pros dois**:

- **Daniel** (`role = producao`) **já tinha** `producao-horistas`
  habilitado em `role_permissions` — junto com `producao` (Esteira,
  Chapas), `baixa-diaria`, `passagem-turno`. Não precisei mudar nada
  pra ele. Se ele não está vendo o menu "Produção Horistas", é porque a
  permissão só carrega uma vez no login (`PermissionsContext.jsx`) —
  só precisa dar F5 na página (não precisa nem deslogar).
- **Diovani** (`role = horista`) — achado real: **a role `horista` não
  tinha NENHUMA linha em `role_permissions`**, pra nenhum módulo. Como
  o controle de acesso é "nega por padrão, libera só o que está
  explícito" (`PermissionsContext.jsx: canAccess`), isso significa que
  hoje, literalmente, ninguém com `role = horista` consegue acessar
  módulo nenhum do sistema (cai sempre em `/dashboard`, que é a única
  rota sem guarda). Corrigido: inserida a permissão
  `('horista', 'producao-horistas', true)` — **já em produção, sem
  precisar de deploy** (é dado no Supabase, não faz parte do build).
- **Achado técnico à parte**: o array `roles: [...]` em cada item de
  `Sidebar.jsx` (ex: `roles: ['admin']` no item Produção Horistas) **não
  é usado pra nada** — confirmado no próprio código-comentário
  ("canSee é ignorado — quem decide é o controle de acesso"). Quem
  decide de verdade é só `role_permissions` + `canAccess()`. Não mexi
  nesses arrays (são só decoração/documentação desatualizada) — se
  algum dia der pra limpar, não afeta comportamento.

Nenhuma mudança de código — só dado (`role_permissions`). Testar: pedir
pro Daniel e pro Diovani darem F5/relogar e conferir se "Produção
Horistas" aparece no menu deles.

---

### 2026-09-17 (3ª parte) — Filtros novos em Estoque Full e Gestão de Envios Full (ML)

Raphael reportou "abas não funcionando" nas duas telas de Full do ML.
Investigando o código não achei bug nenhum nas abas que já existiam em
`MlFullShipmentsPage.jsx` (Gestão de Envios) — a lógica de filtro por
status bate certo. **Achado que mudou o entendimento**: as duas telas
NÃO funcionam do mesmo jeito — `MlFullStockPage.jsx` (Estoque Full)
busca **ao vivo na API real do ML** toda vez que clica "Atualizar"
(`/inventories/{id}/stock/fulfillment`, endpoints confirmados no código
de 13/09), enquanto `MlFullShipmentsPage.jsx` (Envios) é só uma
**fotografia** sincronizada manualmente via bookmarklet — bem diferente
do que eu lembrava. **E Estoque Full não tinha NENHUMA aba** — só
stats fixas, o que provavelmente é a origem da confusão do Raphael (as
duas telas de "Full" pareciam devia se comportar igual e uma delas não
tinha filtro nenhum).

Perguntei antes de mexer, mas o Raphael não confirmou o bug específico
— deu autorização geral pra caprichar nas duas telas com mais
filtro/informação. Feito:
- `MlFullStockPage.jsx`: cards de estatística viraram **filtro
  clicável** (Todos/Sem estoque/Crítico/Saudável — antes eram só
  números fixos), + busca por título/MLB, + linha de abas equivalente
  (mesmo padrão visual da tela de Envios), + "Consultado ao vivo às
  HH:MM" (client-side, já que a busca é sempre ao vivo — não existe
  timestamp salvo pra essa tela, diferente da de Envios).
- `MlFullShipmentsPage.jsx`: busca por nº do envio/produto/MLB, + filtro
  por centro logístico (dropdown, só aparece se houver mais de 1 centro
  nos dados), somados aos filtros de status que já existiam.

`npm run build` limpo. Não reproduzi nenhum bug real nas abas de Envios
— se o problema persistir depois do deploy, preciso de mais detalhe
(print de tela ou o que exatamente acontece ao clicar) pra caçar de
verdade, já que não consigo logar e testar ao vivo.

---

### 2026-09-17 (2ª parte) — Produto principal (variação de cor sem "cor mestre") + chapa por família

Raphael trouxe um ponto mais fundo sobre chapas: hoje o "mestre" de uma
família de variação é, por acaso, uma das próprias cores (ex: o
Amadeirado virou mestre sem querer) — não existe uma identidade do
produto em si, independente de cor. Pedido: criar um **produto
principal** por família (nunca vendido sozinho, sem anúncio próprio,
SKU só a base) e todas as cores — inclusive a que hoje é mestre — viram
variações filhas iguais entre si, mantendo os SKUs que já têm hoje.
Escopo confirmado: todo o catálogo com variação de cor, não só chapa.

Feito via plano formal (EnterPlanMode) com **3 agentes de pesquisa em
paralelo** antes de codar — achados que mudaram o desenho:
- **Escala real**: 75 famílias ativas, 54 de cor. Do padrão de SKU,
  76% permite cortar o sufixo de cor com segurança (auto-conversão),
  24% é irregular (mistura tamanho+cor, ex: `ROD-SS-AMD-15CM`, ou nem é
  cor de verdade) — fica de fora da conversão automática.
- **3 famílias tinham o mestre já marcado como kit** (achado
  cruzando com o trabalho de ontem) — excluídas da conversão, kit e
  produto principal não se misturam.
- **`group_id`** confirmado coluna morta (nunca usada pra agrupamento
  de verdade) — não usei.
- **Risco real achado**: se o principal entrasse na tela de Produtos
  com preço padrão 0, a faixa de preço do card do grupo mostraria "R$
  0,00" e a foto podia sumir — por isso a flag `is_sellable` explícita
  em vez de inferir por preço/SKU vazio.
- **ML/Shopee/Pedidos/Expedição confirmados SEM RISCO** — nenhum lê a
  tabela `products` direto, tudo é casado por SKU exato no momento do
  pedido; um produto principal nunca tem um SKU que bateu numa venda,
  então nunca aparece lá, sem precisar mudar nada nesses módulos.

**Banco** (`fase64-produto-principal.sql`): `products.is_sellable`
(mesmo padrão do `is_kit`, fase63). **`fase64b-migrar-familias-cor.sql`**
— script de uso único: simulei antes (dry-run só leitura, bateu 39
limpas/13 irregulares) e só depois rodei de verdade — **39 produtos
principais criados**, todos os SKUs antigos intactos (conferido: 550→589
produtos, família de teste TRT com as 7 cores reparentadas certo).
**`fase64c-chapa-por-familia.sql`** — `log_chapa_production` (fase63)
ganhou `p_color_selections` (JSONB opcional: `{principal_id: cor_id}`)
pra resolver qual SKU de verdade credita o estoque quando o item da
chapa aponta pra um principal; chapa apontando direto pra produto comum
continua idêntica. **Testado contra dado real** (chapa A-23 redirecionada
via mapa de teste pra outra cor, conferido e revertido) antes de mexer
na UI — mesmo cuidado de sempre com escrita real.

- `ProductsPage.jsx`: agrupamento reescrito pra agrupar por
  `parent_product_id` usando produto vendável como membro e nome/foto/
  categoria do cabeçalho vindos do principal quando existir — corrige a
  raiz do risco de "R$ 0,00". Famílias ainda não convertidas continuam
  funcionando exatamente como sempre (migração é por família, não
  obrigatória).
- `useProductMediaStatus.js`: mesmo ajuste de agrupamento — produto
  principal nunca aparece no checklist de fotos (nunca é fotografado),
  o "mestre" do card do checklist continua sendo sempre uma variação de
  verdade e rastreável.
- `VariationsPage.jsx`: `GroupModal` ganhou a opção "Criar produto
  principal novo" (nome/SKU sugeridos automaticamente quando os
  selecionados já concordam) — vira o caminho oficial pra qualquer
  família nova ou pras 13 que ficaram de fora da conversão automática.
  Lista principal também ganhou badge "PRINCIPAL" (diferente de
  "MESTRE") e um contador próprio nas estatísticas, pra não confundir.
- `ChapasPage.jsx`: "Lançar produção" agora detecta quando um item da
  chapa aponta pra um produto principal e pede a cor (lista vem das
  variações "Cor" reais daquela família) antes de confirmar — resolve
  certo o SKU de destino. Chapa ligada a produto comum continua sem
  esse passo extra.
- `blog-ai`: sugestão de link interno agora ignora produto principal
  (nunca tem página pública de verdade).

**Achado extra, não aplicado — fica pro Raphael decidir**: ao mapear as
chapas reais existentes, achei bastante duplicação exatamente do tipo
que motivou o pedido — ex: chapa "A-23" (TRT-AMD) e "A-24" (TRT-CR) são
duas chapas separadas pra cores diferentes do MESMO corte; o mesmo
acontece com "A-34"/"A-35" (ROD-40) e outras. Agora que existe o
principal, dá pra consolidar essas em 1 chapa só (apontando pro
principal, cor escolhida no lançamento) — **não mexi em nenhuma chapa
existente**, isso é uma limpeza que só faz sentido o Raphael decidir
fazer (ou pedir), não é automático.

`npm run build` limpo. RPCs e migração de dados validadas contra o
banco real antes de mexer em tela; telas não testadas clicando (login
pede credencial que não tenho) — Raphael testa depois do deploy.

---

### 2026-09-17 — Estoque real de produto (via Chapas) + módulo de Kits

Reunião do Raphael com a produção (e o irmão dele): querem lançar a
produção de uma chapa e o estoque do(s) produto(s) que ela rende subir
sozinho — e "Terrário com Acessórios" não é um produto, é um KIT (vários
SKUs existentes combinados), então deve sair da aba Produtos e ganhar
tela própria. Feito via plano formal (EnterPlanMode) — mudança de modelo
de dados, não deu pra ir direto pro código.

**Descoberta importante na investigação**: `products.is_kit` e a tabela
`kit_items` (composição do kit) **já existiam em produção**, usados só
por `ProductFormModal.jsx` como referência visual pra Expedição — mas
**nunca tinham sido versionados** (nenhum `supabase/fase*.sql` os
criava). Também confirmado que **RLS de `products` e `kit_items` está
DESLIGADO** (sem policy nenhuma) — a migração nova teve o cuidado de só
formalizar a estrutura (`IF NOT EXISTS`) sem ligar RLS nessas duas
tabelas, senão quebrava o acesso `anon` que já funciona.

**Decisões confirmadas com o Raphael antes de codar** (pergunta direta):
estoque por enquanto só do lado da produção (venda ainda não desconta
automaticamente — fica pra quando ele quiser fechar o ciclo); kit nunca
tem estoque próprio (sempre calculado a partir do estoque dos
componentes); kits saem mesmo da aba Produtos pra uma aba própria.

- `supabase/fase63-estoque-produto-kits-chapas.sql`: `products.stock_qty`
  (novo), view `kit_availability` (mesma lógica de `production_capacity`
  já usada pra ficha técnica de matéria-prima, só que componente é
  PRODUTO em vez de insumo), tabelas `product_stock_movements` (ledger
  de auditoria) e `chapa_production_entries`, RPCs `log_chapa_production`
  (atômica: cria o lançamento + soma estoque de cada produto da receita
  + grava movimento, tudo numa transação) e `adjust_product_stock`
  (ajuste manual). **Testado direto no banco contra dado real** antes de
  escrever a UI: rodei `log_chapa_production` numa chapa de verdade
  (A-23 → Caixa Alojamento de Transporte, +3 unidades), confirmei
  `stock_qty`/movimento/lançamento gravados certos, e revertido com
  `adjust_product_stock(-3)` logo em seguida pra não deixar dado de
  teste no painel do Raphael.
- `ProductsPage.jsx`: kits saem da lista (`!p.is_kit`); nova coluna
  "Estoque" com badge de 3 níveis (crítico/atenção/ok, mesmo padrão
  visual já usado no resto do sistema) que abre `StockMovementsModal.jsx`
  (novo) — ajuste manual +/- com motivo, e histórico de movimentações.
- `KitsPage.jsx` (novo, rota `/kits`, item novo no menu ao lado de
  Produtos): lista kits com disponibilidade calculada
  (`kit_availability`), composição expansível mostrando o estoque de
  cada componente e destacando o gargalo. Criar/editar **reaproveita o
  `ProductFormModal.jsx` já existente** (só ganhou uma prop nova,
  `defaultIsKit`, pra pré-selecionar "Kit" ao criar por ali) — sem
  duplicar o formulário grande que já tinha toda a lógica de
  composição.
- `ChapasPage.jsx`: botão "Lançar produção" por chapa (multiplicador +
  prévia do que vai somar em cada produto antes de confirmar) e
  "Histórico" expansível com os lançamentos anteriores.

**Fora de escopo desta entrega, registrado no plano**: venda ainda não
desconta estoque automaticamente; Expedição continua tratando kit
vendido como 1 linha só no picklist (não expande pros componentes); kit
nunca ganha estoque físico próprio.

**Bug real reportado pelo Raphael ao testar** (console do navegador):
`useKits.js` dava `PGRST201 — Could not embed because more than one
relationship was found for 'products' and 'kit_items'`. Causa: `kit_items`
tem 2 FKs pra `products` (`kit_product_id` e `component_product_id`) — o
embed `items:kit_items(...)` direto de `products` ficou ambíguo (eu já
tinha desambiguado o embed ANINHADO `component:products!component_product_id`,
mas esqueci o embed de fora). Corrigido pra
`items:kit_items!kit_items_kit_product_id_fkey(...)` (nome exato da FK,
veio no `hint` do próprio erro do PostgREST) — testado de novo direto
contra a API real (curl) antes de considerar resolvido.

**2º bug real reportado**: no modal de criar/editar kit, a seção
"Variações" aparecia 2 vezes. Causa: bug antigo do `ProductFormModal.jsx`
(não é coisa nova de hoje) — tinha 2 blocos `<Section title="Variações">`
idênticos (linhas ~830 e ~913, ambos numerados "6." no comentário,
sinal de refactor incompleto que sobrou código morto). Removido o
duplicado, mantido o que usa o componente `<Field>` compartilhado. Vale
lembrar: esse bug já existia pra QUALQUER produto com variação, não só
kit — só ficou visível agora porque foi o modal mais testado hoje.

**Pedido do Raphael**: marcar automaticamente como kit todo produto que
já tem "Kit" no nome, pra ele só precisar vincular os componentes
depois (em vez de recriar do zero). Levantei os candidatos primeiro
(13 produtos ativos, todos com SKU já prefixado `KIT-`/`KIT0N-`,
nenhum falso positivo) e confirmei com ele antes de aplicar —
`UPDATE products SET is_kit = true` só nesses 13, **SKU intacto** (só a
flag muda, exatamente o que ele pediu pra preservar os relatórios
antigos de venda). Eles agora aparecem em `/kits` sem componente
vinculado ainda — ele adiciona manualmente quais produtos compõem cada
um.

**2ª leva de marcação automática**: pedido pra pegar também tudo com
"Com Acessórios" no nome, **incluindo as variações** (produtos desse
catálogo usam `parent_product_id` — cada cor é uma linha própria com
SKU próprio, não uma sub-tabela de variação). Achei 12 (2 grupos
completos: "Caixa Alojamento de Transporte... com Acessórios" — 7 cores
— e "Terrário Alojamento 120x60x60... Completo Com Acessórios" — 5
cores), todos batendo o padrão, sem falso positivo — marcados
`is_kit=true`, SKU intacto igual da vez anterior. Total agora: 25 kits
(13 + 12). Cada variação de cor virou um card de kit independente em
`/kits` (correto — cada uma é um SKU vendável próprio, com composição
provavelmente diferente por cor).

**Sugestão feita e ainda não construída**: Raphael perguntou sobre uma
IA "SEO master" pra analisar título/descrição de todos os produtos.
Respondido que faz mais sentido como tela própria de auditoria (aponta
problema + nota, não aplica nada sozinha) — separado do fluxo de gerar
texto que já existe pro ML/Shopee. Fica como ideia registrada, não
combinada ainda.

`npm run build` limpo. RPCs validadas contra dado real via SQL direto;
telas não testadas clicando (login pede credencial que não tenho) —
Raphael testa depois do deploy.

---

### 2026-09-16 (15ª parte) — Cupons + Flash Sale da Shopee (CRUD completo via API)

Pedido do Raphael: "capricha, e lembre-se sempre de colocar as informações
máximas que puder, relatórios, dados, CRUDs, tudo que puder" — diretriz
geral pra daqui pra frente, não só pra essa tela.

- **Pesquisado com o mesmo SDK comunitário** (`congminh1254/shopee-sdk`)
  os endpoints reais de Voucher e Shop Flash Sale, e **testado cada um
  contra a API real do sandbox** antes de escrever a UI:
  - **Cupons** (`/voucher/*`) — CRUD completo confirmado ao vivo: criei
    um cupom de teste de verdade (`add_voucher`), consultei
    (`get_voucher`/`get_voucher_list`), atualizei quantidade de uso
    (`update_voucher`) e excluí (`delete_voucher`) — os 4 bateram
    exatamente com o schema do SDK. **2 regras reais descobertas na
    marra** (erro devolvido pela própria Shopee): código do cupom
    aceita só até 5 caracteres alfanuméricos, e desconto percentual de
    cupom de loja tem mínimo de 20% (tentei 10%, rejeitado; 20% passou).
  - **Flash Sale** (`/shop_flash_sale/*`) — `get_item_criteria` (regras
    de elegibilidade de produto) testado e confirmado com dado real.
    `get_time_slot_id` (primeiro passo pra criar uma Flash Sale) **deu
    `not_meet_shop_criteria`** — a loja de teste não atende aos
    critérios da Shopee pra abrir Flash Sale de loja (normalmente
    depende de reputação/tempo de conta). Não é bug daqui: a tela já
    trata esse erro específico e mostra uma mensagem clara em vez de
    quebrar. `add/update/delete_shop_flash_sale_items` ficaram só
    implementados a partir do schema documentado (não testados de
    verdade, já que não consegui criar uma Flash Sale pra testar em
    cima) — reavaliar quando a loja real tiver esse critério liberado.
- `shopee-insights/index.ts`: 6 ações novas de cupom
  (`voucher_list/detail/create/update/end/delete`) e 11 de Flash Sale
  (`flash_sale_time_slots/list/detail/item_criteria/create/
  update_status/delete/items/add_items/update_items/delete_items`).
- `ShopeeVouchersPage.jsx` (`/shopee/cupons`): KPIs (em andamento/
  agendados/expirados), filtro por status, criação completa (loja toda
  ou produtos específicos, percentual ou valor fixo, com seletor de
  produto reaproveitando a busca de anúncios ativos), edição inline
  (nome/fim/qtd. de uso/compra mínima), encerrar agora, excluir.
- `ShopeeFlashSalePage.jsx` (`/shopee/flash-sale`): painel de critérios
  de elegibilidade (dados reais da API), KPIs, fluxo de criação em 2
  passos (escolher horário → escolher produtos com preço/estoque de
  campanha), lista com cliques/lembretes/produtos ativos, ativar/
  desativar, excluir, ver/remover produtos de uma campanha.
- Novo item no menu Shopee: "Cupons" e "Flash Sale".

`npm run build` limpo. Cupom de teste criado e excluído de propósito
(ciclo completo validado, sem deixar lixo no sandbox). Flash Sale não
testada de ponta a ponta por causa do critério de elegibilidade da loja
de teste.

---

### 2026-09-16 (14ª parte) — Estoque Full da Shopee (SBS)

Perguntei ao Raphael o que mais valia a pena construir a seguir olhando
a pesquisa comparativa Shopee×ML — ele escolheu Estoque Full (2º item da
prioridade original, ver [[coisapet_shopee_api_research]]).

- **Pesquisado o endpoint real antes de codar** (a pesquisa original de
  15/09 tinha vindo de um SDK comunitário, não confirmada contra doc
  oficial): usei o SDK `congminh1254/shopee-sdk` (TypeScript, schema
  aberto) pra achar os endpoints e o formato exato de campo —
  `/api/v2/sbs/get_bound_whs_info` (quais armazéns a loja tem vinculado)
  e `/api/v2/sbs/get_current_inventory` (estoque por produto/variação/
  armazém: `sellable_qty`, `reserved_qty`, `unsellable_qty`,
  `coverage_days`, `selling_speed`, `last_30_sold` etc, `whs_region: BR`
  suportado).
- **Testado contra a API real** — os dois endpoints respondem certo
  (sign OK, sem erro), mas vieram vazios (`list: null` / `item_list: []`)
  porque é a loja de TESTE/sandbox, que nunca foi vinculada a nenhum
  armazém. Perguntei ao Raphael se a CoisaPet usa o fulfillment físico
  da Shopee antes de continuar — **correção dele logo depois**: hoje
  AINDA NÃO usa (fabrica, embala e leva pra coleta na mão, igual sempre
  fez), mas pretende começar em breve, e essa API é justamente um dos
  facilitadores pra essa mudança. Ou seja, a tela vai ficar vazia
  também na loja REAL por enquanto — não é só coisa de sandbox — até o
  dia em que a CoisaPet entrar de fato no fulfillment da Shopee, e aí
  passa a puxar sozinha sem precisar mexer em nada.
- `shopee-insights/index.ts`: `sbs_bound_warehouses` (checa vínculo) e
  `sbs_fulfillment_stock` (lista paginada, normalizada por produto →
  variação → armazém). Achado útil no schema: `shop_sku_list[].shop_item_id`
  é o `item_id` normal da Shopee (o mesmo usado no resto do sistema) —
  os cards da tela já linkam pro detalhe do anúncio (`/shopee/item/:id`)
  quando esse dado vem preenchido.
- `ShopeeFullStockPage.jsx`, rota `/shopee/full`, item novo no menu
  Shopee. Mesmo layout/lógica de níveis de estoque (crítico/atenção/
  saudável) da tela equivalente do ML (`MlFullStockPage.jsx`), com
  estado específico pra "loja sem armazém vinculado ainda" (deixa claro
  que pode ser só porque é a loja de teste).
- **Ressalva importante, igual registrado na pesquisa original**: os
  nomes de campo vêm de um SDK comunitário (bem documentado e
  consistente, mas de terceiro, não da doc oficial da Shopee) — o código
  lê tudo de forma defensiva (`?? null`/optional chaining). Só dá pra
  confirmar 100% contra dado real quando tivermos acesso de produção E a
  loja real tiver estoque físico no armazém — revalidar nessa hora.

`npm run build` limpo. Não testado clicando na tela (mesmo motivo de
sempre) nem com dado real (sandbox não tem armazém vinculado).

---

### 2026-09-16 (13ª parte) — Detalhe do anúncio da Shopee completo (partes 2-4: Conteúdo & IA, Imagens & IA, Ficha Técnica, Desempenho)

Raphael pediu pra completar de vez a tela de detalhe (12ª parte tinha
ficado só na parte 1 — Visão Geral). Fechado o resto, mesmo nível do
`MlItemDetailPage.jsx` do ML (adaptado ao que a Shopee de fato oferece).

- **Testado contra a API real, um endpoint de cada vez, antes de montar
  a versão final** (mesmo padrão do dia todo) — achados importantes:
  - `update_item` é o endpoint genérico de conteúdo/ficha técnica.
    Confirmado **parcial** (só muda o campo que você manda — description,
    item_name, weight, dimension testados isoladamente sem afetar os
    outros), MAS **`image.image_id_list`, quando enviado, substitui a
    lista inteira de fotos** — mesmo risco do PUT de `variations` do ML
    (ver [[coisapet_ml_variations_put_gotcha]]). Por isso toda função que
    mexe em foto (anexar/excluir) sempre lê a lista atual do próprio item
    primeiro e manda a lista completa de novo, nunca só o que mudou.
  - Descrição do item de teste veio como `description_type: "extended"`
    (com imagem embutida) — `update_item` recusa sobrescrever isso sem
    `description_type: "normal"` explícito no corpo. Sempre gravamos
    como `"normal"` (texto puro), igual ao padrão já usado no ML.
  - Upload de foto (`media_space/upload_image`) rejeita imagem 1x1 de
    teste ("image is invalid or not supported") — funcionou normal com
    uma foto de tamanho real. Ciclo completo testado ao vivo: upload →
    anexar (2 fotos) → excluir (voltou pra 1) — tudo confirmado no item
    de teste real antes de escrever a tela.
  - **Efeito colateral dos testes**: o item de teste (885183339) ficou
    com título/descrição sem acento ("Divisoria em MDF Preta" / texto de
    teste) — é só o item de sandbox, não afeta nada real, mas fica
    registrado pra não confundir se o Raphael notar.
- `shopee-insights/index.ts`: 7 ações novas — `suggest_item_content`/
  `apply_item_content` (IA de título/descrição, mesmo padrão do
  `suggestContent` do ML mas sem tendência de categoria/perguntas reais,
  que a Shopee ainda não confirma pra gente), `update_item_technical`
  (peso/dimensão), `suggest_item_images`/`generate_item_image`/
  `generate_item_image_custom` (mesma infra de geração de foto por IA do
  ML — `gpt-image-1`, `/v1/images/edits` — só que quadrada 1:1 em vez de
  vertical, que é como a Shopee mostra a foto), `attach_item_image`/
  `delete_item_image` (upload + merge/filter da lista completa).
- `ShopeeItemDetailPage.jsx`: abas Conteúdo & IA, Imagens & IA, Ficha
  Técnica (edição de peso/dimensão — condição/marca ficam só leitura por
  enquanto) e Desempenho ficaram todas funcionais. Desempenho **não busca
  ao vivo na API da Shopee** (sem endpoint de métrica por item confirmado
  ainda) — lê dos nossos próprios pedidos já sincronizados, casando pelo
  título exato do anúncio (não temos `item_id` salvo no pedido, só
  SKU/título).
- **Pendências que ficaram de fora de propósito**: edição de marca
  (precisaria validar contra `get_brand_list` da categoria, não testado),
  edição por variação/modelo (item de teste não tem nenhuma variação pra
  testar contra), Ads/tráfego por anúncio (endpoint não confirmado).

`npm run build` limpo. Não testado clicando na tela (mesmo motivo de
sempre — login pede credencial que eu não tenho).

---

### 2026-09-16 (12ª parte) — Detalhe do anúncio da Shopee (parte 1: Visão Geral + edição rápida de preço/estoque)

Raphael perguntou se dá pra ter a tela de detalhe do anúncio da Shopee
igual à do ML (`MlItemDetailPage.jsx` — clicar no anúncio e editar tudo:
título, descrição, imagem, preço, promoções). Confirmado que **não
existe ainda** (não é limitação de API, só não tinha sido construído).
Combinado ir **por partes**: esta é a parte 1 — Visão Geral + edição
rápida de preço/estoque + pausar/reativar. Conteúdo & IA, Imagens & IA,
Ficha Técnica completa e Desempenho ficam pra próximas partes (abas já
aparecem na tela, desabilitadas, marcadas "em breve" — não fingem
funcionar).

- **Testado contra a API real antes de escrever a tela** (mesmo padrão
  do dia todo): `get_item_base_info` com `response_optional_fields`
  ampliado (descrição, peso, dimensão, marca, condição, `update_time`)
  + `get_model_list` (variações — item de teste não tem nenhuma,
  `has_model:false`) contra o item de teste real (`885183339`). Depois
  `update_price` e `update_stock` testados de verdade (mantendo os
  mesmos valores atuais — 123 e 11 — só pra validar o formato do
  endpoint sem mudar nada), os dois responderam `success_list` de
  primeira com o formato que eu tinha montado
  (`price_list:[{model_id:0,original_price}]`,
  `stock_list:[{model_id:0,seller_stock:[{location_id,stock}]}]`).
- `shopee-insights/index.ts`: 3 ações novas — `item_detail` (mescla
  `get_item_base_info` + `get_model_list` + `get_item_content_diagnosis_result`
  numa resposta só), `update_item_price`, `update_item_stock` (ambas
  logam em `shopee_item_updates`, mesmo padrão de `update_item_status`).
- `ShopeeItemDetailPage.jsx` (novo), rota `/shopee/item/:itemId`. Cards
  de header (foto/título/status/pendências), "Ações rápidas" (preço +
  estoque, 1 só `ConfirmWriteModal` pros dois se mudar junto), ficha
  técnica resumida, descrição, botão pausar/reativar reaproveitando
  `updateItemStatus` já existente.
- `ShopeeHealthPage.jsx` e `ShopeeActiveListingsPage.jsx`: os cards da
  lista agora navegam pro detalhe ao clicar (antes não iam a lugar
  nenhum); link externo pra Shopee e botão pausar/reativar da lista
  continuam funcionando direto ali, sem abrir o detalhe (`stopPropagation`).
- Item com variação (`has_model:true`) não testado ainda — a tela avisa
  que a edição de preço/estoque é no nível do item inteiro nesse caso;
  edição por variação fica pra quando aparecer um item de teste com
  variação de verdade.

`npm run build` limpo. Não deu pra testar clicando na tela (login do
sistema pede credencial que eu não tenho) — Raphael testa ao vivo depois
de subir pro Hostinger (ver pendência de deploy, item 1 dos próximos
passos).

---

### 2026-09-16 (11ª parte) — Saúde dos Anúncios (Shopee) + bug real corrigido na Visão Geral

**Bug real achado pelo Raphael** testando a Visão Geral: `Bad Request`
ao carregar. Causa: a tabela `orders` tem **1.666 pedidos com
`source='shopee'`** (histórico da importação manual por `.xlsx`, não só
o pedido de teste de hoje) — `useShopeeInsights.fetchOverview` buscava
todos os IDs de pedido do período e fazia um 2º `select` em
`order_items` com `.in('order_id', [...milhares de UUIDs])`, estourando
o limite de tamanho da URL. Corrigido: 1 consulta só, com join embutido
(`order_items?select=...,orders!inner(...)&orders.source=eq.shopee&...`),
filtro aplicado do lado do `orders` — escala independente de quantos
pedidos existirem. **Achado a parte**: os pedidos históricos da Shopee
nunca tiveram `preco_unit` salvo (parser do `.xlsx` sempre gravou null)
— a receita na Visão Geral só vai refletir pedidos sincronizados pela
API a partir de agora, não o histórico manual.

**"Saúde dos Anúncios" da Shopee** — pedido do Raphael, mesmo espírito
do `MlHealthPage.jsx`, mas simplificado (sem os conceitos específicos do
ML que não têm equivalente confirmado: Full/frete, buy box, Ads
overlay).
- Testado **duas vezes contra a API real antes de escrever a versão
  final** (mesmo padrão de hoje): 1ª chamada de descoberta
  (`item_content_diagnosis_debug`) revelou o formato real de
  `get_item_content_diagnosis_result` —
  `response.success_item_list[{item_id, quality_level, unfinished_task:[{issue_type,suggestion}]}]`
  — batendo com a realidade (o item de teste só tem 1 foto, e a sugestão
  real veio "Add at least 3 images"). 2ª chamada já testou a função
  final (`items_health`, mescla diagnóstico + `get_item_base_info` pra
  título/foto/link) — resultado correto de primeira.
- 3 níveis de status (saudável/atenção/perdendo exposição) por
  quantidade de `unfinished_task` — não inventei limite pelo
  `quality_level` em si, a escala completa dele não foi confirmada.
- `ShopeeHealthPage.jsx`, rota `/shopee/saude`, item novo no menu.

`npm run build` limpo.

---

### 2026-09-16 (10ª parte) — Anúncios da Shopee: listar + pausar/reativar

Segundo módulo da Shopee (depois de "Visão Geral"), mesmo espírito do
`MlActiveListingsPage.jsx`.

- `supabase/functions/shopee-insights/index.ts` (novo — 1 function pra
  várias ações, mesmo desenho do `ml-insights`): `active_listings`
  (`get_item_list` NORMAL+UNLIST paginado + `get_item_base_info` em
  lotes de 50) e `update_item_status` (`unlist_item`, escrita).
  `shopee_item_updates` (log, espelha `ml_item_updates`) —
  `supabase/fase62-shopee-item-updates.sql`.
- **Testado direto contra a API real antes de mostrar pro Raphael** (só
  leitura, sem risco) — bateu certo de primeira com o item de teste
  real (`885183339`, "Divisória em MDF Preta", preço 123, estoque 11).
  Os nomes de campo que eu tinha "chutado" com base na doc pública
  (`price_info[0].current_price`, `stock_info_v2.summary_info.total_available_stock`,
  `image.image_url_list[0]`) estavam certos.
- `ConfirmWriteModal.jsx` (compartilhado com o ML) ganhou prop
  `platform` (default `'Mercado Livre'`, Shopee passa `'Shopee'`) —
  tinha o nome do ML fixo no texto de aviso, generalizei em vez de
  duplicar o componente inteiro só por isso.
- `ShopeeActiveListingsPage.jsx` + `fetchActiveListings`/
  `updateItemStatus` em `useShopeeInsights.js`. Rota `/shopee/anuncios`,
  item novo no menu "Shopee".
- **Escrita (pausar/reativar) ainda não testada contra a API real** —
  só a leitura foi validada. Fica pro Raphael testar pela tela (sempre
  atrás do modal de confirmação).

`npm run build` limpo. **Lembrete de novo**: precisa subir o `dist/`
pra Hostinger antes de testar — nada disso está em produção ainda.

---

### 2026-09-16 (9ª parte) — Cores do sidebar trocadas (ML=amarelo, Produção=verde, Shopee=laranja) + módulo Shopee "Visão Geral"

**Pedido do Raphael**: trocar o tema verde do ML pelo amarelo (cor real
da marca), Produção herda o verde; Shopee usa laranja (cor da marca
deles). Primeiro módulo real da Shopee: "Visão Geral", igual ou melhor
que a do ML.

- `Sidebar.jsx`: `SECTION_COLORS['Otimização ML']` e
  `['Produção']` trocados de lugar; `'Shopee': { #EE4D2D }` novo. Nova
  seção "Shopee" no menu com o primeiro item "Visão Geral" (`/shopee`).
- `shopee-insights` registrado em `AccessControlPage.jsx` +
  `role_permissions` (role `marketplace`, `enabled: false` por padrão,
  igual todo módulo novo — Raphael habilita quando quiser pela tela de
  Acessos).
- `ShopeeOverviewPage.jsx` + `useShopeeInsights.js` (novo módulo
  `src/modules/shopee-insights/`): **decisão de arquitetura diferente do
  ML de propósito** — o painel do ML busca direto na API deles toda vez
  que abre (`MlAccountDashboardPage.jsx`, comentário explícito na tela:
  "não é do nosso banco"); aqui é o contrário, lê direto de `orders`/
  `order_items` (`source='shopee'`) já sincronizados pela Fase 1 — mais
  rápido, sem risco de limite de chamada, e ainda ganha um card de
  status de conexão (loja/sandbox/última venda) que o do ML nem tem.
  Mesma estrutura visual (KPIs, evolução de receita, padrão por dia da
  semana, calendário de frequência, melhores produtos).
- **Deixado "Em breve" de propósito**: Saúde da loja / Ads da Shopee —
  endpoints exatos não confirmados contra doc oficial ainda, mesmo
  cuidado já tomado o resto do dia (não adivinhar sem validar).

`npm run build` limpo.

---

### 2026-09-16 (8ª parte) — Fase 1 da Shopee VALIDADA de ponta a ponta com pedido real

Raphael criou um "Test Order" de verdade no console da Shopee
(`2609178967T17D`, item "Divisória em MDF Preta", status
`READY_TO_SHIP`, loja `227914440`). Criar o pedido pela ferramenta **não
disparou o push sozinho** (achado novo — só "Push Test Data" dispara de
verdade) — contornado inserindo manualmente 1 linha em
`shopee_webhook_events` com o `ordersn` real, pra forçar o Database
Webhook e testar o caminho completo sem depender de mais cliques no
console.

**Resultado — sucesso completo, primeira tentativa**:
- `orders`: `source=shopee`, `num_venda=2609178967T17D`,
  `status_ml='Pronto para envio'` (`READY_TO_SHIP` → PT via
  `ORDER_STATUS_PT`, certo), `comprador='local_regress.br'`,
  `cidade/estado_uf='São Paulo'`.
- `order_items`: "Divisória em MDF Preta", qtd 1.
- `notifications`: `shopee_order_synced` criada pra cada admin — dispara
  o `ShopeeSaleToast.jsx` (card flutuante, som, sino) via Realtime.

**Fase 1 (sync de pedido em tempo real da Shopee) está funcionando de
verdade** — mesmo nível de confiança que a integração ML hoje. Mapeamento
de status/campos que antes era "não confirmado contra evento real" (ver
6ª/7ª partes) agora está validado com dado genuíno da própria loja.

**Pendente pra continuar depurando com o Raphael**: confirmar se o toast
apareceu ao vivo no navegador dele (Realtime) — a notificação foi
criada no banco certo, só falta essa confirmação visual final.

---

### 2026-09-16 (7ª parte) — Push Mechanism ligado, payload real confirmado + toast visual de venda Shopee

Raphael registrou a URL do `shopee-webhook` em Push Mechanism e
configurou o Database Webhook (tipo "Supabase Edge Functions", mais
simples que "HTTP Request" — não precisa de header de autenticação
manual). Testou com "Push Test Data" no evento `order_status_push`
(código 3).

**Payload real confirmado — bateu exatamente com o que o código já
esperava**:
```json
{"code":3,"data":{"completed_scenario":"","items":[],"ordersn":"2501080NKAMXA8","status":"UNPAID","update_time":1736323997},"msg_id":"...","shop_id":341431138,"timestamp":1736323998}
```
`extractOrderSn` (`shopee-process-webhook`) achou `data.ordersn` de
primeira. Deu erro `error_not_found` no `get_order_detail` **porque o
dado de teste da Shopee é de uma loja de exemplo genérica (shop_id
341431138), não a nossa (227914440)** — esperado, não é bug; prova que
a cadeia inteira (receber → enfileirar → processar → chamar API)
funciona. Falta só um pedido de teste NA NOSSA loja (via "Test Order" no
console) pra validar o caminho de sucesso completo (gravar pedido +
notificar).

**Achado à parte**: a Shopee manda um "ping de verificação" (`code: 0`,
`data.verify_info`) quando você salva a Test Call Back URL pela primeira
vez — nosso webhook aceita e enfileira normalmente (responde 200), não
travou o "Verify and Save" deles. Fica registrado sem processar (sem
`order_sn`), inofensivo.

**Construído**: `ShopeeSaleToast.jsx` (espelha `MLSaleToast.jsx` —
card flutuante, som, título piscando, sino chacoalhando), conectado em
`Layout.jsx` e `NotificationBell.jsx` (tipo `shopee_order_synced` novo
no mapa de ícones). Teste manual via console: `testShopeeToast()`.

`npm run build` limpo.

---

### 2026-09-16 (6ª parte) — Shopee Fase 1: sync de pedido em tempo real construído (falta ligar o Push Mechanism)

**Construído**, espelhando exatamente o desenho já validado do ML
(`ml-webhook`/`ml-process-webhook`):
- `shopee-webhook`: recebe o push da Shopee, grava cru em
  `shopee_webhook_events` (já existia desde a fase61) e responde rápido
  — testado com um payload sintético, confirmado gravando certo.
- `shopee-process-webhook`: disparado por Database Webhook no INSERT da
  fila, busca o `order_sn` no payload, chama
  `/api/v2/order/get_order_detail` (loja já conectada, token com
  refresh automático), mapeia pro formato comum e grava via
  `upsert_orders_safe`/`insert_order_items_safe` — **mesmas RPCs que o
  ML já usa**, `source: 'shopee'`. Gera pedido de produção e notifica
  admin, igual ao ML (Full ainda não mapeado — Shopee tem conceito
  próprio, SBS/FBS, ver [[coisapet_shopee_api_research]] — fica `false`
  por enquanto).
- Corte de "dia do picklist" pra Shopee = meia-noite de Brasília (sem
  corte artificial tipo o do ML, porque a Shopee já manda
  `ship_by_date` pronto) — mesmo critério que a importação manual já
  usa (`plainDayStart`, `useOrders.js`).

**Ressalva importante**: o formato exato do payload de push e da
resposta de `get_order_detail` **não foi confirmado contra um evento
real** — a doc oficial bloqueou acesso automático de novo (mesma
limitação do estudo comparativo de 15/09). Escrito de forma permissiva
de propósito: evento sem `order_sn` reconhecível não dá erro, só fica
marcado como concluído com o `raw_payload` salvo — dá pra inspecionar e
ajustar o parsing sem perder o evento.

**Falta pro Raphael pra testar de ponta a ponta**:
1. Registrar a URL `https://lcybmdiqxmbqeuyeuhdj.supabase.co/functions/v1/shopee-webhook`
   em **"Push Mechanism"** no console da Shopee (Gerenciamento de
   aplicativos → Push Mechanism).
2. Configurar o **Database Webhook** no Supabase (Database → Webhooks,
   INSERT em `shopee_webhook_events` → HTTP Request →
   `shopee-process-webhook`) — mesmo passo manual que já foi feito pro
   ML, não dá pra fazer por SQL.
3. Gerar um pedido de teste de verdade em **Ferramentas → Test Order**
   (visto no menu lateral do console) — isso deve disparar o push de
   verdade e a gente confirma o pedido chegando na tela de Pedidos.

---

### 2026-09-16 (5ª parte) — Shopee: conexão OAuth funcionou de ponta a ponta (sandbox estabilizou)

Depois da pausa da 2ª parte (500 na criação da conta de teste, 403 no
login mesmo com captcha certo), o ambiente sandbox da Shopee
estabilizou e o Raphael conseguiu autorizar o app de verdade. Confirmado
no banco: `shopee_integration` com `shop_id 227914440` (a mesma loja de
teste criada antes), token salvo, badge "Shopee conectada (sandbox)" ao
lado do ML na tela de Pedidos. Todo o desenho construído na 2ª parte
(assinatura HMAC, `shopee-oauth-callback`, refresh automático) validado
funcionando com uma autorização real, não só teste de curl.

**Próximo passo natural**: Fase 1 continua — sync de pedido em tempo
real (`shopee-webhook`/`shopee-process-webhook`, mesmo desenho do
`ml-webhook`), ainda não construído.

---

### 2026-09-16 (4ª parte) — Desconto em massa: múltiplas campanhas ao mesmo tempo + ajustes no 5%

**Pedido do Raphael**: quer 5% de desconto mesmo (já conseguiu aplicar
em outros anúncios depois do fix do arredondamento — confirmado
funcionando) e perguntou se dava pra ter 2 campanhas ativas ao mesmo
tempo (ex: "Super Promo" 10% em uns itens + "Promoçãozinha" 5% em
outros).

- Tirei a trava que eu tinha posto forçando mínimo 10% (excesso de
  zelo meu, sem necessidade — o bug real já era só o arredondamento,
  corrigido na 3ª parte).
- `MlPromotionsPage.jsx` reescrita: a tela pegava só a PRIMEIRA
  campanha `SELLER_CAMPAIGN` ativa (`.find()`) — agora lista TODAS
  (`.filter()`), cada uma como um card independente
  (`BulkDiscountCampaignCard`, componente novo) com seu próprio
  carregamento de itens/seleção/%/busca/confirmação. Botão "+ Nova
  campanha" sempre disponível, não só quando não tem nenhuma.
- `sellerCampaignLastChange` (edge function + hook) ganhou parâmetro
  opcional `promotion_id` — sem isso, o "última alteração" de uma
  campanha vazava pra todas as outras (o log era filtrado só por
  `promotion_type`, não por campanha específica).
- **Não sabemos ainda se a API do ML permite item repetido em 2
  campanhas simultâneas** — não travei nada tentando adivinhar essa
  regra (doc bloqueou acesso automático de novo). Segue a filosofia já
  estabelecida: erro real do ML aparece isolado por item quando o
  Raphael testar de verdade.

`npm run build` limpo.

---

### 2026-09-16 (3ª parte) — Desconto em massa (ML): 2 bugs reais corrigidos — "já com desconto" era mentira + rejeição por desconto abaixo de 5%

**Reportado pelo Raphael**: aba "Desconto em massa" (Campanhas &
Promoções) tinha 232 itens listados como "JÁ COM DESCONTO" numa campanha
ativa, mas ele não achava o desconto em nenhum produto real; o link de
cada item também não levava pro anúncio de verdade; e a lista pra
selecionar produtos (embaixo) aparecia vazia.

**Causa raiz (achada sem precisar de gravação real — só lendo o que a
tela já tinha em tela)**: `promotion_candidates` da API do ML devolve
**todo item elegível** pra aquela campanha, não só quem já entrou —
confirmado pelo próprio rótulo "Candidato" ao lado de cada um dos 232 no
print (`ITEM_STATUS_LABEL.candidate = 'Candidato'`, já existia no
código, só não estava sendo respeitado). A tela tratava qualquer item
retornado por esse endpoint como "já descontado", e por tabela excluía
esses 232 "candidatos" (quase o catálogo inteiro) da lista de seleção
— por isso ela aparecia vazia. `bulkLastChange` mostrando "Nenhuma
alteração registrada ainda" já era a pista de que nada tinha sido
gravado de verdade.

**Corrigido** (`MlPromotionsPage.jsx`):
- `loadBulkDiscount()` agora filtra `status !== 'candidate'` antes de
  guardar em `bulkCampaignItems` — só quem realmente está
  `pending`/`started` conta como "já com desconto" e entra na lista de
  exclusão da seleção.
- Link de cada item na lista "já com desconto" passou a usar o
  `permalink` real (buscado em `bulkItems`, que já vem de
  `active_listings`) em vez de montar `produto.mercadolivre.com.br/ID`
  na mão — esse formato sem hífen não é uma URL válida do ML.

**Testado ao vivo pelo Raphael logo em seguida**: selecionou 2 itens
com 5% e levou erro real do ML —
`MINIMUM_DISCOUNT_PERCENT: Discount final Price must be more than 5
Percent`. **3º bug, achado na hora**: `computeDiscountedPrice` usava
`Math.round` pra arredondar o preço final em centavos — isso pode
arredondar o preço PRA CIMA (ex: R$62,90 a 5% off = R$59,755 → arredonda
pra R$59,76 → desconto real vira 4,99%, não 5%), e o ML exige desconto
**maior que** o mínimo, não igual. Trocado pra `Math.floor` (sempre
arredonda o preço pra baixo, nunca deixa o desconto real ficar abaixo do
pedido). Também travado de verdade o campo de %: o `min={10}` do input
era só visual (não bloqueava digitar 5) — agora tem `onBlur` que força
de volta pra 10 se digitar abaixo disso.

`npm run build` limpo. Ainda não confirmado se o `SELLER_CAMPAIGN`
produz o visual "de/por" (riscado + badge) na página do produto quando
aplicado de verdade — nenhum desconto genuíno tinha sido aplicado até
agora (era tudo candidato fantasma). Próximo teste do Raphael com os
bugs corrigidos vai confirmar isso.

---

### 2026-09-16 (2ª parte) — Shopee: app criado, OAuth de conexão funcionando (Fase 1 iniciada)

**Feito junto com o Raphael**, passo a passo pelo console da Shopee
(open.shopee.com): criado o app "Sistema Coisa Pet" (categoria "Sistema
interno do vendedor"), enviado pra revisão de produção (resultado em
24h), e já com credenciais de **teste** liberadas na hora (`Test
Partner_id: 1244669`, `Test API Partner Key`) — guardadas como secrets
no Supabase (`SHOPEE_PARTNER_ID`, `SHOPEE_PARTNER_KEY`, mesmo padrão do
`ML_CLIENT_ID`/`ML_CLIENT_SECRET`).

**Construído** (primeira peça da Fase 1 do plano — ver
[[coisapet_shopee_api_research]]):
- `shopee_integration` (token da loja conectada), `shopee_connection_status()`/
  `shopee_disconnect()` (SECURITY DEFINER, expõe só status pro front) e
  `shopee_webhook_events` (fila, ainda não processada — próxima etapa) —
  ver `supabase/fase61-shopee-integracao.sql`. Mesmo desenho do
  `ml_integration`.
- `supabase/functions/_shared/shopee.ts`: assinatura HMAC-SHA256
  (`partner_id + api_path + timestamp`, hex) — diferente do ML, que não
  assina nada. `getValidIntegration`/refresh automático, `shopeeFetch`
  genérico pra próxima fase.
- `shopee-oauth-callback`: **diferente do `ml-oauth-callback`** — a
  Shopee exige o link de autorização assinado com a `partner_key`
  (secreta), então não dá pra montar esse link no front (como fazemos
  com o ML, cujo `client_id` não é secreto). A mesma function faz os 2
  papéis: sem `code` na query = monta o link assinado e redireciona;
  com `code` = troca por token e salva.
- `ShopeeConnect.jsx` — botão "Conectar Shopee" ao lado do do ML, em
  Pedidos (`OrdersPage.jsx`).

**Incidente real durante o desenvolvimento**: primeira tentativa deu
`{"error":"error_sign","message":"Wrong sign."}` repetidamente. A causa
**não era a fórmula da assinatura** (essa já estava certa) — era o
**domínio do ambiente sandbox**. Usei
`partner.test-stable.shopeemobile.com` (aparece em várias fontes
secundárias/SDKs comunitários que pesquisei) mas o domínio real, **só
confirmado com print da documentação oficial que o Raphael mandou**
(`open.shopee.com/developer-guide/20`), é
`https://openplatform.sandbox.test-stable.shopee.sg`. Corrigido e
**testado de ponta a ponta via curl**: o redirect final da Shopee agora
é uma tela de login de verdade, não mais erro de assinatura. Lição:
fontes secundárias sobre API de terceiro podem estar desatualizadas ou
cobrir domínio errado — quando disponível, sempre preferir a
documentação oficial (nem que seja via print, se o fetch automático não
alcançar).

**Pendente pro Raphael**: criar uma **Conta de teste - Sandbox** no
console da Shopee (Ferramentas → Conta de teste) — sem isso não dá pra
completar o login de autorização de verdade (as credenciais de teste só
autenticam contra loja de teste, não contra a loja real da CoisaPet).
Depois disso, clicar em "Conectar Shopee" na tela de Pedidos do sistema
e testar o fluxo completo ao vivo.

---

### 2026-09-16 — Manuais de produto: 404 no ar + Supabase não serve .html renderizável

**Reportado pelo Raphael**: subiu um manual de teste (aba "Manuais") e
clicando no link deu 404. Também perguntou se dava pra fazer o Apache
"interpretar" o `.html` já que talvez o Supabase não suportasse servir
isso direto.

**Causa 1 (o 404)**: as pastas novas `doc/` e `links/manuais/` (criadas
na sessão de 15/09) nunca foram de fato subidas pro Hostinger — só
existiam no repo local. Confirmado ao vivo: `coisapet.com.br/doc/` e
`/links/manuais/` respondem 404 em produção. **Continua pendente** — só
eu subir código, quem sobe pro `public_html` é o Raphael (mesmo processo
manual de sempre).

**Causa 2 (achado real, a pergunta dele estava certa)**: testei direto —
o Supabase Storage **recusa servir um `.html` com content-type
renderizável**, mesmo mandando `contentType: 'text/html'` no upload.
Sempre devolve `text/plain` + `X-Content-Type-Options: nosniff`. Isso é
proteção deliberada deles contra XSS (domínio de storage é compartilhado
entre todos os clientes Supabase) — não é bug nosso, nem tem como
contornar mandando header diferente. PDF não tem essa restrição.
Detalhe registrado em [[coisapet_supabase_html_serving_gotcha]] na
memória do Claude, pra não redescobrir isso do zero numa sessão futura.

**Corrigido:**
- `useProductDocs.js`: upload de arquivo passa a fixar `contentType`
  pela extensão (`.pdf`→`application/pdf`, `.html`→`text/html`) em vez
  de confiar no `file.type` do navegador — o navegador às vezes manda
  vazio pra `.html`, e sem isso o supabase-js cai pra `text/plain`
  mesmo na metadata.
- Novo `doc/ver.html`: visualizador que busca o `.html` bruto via
  `fetch().text()` (isso funciona normal, o bloqueio é só em servir com
  content-type certo) e desenha num `<iframe sandbox>` isolado, no nosso
  próprio domínio — exatamente a ideia que o Raphael sugeriu ("fazer o
  Apache interpretar"). `doc/index.html` agora manda recurso `kind=file`
  com extensão `.html`/`.htm` pro visualizador em vez de linkar direto
  pro Supabase; `.pdf` continua linkando direto (esse o Supabase serve
  certo).
- O manual de teste que ele já tinha subido (`Substrato Aspen`) foi
  corrigido diretamente via API do Supabase (re-upload do mesmo conteúdo
  em outro path, já que o `content_type` antigo tinha ficado errado e o
  Supabase não permite `UPDATE` de objeto existente com as policies
  atuais — só insert/select/delete).

**Ainda pendente**: Raphael subir `doc/` (incluindo `.htaccess` e o novo
`ver.html`) e `links/manuais/` pro `public_html` da Hostinger — só depois
disso dá pra testar o fluxo completo ao vivo.

---

### 2026-09-15 (10ª parte) — Raphael conseguiu acesso à API da Shopee: estudo comparativo com ML feito

**Pedido do Raphael**: conseguiu acesso à API oficial da Shopee (Shopee
Open Platform, v2) e pediu um estudo — o que a API oferece, comparado
com tudo que já foi construído pra Mercado Livre no sistema, e o que dá
pra fazer a mais.

**Feito**: pesquisa via subagente (fork), comparando por área funcional
(Pedidos, Anúncios, Imagens, Ads, Cupons/Promoções, Chat/Perguntas,
Reputação/Saúde, Estoque Full/Logística, Webhooks). Detalhe completo e
fontes salvos na memória do Claude
([[coisapet_shopee_api_research]]) — resumo rápido:

- **Ganhos reais que o ML não tem**: Ads/Impulsionamento gerenciável via
  API (no ML é só leitura, confirmado antes), Estoque Full com API real
  (SBS/FBS, sem precisar de scraping como fizemos pro ML), criar cupom
  via API, recovery de webhook perdido, nota fiscal (NF-e) integrada ao
  pedido.
- **Continua igual**: automação de resposta a chat/perguntas por IA —
  existe Chat API na Shopee, mas não vem liberada por padrão, precisa
  pedir acesso extra.
- **Ressalva**: não deu pra acessar `open.shopee.com` direto (fetch
  falhou) — pesquisa usou um SDK comunitário (`congminh1254/shopee-sdk`)
  como proxy da API oficial. Estrutura geral tem confiança boa; detalhes
  finos de payload precisam ser conferidos na doc oficial antes de
  codar, agora que há acesso real.
- **Prioridade sugerida pra Fase 1** (mesma lógica do ML — pedido
  primeiro): (1) sync de pedido em tempo real, (2) Estoque Full via SBS,
  (3) Ads API, (4) Cupom/Flash Sale via API, (5) Chat API por último.

**Pendência**: Raphael vai criar o app da Shopee e passar as credenciais
da API amanhã (16/09) pra começar a Fase 1 de verdade.

---

### 2026-09-15 (9ª parte) — Manuais/instruções/vídeo por produto: coisapet.com.br/doc/&lt;slug&gt;

Pedido do Raphael: começar a subir manual de montagem, instruções de uso
e link de vídeo por produto, com URL amigável, cadastrado na mão no
painel (mesmo padrão de `bio_links`) — e achável a partir do `/links`
público sem listar todo produto lá, só uma entrada "Manuais e Dicas de
Uso" levando pra um hub à parte com busca. Plano revisado com ele antes
(1 pergunta: abrir cada recurso como link direto em nova aba — confirmado
— em vez de embutir/iframe).

**Construído:**
- Tabela nova `product_doc_resources` (produto → N recursos: manual,
  instruções, vídeo... cada um `kind='link'` — URL externa tipo YouTube —
  ou `kind='file'` — upload de `.html`/`.pdf`) + bucket `product-docs` —
  ver `supabase/fase60-product-docs.sql`. Usa `products.slug`, que já
  existia 100% populado (550/550 produtos ativos) — não precisou de
  coluna nova pra isso.
- Painel interno: nova aba **"Manuais"** dentro de `/bio-links`
  (`BioLinksPage.jsx`) — busca produto, adiciona recurso (link ou
  arquivo), lista por produto com link "Ver página" e remoção.
- Público (fora do build React, mesmo molde de `links/index.html`):
  `doc/index.html` + `doc/.htaccess` (rewrite `/doc/<slug>` → index.html,
  lê o slug de `location.pathname`) e `links/manuais/index.html` (hub
  estilo linktree com busca client-side, lista todo produto com pelo
  menos 1 recurso).
- **Achado importante**: RLS está **desligada** na tabela `products`
  (`relrowsecurity=false`) — as policies existentes lá (`autenticados_*`)
  não fazem nada na prática, a tabela já é 100% aberta pro `anon`. Foi
  assim que confirmei que as páginas públicas novas conseguem ler
  produto por slug sem precisar de policy nova nessa tabela.
- Adicionada a entrada "Manuais e Dicas de Uso" em `bio_links`
  (categoria `geral`, aponta pra `/links/manuais/`) — zero código novo em
  `links/index.html`, só uma linha na tabela, mesmo fluxo de sempre.

**Testado**: consultas reais via REST com a `anon key` (produto por slug,
recursos por produto, embed produto↔recursos pro hub) — todas retornaram
certo, testado com uma linha real inserida e removida em seguida.
`npm run build` limpo. **Não testado no navegador de verdade** (painel
nem páginas públicas) e **as páginas estáticas novas (`doc/`,
`links/manuais/`) ainda não foram subidas pro Hostinger** — só existem
localmente/no repo por enquanto.

**Escopo combinado pra essa primeira leva** (começar simples, melhorar
depois): sem upload em massa, sem preview antes de publicar, sem
analytics de clique nos docs.

---

### 2026-09-15 (8ª parte) — Priorização semanal na lista de Atualização de Mídia

Pedido do Raphael: separar na lista os produtos já combinados pra Isa
trabalhar essa semana (meta informal: 3 a 5 por vez) dos demais, sem
duplicar entre as duas áreas.

- `product_media_status` ganhou `is_priority` + `prioritized_at` — ver
  `supabase/fase59-media-priority.sql`.
- Lista (`MediaControlPage.jsx`) virou 2 blocos empilhados (não abas —
  optei por isso pra dar pra ver "o que fazer essa semana" e navegar o
  catálogo completo na mesma rolagem, sem alternar aba): caixa "Priorizados
  esta semana" (destaque âmbar, com a meta "3 a 5" escrita) em cima, e "A
  priorizar" com todo o resto embaixo — um produto nunca aparece nas duas
  ao mesmo tempo. Estrela em cada card liga/desliga a prioridade
  (otimista, sem precisar abrir o produto).
- Prioridade é por grupo (mestre + variações contam como 1 card na
  lista, mesma granularidade que já existia) — não dá pra priorizar só
  uma variação específica sem priorizar o produto todo. Se isso virar
  problema real (ex: só uma cor precisa de sessão nova), avaliar depois.

`npm run build` limpo.

---

### 2026-09-15 (7ª parte) — Cache dos exemplos entre produtos + hover-zoom no carrossel

Dois ajustes pedidos pelo Raphael sobre o carrossel de referência (6ª
parte): (1) cache — os exemplos são os mesmos em qualquer produto e
raríssimo vão mudar, não fazia sentido recarregar do banco toda vez que
trocava de produto; (2) ver a imagem maior sem precisar clicar/abrir
modal.

- `useGuideExamples.js`: cache em variável de módulo (`cachedBySlot`),
  fora do hook — busca 1x por sessão (troca de produto só reusa o que já
  tem), só refaz a busca depois de um upload/remoção de verdade. URLs
  assinadas passaram a usar o cache já existente do app
  (`getSignedUrl`/`invalidateSignedUrl` de `signedUrlCache.js`, mesmo
  usado no resto do sistema) em vez de gerar de novo sempre.
- `GuideExampleCarousel.jsx`: hover-zoom — passar o mouse por cima do
  carrossel mostra a imagem atual bem maior flutuando por cima (sem
  clique, sem modal), some ao tirar o mouse.

`npm run build` limpo.

---

### 2026-09-15 (6ª parte) — Galeria de exemplos virou mini carrossel por check (não modal solto)

Raphael separou as imagens dos 5 guias prontos (uma por check, até 5 por
slot) e pediu pra ficarem visíveis direto na linha de cada check, ao lado
do box de upload, em vez do modal geral da 5ª parte — carrossel pagina
1 imagem por vez ("2/5") pra Isa ver a inspiração daquele tipo de foto
sem sair da tela.

- `media_guide_examples` ganhou `check_slot` (1-9) — ver
  `supabase/fase58-guide-examples-per-slot.sql`.
- `useGuideExamples.js` reescrito: carrega tudo de uma vez e agrupa por
  slot (`bySlot`), em vez de lista solta.
- `GuideExamplesModal.jsx` (5ª parte) removido; novo
  `GuideExampleCarousel.jsx` — carrossel compacto (mesma proporção 4:5 do
  box de upload) embutido na linha de cada check em
  `MediaChecklistPage.jsx`, com paginação, adicionar e remover.
- Box de upload encurtado (`w-24 sm:w-28`, antes `w-28 sm:w-32`) pra abrir
  espaço na linha.

`npm run build` limpo. Raphael ainda precisa subir as imagens separadas,
check por check, pelo "+" do carrossel — não é mais um botão único de
galeria geral.

---

### 2026-09-15 (5ª parte) — Proporção 4:5 + galeria de exemplos visuais do guia

Raphael mandou 5 guias prontos (exemplos gerados por IA pra Kit 3
Acessórios, Substrato Aspen, Banheirinha de Terra, Rodinha Silenciosa,
Terrário) e pediu: (1) trocar a proporção recomendada de 1:1 pra **4:5
(1080×1350px)** — slot de upload e o texto do banner em
`MediaChecklistPage.jsx` ajustados; (2) anexar essas imagens de exemplo
no módulo pra consulta visual.

**Limitação encontrada**: imagens coladas direto no chat não viram
arquivo acessível pra mim — não dá pra "salvar" elas no sistema
sozinho. Construí a galeria (`media_guide_examples`, tabela nova — ver
`supabase/fase57-guide-examples.sql`, reaproveita bucket
`product-photos` em `guide-examples/`) com upload próprio
(`GuideExamplesModal.jsx` + `useGuideExamples.js`), botão "Ver exemplos
do guia" tanto na lista quanto no detalhe. **O Raphael ainda precisa subir
essas 5 imagens manualmente pelo botão** — não é uma pendência de código,
é só a próxima ação dele.

`npm run build` limpo.

---

### 2026-09-15 (4ª parte) — Guia oficial de imagens (Manual de Marketplace) anexado em cada check + confirmado uso futuro pro ML/Shopee

Raphael mandou o guia definitivo (imagem "Manual de Marketplace — Guia de
Imagens para Produtos", 9 boxes com categoria/descrição/tags/objetivo/
pergunta do cliente/cuidado). Troquei o placeholder da 3ª parte pelo texto
real em `mediaChecklist.js` (agora com `category` C/E/ED/Opcional,
`tags`, `objective`, `quote` e `warning` por check) e redesenhei
`CheckCard` em `MediaChecklistPage.jsx`: saiu a grade 3×3 quadrada, entrou
uma lista vertical (foto à esquerda, guia completo à direita — cabe muito
mais texto). Adicionei também a "regra de ouro" do guia + padrão técnico
(2000×2000px, 1:1) como banner fixo no topo da página.

**Confirmado com o Raphael**: o objetivo não é só o site — é melhorar aos
poucos as fotos de **todos** os produtos pra alimentar também o Mercado
Livre (já tem API) e, quando a Shopee tiver API, lá também. Registrado em
memória (`coisapet_media_checklist_ml_shopee_goal`) pra não se perder em
sessão futura — qualquer feature de sync de imagem pro ML deve ler dessas
mesmas fotos (`product_images.check_slot`), não pedir upload duplicado.

`npm run build` limpo. Upload/troca de variação/vídeo ainda não testados
clicando na tela real (mesma pendência da 3ª parte).

---

### 2026-09-15 (3ª parte) — "Controle de Atualização dos Produtos" refeito: checklist de 9 fotos + 1 vídeo por produto/variação

**Pedido do Raphael**: o módulo antigo (tabela com status manual de vídeo/
foto/previsão/status geral) ia ser abandonado — surgiu um guia padrão de
9 fotos por produto (imagem que ele mandou: Hero, Ambientada+Pet, O que
acompanha, Dimensões, Benefícios, Detalhes construtivos, Uso/
Enriquecimento, Compatibilidade, Comparativo) + 1 vídeo de 10s, e a Isa
(Atendimento) precisa subir as fotos de verdade no sistema (não só marcar
status), escolhendo a variação certa quando o produto tiver mais de uma.

**Construído** (plano revisado com o Raphael antes de mexer — ver
`~/.claude/plans/replicated-snuggling-flurry.md` nesta máquina, só
local):
- **Reaproveitada `product_images`** (galeria já existente, usada hoje só
  em `ProductFormModal.jsx`, bucket `product-photos`) em vez de criar
  tabela paralela — nova coluna `check_slot` (1-9, índice único parcial
  por produto). Assim os uploads da Isa **já viram a galeria oficial do
  produto**, pronta pro site ler quando isso for decidido (mesma situação
  do Blog: existe internamente, site ainda não lê).
- `product_media_status`: removidos `video_status`, `photo_status`,
  `video_forecast`, `overall_status` (confirmado sem uso fora do módulo);
  adicionados `video_url`/`video_uploaded_at`. Mantidos feedback de
  montagem e observações, sem mudança de comportamento.
- Bucket novo `product-videos` (público, mp4/mov/webm, até 80MB) + RLS
  `anon` espelhando `product-photos`. Ver `supabase/fase56-media-checklist.sql`.
- Variação = a mesma linha `products` já usada em `ProductsPage.jsx`
  (agrupamento por `parent_product_id`) — não precisou de coluna nova.
  Página de detalhe mostra pills pra trocar entre variações do mesmo
  grupo.
- Tela de lista (`/producao/midia`) virou cards com progresso ("6/9 fotos"
  + ícone de vídeo) em vez da tabela larga de colunas. Clique abre página
  própria nova `/producao/midia/:productId` (rota nova, decisão do
  Raphael — não modal) com a grade 3×3 dos 9 checks (cada um com
  título/legenda do guia + dica dinâmica quando o produto já tem o dado
  estruturado, ex: dimensões, acessórios, espécies compatíveis — dados da
  fase 54) e o card de vídeo.
- **Textos dos 9 checks são placeholder** (copiados da imagem que ele
  mandou) — Raphael disse que vai mandar o guia escrito definitivo depois
  pra ajustar; ficou isolado em `src/modules/production/mediaChecklist.js`
  de propósito, pra ser 1 arquivo só de editar.

**Testado**: `npm run build` passou limpo, migration aplicada e conferida
em produção (colunas, índice único, bucket). **Não testado clique-a-clique
na tela real** (upload de foto/vídeo, troca de variação) — confirmar na
próxima sessão antes de passar pra Isa usar.

---

### 2026-09-15 (2ª parte) — CoisaDecor: novo status de pagamento "Cobrado"

Pedido do Raphael: separar contas já cobradas do cliente mas que ele
ainda não começou a pagar (diferente de "parcial", que já tem valor pago
> 0). Novo status `cobrado` entre "Em aberto" e "Pago parcial" no Kanban,
formulário e KPIs de `CoisaDecorPage.jsx`. Constraint
`coisadecor_orders_payment_status_check` atualizada em produção — ver
`supabase/fase55-coisadecor-status-cobrado.sql`. `npm run build` limpo.

---

### 2026-09-15 — Destino da imagem gerada era sempre a variação da foto BASE, não dava pra escolher nem mover

**Pedido do Raphael**: "precisamos deixar mais claro como uma imagem vai para cada variação" — exemplo real: pega a foto do Amadeirado como inspiração, pede pra IA fazer ela preta, mas o resultado vai pro Amadeirado (a variação da foto base) e não pro Preto (o destino de verdade) — e não tinha como mover depois.

**Causa**: clicar numa foto da galeria pra usar como referência (`selectedPictureUrl`) e escolher pra qual variação a imagem gerada vai (`variationId` mandado no `attach_item_image`) eram a MESMA ação/estado (`selectedVariationId`) — não dava pra usar a foto de uma variação como inspiração e mandar o resultado pra outra.

**Construído**:
- Desacoplado em dois estados: `selectedVariationId` (só destaca qual foto é a base/referência visual) e `targetVariationId` (pra onde a imagem gerada vai de verdade) — por padrão andam juntos (clicar numa foto já sugere a mesma variação como destino, comportamento de antes preservado), mas agora dá pra trocar o destino livremente antes de gerar (dropdown "Vai entrar em:" no card "Gerar nova imagem") e de novo na prévia antes de confirmar (mesmo dropdown, último checkpoint antes do `attach_item_image`).
- Nova ação `move_variation_picture` (`ml-insights/index.ts`) — move uma foto JÁ existente de uma variação pra outra num PUT só (tira do `picture_ids` de origem, acrescenta no de destino, sem duplicar), pra quando a foto já foi parar na variação errada e não faz sentido regenerar. Segue a mesma regra de ouro do incidente de 14/09 (`buildVariationsForWrite`, reenvia todas as variações + `pictures` explícito). Bloqueia se a foto for a única da variação de origem (mesma regra do `unlink`/`delete`).
- Botão novo (ícone de setas ⇄) no hover de cada foto da galeria, ao lado da lupa — só aparece quando o anúncio tem mais de 1 variação. Abre confirmação com seletor de variação de destino antes de gravar no ML.

**Testado**: `npm run build` passou limpo, edge function `ml-insights` reimplantada no Supabase (`supabase functions deploy ml-insights`). Clique-a-clique na tela real (gerar com destino diferente da base + mover foto existente) **não foi testado ao vivo** nesta sessão — vale conferir na próxima antes de considerar fechado, mesmo padrão de pendência de sessões anteriores.

---

### 2026-09-14 (3ª parte) — Definir foto principal + remover foto de 1 variação só (e 2º incidente real, já corrigido)

**Pedido do Raphael**: depois de conseguir só "reordenar", perguntou se dava pra ESCOLHER qual foto é a principal (resolvido com `reorder_variation_picture`, ver entrada anterior) — mas ao tentar excluir a foto genérica de uma variação que já tinha fotos próprias (Branco, 3 fotos), continuava bloqueado, mesmo Branco tendo mais de 1 foto.

**Causa**: `deleteItemImage` sempre olha o item INTEIRO — bloqueia mesmo se a variação em que você está clicando já tem fotos de sobra, porque OUTRAS variações (Azul, Preto, BERLIN, GEPETO, Verde-claro) ainda dependem só daquela foto. Faltava uma ação de escopo menor.

**Construído**: nova ação `unlink_variation_picture` — remove a foto só do `picture_ids` daquela variação (nunca mexe no array geral `pictures` nem em nenhuma outra variação). A tela agora decide sozinha qual ação usar ao clicar na lixeira: se a foto é compartilhada (tem o selo 🔗), vira "remover só dessa variação"; se é exclusiva, continua sendo exclusão de verdade do anúncio. Testado ao vivo: removida a foto genérica só do Branco, as outras 5 variações que ainda dependiam dela continuaram com ela normalmente.

**2º INCIDENTE real do dia, pego durante o teste ao vivo dessa função**: depois de testar `reorder_variation_picture` e `unlink_variation_picture`, uma foto REAL do Cobre (`876789-MLB74658223649_022024`, uma das 6 fotos originais, nunca tocada por nenhuma ação) sumiu sozinha do anúncio — nem do array geral `pictures` nem da variação Cobre. A foto continuava válida no CDN do ML (URL respondia 200), então não foi expiração — foi removida pelo próprio ML durante um dos PUTs. Causa suspeita: as duas funções novas só mandavam `variations` no corpo do PUT, sem incluir `pictures` — parece que o ML "sincroniza" o array geral quando ele não vem explícito, derrubando algo nesse processo. **Corrigido preventivamente**: as duas funções agora SEMPRE mandam `pictures` explícito também (idêntico ao que já tinha, sem mudança nenhuma nele) — regra nova, permanente: nenhum PUT que toque `variations` pode omitir `pictures`. Restaurada a foto do Cobre na hora (mesma técnica de sempre: snapshot salvo antes do erro). Registrado em memória (`coisapet-ml-variations-put-gotcha`) pra nunca mais esquecer, já que é o 2º incidente de gravação em `variations` no mesmo dia.

---

### 2026-09-14 (2ª parte) — Imagens & IA reorganizada: galeria por variação + excluir foto

**Pedido do Raphael**: depois do incidente (ver entrada acima), pediu pra reorganizar a aba de imagens de verdade — galeria por variação, poder adicionar/gerar/excluir foto, "confesso que tá bem difícil" de usar como estava.

**Construído**:
- `suggestItemImages` agora devolve a galeria já organizada: `variations[].pictures` (TODAS as fotos de cada variação, não só uma "representante") e `general_pictures` (fotos do item que não estão em nenhuma variação — inclui as órfãs que o bug de 13/09 tinha deixado invisíveis, agora aparecem numa seção própria pra poder limpar).
- Nova ação `delete_item_image` — remove a foto do array geral E de qualquer variação que a use, sempre pela mesma regra de segurança descoberta no incidente (reenvia todas as variações, nunca um subconjunto).
- Extraído `buildVariationsForWrite()` — helper único que tanto `attachItemImage` quanto `deleteItemImage` usam pra montar o `variations` de qualquer PUT, garantindo que a regra do incidente nunca seja esquecida de novo em código futuro.
- `MlItemDetailPage.jsx`: aba reescrita — 1 seção por variação (miniatura + nome, com lupa/lixeira no hover de cada foto), seção "Fotos gerais" quando existem órfãs, e um card de geração separado que sempre mostra pra qual variação a próxima imagem vai ("Gerando pra variação: Branco" etc.) antes de gerar qualquer coisa — a seleção de variação e a seleção de foto base viraram a mesma ação (clicar na foto já escolhe tudo junto).

**Bug pego pelo Raphael na primeira tentativa real de excluir**: `item.variations.picture_ids.invalid` — o ML rejeita a variação inteira se ela ficar com `picture_ids` vazio (variação sem nenhuma foto não é permitido). Corrigido com uma checagem ANTES do PUT: se a foto é a única de alguma variação, `deleteItemImage` bloqueia com mensagem clara nomeando a(s) variação(ões) afetada(s), em vez de deixar o JSON cru do ML estourar na tela. Testado ao vivo com o exato caso que falhou (MLB4685435660, foto compartilhada por Azul/BERLIN/GEPETO/Verde-claro) — bloqueou certinho nomeando as 4, sem tocar no anúncio.

**2º relato do Raphael — mesmo erro em variação com 2 fotos**: confuso, porque "Preto (2 fotos)" também acusava a foto travada. Causa: a foto genérica compartilhada aparece como a 1ª foto em TODAS as variações que ainda não têm foto própria (7 das 8) — visualmente parecia "a foto de Preto", mas é a mesma foto em todo lugar. Corrigido: cada miniatura compartilhada agora mostra um selo "🔗N" com o número de variações que a usam (hover mostra quais) — `variationsByPictureId` calculado em `suggestItemImages`, expõe `shared_with` por foto.

**Erro meu ao testar ao vivo pro Raphael**: pra provar que excluir funcionava, testei apagando a foto (de verdade, gerada) da variação Preto — sem perceber que era a foto BOA (não a genérica), deixando Preto de volta só com a genérica. Assumido e avisado na hora; ofereço regenerar.

**Pedido seguinte do Raphael**: "tem como eu escolher qual eu quero que seja a principal?" — nova ação `reorder_variation_picture` (só reordena `picture_ids`, promove uma foto já existente pra posição 0 = capa da variação no ML) — não precisa apagar a genérica pra ela deixar de ser a foto de destaque, só reordenar. Testado ao vivo: promovido a foto branca própria pra 1ª posição de Branco, genérica foi pra 2ª, as 8 variações continuaram intactas.

---

### 2026-09-14 — INCIDENTE: PUT de `variations` apagou 5 de 8 variações de um item real (causa raiz + fix permanente)

**O que aconteceu**: ao vincular a mão as 4 fotos geradas (ver 8ª parte de 13/09) à variação certa do `MLB4685435660`, o PUT `/items/{id}` foi feito enviando só as 3 variações que mudaram (Preto, Verde-escuro, Branco). O Mercado Livre trata o campo `variations` no PUT como **substituição TOTAL do array, não merge por id** — as outras 5 variações do anúncio real (Cobre, Azul, BERLIN, GEPETO, Verde-claro) foram **apagadas de verdade** do anúncio. O Raphael reportou na hora ("sumiram as outras variações").

**Correção de emergência**: tinha um snapshot completo das 8 variações salvo antes do erro (rotina de sempre nesse módulo: ler o item inteiro antes de qualquer PUT) — reconstruído o payload com as 8 (as 5 intocadas exatamente como estavam, as 3 com a foto nova mantida) e regravado. Confirmado ao vivo: as 8 voltaram, preço/estoque/fotos corretos.

**Efeito colateral que NÃO deu pra desfazer**: as 5 variações recriadas (Cobre, Azul, BERLIN, GEPETO, Verde-claro) voltaram com **IDs novos** no ML (o Preto/Branco/Verde-escuro mantiveram o ID original, por nunca terem saído do ar) — e o contador de "vendido" (`sold_quantity`) dessas 5 zerou (era histórico da variação antiga, que deixou de existir). Conferido: nenhuma tabela do nosso banco referencia `variation_id` do ML diretamente (a única coluna parecida, `product_variation_option_links.variation_id`, é `uuid` do catálogo interno, sem relação) — não quebrou nada por aqui, só o número exibido no próprio anúncio do ML.

**Causa raiz também confirmada durante a restauração**: reenviar um objeto de variação inteiro (como veio do GET) também falha — o ML rejeita com `catalog_product_id is not_modifiable` se esse campo (mesmo `null`) for ecoado de volta. Campos seguros pra reenviar num PUT de variação: `id`, `price`, `attribute_combinations`, `available_quantity`, `sale_terms`, `picture_ids`, `seller_custom_field`. NUNCA ecoar de volta: `catalog_product_id`, `inventory_id`, `item_relations`, `user_product_id`, `sold_quantity`.

**Fix permanente** (`attachItemImage` em `ml-insights/index.ts`): agora SEMPRE reenvia todas as variações existentes do item no PUT (buscadas antes, na mesma chamada), só trocando o `picture_ids` da variação alvo — nunca mais manda um array parcial. Mesma regra vale pra qualquer futura função que precise editar 1 variação: **regra de ouro, nunca esquecer** — `variations` no PUT do ML é sempre "tudo ou nada", nunca um patch por id.

---

### 2026-09-13 (8ª parte) — Nova aba "Imagens & IA" no detalhe do anúncio: sugestão e geração de foto real por IA

**Pedido do Raphael**: começar a atualizar as fotos dos produtos (além das descrições) — pediu uma aba nova na tela de Saúde de Anúncio (detalhe do item) com sugestões de criação de imagem baseadas nas perguntas dos compradores, com opção de já gerar a imagem sugerida usando a foto real do produto como base (API do ChatGPT e/ou Higgsfield). Confirmado por ele: (1) manter a geração mesmo quando o produto não tem nenhuma pergunta ainda (cai só na ficha técnica/descrição), (2) imagem sempre em proporção **vertical** (melhor visibilidade no app do ML), (3) pensar no caso de produto com variações (cor/modelo), e (4) além da sugestão por IA, ter uma opção de **prompt personalizado simples** (ex: "gere uma imagem deste item na cor rosa, sem mudar nada apenas a cor"). Pedido pra começar no mesmo dia.

**Pesquisa antes de implementar**: confirmado que o endpoint já usado no Blog pra edição de imagem (`gpt-image-1`, `POST /v1/images/edits`) aceita `size: "1024x1536"` (vertical 2:3) além do quadrado — não precisou de endpoint novo nem da Higgsfield (o fluxo de referência de foto real já tinha sido abandonado lá por "travar" no objeto, ver 12/09).

**Construído** (`ml-insights/index.ts`, mesmo padrão auto-contido do `blog-ai/index.ts`, sem módulo compartilhado):
- `suggestItemImages` — reaproveita `fetchItemQuestions` + `buildFullAttributes` (mesmas fontes do `suggestContent`) e devolve 2-4 ideias de foto (título + motivo + prompt de edição já pronto em inglês), além da lista de fotos do anúncio e, quando o item tem variação, a foto de cada variação já rotulada (ex: "Rosa", "Preto") pra servir de base.
- `generateItemImage` / `generateItemImageCustom` — gera a imagem de verdade a partir da foto real escolhida como base (baixada direto do CDN público do ML, sem precisar de bucket próprio nem signed URL) + `gpt-image-1` sempre com `size: 1024x1536`. O caminho "custom" primeiro traduz o pedido em português pra uma instrução de edição em inglês (chamada de texto simples, gpt-4o-mini) antes de cair na mesma geração. Sufixo obrigatório fixo no código (mesmo raciocínio do Blog: o GPT às vezes derruba regra do prompt sob pressão de espaço) garante produto fiel, sem texto/logo, vertical, e animal em escala realista quando aparecer.
- `attachItemImage` — só ação que GRAVA de verdade: sobe a imagem gerada (`uploadPicture`, endpoint já existente) e faz `PUT /items/{id}` acrescentando ao array de fotos já existente (nunca substitui/remove nenhuma) — sempre atrás de `ConfirmWriteModal`, mesma regra permanente de toda escrita no ML.
- `MlItemDetailPage.jsx`: aba nova "Imagens & IA" ao lado de "Conteúdo & IA" — sugestão, seletor de foto base (com atalho por variação quando existem), botão por sugestão pra gerar, campo de prompt personalizado, prévia da imagem antes de aplicar (nunca grava sozinho), e confirmação explícita pra adicionar ao anúncio real.

**Testado ao vivo** (`MLB3690960834`, "Gaiola Hamster Terrário Com Roda Habitat Completo Roedores" — item real com 11 perguntas de comprador e 5 variações de cor incluindo "Rosa", o mesmo cenário do pedido original do Raphael): `suggest_item_images` devolveu 4 sugestões coerentes com as perguntas reais (uso com hamster, resistência/transporte, escala) e as 5 variações corretamente rotuladas com foto própria cada uma. Geração de imagem testada de ponta a ponta com a foto real da variação "Amadeirado" como base + 1 das sugestões: resultado manteve o terrário fiel (mesmo corte, mesmas juntas), hamster em escala realista dentro da roda, ambiente doméstico ao fundo, vertical, sem texto/logo — conferido visualmente decodificando o `b64_json` retornado. Ação de gravação real (`attach_item_image`) **não foi testada** — mesma regra de sempre, fica pra o Raphael confirmar pela tela quando quiser aplicar de verdade.

**Pendência**: verificação visual do clique-a-clique da aba nova pelo navegador ficou bloqueada por limite de uso da sessão (não é bug do app — o backend já foi confirmado funcionando via chamada direta, e o build do frontend passou limpo). Vale conferir na tela na próxima sessão antes de considerar 100% fechado.

---

### 2026-09-13 (7ª parte) — Sugestão de descrição por IA passa a ler as perguntas reais do anúncio

**Pedido do Raphael**: a sugestão de título/descrição por IA (Fase existente, `suggestContent`) já usa ficha técnica + tendências da categoria — pediu pra também ler as perguntas/dúvidas reais que compradores fizeram naquele anúncio específico e, quando der, já responder isso dentro da descrição.

**Construído** (`ml-insights/index.ts`): `fetchItemQuestions(integration, itemId)` — `GET /questions/search?item=$ITEM_ID` (endpoint já usado noutro lugar do sistema pra perguntas sem resposta da conta toda; aqui é o mesmo endpoint, só filtrado por item e sem filtro de status, pra pegar respondidas E não respondidas — o que importa é o que o comprador ficou em dúvida, não se já foi respondido no Q&A). Prompt da OpenAI ganhou regra explícita: só responder na descrição a pergunta que der pra confirmar com 100% de certeza usando a ficha técnica/descrição já fornecidas — pergunta sem dado que sustente a resposta é ignorada de propósito (reforça a regra mais importante do prompt, "nunca inventar fato", em vez de abrir exceção pra ela).

**Testado ao vivo com item real** (`MLB3334101665`, "Gaiola Terrário 60x40x40" — 17 perguntas reais, bem misturadas): funcionou exatamente como esperado — várias perguntas de compatibilidade de espécie ("Serve pra hamster sírio?", "Por que não indicado pra gerbil?", "Serve pra ouriço?") foram respondidas de uma vez com uma frase nova na descrição, baseada no campo real da ficha técnica ("Animais recomendados: Anão-Russo, Hamster"). Perguntas sem dado de sustentação (ex: "já vem com casinha ou compra separado?", "dá pra fazer maior?", "é normal vazar forragem?", "meu hamster fugiu, como aviso o vendedor?") foram corretamente IGNORADAS pela IA, sem inventar resposta nenhuma — validado lendo a resposta completa, não só confiando no comportamento esperado.

`MlItemDetailPage.jsx`: aba "Conteúdo & IA" agora mostra, abaixo do resumo de mudanças, a lista de perguntas reais consideradas na sugestão — transparência de onde cada ajuste no texto veio.

---

### 2026-09-13 (6ª parte) — Campanhas & Promoções vira 3 abas + Oferta Relâmpago (LIGHTNING) implementada de verdade

**Pedido do Raphael**: a tela "Campanhas & Promoções" misturava 3 áreas sem separação clara (desconto em massa, convites de campanha, "candidatos a campanha relâmpago" — que na real nunca fazia oferta relâmpago de verdade, era só um diagnóstico de estoque parado desconectado da API). Pediu pra separar em abas e perguntou se dava pra fazer oferta relâmpago de verdade daqui.

**Pesquisa antes de implementar**: doc oficial (`ofertas-relampago`) confirma que `LIGHTNING` é gravável, mesmo padrão de escrita da campanha DEAL (`POST /seller-promotions/items/{id}`), só que exige também um campo `stock` (quantidade reservada pra promoção — quando esgota, encerra sozinha nesse item). Testado ao vivo contra a conta real: a CoisaPet já tem um convite ativo (`LGH-MLB1000`) com **mais de 100 candidatos reais** retornados por `promotion_candidates` (reaproveitado sem nenhuma mudança — já era genérico por `promotion_type`).

**Construído**:
- Backend: `promotionJoinItem` ganhou um parâmetro `stock` opcional (só enviado quando informado — DEAL/SELLER_CAMPAIGN continuam sem ele, sem quebrar nada).
- `MlPromotionsPage.jsx` reescrita com 3 abas: **Desconto em massa**, **Campanhas** (convites DEAL etc., como já era), **Oferta relâmpago** (nova, de verdade). Cada aba carrega os dados sozinha na primeira vez que é aberta.
- Oferta relâmpago: mostra o convite ativo, candidatos com preço/estoque sugeridos (editáveis), toggle "Ordenar por: Estoque parado / Mais vendidos" (o antigo diagnóstico de "candidatos a campanha relâmpago" virou esse critério de ordenação DENTRO da aba real, em vez de uma tela solta desconectada da API) — checkbox + preço + estoque reservado por linha, "Indicar selecionados" sempre atrás de `ConfirmWriteModal`. "Sair" só aparece pra item ainda `pending` (doc confirma: depois de `started`, oferta não pode ser removida por essa API — só pausando o anúncio).

**Resposta pro Raphael sobre "a tela de desconto não mostra os produtos de cara"**: é esperado, não é bug — a API do ML exige a campanha (`promotion_id`) existir ANTES de poder indicar item com preço; sem campanha criada, não tem em que "encaixar" os produtos. A tela já reflete isso: mostra o formulário de criar campanha primeiro, e a lista de produtos só depois de criada.

**Não testado com gravação real de LIGHTNING** (mesmo cuidado de sempre — indicar item de verdade é escrita real, fica pro Raphael testar pela tela). Backend testado ao vivo (candidatos reais confirmados). Build limpo. Verificação visual final da aba nova pelo navegador ficou inconclusiva por instabilidade recorrente da ferramenta de automação nesta sessão (mesmo padrão já visto e reportado antes) — a aba "Desconto em massa" (também reescrita nesta parte) foi confirmada funcionando ao vivo antes da ferramenta travar.

---

### 2026-09-13 (4ª parte) — Bug real corrigido: Estoque Full mostrava números MUITO maiores que o real

**Pedido do Raphael**: "os números que temos no sistema não batem com o painel do ML" — pediu um pente fino no Estoque Full.

**Causa raiz encontrada e confirmada ao vivo**: em `fulfillmentStock()` (`ml-insights/index.ts`), item do Full SEM variação usava `item.available_quantity` (vindo direto de `/items`) como estoque disponível — esse campo NÃO reflete o estoque real do Full. Achado um caso concreto: `MLB7117567508` (Roda Para Hamster Branco) dizia **93 unidades** disponíveis; o estoque de verdade no centro de distribuição (`/inventories/{inventory_id}/stock/fulfillment`, ondevinventory_id vem do próprio item) era **0** — confirmado batendo exatamente com a tela "Controle de estoque" do painel do ML (`vendedores.mercadolivre.com.br/anuncios/lista/space_management`), que mostra o estoque por SKU com colunas "A caminho / Não aptas para venda / Aptas para venda". Itens COM variação já usavam a fonte certa (`/inventories/.../stock/fulfillment` por variação) — só o caminho sem variação estava errado.

**Corrigido**: agora todo item (com ou sem variação) busca o estoque real via `/inventories/{inventory_id}/stock/fulfillment` — o `inventory_id` do item (não só da variação) passou a ser pedido no `/items?attributes=...`. Item sem variação também ganhou a mesma exibição de "indisponível/motivo" que já existia só pros com variação (`MlFullStockPage.jsx`).

**Testado ao vivo, comparando com o painel real**: total ANTES da correção somava **240 unidades** nos 13 itens ativos do Full; DEPOIS da correção, **44 unidades** — batendo em cheio com a soma da coluna "Aptas para venda" da tela oficial do ML (também 44, conferido item por item, todos os 13 batendo exato).

**Achado à parte, resolvido na mesma sessão (5ª parte abaixo)**: a tela "Controle de estoque" do ML também mostrava 6 SKUs de "Gaiola Terrário" com estoque real chegando que não apareciam em lugar nenhum do nosso sistema. Raphael pediu pra ampliar — ver 2026-09-13 (5ª parte).

---

### 2026-09-13 (5ª parte) — Estoque Full: mostra estoque "a caminho" (lotes em trânsito) e cruza com a Gestão de Envios Full

**Pedido do Raphael**: "este lote saiu da fábrica há 2 dias, está a caminho... seria legal fazer essas 2 telas conversarem" (Estoque Full + Gestão de Envios Full).

**Descoberta ao vivo**: o endpoint `/inventories/{id}/stock/fulfillment` NUNCA mostra quantidade "a caminho" (só o que já está fisicamente no armazém) — testado com um SKU real (IOXE55033) que o painel do ML mostra como "20 un. Entrada pendente": o endpoint devolve `total:0`. Ou seja, "a caminho" não existe no endpoint de estoque — só existe na Gestão de Envios Full, que já sincronizamos via bookmarklet (13/09, 1ª parte do dia). Cruzamento confirmado: SKU `IOXE55033` bate exatamente com `ml_full_inbound_items.raw->>'inventoryId'` do envio #74259426 (variação "Amadeirado", 20 un. declaradas) — **`ml_code` guarda o ID do ANÚNCIO** (repete por variação), o SKU/inventory_id real só existe dentro do `raw` (campo `inventoryId`, não estava mapeado em coluna própria).

**3 problemas em cadeia, todos achados e corrigidos ao vivo, comparando sempre com o painel real do ML**:
1. Item recém entrando no Full não tem `logistic_type: fulfillment` ainda (fica em `xd_drop_off` com a tag `fbm_in_process` durante a transição) — invisível pra busca normal. Corrigido: complementa a lista de itens com qualquer `ml_code` referenciado num envio nosso "não terminal" (`status` fora de `closed_ok/closed_with_changes/cancelled/expired` — inclui um status real e não documentado que apareceu numa conta de verdade, `received` com `sub_status: open`, "chegou mas ainda processando").
2. Isso trouxe pra lista um item (`MLB3334101665`) cujo total pulou pra 251 un. — óbvio demais pra ser real. Causa: 2 das 5 variações desse item (Vermelho, Rosa) ainda não têm `inventory_id` no Full (só ALGUMAS cores já migraram) — o código antigo caía de volta pro `available_quantity` cru pra essas, o MESMO bug da 4ª parte, só que no nível de variação. Corrigido: variação sem `inventory_id` agora mostra "não confirmado" (null, não soma no total) em vez de repetir o número não confiável.
3. Resultado final, testado e batendo: total ficou nas mesmas **44 unidades** de antes (os itens novos genuinamente não têm nada "apto pra venda" ainda, só "a caminho") — 15 itens no total agora (13 + 2 "Gaiola" que entraram pelo cruzamento).

**Construído**: `fulfillmentStock()` agora inclui `status=paused` na busca também, monta um `Set` de `inventory_id`s vistos e faz UMA query em `ml_full_inbound_items` (filtro `raw->>inventoryId in (...)`) pra achar envios em aberto por SKU — anexa `item.incoming`/`variation.incoming` (`{shipment_id, qty, status, appointment_date}`). `MlFullStockPage.jsx`: badge "X un. a caminho — Envio #123" (ícone caminhão) linkando pra `/ml/full/envios?envio=123`; selo "Pausado" pra anúncio inativo; variação "não confirmado" com texto explicativo. `MlFullShipmentsPage.jsx`: lê `?envio=` da URL, abre o card já expandido e rola até ele (`scrollIntoView`), com borda destacada; adicionado o status `received` (faltava no `STATUS_CONFIG`, caía num rótulo genérico antes).

---

### 2026-09-13 (2ª parte) — Desconto em massa nos anúncios ML ("de/por" self-service, sem depender de convite do ML)

**Motivação**: Raphael notou que a grande maioria dos anúncios não tem preço "de/por" (o riscado + desconto que chama atenção do comprador), e queria um jeito de selecionar vários anúncios em massa e aplicar um desconto (% escolhida por ele) direto no ML, sem precisar ficar me pedindo.

**Pesquisa antes de construir** (doc oficial do ML, `developers.mercadolivre.com.br`, acessada pelo navegador logado — igual sempre): a campanha "9.9"/DEAL que já existe na tela (Fase 37, ver 01/09) é por CONVITE do ML — item pré-selecionado por eles, preço sugerido dentro de min/max deles. O que o Raphael queria é outra coisa: `SELLER_CAMPAIGN` (sub_type `FLEXIBLE_PERCENTAGE` — o único disponível, `FIXED_PERCENTAGE` foi descontinuado em 07/2025), campanha CRIADA pelo próprio vendedor, item e desconto livremente escolhidos. Confirmado ao vivo contra a conta real: a CoisaPet não tinha nenhuma campanha desse tipo rodando. Achado também um alerta sério e irrelevante pra nós: os campos `price`/`base_price`/`original_price` do endpoint antigo `/items` estão sendo descontinuados (desde 18/03/2026 um PUT só com `price` já dá 400), mas isso não afeta esse recurso — a escrita de desconto usa `/seller-promotions/...`, que é outro sistema, já validado e em uso desde a Fase 37.

**Regras reais da campanha do vendedor** (confirmadas na doc):
- Prazo máximo de **14 dias** por campanha (Raphael escolhe as datas dentro desse limite, nada fixo).
- Elegibilidade: reputação verde, anúncio ativo, condição "novo", exposição paga (não gratuita) — não validamos isso na tela, deixamos o erro real do ML aparecer isolado por item (mesmo espírito de `applyContent`/`create_item`: sucesso parcial, nunca tudo ou nada).
- Preço só pode diminuir enquanto a campanha estiver ativa, nunca aumentar.
- Escreve nos MESMOS endpoints `/seller-promotions/items/{id}` já usados pela campanha DEAL — `promotionJoinItem`/`promotionLeaveItem` (`ml-insights/index.ts`) são genéricos por `promotion_type` e não precisaram mudar nada.

**Construído** (`ml-insights/index.ts` + `MlPromotionsPage.jsx`):
- Backend novo: `sellerCampaignCreate` (`POST /seller-promotions/promotions`), `sellerCampaignDelete` (`DELETE`), `sellerCampaignLastChange` (não pergunta pro ML — lê a data mais recente do nosso próprio log `ml_item_updates` onde `action` é `promotion_join`/`promotion_leave` e `detail->>promotion_type = 'SELLER_CAMPAIGN'`).
- Tela nova "Desconto em massa (de/por)", dentro de Campanhas & Promoções: se não tem campanha própria rodando, mostra formulário de criação (nome + datas, já sugerindo hoje até +14 dias, editável). Se tem, mostra card com nome/status/dias até encerrar/**dias desde a última alteração** (pedido explícito do Raphael, pra nunca esquecer uma campanha parada) + botão "Excluir campanha". Abaixo, lista TODOS os anúncios ativos (`active_listings`, já existia) com busca por título, checkbox de seleção, campo de "% off" aplicado ao lote no momento que marca o item (editável por linha depois — decisão explícita do Raphael, não por item desde o início). "Aplicar desconto" abre `ConfirmWriteModal` com a lista de antes→depois de cada item, sucesso parcial por item.

**Nada testado com gravação real** (criar campanha, indicar item) — mesmo cuidado já usado com `promotion_join_item`/`promotion_leave_item` desde a Fase 37: fica pro Raphael testar pela tela de verdade, sempre atrás do modal de confirmação. Testado ao vivo só o que é seguro: build limpo, tela renderiza, detecção de "nenhuma campanha ainda" funcionando (confirmado contra a conta real — 0 `SELLER_CAMPAIGN` hoje), formulário de criação pré-preenche datas corretamente.

---

### 2026-09-13 (3ª parte) — Preço "de/por" verdadeiro (subir preço antes de descontar) confirmado indisponível + bug real no nome da campanha de desconto

**Dúvida do Raphael**: dado que já vendem alguns produtos abaixo do ideal, ele perguntou se dava pra subir o preço "de verdade" primeiro e só depois aplicar o desconto (pra manter o valor final igual ao de hoje, mas com o "de/por" aparecendo). Respondi com dois pontos, o segundo mais importante que o primeiro:
1. **Risco legal real**: subir o preço pouco antes de "descontar" de volta pro mesmo valor é "desconto fictício", proibido pelo art. 37 do CDC — tem caso recente do Procon notificando o iFood por exatamente isso. Não é só falta de ética, é enforcement ativo.
2. **Testado ao vivo contra a conta real** (autorizado pelo Raphael, valor de teste = preço já vigente, sem mudar nada de verdade): os dois caminhos de editar o preço "padrão" de um item estão bloqueados AGORA pelo próprio ML — `POST /items/$ID/prices/standard` (o novo, documentado como "em breve") devolve **404 not.found** (não existe de verdade); `PUT /items` só com `price` devolve **400 item.price.not_modifiable**. Confirma que a doc (desatualizada, última mod. 26/02) ainda reflete a realidade — não é preguiça de atualizar a doc, o endpoint novo genuinamente não foi lançado. Conclusão pro Raphael: hoje só dá pra subir preço manualmente no painel do ML; o desconto em massa daqui do sistema só atua sobre o preço já publicado.

**Bug real achado e corrigido**: Raphael reportou "não achei a tela de selecionar produtos". Reproduzi ao vivo (com autorização, criando e apagando campanhas de teste reais) e achei a causa: o nome padrão que o formulário sugeria (`Desconto CoisaPet 13/09/2026`) é **sempre rejeitado pelo ML** — testei o limite exato: **máximo 25 caracteres, proibido usar "/"** (erro real do ML: `seller_proposition_title: may only be  characters long`, mensagem mal formatada dele mesmo). Como o nome padrão sempre violava os dois limites de uma vez, TODA tentativa de criar campanha com o nome sugerido falhava silenciosamente (toast de erro rápido demais pra notar) — por isso a tela de seleção de produtos (que só aparece depois de criar a campanha) nunca aparecia. Corrigido: nome padrão agora é `Desconto AAAAMMDD` (sem barra, 17 caracteres), campo do formulário com `maxLength=25` + contador de caracteres restantes, e barra digitada é auto-convertida pra hífen. Confirmado ao vivo que o novo formato é aceito pelo ML. Nenhuma alteração na Edge Function foi necessária desta vez (o backend já funcionava certo — o bug era só no valor padrão gerado no frontend).

---

### 2026-09-13 — Gerador de imagem do Blog (edição real de produto via OpenAI) + bug de cursor no editor + sync self-service da Gestão de Envios Full

**Gerador de imagem do Blog — trocado o motor quando há produto de referência**: pedido do Raphael foi "usar o produto real como base, sem ser cópia fiel, deixando a cena livre" — algo que nem o `soul/reference` nem o `soul/character` da Higgsfield resolvem bem (ver notas de 11/09). Testado ao vivo e confirmado: a **OpenAI** (`gpt-image-1`, endpoint `images/edits`) faz exatamente isso — mantém o produto fiel e compõe a cena livremente ao redor, sem precisar de conta/API nova (já tínhamos `OPENAI_API_KEY`). `blog-ai/index.ts`: `generate_image` agora usa `callOpenAiImageEdit` quando há `reference_photo_path`; sem referência, continua na Higgsfield (`callHiggsfield`, só texto, sem o parâmetro de referência que existia antes). Prompt de sistema novo (`IMAGE_EDIT_PROMPT_SYSTEM`) escreve INSTRUÇÃO DE EDIÇÃO, não descrição de cena. Iterado ao vivo com o Raphael até ficar bom, nessa ordem:
- Proibição de texto/logo (a IA "alucinava" um logo ilegível no produto) — reforçada como sufixo FIXO no código (`MANDATORY_IMAGE_SUFFIX`), não só pedida ao GPT — porque o GPT às vezes cortava essa regra quando tinha muita coisa pra cobrir num prompt curto (por isso também removemos o limite de "3-5 frases" dos prompts de sistema).
- Enquadramento sempre aberto/afastado (vinha com zoom apertado demais).
- Fundo trocado de "estúdio branco" pra ambiente lifestyle real (quarto, mesa, janela) — pedido explícito do Raphael, é conteúdo de blog, não fica de catálogo.
- Realismo fotográfico explícito (textura de pelo real, evitar "cara de CGI/IA").
- Proporção do hamster (é um bicho pequeno, 13-18cm) — tende a sair grande demais; reforçado com número explícito (10-15% da largura do habitat) + instrução "quando em dúvida, faça menor" no sufixo fixo.
- Hamster não precisa olhar pra câmera — pode estar interagindo com o ambiente (fungando, cavando), não posado feito retrato.
- Terrário sempre "mobiliado" (forração farta + 2-3 itens de enriquecimento), nunca vazio.
Também adicionado: campo de "Instrução extra pra imagem" (textarea) na aba de capa do editor de post (`BlogPostEditorPage.jsx`) — faltava desde sempre; o gerador de imagem do CORPO do post já tinha esse campo, só a capa não.

**Bug real corrigido no editor de texto do Blog**: Raphael reportou que clicar no meio de um parágrafo pra editar fazia a letra digitada "voltar pro início e escrever de trás pra frente". Causa: `BlogRichTextEditor.jsx` usava `dangerouslySetInnerHTML` controlado — a cada tecla, o React reescrevia o `innerHTML` inteiro da `contentEditable`, destruindo a posição do cursor no meio do texto (só não aparecia digitando no final). Corrigido trocando por sincronização via `useLayoutEffect` que só toca no DOM quando `html` difere do que já está lá (nunca acontece durante digitação normal, já que `onInput` já deixou o DOM com o valor novo antes do React re-renderizar). Testado ao vivo num rascunho real.

**Gestão de Envios Full — sincronização virou self-service (bookmarklet), sem precisar mais pedir pro Claude**: o ML não expõe esses dados por nenhuma API (só o painel logado). Descoberto que a própria tela do ML (`vendedores.mercadolivre.com.br/shipping/inbounds`) é renderizada com os dados já embutidos em JSON numa tag `<script>` de hidratação (framework Nordic/Fury deles), e a paginação da lista usa uma API JSON de verdade (`/api/shipping/inbounds/search?page=N&offset=...`) — dá pra puxar tudo isso com `fetch()` simples, usando a sessão já logada do navegador, sem precisar de browser automation nem raspar texto de tela.
- Nova Edge Function `ml-full-shipments-ingest` (deploy `--no-verify-jwt`, mesmo motivo do `ml-webhook`/`ml-oauth-callback` — quem chama é o navegador no domínio do ML, não o nosso frontend) — recebe o JSON bruto, mapeia pros campos de `ml_full_inbound_shipments`/`ml_full_inbound_items`, protegida por um segredo simples (`FULL_SYNC_SECRET`, não JWT de usuário).
- Bookmarklet em `scripts/ml-full-sync-bookmarklet.js` (fonte legível) — o Raphael salva a versão minificada como favorito "Sincronizar Full CoisaPet" e clica nele estando logado na Central de Vendedores do ML. Busca a lista (paginada) + detalhe de cada envio, e manda tudo pro ingest.
- **Limitação real, testada ao vivo**: buscar os ~29 detalhes em paralelo faz o ML devolver página incompleta pra várias (15 de 29 falharam num teste); sequencial com retry (3x) reduz bastante mas não elimina 100% — especificamente, envios já **cancelados/finalizados há muito tempo** (`closed_ok`/`closed_with_changes`/`cancelled`) às vezes não atualizam numa passada. Como o dado desses nunca muda mesmo, não é um problema prático — só clicar de novo se quiser forçar. Os envios que realmente importam (em preparação, aguardando recebimento) sincronizaram certinho em 100% dos testes.
- `MlFullShipmentsPage.jsx`: texto atualizado pra explicar o novo processo (era "peça pro Claude"), botão "Recarregar" adicionado (só relê o que já está no nosso banco, não refaz a sincronização com o ML).

---

### 2026-09-09 — Módulo Blog (CMS interno, geração por IA + SEO tipo Yoast + hyperlinks)

**Motivação**: o WordPress usado hoje pro blog está degradando cada vez
mais. Raphael pediu uma área "Blog" dentro do próprio sistema — uma
espécie de WordPress interno, com geração de texto por IA (ChatGPT/
OpenAI: palavra-chave + mini-contexto + tamanho alvo → título e texto),
um painel de SEO tipo Yoast, e sugestão de hyperlinks pra produtos
próprios mencionados no texto, "sem ficar forçado a inserção de muitos
hyperlinks" (bom senso).

**Decisão de escopo (confirmada com o Raphael antes de codar)**: o
sistema por enquanto só MANTÉM o conteúdo — quem vai exibir pro público
é o `coisapet-site` (projeto PHP à parte, fora desta pasta), lendo os
posts publicados daqui de algum jeito ainda não definido. Não construir
nada de "exibição pública" nessa rodada.

**Implementado**:
- `supabase/fase47-blog.sql` — tabela `blog_posts` (título, slug, HTML do
  conteúdo, capa, campos de SEO — `focus_keyword`/`meta_title`/
  `meta_description`, campos de IA — `ai_context`/`ai_target_words`,
  status `draft`/`published`/`trash`). RLS `TO anon` (mesmo motivo já
  documentado na Fase 46/Chapas — o app nunca usa sessão real do
  Supabase Auth). Bucket novo `blog-covers` (público, diferente do
  padrão de bucket privado — o site principal vai exibir a imagem de
  capa direto pro visitante).
- `supabase/functions/blog-ai/index.ts` — Edge Function nova (não
  colada em `ml-insights`, que já está gigante), 2 actions:
  - `generate_content`: chama OpenAI (`gpt-4o-mini`, mesmo padrão já
    usado no módulo ML) com palavra-chave + contexto + tamanho alvo,
    devolve título, slug, meta title/description, resumo e corpo em
    HTML (H2/H3/parágrafos/listas, nunca markdown). Testado ao vivo
    ("terrário para hamster") — gerou post completo e coerente, 460
    palavras, título SEO e meta descrição dentro do tamanho ideal.
  - `suggest_links`: manda o catálogo de produtos ativos (id+nome) e o
    HTML do post pra IA, que devolve só os trechos que batem de
    verdade com nome de produto — regra explícita no prompt de NÃO
    forçar link (máx. ~1 a cada 150-200 palavras, nunca 2x no mesmo
    produto). Testado ao vivo: retornou lista vazia pro texto gerado
    sobre "terrário", porque o catálogo real só tem 1 produto com
    "terrário" no nome ("Junção De Terrário..." — um acessório de
    nicho, não um terrário em si) — comportamento correto, a IA não
    forçou um link ruim só pra preencher.
- Tela `/blog` (`BlogPage.jsx`) — lista em cards, filtro por status
  (Todos/Rascunhos/Publicados) e busca por título/palavra-chave.
- Tela `/blog/novo` e `/blog/:id` (`BlogPostEditorPage.jsx`) — título,
  slug (auto-gerado, editável), editor de texto simples
  (`BlogRichTextEditor.jsx`, `document.execCommand` — sem lib nova,
  decisão consciente pra não adicionar dependência só pra isso),
  upload de capa, e sidebar com 3 cards: Gerar com IA, SEO (checklist
  tipo semáforo, tudo calculado localmente em `seoChecks.js`, nunca
  "nota" inventada por IA), e Hyperlinks sugeridos (cada sugestão tem
  botão "Inserir" individual — nunca aplica sozinho).
- `useBlogPosts.js` — hook padrão do projeto (create/update/moveToTrash
  com toast + audit log, mesmo esqueleto do `useChapas.js`).
- Sidebar: seção nova "Blog" (cor índigo, ainda não usada em nenhuma
  outra seção). `AccessControlPage.jsx`: módulo `blog` registrado —
  fechado por padrão pra quem não é admin (nenhuma linha em
  `role_permissions` ainda, precisa liberar manualmente se quiser dar
  acesso a outro papel, ex: marketplace).

**Testado ao vivo, fluxo completo**: criar post → gerar conteúdo por IA
→ conferir checklist de SEO mudando ao vivo → tentar sugerir hyperlinks
(corretamente vazio, ver acima) → salvar rascunho (persistiu, URL virou
`/blog/<id>`) → aparece na listagem com status Rascunho → remover
(vai pra lixeira, `status='trash'`, some da lista). `npm run build`
limpo.

**Pendências conhecidas**:
- Botão "Publicar" ainda não foi testado ao vivo (só "Salvar rascunho"
  — não quis criar lixo com status published na primeira rodada de
  teste). Fluxo é o mesmo caminho de código (`handleSave('published')`),
  risco baixo, mas vale um teste manual do Raphael antes de confiar 100%.
- Catálogo de produtos tem poucos nomes "genéricos" (ex: só 1 produto
  com "terrário" no nome, e é um acessório de nicho) — isso limita
  bastante quando a sugestão de hyperlink vai achar algo pra linkar de
  verdade. Não é bug, é reflexo de como os produtos são nomeados hoje
  (nomes longos e específicos tipo "Junção De Terrário Peça Para..."em
  vez de simplesmente "Terrário Grande"). Se o Raphael achar pouca
  sugestão de link na prática, vale revisar nome/sinônimo dos produtos,
  não a lógica da IA.
- `document.execCommand` usado no editor é uma API tecnicamente
  "deprecated" do browser, mas ainda amplamente suportada — decisão
  consciente de não trazer lib externa (Tiptap/Quill) só pra isso numa
  ferramenta interna. Se no futuro precisar de mais recurso (tabela,
  embed de vídeo, colar do Word mantendo formatação), aí sim vale
  revisitar essa decisão.
- Como o site principal vai ler os posts publicados ainda não foi
  decidido (ver Próximos Passos no topo do arquivo).

---

### 2026-09-09 (2ª parte) — Blog: prompt sem "Introdução/Conclusão", texto de redator profissional, e link manual pra produto

Raphael testou a v1 e voltou com 2 pedidos concretos:

1. **Prompt de geração**: tirar "Introdução"/"Conclusão"/"Em suma" e
   qualquer estrutura de "texto de IA genérico" — quer texto como se
   fosse escrito por redator profissional de verdade, sem "encher
   linguiça" (repetir a mesma ideia com palavras diferentes só pra
   bater a contagem de palavras), e mais responsabilidade no conteúdo
   (é orientação sobre um ser vivo).
2. **Hyperlink automático não está funcionando na prática** — Raphael
   viu a palavra "terrários" aparecer várias vezes no texto e a IA não
   sugeriu nada. Bate com o que já tínhamos identificado (ver pendência
   acima): confirmei olhando o catálogo (550 produtos ativos) que os
   nomes são todos estilo título de marketplace — ex: "Divisória Muro
   Contenção Reta Para Terrário G com Escada para Roedores Hamster
   Gerbil Topolino" — nunca um nome limpo tipo "Terrário G", então
   nenhum texto de blog vai conter esse nome literal. Raphael sugeriu a
   solução certa: **link manual** — selecionar o trecho no texto e
   escolher o produto numa busca.

**Implementado**:
- `GENERATE_SYSTEM_PROMPT` (`supabase/functions/blog-ai/index.ts`)
  reescrito: proibido literalmente os cabeçalhos "Introdução"/
  "Conclusão"/"Considerações finais"/"Resumo" e frases de fechamento
  clichê ("em suma", "por fim", "concluindo", "não é apenas... é
  também..."); regra explícita contra "encher linguiça" (cada parágrafo
  precisa de uma ideia nova, prefere post mais curto a redundante);
  regra de responsabilidade (nunca inventar "regra" de cuidado que soe
  precisa sem embasamento real, e recomendar procurar
  médico-veterinário quando o assunto tocar saúde). Testado ao vivo
  ("alimentação de porquinho da índia", 530 palavras): resultado sem
  nenhum "Introdução"/"Conclusão", títulos de seção específicos (ex:
  "Fibras São Essenciais", "Alimentos Proibidos"), e menção espontânea
  de "consulte um veterinário" em 2 pontos do texto.
- **Link manual pra produto** — novo botão na toolbar do editor
  (`BlogRichTextEditor.jsx`, ícone de pacote): seleciona um trecho de
  texto, clica no botão, abre um popover com busca (nome do produto,
  ignora acento/caixa) sobre os produtos ativos, clica no produto e o
  trecho vira link pra `coisapet.com.br/<slug>`. Mecanismo: a seleção é
  capturada no `onMouseDown` do botão (antes do clique tirar o foco do
  editor) via `Range` clonado, e restaurada na hora de aplicar o link
  (`execCommand('createLink', ...)`), então funciona mesmo depois de
  digitar na busca do popover. Testado ao vivo, confirmado funcionando
  (link aplicado exatamente na palavra selecionada).
- Sugestão de hyperlink por IA (`suggest_links`) foi mantida como está
  (ainda vale a pena quando o catálogo tiver produto com nome bom pra
  bater) — não é o caminho principal mais, o manual é.

**Pendência**: nenhuma nova além das já registradas na entrada anterior
(Publicar ainda não testado ao vivo; site principal ainda não lê os
posts).

---

### 2026-09-09 (3ª parte) — Blog: importador do WordPress (WXR)

Raphael perguntou se dava pra importar os posts que já existem no
WordPress. Sim — WordPress exporta um arquivo `.xml` (formato WXR, via
Ferramentas → Exportar → Posts no admin do WP), que dá pra ler inteiro
no navegador sem precisar subir pra lugar nenhum antes de decidir o que
importar.

**Implementado**:
- `src/modules/blog/wpImport.js` — parser do WXR com `DOMParser` (só
  navegador, sem lib nova). Lê só itens `wp:post_type=post` (ignora
  páginas, mídia, menus etc.), pula status `trash`/`auto-draft`. Resolve
  a imagem destacada (`_thumbnail_id` do postmeta → `wp:attachment_url`
  do item de anexo correspondente, numa 1ª passada). Junta categorias +
  tags num array só (`tags`). Limpa os comentários do editor Gutenberg
  (`<!-- wp:paragraph -->` etc.) que sobram no `content:encoded` — sem
  isso apareceriam literalmente pro leitor. Mapeia status: `publish` →
  `published` (com `published_at` real do post), qualquer outro
  (`draft`/`pending`/`private`/`future`) → `draft` sem data. `meta_title`/
  `meta_description` derivados por truncamento simples do
  título/resumo (sem chamar IA — importação em lote não deveria gerar
  custo/demora extra).
- `src/modules/blog/components/WpImportModal.jsx` — modal com upload do
  `.xml`, pré-visualização em lista (checkbox por post, badge de status
  original, aviso "slug existente" pra quem já tem um post com esse
  slug no sistema — desmarcado por padrão nesse caso), progresso durante
  a importação.
- `useBlogPosts.bulkImport()` — insere um post por vez (não em lote
  único), pra um slug duplicado não derrubar a leva inteira; volta
  `{imported, skipped, failed}` pro toast final. Autor sempre é quem tá
  importando agora (sessão atual), não o autor original do WordPress.
- Botão "Importar do WordPress" na tela `/blog` (cabeçalho e também no
  estado vazio).

**Testado**: montei um WXR sintético (1 post publicado com imagem
destacada + categoria + tag, 1 rascunho com slug/data vazios, 1 post na
lixeira, 1 página, 1 anexo) — resultado bateu exatamente: 2 posts
achados, 2 ignorados, imagem destacada resolvida certinho, tags
juntadas, HTML sem sujeira do Gutenberg, slug do rascunho gerado a
partir do título (fallback funcionando). Conferido direto no banco.
Post de teste removido (pra lixeira) depois — não é dado real.

**Pendências conhecidas**:
- ~~Imagem de capa importada fica apontando pro `wp-content/uploads`
  do WordPress ANTIGO~~ — resolvido na entrada de 09/09 (4ª parte),
  ver "Re-hospedar imagens".
- Shortcode de WordPress (`[gallery]`, `[caption]`) não é convertido —
  se algum post usar isso, vai aparecer o texto puro do shortcode no
  conteúdo. A maioria dos posts de texto simples não é afetada.
- `meta_title`/`meta_description` importados são só truncamento
  (sem IA) — pode valer a pena revisar/gerar de novo pelos posts
  importados que o Raphael achar mais importantes.

---

### 2026-09-09 (4ª parte) — Blog: categorias + re-hospedagem de imagens externas

Raphael pediu 2 coisas, pensando em produção de verdade: (1) categoria
nos posts (pra filtrar depois), o WXR que ele importou já trazia
categoria; (2) hoje `/blog` na Hostinger redireciona direto pro
WordPress antigo — quando esse redirect for removido (ou o WP sair do
ar), qualquer imagem que ainda aponta pra lá quebra. Perguntou se
tinha algo melhor que baixar imagem por imagem na mão.

**Categorias** (`supabase/fase48-blog-categorias.sql`):
- Tabela nova `blog_categories` (id/nome/cor) — mesmo padrão de
  `product_categories`, pra manter consistência com o resto do
  sistema. `blog_posts.category_id` (FK, `ON DELETE SET NULL`).
- `useBlogCategories.js` + `BlogCategoriesModal.jsx` — cópia fiel do
  padrão `ProductCategoriesModal.jsx` (CRUD com seletor de cor).
- Editor do post: card "Categoria" (select + botão de gerenciar).
  Listagem: pílulas de filtro por categoria (cor própria de cada uma)
  + selo colorido no card do post.
- Importador do WordPress: `wpImport.js` agora separa `domain="category"`
  (vira a categoria) de `domain="post_tag"` (continua em `tags`, livre) —
  antes os dois caiam juntos em `tags`. `useBlogPosts.bulkImport()`
  resolve nome de categoria → `category_id`, reaproveitando categoria
  existente por nome (sem diferenciar maiúscula/acento) e criando só a
  que ainda não existe — outra rodada de import não duplica categoria.

**Re-hospedar imagens** (`blog-ai`, action `rehost_images`):
- Roda no servidor (Edge Function), não no navegador — evita qualquer
  bloqueio de CORS que um `fetch` direto do admin (rodando noutro
  domínio/path que o WordPress) poderia sofrer pra ler bytes de imagem
  de outro host.
- Varre todo post não-lixeira: baixa qualquer imagem (capa ou `<img>`
  dentro do `content_html`) que ainda não aponta pro nosso próprio
  Storage, reenvia pro bucket `blog-covers` (`imported/<sha256-da-url>.ext`
  — hash da URL como nome, então rodar de novo não duplica upload nem
  re-baixa o que já foi feito) e troca a URL no post. Botão "Re-hospedar
  imagens" na tela `/blog`, com confirmação antes (mexe em post
  publicado) explicando pra rodar isso ANTES de tirar o WordPress do ar
  ou remover o redirect.

**Descoberta importante ao testar**: rodei a ação pra validar e ela
processou **21 posts publicados** que já existem em produção (o
Raphael gerou bastante conteúdo real entre uma sessão e outra) — todos
tinham `cover_image_url` externa (provavelmente imagem gerada por IA
com link temporário, não do WordPress). A ferramenta baixou e
re-hospedou as 21 com sucesso (0 falha), confirmado depois que não
sobrou nenhuma imagem externa (`cover_image_url`) nem `<img>` externo
dentro do conteúdo. Ou seja, a ferramenta não só resolve o problema do
redirect do WordPress — já rodou "pra valer" e resgatou imagem que
possivelmente ia expirar de qualquer jeito. Post de teste usado pra
validar (`teste-rehost-imagens`) foi apagado depois (DELETE de
verdade, não lixeira — era só dado de teste meu, não do Raphael).

**Pendência**: nenhuma nova.

---

### 2026-09-09 (5ª parte) — Analytics do Blog (visualizações por post, dentro do sistema)

Raphael pediu pra estender o controle de cliques que já existia
(`product_clicks` / tela "Analytics do Site" em `/cliques`, que
rastreia clique nos botões Shopee/ML/WhatsApp/Clô) pra também cobrir o
Blog — quantas vezes cada post foi visto, por slug. Motivação:
controle PRÓPRIO dentro do sistema, mesmo já tendo o Google Search
Console (GSC é de fora, não é a mesma coisa).

**Implementado**:
- `supabase/fase49-blog-post-views.sql` — tabela nova `blog_post_views`
  (`slug`, `referrer`, `viewed_at` — bem enxuta de propósito, NÃO
  guarda título, isso já existe em `blog_posts` e é ligado por slug na
  hora de exibir, pra nunca ficar desatualizado se o post for
  renomeado). RLS `TO anon` (insert + select), mesmo padrão de sempre —
  quem grava é o site público (`coisapet-site`, PHP) usando a chave
  anon.
- `src/modules/reports/BlogAnalyticsTab.jsx` — aba nova ("Blog") dentro
  da tela `/cliques` (que já tinha Visão Geral/Produtos/Feed ao vivo),
  reaproveitando o mesmo período de filtro e o mesmo estilo visual
  (cards, `recharts`). KPIs (visualizações, posts visualizados, média
  por post, principal origem), evolução por dia, distribuição por
  hora, ranking "Posts mais lidos" (com selo de categoria, linkado pro
  post real) e um breakdown "De onde vêm" (Google/Direto/Instagram/
  Facebook/TikTok/WhatsApp/outros, extraído do `referrer` cru — sem
  lib de analytics nenhuma, só `new URL(referrer).hostname`).
- Filtros de plataforma/página e os KPIs de clique de produto ficam
  escondidos quando a aba Blog está ativa (não fazem sentido ali).

**Testado**: inseri visualizações sintéticas (Google/Instagram/direto,
horários variados) pra 3 posts reais, conferi ao vivo — KPIs, gráfico
de evolução, distribuição por hora, ranking de posts e breakdown de
origem bateram exatamente com o esperado. Removidas depois (eram só
teste, `DELETE` direto — não é dado real).

**Pendência — falta 1 passo pra funcionar de verdade**: essa tela só
mostra o que estiver na tabela `blog_post_views`; quem GRAVA a
visualização é o `coisapet-site` (PHP, fora deste repo) — ainda
precisa colar lá o snippet de tracking (dado ao Raphael no chat, não
gravado em arquivo aqui por ser código de outro projeto). Até isso ser
colado no site, a aba Blog fica vazia (o que é esperado, não é bug).

---

### 2026-09-09 (6ª parte) — Blog: rastrear clique em produto dentro do post (funil "leu → clicou")

Raphael perguntou se dava pra rastrear também quando o leitor clica
num hyperlink de produto dentro do texto do post — fecha o funil
"post → interesse em produto", que nem o GSC nem `blog_post_views`
sozinho mostram.

**Implementado**:
- `supabase/fase50-blog-product-clicks.sql` — tabela nova
  `blog_product_clicks` (`post_slug`, `product_slug`, `link_text`
  opcional, `clicked_at`). Mesmo padrão de `blog_post_views`: sem FK,
  RLS `TO anon` insert+select. Importante: precisa ser registrado no
  **clique do link dentro da página do post** (antes da navegação),
  não no acesso da página de produto — só assim dá pra saber DE QUAL
  POST veio o interesse.
- `BlogAnalyticsTab.jsx` ganhou: KPI "Cliques pra produto" (+ % das
  visualizações, uma taxa de conversão do conteúdo), e uma tabela nova
  "Cliques em produto a partir do Blog" — ranking post→produto→cliques,
  com busca.
- Passei ao Raphael um 2º snippet de tracking pro `coisapet-site`: um
  listener de clique no container do texto do post, que intercepta
  clique em link cujo `href` seja `coisapet.com.br/<slug>` (produto,
  raiz do domínio — diferente de `coisapet.com.br/blog/<slug>`, que é
  post), manda o evento (`post_slug` + `product_slug` + `link_text`)
  via `fetch(keepalive:true)` e deixa a navegação seguir normal.

**Testado**: inseri clique sintético pra 2 pares post→produto reais,
conferi ao vivo — KPI, % de conversão e a tabela bateram certinho.
Removido depois (teste, `DELETE` direto).

**Pendência**: mesmo passo da entrada anterior — falta colar os 2
snippets (visualização + clique em produto) no `coisapet-site`.

---

### 2026-09-09 (7ª parte) — Blog: prévia do post e agendamento de publicação

Raphael pediu 2 coisas no editor de post: "Ver prévia" (como o post
vai ficar antes de publicar) e agendar a data de publicação.

**Implementado**:
- `src/modules/blog/components/BlogPreviewModal.jsx` — modal com 2
  abas: "Como fica o post" (capa, categoria, título, autor/data/tempo
  de leitura estimado, corpo renderizado em tipografia de leitura) e
  "Como aparece no Google" (mockup de SERP — título/URL/descrição,
  mesma ideia do Yoast). É só aproximação visual (o site público de
  verdade é o `coisapet-site`, fora deste repo), mas dá pra revisar
  tudo sem sair do sistema.
- `supabase/fase51-blog-agendamento.sql` — `blog_posts.scheduled_at`
  (nullable) + `status` ganhou o valor `'scheduled'` (constraint
  atualizada). Cron `blog-publicar-agendados` (`pg_cron`, a cada 5min)
  publica sozinho quem já passou da hora — `UPDATE ... SET
  status='published', published_at=scheduled_at WHERE
  status='scheduled' AND scheduled_at <= NOW()`. Sem Edge Function
  aqui (diferente do cron de ML da Fase 34) — é só uma troca de
  status, não tem lógica de negócio externa envolvida.
- Editor: botão "Agendar" (datetime-local nativo, sem lib) num
  popover; badge no cabeçalho mostrando "Agendado pra X" quando
  aplicável; listagem (`BlogPage.jsx`) ganhou status "Agendado"
  (filtro + selo + data no card).

**Bug real encontrado e corrigido durante o teste** (vale registrar
pra não cair de novo): o botão "Agendar" usava
`setScheduleOpen(o => !o)` (forma de função/updater do `useState`).
Em desenvolvimento, o `React.StrictMode` (ativo em `main.jsx`) invoca
a função de updater 2x de propósito pra pegar efeito colateral —
`!o` duas vezes cancela a mudança, então o popover nunca abria
visualmente (clicar parecia não fazer nada). Corrigido pra
`setScheduleOpen(true)` (valor fixo, não função) — o fechamento já é
coberto pelo botão "X" e pelo clique fora. Isso só afeta o
comportamento em `npm run dev`/StrictMode; não creio que quebrasse em
produção, mas o padrão com função de updater pra abrir/fechar
popover deve ser evitado no resto do Blog por causa disso.

**Testado parcialmente**: título/slug/conteúdo confirmados
sincronizando com o estado do React (digitação real), e "Ver prévia"
abriu o modal com sucesso uma vez. Depois disso a extensão do
Chrome (claude-in-chrome) começou a reportar clique/digitação como
bem-sucedidos sem o evento chegar de fato na página (confirmado
comparando com leitura direta do DOM via JS) — sessão de teste ficou
instável pro resto da verificação visual do agendamento. Build limpo,
código revisado à mão e segue o mesmo padrão já validado do
`ProductLinkPopover` (`BlogRichTextEditor.jsx`). Recomendo o Raphael
conferir na prática (criar um post, clicar Agendar, escolher uma data
próxima, confirmar, esperar o cron rodar).

**Pendência**: confirmar visualmente o fluxo de agendamento numa
sessão nova (a instabilidade foi da ferramenta de automação do
navegador, não deve se repetir).

---

### 2026-09-09 (8ª parte) — Blog: limpar formatação ao colar (Word/Google Docs)

Raphael notou um post que a equipe colou de outro lugar (print
mostrando texto com cores e fontes diferentes espalhadas, tipo
sublinhado de correção ortográfica do Word) e perguntou se, ao
publicar, isso ia manter o "padrão nosso" ou assumir aquele estilo
colado. Resposta antes do fix: ia manter a bagunça — `contentEditable`
sem tratamento de paste insere o HTML colado exatamente como veio,
`style="..."` inline incluso, e isso é salvo direto em `content_html`;
estilo inline tem prioridade sobre qualquer CSS nosso, então nem o
sistema nem o site publicado nunca conseguiriam sobrescrever.

**Correção rápida pro post já colado**: selecionar o texto afetado e
clicar no ícone de borracha (Limpar formatação) na barra do editor —
já existia, resolve a maior parte do estrago em conteúdo já colado.

**Correção de fundo** (`BlogRichTextEditor.jsx`): novo handler de
`onPaste` que intercepta o clipboard, reconstrói o HTML colado do
zero só com a estrutura que interessa — nunca deixa passar
`style`/`class`/fonte de lugar nenhum:
- Reconstrói recursivamente a partir do `text/html` do clipboard,
  mantendo só uma lista branca de tags (parágrafo, H2/H3 — H1/H4-H6
  viram H2/H3 —, lista, link, negrito/itálico, citação, tabela).
- `<span>`/`<font>`/tag desconhecida: descarta o envoltório mas
  mantém o texto de dentro (é onde mora a cor/fonte colada — span é o
  caso mais comum vindo do Word/Google Docs).
- `<div>` é tratado diferente de span — no Word/Docs cada "parágrafo"
  vira um `<div>`, então em vez de só descartar, vira um `<p>` de
  verdade (senão o texto ficava sem quebra nenhuma).
- `<style>`/`<script>`/`<img>` e afins: descartados por completo (nem
  o texto de dentro, pra não vazar CSS/JS como texto visível).
- Tabela: mantém a estrutura (linhas/células, `colspan`/`rowspan`),
  descarta toda borda/cor/padding colada — ganhou estilo próprio no
  editor e na Prévia (`[&_table]`/`[&_th]`/`[&_td]`), então uma
  tabela colada (ex: tabela de faixa de temperatura por espécie, foi
  o caso real que o Raphael mostrou) sai formatada no nosso padrão.
- Sem `<html>`/texto puro no clipboard (paste de app que não manda
  HTML): cai num fallback simples, quebra por linha em branco = novo
  parágrafo.

**Testado**: simulei um paste sujo de verdade (cor/fonte/sublinhado
inline em `<span>`, `<b>` com peso customizado, tabela com bordas
coloridas, `<div class="MsoNormal"><font>` estilo Word, e um
`<style>` solto) — saiu exatamente limpo, só a estrutura semântica,
zero atributo de estilo sobrevivente. Sem lib nova (nada de
DOMPurify) — só `DOMParser` + lista branca, mesmo espírito de baixa
dependência do resto do editor.

**Pendência**: só afeta paste NOVO a partir de agora — conteúdo já
colado antes desse fix continua com o estilo sujo salvo no banco até
alguém rodar "Limpar formatação" nele (ou colar de novo).

---

### 2026-09-09 (9ª parte) — Nova tela: Cupons do Mercado Livre (`/ml/cupons`)

Raphael cria cupom direto no painel do ML e depois não consegue achar
onde ver status/período/orçamento/quantos já usaram — pediu uma tela
nossa de controle.

**Pesquisa antes de codar** (doc oficial do ML, `developers.mercadolivre.com.br`,
lida ao vivo em 09/09): a API de "Cupons do vendedor"
(`SELLER_COUPON_CAMPAIGN`) existe e é rica (criar/atualizar/excluir/
detalhe/itens), mas **não tem endpoint de "listar meus cupons"** — só
dá pra consultar detalhe se você já souber o ID. Isso bate exatamente
com a reclamação do Raphael (nem o painel do ML facilita achar). A
saída: `GET /seller-promotions/users/{ml_user_id}` — o MESMO endpoint
que `promotionInvites` já usa desde a Fase 37 pra convites de campanha
— devolve TODOS os tipos de promoção/convite do vendedor misturados
(paginado). Filtramos por `type === 'SELLER_COUPON_CAMPAIGN'` e, pra
cada um, buscamos o detalhe completo por ID (só ali vem
`budget`/`remaining_budget`/`used_coupons`/`coupon_code` — a listagem
resumida não traz isso).

**Implementado**:
- `couponsList()` nova em `ml-insights/index.ts` (action `coupons_list`)
  — reaproveita `mlFetch`, sem Edge Function nova nem tabela nova (é
  tudo consulta em tempo real na API do ML, nada fica salvo aqui).
- `useMlInsights.fetchCoupons()` + reaproveitado `fetchPromotionCandidates`
  (já existia, genérico por `promotion_id`+`promotion_type`) pra listar
  produtos participantes de cada cupom.
- Tela nova `MlCouponsPage.jsx` (`/ml/cupons`, mesmo `moduleKey`
  `ml-insights` — não é módulo novo, é mais uma tela dentro de
  Otimização ML): 1 card por cupom com nome, status (Agendado/Ativo/
  Encerrado/Excluído — direto da API, sem estado inventado), desconto
  (% ou R$ fixo), compra mínima, período com "começa em/termina em/
  encerrado há N dias", código do cupom (ou "sem código — automático"
  quando a campanha não tem `partial_coupon_code`), barra de orçamento
  usado, número de cupons usados em destaque, e uma seção expansível
  com os produtos participantes (link direto pro anúncio no ML).

**Testado ao vivo, funcionou de primeira**: a conta real da CoisaPet
já tem 1 cupom criado no painel do ML ("COISA10", 10%, agendado pra
10/09, R$710 de orçamento) — apareceu certinho na tela, incluindo os
produtos participantes (todos "Candidato", já que o cupom ainda não
começou).

**Pendência**: nenhuma — só consulta, sem escrita, não precisa de
`ConfirmWriteModal`. Se um dia quiserem CRIAR cupom por aqui também
(não só consultar), a doc já documentada dá pra isso, mas não foi
pedido agora.

---

### 2026-09-09 (10ª parte) — Nova tela: Controle de Atualização dos Produtos (vídeo/foto/montagem)

Raphael mandou print de uma planilha ("CONTROLE DE ATUALIZAÇÃO DOS
PRODUTOS" — 321 produtos cadastrados na planilha) que o time usa pra
acompanhar vídeo/foto atualizados por produto e feedback de montagem,
e pediu pra trazer isso pro sistema, com acesso de EDIÇÃO completa pro
Atendimento.

**2 decisões confirmadas com o Raphael antes de codar** (perguntei
porque não dava pra adivinhar com segurança):
1. **"Status geral"** (última coluna) — é campo MANUAL, dropdown
   próprio (Pendente/Em andamento/Concluído/Refazer), não é calculado
   a partir de vídeo/foto/feedback.
2. **Atendimento edita tudo** — não é só visualização, é a mesma
   permissão de admin/administrativo pra essa tela específica.

**Implementado**:
- `supabase/fase52-controle-midia-produtos.sql` — tabela nova
  `product_media_status`, **1 linha por produto só depois que alguém
  muda algo pela primeira vez** (não precisa popular ~550 linhas na
  migração nem manter sincronizado quando produto novo entra — a tela
  faz LEFT JOIN com `products` e usa default "Não iniciada"/"Pendente"
  pra quem ainda não tem linha). Campos: `video_status`/`photo_status`
  (Não iniciada/Em produção/Atualizada/Refazer), `video_forecast`
  (data), `feedback_montagem` (boolean, NULL=ainda não avaliado),
  `feedback_details`, `observations`, `overall_status` (Pendente/Em
  andamento/Concluído/Refazer). RLS `TO anon`. Liberado pro
  `role_permissions` do Atendimento (`module = 'controle-midia'`).
- `useProductMediaStatus.js` — busca todo produto ATIVO com
  `LEFT JOIN` pro status (embed do PostgREST, pega `media[0]` ou usa
  default), e grava por `upsert` a cada campo mudado — sem botão
  "Salvar" por linha, igual planilha. Campo de texto (Detalhes do
  feedback/Observações) salva no `blur`, não a cada tecla, pra não sair
  gravando request no meio da digitação; os selects/data salvam na
  hora.
- `MediaControlPage.jsx` (`/producao/midia`) — tabela com miniatura+nome
  do produto, SKU, os 2 status coloridos (mesma paleta de sempre:
  slate/âmbar/emerald/rosa), previsão do vídeo, última atualização
  (automática, é o `updated_at` da linha), feedback de montagem
  (Sim/Não/—), detalhes, observações e status geral. KPIs no topo
  (produtos cadastrados, vídeos atualizados, fotos atualizadas, com
  feedback) — os mesmos 4 números que a planilha já mostrava.
- Sidebar: item novo "Atualização de Mídia" dentro de Produção, com
  `atendimento` explícito nos `roles` (os outros itens de Produção não
  incluem atendimento — esse é o único, de propósito).

**Divergência notada, não é bug**: a planilha falava 321 produtos
cadastrados, o sistema tem 550 produtos ativos (inclui variação como
linha própria, ex: Alfafa 250g/500g/1kg = 3 linhas). Pode ser que a
planilha estivesse desatualizada ou contasse diferente — vale o
Raphael confirmar se 550 faz sentido ou se precisa filtrar algo.

**Testado ao vivo**: mudei o vídeo de 1 produto pra "Atualizada" (KPI
subiu de 0→1 na hora, confirmado gravado no banco), digitei um texto
em "Detalhes do feedback" e confirmei que salva só ao saber do campo
(blur), não a cada letra. Removido depois (era só teste, `DELETE`
direto — tabela ficou vazia de novo, do jeito que a planilha real vai
começar).

---

### 2026-09-09 (11ª parte) — Controle de Mídia: tirar o scroll horizontal

Raphael viu a tela e pediu 2 ajustes: remover a coluna SKU, e virar
"Feedback montagem?"/"Detalhes do feedback"/"Observações" em botão
(popup) — só aparece cheio quando tem conteúdo, senão fica discreto —
com o objetivo de caber tudo sem precisar rolar a tabela pro lado.

**Implementado**:
- Coluna SKU removida — o SKU não sumiu, virou subtítulo pequeno
  embaixo do nome do produto na mesma coluna "Produto" (sem isso, as
  variações do mesmo produto — ex: Alfafa 250g/500g/1kg — ficariam
  idênticas na tela, já que o nome é igual e só o SKU diferencia).
- "Feedback montagem?" + "Detalhes do feedback" viraram 1 coluna só
  ("Feedback"), com um botão que abre modal (`FeedbackModal`): sem
  feedback registrado ainda → só um "+" discreto cinza; com feedback →
  selo colorido clicável ("Sim" verde / "Não" cinza) que abre o modal
  de novo já preenchido pra editar.
- "Observações" virou botão + modal (`NoteModal`) no mesmo espírito —
  "+" discreto quando vazio, selo âmbar "Ver" quando tem texto.
- Usei o componente `Modal` já existente no sistema (não um popover
  ancorado) de propósito — a tabela tem `overflow-x-auto`/scroll
  vertical próprio, um popover posicionado `absolute` correria risco
  de ficar cortado pelas bordas do scroll em linhas perto do fim.
- Resultado: de 10 colunas caiu pra 8, e as 2 mais largas (texto livre)
  viraram botão compacto — a tabela cabe inteira sem scroll horizontal
  na resolução testada.

**Testado ao vivo**: abri o modal de Feedback, marquei "Sim" +
escrevi um texto de teste, salvei — o botão virou o selo verde "Sim"
na hora e o KPI "Com feedback" subiu de 0→1, confirmado no banco.
Removido depois (teste).

---

### 2026-09-10 — Diagnóstico: contador de cliques do Blog "não funciona" (era só o snippet)

Raphael reportou que testou o blog ontem e nada apareceu em
`/cliques` → aba Blog. Investiguei ao vivo (`blog_post_views`/
`blog_product_clicks` com 0 linhas, insert manual direto na API
funcionou — 201 — confirmando que o banco/RLS/chave estão OK; abri o
post real em `coisapet.com.br/blog/...` e conferi a network: só tem
`GET` de leitura dos posts, nenhum `POST` de tracking, e o HTML da
página nem contém a string `blog_post_views`). Conclusão: **os
snippets nunca foram colados no `coisapet-site`** — não é bug nosso,
é só a última etapa que ficou faltando. Boa notícia no caminho: o site
já lê os posts do Supabase perfeitamente (capa, conteúdo, tudo certo).

**Melhoria feita antes de reenviar os snippets**: os links de produto
inseridos pelo editor (manual — `BlogRichTextEditor.jsx` — e pela
sugestão da IA — `insertFirstLink` em `BlogPostEditorPage.jsx`) agora
saem com o atributo `data-product-link="true"`. Antes, o plano era o
site reconhecer link de produto por regex de URL (`coisapet.com.br/`),
mas isso pegaria QUALQUER link interno do site (menu, "sobre" etc.),
não só produto. Com o atributo, o snippet do site fica muito mais
simples e confiável — só verifica se o link tem esse atributo, sem
adivinhar por padrão de URL. Só afeta link inserido DAQUI EM DIANTE
(link de produto já publicado antes não tem o atributo).

**Também simplifiquei o snippet de visualização** — em vez de depender
de uma variável PHP com o slug (que eu não sei o nome real no
template deles), agora pega o slug direto da URL no navegador
(`window.location.pathname`) — funciona em QUALQUER lugar do site sem
precisar saber nome de variável do backend, só precisa estar carregado
em toda página (ex: incluído no rodapé/footer comum).

**Pendência**: aguardando o Raphael colar os 2 snippets (dados de novo
no chat) no `coisapet-site`.

---

### 2026-09-11 (8ª parte) — Fidelidade das imagens: virada de estratégia (texto rico > imagem de referência)

Raphael testou a foto de referência (item anterior) e não gostou —
"o Higgsfield pega ela e gera uma cópia dela, não é isso... queria que
ele usasse como base, não como cópia fiel". Confirma exatamente o que
o teste ao vivo já tinha mostrado (ver 7ª parte): `soul/reference`
recria o objeto da foto, não usa "espírito"/estilo livre.

**Pesquisei mais fundo** (schema oficial via assistente da doc):
`image_reference_url` é OBRIGATÓRIO nesse endpoint (não é só uma opção
de estilo), e `style_id` é um preset FECHADO deles — não existe jeito
de criar um "estilo CoisaPet" customizado a partir das nossas fotos.
Ou seja, essa API não tem o recurso "inspiração solta" que o Raphael
queria — conclusão real, não suposição.

**Virada de estratégia**: em vez de imagem de referência, fui olhar
fotos reais de 2 categorias bem diferentes (caixa de feno = madeira
escura; terrário = MDF pintado claro) pra escrever uma descrição de
ESTILO bem mais precisa no prompt de texto (sempre em
`IMAGE_PROMPT_SYSTEM`, `blog-ai/index.ts`): peça cortada a laser,
bordas de corte visíveis, encaixe geométrico, acabamento fosco (varia
por tipo de item, nunca uma cor fixa), fundo de estúdio branco/cinza-
claro, luz suave, ângulo 3/4 — e uma regra explícita "terrário da
CoisaPet NUNCA é vidro/aquário, é sempre madeira/MDF cortado a laser"
(1º teste ainda saiu com vidro; reforcei a regra e o 2º teste já saiu
certo).

**Testado ao vivo, 2 gerações reais** com o mesmo tema (terrário pra
hamster sírio), sem nenhuma imagem de referência:
1. Resultado ficou bonito e livre, mas assumiu vidro (chutou "glass
   terrarium" apesar da instrução).
2. Depois de reforçar a regra anti-vidro: resultado ficou muito
   próximo da nossa realidade (MDF laminado com bordas de corte
   visíveis, acabamento fosco, caixa com abertura recortada, furos de
   ventilação, fundo de estúdio) — E continua sendo uma composição
   NOVA a cada geração, não uma cópia de uma foto específica. É
   exatamente o "usar como base, mudando bastante coisa" que o Raphael
   pediu.

**Ficou assim**: o seletor de produto de referência (7ª parte)
continua disponível (útil se algum dia quiser variação de um produto
EXATO), mas o caminho padrão/recomendado agora é gerar só por texto —
o prompt já embute o estilo real da marca, sem precisar escolher nada.

---

### 2026-09-11 (7ª parte) — Fidelidade das imagens geradas: foto de referência real (opcional)

Raphael reclamou que as imagens da Higgsfield ficam bonitas mas fora
do nosso contexto real (exemplo dado: gerou um rato num caixote de
madeira genérico, nada a ver com nossos produtos). Pediu ideia de
"explicar" pra IA com o que a gente trabalha, inclusive com imagens
reais dos produtos.

**Pesquisa + teste ao vivo contra a API real** (não assumi nada, testei
3 gerações completas comparando com a foto original):
- Achei o endpoint `soul/reference` da Higgsfield (aceita
  `image_reference_url` + `style_strength`, além do `prompt`) — confirmado
  via assistente de busca da própria doc deles, e validado batendo
  direto na API com uma foto real de produto (`product-photos`, bucket
  privado — usei signed URL).
- **Teste 1** (prompt pedindo o mesmo produto da referência): resultado
  quase idêntico à foto real (mesma madeira, corte, feno, fundo de
  estúdio) — só errou a logo gravada, virou texto ilegível genérico.
- **Teste 2 e 3** (prompt pedindo uma cena BEM diferente — hamster em
  terrário de tela com rodinha —, com `style_strength` 0.6 e depois
  0.25): mesmo assim voltou a mesma caixa de feno da referência,
  ignorando quase tudo do prompt nas duas tentativas.
- **Conclusão**: `soul/reference` funciona muito bem, mas o CONTEÚDO da
  foto de referência domina o resultado independente do prompt — não é
  um "estilo geral" aplicável a qualquer cena. Só faz sentido escolher
  uma referência que já seja do mesmo assunto/categoria do post.

**Decisão** (perguntei ao Raphael: automático por categoria vs manual —
escolheu manual): a escolha da foto de referência é sempre feita pelo
usuário na hora de gerar, nunca automática.

**Implementado**:
- `supabase/functions/blog-ai/index.ts` — `generateImage()` e
  `callHiggsfield()` aceitam `reference_photo_path` opcional; quando
  presente, usa `soul/reference` (gera signed URL do
  `product-photos` na hora); sem isso, continua no `soul/v2/standard`
  de sempre. Prompt de imagem reforçado pra evitar a IA "inventar"
  gravação/marca na madeira.
- `src/modules/blog/components/ProductReferencePicker.jsx` novo —
  busca produto ativo com foto, mostra miniatura depois de escolhido.
  Reaproveitado nos dois lugares: card de capa
  (`BlogPostEditorPage.jsx`) e popover de inserir imagem no corpo
  (`BlogRichTextEditor.jsx`), sempre opcional.

**Debug temporário**: adicionei e depois REMOVI duas actions de teste
(`_test_reference`, `_test_status`) no `blog-ai` só pra rodar os 3
testes acima direto contra a API real sem esperar a UI — não sobrou
nada disso no código final.

**Pendência de verificação**: o fluxo de ponta a ponta (escolher
produto → gerar → aprovar) foi testado por código/build/backend, mas
a extensão do navegador ficou instável demais pra confirmar o clique
na tela dessa vez (erros repetidos de CDP/timeout, já reportado como
bug da ferramenta) — vale um teste manual rápido do Raphael assim que
possível.

---

### 2026-09-11 (6ª parte) — Higgsfield instável hoje: retry em 5xx, erro amigável, contexto mais leve

Raphael pegou um erro 504 "Gateway time-out" da Cloudflare (na frente
da API da Higgsfield) — o toast mostrou a página HTML de erro inteira
(gigantesca) em vez de uma mensagem curta. Ele também sugeriu deixar
o prompt de imagem mais leve, usando só o resumo do post.

**Investigado**: reproduzi o teste direto e bati no MEU PRÓPRIO limite
de espera (100s) — a geração que antes levava ~45s passou de 100s.
Confirma: não é bug nosso, é a Higgsfield mesmo lenta/instável nesse
momento (mesma causa do 504 que ele viu).

**Corrigido** (`supabase/functions/blog-ai/index.ts`):
- `fetchRetrying5xx()` novo — re-tenta até 2x só em erro 5xx (502/503/
  504 = problema deles/rede, vale tentar de novo); erro 4xx (credencial,
  sem crédito) não tenta de novo, é erro real.
- Mensagem de erro virou curta e em português ("Higgsfield indisponível
  no momento — tente de novo em alguns segundos") em vez de despejar o
  HTML de erro inteiro no toast.
- Deadline do polling subiu de 100s pra 130s, dando mais margem pros
  dias em que a geração está mais lenta que o normal, sem passar do
  limite de execução da Edge Function (~150s).

**Também simplificado** (`BlogPostEditorPage.jsx`): `buildImageContext()`
da capa agora usa só o campo Resumo como base do prompt (cai pra
título/palavra-chave só se o resumo ainda não foi escrito) — mais
leve e previsível, como o Raphael sugeriu. (O texto que chega na
Higgsfield já era só a frase visual curta que o GPT gera antes, nunca
o post inteiro — a lentidão não vinha do tamanho do contexto, mas a
simplificação continua sendo uma boa ideia por conta própria.)

---

### 2026-09-11 (5ª parte) — Blog: correção do erro genérico + prévia/aprovação de capa gerada por IA

Raphael reportou toast genérico "Edge Function returned a non-2xx
status code" ao gerar capa, e pediu pra poder ver a imagem em tamanho
grande e decidir se aceita antes de trocar a capa que já tinha (hoje
trocava direto, sem chance de recusar).

**Causa raiz do erro genérico**: `supabase.functions.invoke()` não
devolve a mensagem real do erro no campo `error` por padrão — ela fica
em `error.context` (precisa `await error.context.json()`), e nenhum
dos 5 pontos que chamam o `blog-ai` no frontend fazia essa leitura
(só existia esse cuidado em `useMlInsights.js`, feito antes). Corrigi
de vez: `src/modules/blog/blogAi.js` novo — um `callBlogAi(action,
params)` único com a extração correta do erro — e troquei as 5
chamadas (`BlogPage.jsx`, `BlogPostEditorPage.jsx` ×3,
`BlogRichTextEditor.jsx`) pra usar ele. Agora qualquer erro real da
Higgsfield/OpenAI aparece de verdade no toast, não só "non-2xx".

**Fluxo de capa por IA agora tem aprovação**: gerar não troca mais a
capa direto — a imagem nova fica num painel "Nova capa gerada — usar
essa?" com botões "Usar essa" / "Descartar", e um clique na miniatura
(tanto da capa atual quanto da candidata) abre em tela cheia
(lightbox simples, fecha clicando fora ou no X). Testado ao vivo:
geração real (~45s), prévia apareceu certinho, zoom em tela cheia
funcionou, "Descartar" confirmado que não mexe na capa que já estava.

---

### 2026-09-11 (4ª parte) — Novo padrão editorial fixo pro gerador de conteúdo (único + em massa)

Raphael trouxe um padrão editorial próprio, já validado, que ele
"sempre" usa (veio de um prompt do ChatGPT que ele já testava manual)
e pediu pra virar o padrão do `GENERATE_SYSTEM_PROMPT` — vale pros
DOIS geradores (editor único e o em massa), porque os dois chamam a
mesma action `generate_content` do `blog-ai`.

**Reescrito** (`supabase/functions/blog-ai/index.ts`):
- **Escopo de espécie fechado**: hamster Sírio e Anão Russo, nunca
  Chinês nem Roborowski; porquinho-da-índia só quando o tema pedir.
- **Estrutura obrigatória, nessa ordem**: subtítulo em itálico →
  índice âncora rotulado "Encontre neste artigo:" (com `<h2 id="ancora-
  N">` correspondente em cada seção) → parágrafo de abertura citável
  (sem metáfora) → contexto/importância → seções com subtítulo
  específico (nunca "Introdução"/"Conclusão") → listas/tabelas de
  DADOS (nunca "X vs Y") → 1-2 frases em `<blockquote>` (vira borda
  lateral no nosso layout) → passo a passo numerado → FAQ real (3-5
  pares) → fechamento com título autoral próprio (nunca repetido) +
  CTA ligado ao tema (nunca genérico).
- **Regras de escrita**: proibido travessão (—), proibida 1ª pessoa
  ("eu"/"nós" — voz é "a CoisaPet" ou 3ª pessoa), proibida comparação
  em formato confronto, categorias de produto mencionadas ao longo do
  corpo (não só no fim) pra dar ancoragem pro passo de sugerir link
  depois.
- **Verificação de fatos**: instrução pra responder como se tivesse
  checado contra fonte veterinária primária (Merck Veterinary Manual,
  PetMD) e sinalizar/optar pela versão cautelosa quando não há
  consenso. **Importante ficar registrado**: isso é uma instrução de
  postura pro modelo (gpt-4o-mini via Chat Completions) — NÃO é busca
  na internet de verdade em tempo real. Se quiser essa garantia mais
  forte (grounding com busca real), é uma integração maior, separada,
  ainda não construída.
- **Pacote de SEO**: adicionado `secondary_keywords` (3-5 palavras-
  chave secundárias) na resposta — guardado no campo `tags` (existia
  no schema desde a fase47, nunca tinha UI). `BlogPostEditorPage.jsx`
  ganhou um mini editor de chips (adicionar com Enter, remover com X)
  no card de SEO; `bulkGenerate` (useBlogPosts.js) salva automático.

**Testado ao vivo, 2 gerações reais completas** contra o modelo em
produção — confirmado item por item: rótulo do índice presente, zero
travessão, `<blockquote>` presente, lista numerada presente, zero
menção a Roborowski/Chinês, fechamento com título autoral único +
CTA temático citando categoria de produto (não modelo específico).
Na 1ª tentativa o índice saiu sem o rótulo "Encontre neste artigo" —
corrigido no prompt (deixei explícito que o rótulo é obrigatório, não
só a lista) e reconfirmado na 2ª geração.

---

### 2026-09-11 (3ª parte) — Assistente de IA pra Perguntas do ML (sugestão, não envio automático)

Raphael trouxe um brainstorm do ChatGPT sobre um bot pra responder
perguntas repetitivas no Mercado Livre ("serve pra hamster sírio?",
"vem montado?", "acompanha rodinha?" etc), pedindo explicitamente pra
eu VALIDAR a integração/API real antes de supor qualquer endpoint.

**Pesquisa feita antes de codar** (docs oficiais + código já existente):
- `GET /questions/search` e `POST /answers` **já estavam** implementados
  em `ml-insights/index.ts` (fase anterior) e em uso real na tela
  "Perguntas & Reputação" — só que 100% manual até agora, zero IA.
- Existe tópico de webhook `questions` (real-time) na doc oficial, mas
  o `ml-webhook` de hoje só escuta `orders_v2` e ignora o resto — não
  mexi nisso ainda (funcionalidade nova roda por polling, igual a tela
  já funciona; virar tempo real é upgrade futuro, não bloqueador).
- Cruzamento anúncio → produto interno já existe em outro lugar do
  código via `SELLER_SKU` do anúncio batendo com `products.sku` —
  reaproveitado aqui do mesmo jeito.
- **Gargalo real encontrado**: metade das perguntas de exemplo dependem
  de saber a espécie compatível, e isso não existia como campo
  estruturado — só descrição em texto livre. Decisão do Raphael
  (confirmada antes de codar): criar os campos antes, não deixar a IA
  adivinhar por texto solto.

**Duas decisões de segurança confirmadas com o Raphael antes de
construir**: (1) IA só SUGERE, nunca envia sozinha — sempre passa por
aprovação humana antes de publicar no Mercado Livre; (2) criar campos
próprios na ficha do produto em vez de depender só da descrição solta.

**Implementado**:
- `supabase/fase54-produtos-dados-atendimento.sql` — campos novos em
  `products`: `compatible_species` (lista fixa de espécies, não texto
  livre — pra IA comparar com segurança), `comes_assembled`,
  `includes_wheel` + `wheel_diameter_cm`, `accessories_included`.
  Booleans usam `NULL` = "não preenchido ainda", diferente de `false`
  — importante pra IA saber quando não tem certeza.
- `ProductFormModal.jsx` — seção nova "Dados pra atendimento" na ficha
  do produto (chips de espécie, toggle sim/não/não-preenchido, campo
  de rodinha condicional, acessórios inclusos).
- `ml-insights/index.ts` — action nova `draft_answer`: pega o item no
  ML, acha o `SELLER_SKU`, cruza com `products`, manda pra IA (mesmo
  `callOpenAI` já usado noutras partes do módulo ML) com um prompt que
  **proíbe explicitamente inventar dado que não está na ficha** — se
  faltar informação, a resposta vem com `confidence:"low"` e explica o
  que falta, em vez de chutar.
- `MlQuestionsReputationPage.jsx` — botão "Sugerir resposta com IA" no
  modal de responder pergunta (já existente): preenche o campo de
  texto com a sugestão, mostra um aviso se a confiança for baixa. O
  fluxo de enviar continua exatamente igual (sempre manual, sempre com
  aviso "isso publica de verdade").

**Testado ao vivo contra a API real do Mercado Livre** (2 cenários):
1. Item sem `SELLER_SKU` configurado no ML → resposta veio com
   `confidence:"low"`, sem inventar nada, explicando que não achou o
   produto — comportamento certo.
2. Item com SKU batendo (`FORR-PAP-NEUT`, "Forração Papel Neutro pra
   Terrário Hamster") → resposta certa, citando fatos reais da
   descrição cadastrada ("atóxico", "não emite odores"),
   `confidence:"high"`, `matched_product_name` correto.

**Pendente pro Raphael**: preencher os campos novos (espécie
compatível, vem montado, rodinha) nos produtos reais — hoje estão
todos vazios, então toda pergunta de compatibilidade ainda vai cair em
"confiança baixa" até alguém preencher a ficha. Real-time via webhook
`questions` fica como próximo passo opcional (hoje funciona por
polling, igual a tela já usava).

---

### 2026-09-11 (2ª parte) — Blog: geração de imagem por IA (Higgsfield)

Raphael trouxe uma chave de API da Higgsfield (geração de imagem) pra
usar nas capas/imagens do blog, a partir do conteúdo do post.

**Credenciais**: guardadas como secrets do Supabase
(`HIGGSFIELD_API_KEY_ID` / `HIGGSFIELD_API_KEY_SECRET`, mesmo padrão do
`OPENAI_API_KEY`) — nunca ficaram no código nem no git.

**Pesquisa da API antes de codar** (docs.higgsfield.ai): autenticação
por par de chave (`Authorization: Key {ID}:{SECRET}`), geração é
assíncrona — POST em `.../soul/v2/standard` com `{"prompt": "..."}`
devolve `status_url`, faz polling com backoff (2s→10s) até
`completed`/`failed`/`nsfw`/`cancelled`; imagem final vem em
`images[0].url`.

**Implementado** (`supabase/functions/blog-ai/index.ts`, action nova
`generate_image`):
1. GPT (gpt-4o-mini) transforma o contexto em português (título/
   trecho do post) num prompt visual em inglês — regra explícita de
   nunca inventar produto específico nem colocar texto/logo na imagem,
   estilo fotografia editorial/lifestyle.
2. Chama a Higgsfield com esse prompt, faz o polling.
3. Re-hospeda a imagem gerada no nosso bucket `blog-covers`
   (`ai-generated/`) em vez de depender do CDN deles direto — mesmo
   motivo do `rehost_images` já existente (link externo pode quebrar).
   Refatorei o `rehostOne` interno em função reutilizável
   `downloadAndHost()`, usada pelos dois fluxos agora.

**Frontend**:
- `BlogPostEditorPage.jsx` — botão "Gerar capa com IA" no card de
  capa, usa título+resumo+palavra-chave+trecho do corpo como contexto.
- `BlogRichTextEditor.jsx` — botão novo na barra de ferramentas
  "Inserir imagem com IA": clica no texto (define o ponto de inserção,
  igual ao link de produto), abre popover com prompt pré-preenchido a
  partir do parágrafo mais próximo do cursor (editável antes de
  gerar), insere a imagem exatamente na posição via DOM Range.

**Testado ao vivo, parcialmente**: confirmei a chamada real end-to-end
contra a Higgsfield direto via curl — autenticação e formato
corretos, chegou no servidor deles, só bloqueado por
`"not_enough_credits"` (conta sem crédito — Raphael precisa resolver
isso direto com eles, não é algo que dá pra contornar por aqui).
Também confirmei visualmente que o botão de capa aparece, e que o
popover de inserir imagem no corpo abre com o prompt pré-preenchido
certinho. A inserção da imagem em si (depois de uma geração
bem-sucedida) não pôde ser testada de ponta a ponta por falta de
crédito na conta — revisão de código confirma a lógica (mesmo padrão
já comprovado do link de produto, com `Range.insertNode`).

---

### 2026-09-11 — Blog: Geração de Conteúdo em Massa

Raphael pediu uma tela pra gerar vários posts de uma vez: lista de
linhas (palavra-chave + mini-contexto), botão "+" pra adicionar mais,
"Gerar" dispara a IA pra cada linha e cada post já nasce como
`rascunho`, aguardando revisão/agendamento manual — igual ele descreveu.

**Implementado, sem mexer no edge function** — a geração em massa só
chama a mesma action `generate_content` do `blog-ai` já existente
(usada pelo editor único), um item de cada vez, sequencial (não em
paralelo, pra não estourar rate limit da OpenAI nem perder o
acompanhamento de progresso por item). Todo post sai com
`ai_target_words: 800` fixo (a "média de 800 palavras" pedida), regras
de conteúdo herdadas do mesmo prompt já ajustado em 09/09 (sem
introdução/conclusão/em suma, sem encher linguiça, responsabilidade
com bem-estar animal).

- `src/modules/blog/hooks/useBlogPosts.js` — `bulkGenerate(items,
  onProgress)` novo: gera + insere cada post (`status: 'draft'`),
  reporta progresso item a item, continua mesmo se um item falhar
  (não derruba o lote inteiro), slug duplicado ganha sufixo numérico
  em vez de falhar.
- `src/modules/blog/BlogBulkGeneratePage.jsx` — tela nova, 3 fases:
  entrada (linhas com palavra-chave + contexto, "+" pra adicionar,
  remover linha) → progresso (checklist ao vivo, um ícone por item:
  pendente/gerando/pronto/erro) → resultado (link "Editar" direto pro
  post gerado, botão "Tentar de novo" só no item que falhou, sem
  precisar regenerar o lote inteiro).
- Rota `/blog/gerar-lote` (`App.jsx`) + item novo no sidebar dentro do
  grupo Blog ("Geração em Massa").

Testado ao vivo com geração real (1 post de teste, keyword marcada
"ignorar") — confirmado no banco: `status: draft`, `ai_generated:
true`, `ai_target_words: 800`, conteúdo real gerado. Removido depois
(era só teste).

---

### 2026-09-10 (4ª parte) — Sidebar: grupos recolhíveis, favoritos por usuário e reorganização

Raphael achou o menu lateral "imenso" pra quem (diretoria) vê o
sistema inteiro. Três pedidos em sequência, todos em
`src/components/layout/Sidebar.jsx`:

**1. Grupos recolhíveis** — cada seção (Otimização ML, Blog, Produção,
RH, Gestão, Diretoria) virou acordeão com seta, ícone próprio por
grupo e selo com a quantidade de itens quando fechado. Preferência
salva no `localStorage` (por navegador — é só conveniência visual,
não por conta), padrão inicial só com "Favoritos" (ver item 3) aberto.
Se a página atual pertence a um grupo fechado, ele abre sozinho pra
mostrar onde você está.

**2. Fecha o grupo antigo ao trocar de módulo** — navegar pra um
módulo de outro grupo fecha sozinho o grupo que você acabou de sair
(só esse — qualquer outro que você tenha aberto de propósito, tipo
referência, continua do jeito que estava). Testado ao vivo trocando
Produção → RH → Blog com um terceiro grupo fixado aberto no meio —
comportamento bateu certinho nas 3 trocas.

**3. "Principal" virou "Favoritos" (bandeirinha por usuário)** — igual
o Mercado Livre faz no painel deles. Só o Dashboard fica fixo ali; o
resto do grupo é montado na hora a partir do que cada usuário marcar
com a bandeirinha (ícone de `Bookmark`, aparece no hover de cada item,
fica sempre visível se já favoritado). O item favoritado continua
aparecendo no lugar original também — é um atalho fixado no topo, não
uma mudança de lugar. Salvo **por usuário** (não por navegador, ao
contrário do item 1) — tabela nova `user_sidebar_favorites`
(`supabase/fase53-favoritos-sidebar.sql`, RLS `TO anon` de novo, mesmo
motivo de sempre: login 100% custom, nunca sessão real do Supabase
Auth). Testado ao vivo: favoritar grava na tabela na hora, aparece nos
dois lugares, sobrevive a reload (vem do banco, não do localStorage),
desfavoritar remove a linha.

**Reorganização pedida junto**:
- `Pedidos` e `Orçamentos` saíram de "Favoritos"/Principal e foram pro
  topo da seção **Produção** (fica junto do fluxo real de trabalho,
  pedido → produção).
- `Pick List` **removido do menu** — já é acessível de dentro da tela
  de Pedidos, não precisa de entrada própria. A rota `/pick-list`
  continua funcionando normalmente (só não aparece mais no sidebar).
- `Produção Horistas` saiu de "Diretoria" e foi pra **Produção**
  também (fica perto de Passagem de Turno/Baixa Diária, que são do
  mesmo tipo de controle).

Build limpo (`npm run build`), tudo testado ao vivo no navegador antes
de reportar pronto. Só local até agora — falta subir junto no próximo
`npm run build` + deploy pro Hostinger, e rodar a migration
`fase53-favoritos-sidebar.sql` (já aplicada no banco de produção via
`supabase db query --linked`, então essa parte já está no ar).

---

### 2026-09-10 (3ª parte) — Retrofit: marcado `data-product-link` nos posts antigos

Raphael perguntou "não dá pra inserir este link nos antigos?" — os
posts publicados **antes** da correção do editor (que passou a marcar
todo link de produto novo com `data-product-link="true"`) tinham links
reais de produto no HTML, mas sem o atributo, então o clique nunca
seria contado em `blog_product_clicks`.

**Solução**: UPDATE direto no banco em vez de reeditar cada post na UI,
com regex que pega qualquer `href="https://coisapet.com.br/..."` que
NÃO seja link interno de blog (`(?!blog/)`, lookahead) e insere o
atributo:

```sql
UPDATE blog_posts
SET content_html = regexp_replace(
  content_html,
  'href="(https://coisapet\.com\.br/(?!blog/)[^"]+)">',
  'href="\1" data-product-link="true">',
  'g'
)
WHERE content_html ~ 'coisapet\.com\.br/(?!blog/)'
RETURNING slug;
```

**8 posts atualizados** (todos os publicados que tinham link de produto
sem marcação). Verificado depois: 0 posts publicados restaram sem
marcação, e o HTML da tag continua válido (spot-check no post do
hamster/gaiola — `<a href="..." data-product-link="true">` certinho,
sem quebra).

Isso destrava o "Clique em produto ainda não testável" que ficou
pendente na entrada anterior — agora existem links reais e marcados em
posts já publicados, dá pra clicar de verdade no site e conferir se
cai em `blog_product_clicks`.

---

### 2026-09-10 (2ª parte) — Confirmado: snippet de visualização funcionando de verdade

Raphael pediu pro Copilot colar o snippet — ele inseriu certinho no
`footer.php:254` (antes do `</body>`, include global). Fui conferir ao
vivo na página real do post.

**Diagnóstico curioso pelo caminho**: primeiras 2-3 tentativas não
gravaram nada no banco, mesmo com o script presente e sintaticamente
correto no HTML (confirmei: sem aspas curvas, IIFE fechada certinho,
sem CSP bloqueando). Só quando li a lista de rede SEM filtro
(`read_network_requests` sem `urlPattern`) apareceu a explicação real:
o `POST` pra `blog_post_views` estava acontecendo, só que voltando
**503** — erro temporário do lado do Supabase/Cloudflare (mesma
instabilidade "Bad gateway" que já tinha pego uma query minha mais
cedo no dia). Nada a ver com o script ou com o `footer.php` — só
timing infeliz de testar bem na hora de uma instabilidade pontual.
Recarreguei mais uma vez e gravou normal.

**Confirmado ao vivo**: recarreguei a página do post real
(`coisapet.com.br/blog/frutas-legumes-...`) e apareceu a linha certa
em `blog_post_views` (slug correto, `referrer: null` por ter entrado
direto). Removida depois (era só teste).

**Clique em produto ainda não testável**: nenhum post publicado antes
de 09/09 tem o atributo `data-product-link` (só link inserido daqui
pra frente tem). Not a bug — só falta gerar/inserir um link de produto
novo em algum post publicado pra ter o que clicar e testar de verdade.

---

### 2026-09-08 — "Criar anúncio novo" completo: SEO, campos ocultos do ML, variações e vídeo

Raphael perguntou se dava pra fazer o "anúncio perfeito" pelo nosso
sistema, com tudo que o ML deixa preencher — inclusive coisas que o
próprio painel deles esconde. Antes de construir, pesquisei o que já
existia: a tela `/ml/anuncios/novo` (assistente de 7 passos) já tinha
todo o "cano difícil" funcionando (sugestão de categoria por IA, ficha
técnica dinâmica por categoria, upload de foto, valores padrão copiados
de anúncio real). Em vez de reconstruir, estendi ela.

**Descoberta real, testada ao vivo contra a API antes de codar**:
puxei o anúncio real "Placa de Identificação" e comparei com a lista de
atributos da categoria — `SELLER_PACKAGE_WIDTH/LENGTH/HEIGHT/WEIGHT`
(dimensão/peso da embalagem) vêm com `tags.hidden: true` na API do ML:
o formulário de criação DELES não mostra esse campo pro vendedor, mas
ele existe de verdade e entra no cálculo de frete — o anúncio real
testado tinha os 4 preenchidos (25cm/8cm/18cm/175g). Isso é literalmente
"o que o ML não mostra" que o Raphael pediu.

Implementado:
- Backend: `buildFullAttributes` agora marca `hidden: !!a.tags?.hidden`
  em cada atributo (`ml-insights/index.ts`).
- Ficha técnica (Step 3) ganhou uma 3ª seção separada "Ocultos no ML",
  só com esses campos, com aviso explicando por que preencher isso é
  uma vantagem que o próprio ML não dá pro vendedor.
- SEO do título (Step 1): contador de caracteres ao vivo (ideal 20–60,
  limite real do ML), aviso de tudo-maiúsculo, aviso de palavra de
  propaganda ("grátis", "promoção"...) que a política do ML rejeita —
  tudo regra real, nada de nota inventada por IA.
- Variações (Step 4 novo, opcional): detecta os atributos que a
  categoria permite variar (`is_variation_attribute`), deixa escolher 1
  (ex: cor), adicionar valores (de lista fechada ou texto livre) com
  preço/estoque próprio de cada um. Sem variação, segue exatamente como
  antes.
- Vídeo do produto (Step 7, campo simples de ID do YouTube).
- Revisão (Step 8): checklist de qualidade calculado na hora (título,
  quantidade de fotos, atributos obrigatórios, campos ocultos
  preenchidos, descrição, vídeo) — nada de nota mágica, só comparação
  direta com o que já sabemos que o ML valoriza.

**Não implementado nessa rodada** (avaliado e descartado por enquanto):
garantia (`sale_terms` — formato incerto, a categoria testada nem
oferecia isso como atributo, arriscado demais pra "chutar" numa escrita
real) e correspondência com catálogo do ML (`catalog_product_id` — feature
grande e arriscada por si só, GTIN já preenchido nos atributos ajuda o ML
a achar o catálogo sozinho, sem precisar construir isso agora).

Testado ao vivo do início ao fim (categoria real "Casas", 9 campos
ocultos confirmados aparecendo, variação por SKU com preço/estoque,
foto real enviada pro ML, checklist final batendo) — **parei antes do
botão "Publicar"** pra não criar um anúncio de teste de verdade na
loja.

---

### 2026-09-08 — Módulo "Chapas" (`/producao/chapas`)

Raphael explicou como a Produção funciona na prática: eles não produzem
peça por peça, produzem por CHAPA de corte a laser — uma chapa pode
render várias unidades do MESMO produto (ex: 14x Toca Luxo) ou uma
combinação de produtos DIFERENTES (ex: 1x Terrário Grande + 1x Toca
Luxo + 1x Banheira). Pediu um "gerador de chapas" — primeira versão,
"depois vamos lapidando".

Implementado (v1, só cadastro — ainda não integra com a fila de
Produção existente):
- Tabelas `chapas` (nome, observações) e `chapa_items` (chapa × produto
  × quantidade, `UNIQUE(chapa_id, product_id)`) — `supabase/fase46-chapas.sql`.
- Hook `useChapas.js` (padrão idêntico ao `useProducts.js`: create/
  update/remove com toast + audit log) e página `ChapasPage.jsx`,
  reaproveitando o mesmo padrão de busca+adicionar produto do
  `NewOrderModal` da Produção (busca por nome/SKU, lista de itens com
  +/- de quantidade). Editar reconstrói os itens do zero (mais simples
  que diff). Remover é soft-delete (`active=false`), não apaga produtos.
- Rota `/producao/chapas`, item no sidebar logo abaixo de "Produção"
  (mesmo `moduleKey: 'producao'`, sem permissão nova).

**Bug real encontrado e corrigido nesse processo, importante pra
qualquer tabela nova daqui pra frente**: segui o texto do migration
antigo (`fase2-materiais-produtos.sql`) e criei `chapas`/`chapa_items`
com RLS `TO authenticated` — só que esse app **nunca estabelece sessão
real do Supabase Auth** (login é 100% custom via RPC, ver
`AuthContext.jsx`), então toda chamada sai com a ANON key, papel `anon`
de verdade. `TO authenticated` bloqueou 100% dos inserts (401 "new row
violates row-level security policy"), sem travar a tela, só falhando
silencioso. Descobri comparando com o estado REAL de `products`/
`raw_materials` em produção: o RLS delas está **desativado**
(`relrowsecurity=false`), apesar do texto da migração antiga dizer
`TO authenticated` — foi alterado depois sem atualizar o arquivo.
Corrigido com policy explícita `TO anon` nas tabelas novas. Registrado
em memória (`coisapet_rls_anon_only_auth`) pra não cair nessa de novo.

Testado ao vivo: criar chapa com 2 produtos diferentes, editar (recarrega
itens certinho), remover (com confirmação) — tudo funcionando, dado real
gravado e conferido direto no banco.

---

### 2026-09-08 — Histórico de Atualizações: agrupar por anúncio + acesso do Atendimento + check de sincronização Shopee

Follow-up da tela de ontem, 3 pedidos do Raphael:

1. **Não repetir produto** — se o mesmo anúncio teve 2+ gravações (ex:
   ficha técnica E título/descrição), antes aparecia 1 linha por
   gravação; agora `allItemUpdates()` agrupa por `item_id`, juntando as
   ações distintas num card só (com todos os badges de tipo de ação +
   resumo de cada uma), usando o `updated_at` mais recente do grupo pra
   ordenar. Como isso muda a paginação (agora pagina ANÚNCIOS, não
   linhas cruas do log), a função busca até 1000 linhas recentes do log,
   agrupa em memória e só depois pagina os grupos — teto de segurança
   bem acima do volume atual (53 linhas / 39 anúncios hoje).
2. **Paginação de 15 em 15** — trocado o "Carregar mais" (infinito) por
   páginas de verdade (Anterior/Próxima, "Página X de Y"), 15 anúncios
   por página.
3. **Check de sincronização Shopee** — o time de Atendimento vai olhar
   essa tela, replicar manualmente cada mudança na Shopee, e marcar um
   check quando terminar. Nova tabela `ml_item_sync_checks` (Fase 45,
   `item_id` PK + `checked_at` + `checked_by` texto livre) + ação
   `set_item_sync_check`. Importante: o check **não é permanente** — ao
   exibir a lista, comparamos `checked_at` do check com o `updated_at`
   mais recente do grupo; se surgir uma mudança NOVA depois do check, o
   item volta a aparecer como pendente sozinho, sem precisar de nenhuma
   lógica extra pra "resetar" (é só comparação de timestamp).
4. **Acesso liberado pro Atendimento, só nessa tela** — antes tudo de
   "Otimização ML" usava o mesmo `moduleKey` (`ml-insights`), que o
   Atendimento não tem. Criado um `moduleKey` novo e exclusivo,
   `ml-historico`, só pra essa rota (`/ml/historico`) — as outras telas
   de ML continuam fechadas pro Atendimento. Registrado em
   `role_permissions` (`atendimento` → `true`, demais roles não-admin →
   `false`, mesmo padrão restritivo que `ml-insights` já tinha) e
   adicionado em `AccessControlPage.jsx` (`MODULES`) pra aparecer no
   painel de Controle de Acesso caso precise ajustar depois.

Testado ao vivo: agrupamento confirmado (53 linhas → 39 anúncios, sem
repetição), check/uncheck persistindo entre reloads com nome de quem
marcou, paginação 15/página funcionando ("Página 1 de 3").

---

### 2026-09-08 — Tela "Histórico de Atualizações" (`/ml/historico`)

Raphael pediu uma tela mostrando TODAS as atualizações feitas na saúde
dos anúncios, mais recente primeiro — a tabela `ml_item_updates` (Fase
38) já registrava isso, mas só existia visão por item (widget dentro do
detalhe de cada anúncio, últimas 10). Implementado:
- `allItemUpdates()` + `case 'all_item_updates'` em `ml-insights/index.ts`
  — lê `ml_item_updates` inteiro (não só 1 item), pagina por offset/
  limit (50 por vez), enriquece com título/thumbnail/permalink do item
  via multiget na API do ML.
- Página nova `MlUpdatesHistoryPage.jsx`, rota `/ml/historico`, item no
  sidebar logo depois de "Saúde dos Anúncios". Cada linha resume o
  `detail` salvo de um jeito legível por tipo de ação (ficha técnica:
  quantos campos; conteúdo: título e/ou descrição; preço/estoque/status:
  campo e valor; campanha: tipo + preço promo; pergunta respondida: o
  texto da resposta). Botão "Carregar mais" pagina o resto.
- Testado ao vivo: 53 atualizações reais carregaram certinho, ordem
  decrescente confirmada, "Carregar mais" trouxe o resto até acabar.
  Bônus: apareceu ali a resposta que o Raphael mandou ontem pra pergunta
  antiga da Rodinha 30cm — confirma que aquele fluxo (`/ml/perguntas`)
  também está funcionando de ponta a ponta.

---

### 2026-09-07 — Responder pergunta antiga direto pelo sistema (`/ml/perguntas`)

Raphael tinha uma pergunta de comprador muito antiga (04/05/2026, ~125
dias) sem resposta e não conseguia achar ela pra responder. Investigado
ao vivo navegando no próprio painel do ML:
- A tela nova de Perguntas (`vendedores.mercadolivre.com.br/perguntas/vendedor`)
  **só tem filtro de data até 30 dias** (confirmado inspecionando o
  dropdown pelo DOM — só existem as opções "Últimos 15 dias" e "Últimos
  30 dias", nada de período customizado nem "todos").
- O painel clássico (`myaccount.mercadolivre.com.br/questions`) não
  existe mais (404).
- A página pública do anúncio ("Ver todas as perguntas") só mostra as
  já respondidas, não as pendentes.
- Ou seja: **não existe, hoje, link nenhum dentro do ML pra achar/
  responder uma pergunta com mais de 30 dias** — é uma limitação real da
  interface deles, não falta de procurar.

A API do ML não tem essa limitação (`/questions/search?status=UNANSWERED`
devolve a pergunta certinha, sem filtro de data) e tem endpoint de
escrita documentado (`POST /answers`). Implementado:
- `answerQuestion()` + `case 'answer_question'` em `ml-insights/index.ts`
  (mesmo padrão de toda escrita no ML: log em `ml_item_updates`, erro
  amigável via `friendlyMlError`).
- Botão "Responder" em cada card de `/ml/perguntas`, abre modal com a
  pergunta + textarea + aviso de que é publicação real e imediata —
  nunca 1 clique só grava.
- Testado ao vivo: modal abre certinho com a pergunta de maio
  carregada. **Não testei o envio de verdade** (postar uma resposta é
  irreversível e pública — isso fica pro Raphael escrever e confirmar).

---

### 2026-09-07 — Tela "Publicidade" (`/ml/publicidade`): campanhas e anúncios patrocinados do ML (Ads)

Raphael pediu uma tela completa de Publicidade/Ads do Mercado Livre:
campanhas ativas/inativas, anúncios patrocinados (parados, com gasto,
completos), valores investidos, ROAS — "tudo tudo tudo" que der pra
puxar pela API, com links diretos pro ML pro que não der.

- Diferente de "Promoções" (`MlPromotionsPage.jsx`, campanhas de
  desconto tipo 9.9/DEAL) — essa tela é sobre **Product Ads**
  (publicidade paga por clique), que antes só aparecia como 1 cartão
  isolado no Dashboard da conta.
- Boa parte da infraestrutura de backend pra falar com a API de Ads do
  ML já existia (`findMlAdvertiser`, `fetchAdsMetrics`, `adsCoverage`,
  `fetchAccountAdsSummary`) — faltava só uma ação que buscasse TUDO de
  uma vez (todas as campanhas + todos os anúncios, com métricas) e
  cruzasse anúncio → nome da campanha. Nova função `adsDashboard` +
  ação `ads_dashboard` em `supabase/functions/ml-insights/index.ts`.
- Página nova `src/modules/ml-insights/MlAdsPage.jsx`, rota
  `/ml/publicidade`, item novo no sidebar (entre Promoções e
  Oportunidades de Venda). Cartões de resumo (investido, receita, ROAS
  médio, cliques, impressões, CTR médio), lista de campanhas com meta
  vs. real de ACOS/ROAS, tabela de anúncios patrocinados com busca +
  filtro por status (ativo/idle/pausado/hold) + ordenação, seção
  separada dos anúncios pausados fora do Ads (cruzando com
  `active_listings`), e botão "Ver no Mercado Livre" apontando pro hub
  de Publicidade do vendedor (não existe link profundo confirmado por
  campanha/anúncio individual — pausar campanha, mudar orçamento etc.
  continua só manual no painel deles, sem API pública pra isso).
- **Testado ao vivo** contra a API real da CoisaPet antes de considerar
  pronto: 5 campanhas ativas, 90 anúncios patrocinados (45 ativos / 37
  idle / 6 pausados / 2 hold), R$760,76 investidos e R$17.329,47 de
  receita de Ads nos últimos 30 dias (ROAS médio 22,78x) — e depois
  conferido visualmente na tela renderizada, batendo com esses números.

**Follow-ups no mesmo dia, pedidos pelo Raphael depois de ver a tela:**
- Balões de "?" explicando Custo/Receita/ACOS/ROAS/CTR em todo canto que
  aparecem (cartões de resumo, cada campanha, cabeçalho da tabela de
  anúncios — não repetido linha a linha, só uma vez no topo da tabela,
  pra não poluir com 90 linhas × 5 tooltips). Deixa claro que Custo é só
  do período selecionado (não é total histórico nem orçamento diário) e
  Receita é só o atribuído àquele anúncio (direta + indireta), não a
  receita geral da loja.
- Modal de produtos por campanha: clicar no nome da campanha (ou no
  contador "N produtos") abre modal com cada anúncio daquela campanha e
  seus dados individuais (custo/receita/cliques/ACOS/ROAS), ordenado por
  custo. Testado ao vivo, abre certinho.
- **Bug corrigido**: o toggle "Anúncios parados fora do Ads" era um
  `<button>` com um `InfoTooltip` (que também renderiza um `<button>`)
  dentro — `<button>` dentro de `<button>` é HTML inválido, o navegador
  corrige sozinho e quebra a estrutura. Trocado o toggle externo pra
  `<div role="button" tabIndex={0}>` com `onKeyDown` pro Enter/Espaço, e
  o clique no "?" agora leva `stopPropagation()` pra não also-togglear o
  card ao explicar o termo. Vale ficar de olho: **nunca aninhar
  `InfoTooltip` dentro de um `<button>`** — usar `<div role="button">`
  quando precisar de clique + tooltip juntos.
- Próximo pedido do Raphael, ainda não implementado: um "analisador" de
  campanha (regras sobre os números reais — orçamento batendo teto,
  ACOS estourando meta, anúncio gastando sem vender, anúncio com ROAS
  bom mas pouco explorado — nunca IA "inventando", só cálculo em cima
  do que já vem da API). Combinado formato por campanha (não resumo
  geral).

---

### 2026-09-06 — Site novo (`site-novo/`): hero de scroll "andar no terrário"

Raphael pediu um site institucional novo pra CoisaPet, padrão "melhores
UI/UX do mundo": primeira dobra com efeito de zoom/andar dentro de um
terrário ambientado ao rolar a página, antes de cair nas seções normais
(história, produtos, diferenciais, equipe, comunidade). Projeto vive
isolado em `site-novo/` (HTML/CSS/JS puro, sem build, mesmo espírito de
`site/`) — não mexe no site atual.

**Plano alinhado com o Raphael antes de codar** (`AskUserQuestion`, todas
as recomendadas): paralaxe 2D em camadas (não WebGL/3D), evoluir a
identidade visual já existente (cobre/creme/marrom + Playfair Display +
DM Sans, mesma de `site/quemsomos.html`), HTML/CSS/JS puro, fotos de
produto reais curadas e baixadas localmente (não busca ao vivo).

**Achado importante**: a skill de geração de imagem (`design`, Gemini)
precisa de Python + `GEMINI_API_KEY` — nenhum dos dois está disponível
nesta máquina, e a skill instrui explicitamente a NÃO instalar Python
sozinho. Pivotei pra uma solução melhor pro caso: a cena inteira do
terrário é **SVG desenhado à mão** (camadas por profundidade: parede,
vidro, substrato, planta, roda, casinha), animado com GSAP ScrollTrigger
— zero dependência externa, nítido em qualquer resolução, e sem risco de
inconsistência entre "cenas" (é a mesma ilustração, a câmera avança).

**Bug real encontrado e corrigido**: passar `transformOrigin` em
coordenadas do viewBox (ex: `'800px 520px'`) pro GSAP quebra a origem de
escala, porque o SVG renderizado tem sua própria escala de tela
(viewBox 1600x900 esticado pro viewport real) — os elementos incham na
direção errada. Corrigido usando a origem padrão do GSAP (`50% 50%`,
relativo à própria caixa de cada elemento). Escalas também foram
reduzidas (de até 2.4x pra no máximo ~1.45x) pra composição não ficar
"quebrada" visualmente.

Fotos reais de 12 produtos (bebedouro, labirinto, plataforma, etc.)
baixadas via `scripts/fetch-site-novo-products.mjs` (gera signed URL do
bucket privado `product-photos` com a anon key, baixa os bytes — não
expira porque vira arquivo local em `site-novo/assets/products/`).
Conteúdo institucional (história, pilares, equipe) reaproveitado de
`site/quemsomos.html` e `site/index.html`, adaptado.

Testado ao vivo (servidor estático local + Claude in Chrome): mecânica
do hero funcionando (rolei em ~6 pontos diferentes, composição limpa em
cada um); fallback de `prefers-reduced-motion` também testado (esta
máquina tem a preferência ativada no SO) — mostra cena estática, sem
scroll-jacking, como devia. Todas as seções institucionais conferidas
(história, produtos com fotos reais, diferenciais, equipe, comunidade,
footer).

**Atualização no mesmo dia — trocado por fotos reais**: o Raphael viu a
versão em SVG e pediu fotos de verdade, "bem mais realista". Resolvido
assim:
1. Máquina não tinha Python nem `GEMINI_API_KEY` — Raphael instalou os
   dois na sessão (Python 3.12 via `winget install Python.Python.3.12`;
   chave em aistudio.google.com/apikey). **Detalhe que custou tempo**: o
   projeto sincroniza via OneDrive entre PCs do Raphael, mas cada sessão
   do Claude Code fica presa na máquina onde foi aberta — o primeiro
   Python instalado foi numa máquina errada (`Zeus`) e só apareceu depois
   de instalar de novo na máquina certa (`DESKTOP-VI61O97`, a desta
   sessão). Depois do install, o Python só ficou visível via caminho
   absoluto (`AppData/Local/Programs/Python/Python312/python.exe`) — o
   processo do Claude Code já estava rodando antes do install e não
   pega o PATH atualizado sem reiniciar.
2. **A API do Gemini (`google-genai`) devolveu 429 cota-zero** pros
   modelos de imagem (`gemini-3-pro-image-preview` e
   `gemini-2.5-flash-image`) mesmo com a chave válida — o nível grátis
   da API exige faturamento ativado no Google Cloud pra liberar QUALQUER
   cota de geração de imagem (script ficou salvo em
   `scripts/generate-hero-scenes.py`, funcional se um dia ativarem
   faturamento).
3. **Solução que funcionou**: gerar pelo **app de chat do Gemini**
   (gemini.google.com, mesma conta Google "Coisa Pet" já logada no
   Chrome conectado) em vez da API — o free tier do app permite geração
   de imagem normalmente. Pedi as 3 cenas na MESMA conversa (uma
   seguindo a outra, "essa mesma cena, câmera moveu mais perto...") pra
   manter continuidade visual real entre elas, baixei cada uma e salvei
   em `site-novo/assets/hero/scene-{1-wide,2-mid,3-close}.jpg`.
4. Reescrito `hero.js`/`index.html`/`style.css`: as 3 fotos reais
   substituem o SVG, em crossfade + zoom contínuo (Ken Burns) via GSAP
   — mesma timeline por scroll de antes, só trocando "camadas
   desenhadas" por "3 `<img>` empilhadas com opacity cruzando". Testado
   de novo em vários pontos do scroll — resultado ficou bem mais
   convincente que o SVG.

**2ª atualização no mesmo dia — 3 fotos não bastava, virou sequência de 7**:
Raphael lembrou que o pedido original era tipo vídeo quebrado em frames
(scroll = frame, andando de verdade), não só 3 fotos alternando. Tentei
gerar vídeo de verdade (Veo) — **exige assinatura paga do Gemini**,
confirmado testando direto no chat ("Video Generation Requires
Subscription"). Sem assinar, resolvido assim: gerei mais 4 fotos
intermediárias na MESMA conversa do Gemini (mesma técnica de
continuidade), ficando com 7 pontos de parada ao todo (de fora →
próximo do vidro → substrato/galho com a roda ao fundo → roda em foco →
passando a roda com a casinha aparecendo → casinha meio-perto → close
final). Reescrito `hero.js`/`index.html` pra loop genérico sobre N
quadros (`data-frame="0..6"`) em vez de 3 fixos — cada quadro ocupa 1/7
do scroll, com crossfade curto entre um e outro. Com mais pontos de
parada mais próximos entre si, o efeito lembra bem mais "andar quadro a
quadro" do que as 3 fotos anteriores. Bug de teste encontrado no
caminho (não é bug do site): ao testar via console forçando o modo
animado, esqueci de restaurar `.hero-stage` pra `position:sticky` (o
CSS real desliga isso via `prefers-reduced-motion`, que está ativo
nesta máquina) — sem isso as fotos pareciam "sumir" porque a seção
inteira rolava normal em vez de ficar fixa. `#hero` aumentado pra 480vh
(desktop) / 280vh (mobile) pra dar espaço aos 7 quadros.

**3ª atualização — hero não animava pro Raphael**: ele testou e reportou
"nada muda, mesmo rolando". Causa: o `hero.js` desligava a animação
inteira quando `prefers-reduced-motion: reduce` estava ativo (decisão
minha, de acessibilidade) — e o Windows dele tinha "Efeitos de
animação" desligado (Configurações → Acessibilidade → Efeitos visuais),
o que ativa essa preferência no Chrome. Raphael questionou (com razão)
por que a dobra principal do site dependia de uma configuração de
sistema tão pouco conhecida, já tendo visto outros sites com scroll
assim funcionarem mesmo com essa opção desligada. **Removida a trava**:
o hero agora anima pra todo mundo, independente de
`prefers-reduced-motion` — decisão consciente de tratar essa dobra como
conteúdo principal (não efeito decorativo por cima de conteúdo já
legível), igual a maioria dos sites com esse tipo de scrollytelling.
Tirado tanto do `hero.js` (early return) quanto do `style.css` (media
query que forçava `#hero` a 100vh / `.hero-stage` a `position:relative`).
Testado com scroll de mouse de verdade (não só JS) depois da correção,
funcionando em todos os 7 quadros.

**Pendências**: nenhuma; projeto funcional com sequência de 7 fotos
reais, animação sem trava de reduced-motion. Falta decidir com o
Raphael quando/se substitui `site/` em produção, e se algum dia quiser
vídeo de verdade (Veo) precisa assinar o Gemini pago.

---

### 2026-09-05 — Gestão de Envios Full (`/ml/full/envios`) + múltiplos holerites por funcionário/mês

Duas entregas nessa sessão:

**1. Múltiplos holerites por funcionário/mês** (fase43): Marlon (CLT +
fim de semana) e Diovani (pagamento semanal) recebem mais de um holerite
no mesmo mês. **Bug real encontrado**: o botão "Enviar" do modal
`PayModal` (`RHPages.jsx`) chamava `onClick={save}` direto — o React
passa o evento do clique como argumento, que virava o `forceOverwrite`
(sempre truthy!), pulando a checagem de conflito. Ou seja, **o sistema
já vinha sobrescrevendo holerites em silêncio**, sem nunca perguntar.
Corrigido: campo `label` novo em `payslips` (coluna, migration
`fase43-payslips-multiplos.sql`), modal agora detecta os já existentes e
oferece "Adicionar mais um" ou "Substituir" um específico da lista.
Storage também ajustado pra não um arquivo apagar o outro (sufixo por
rótulo ou timestamp quando há mais de um no mês).

**2. Gestão de Envios Full**: Raphael queria acompanhar dentro do
CoisaPet a tela "Gestão de envios Full" do painel do Mercado Livre
(`vendedores.mercadolivre.com.br/shipping/inbounds` — onde ele cria/
acompanha envios de estoque pro CD). **Confirmado por pesquisa (e pela
doc oficial do ML)**: essa tela não tem API pública — só dá pra
consultar "estoque Full" e "operações de estoque" via API, a gestão de
envios em si só existe no painel logado no navegador (o endpoint que a
tela usa devolve 401 sem os cookies de sessão). Por isso virou um
**snapshot sincronizado via automação de navegador** (Claude in Chrome,
perfil "login coisapet"), não uma tela ao vivo tipo o resto do módulo
ML: tabelas novas `ml_full_inbound_shipments` + `ml_full_inbound_items`
(migration `fase44-full-inbound-shipments.sql`), populadas rodando um
script no console da própria página do ML (fetch da lista + parse do
HTML de cada detalhe, grava direto no Supabase via REST com a anon key).
29 envios / 387 itens sincronizados nesta sessão. Pra atualizar: pedir
"sincroniza a gestão de envios Full" (só o Claude com esse navegador
conectado consegue rodar de novo, não tem botão dentro do app que
funcione sozinho). Tela em `/ml/full/envios`, sidebar dentro de "Estoque
Full", com tooltips explicativos (`InfoTooltip`) e abas por status
(pendentes/aguardando/finalizados/cancelados).

**Achado à parte, útil pra sessões futuras**: a CLI do Supabase local
está logada e linkada ao projeto CoisaPet (`supabase db query --linked`
funciona direto, sem precisar copiar SQL pro dashboard) — usado pra
aplicar as duas migrations acima nesta sessão.

---

### 2026-09-04 (9ª parte) — Campo de observação no holerite

Pedido simples do Raphael: um campo curto no modal "Enviar holerite"
(`/rh/holerites`) pra anotar algo sobre o pagamento daquele mês (ex:
adiantamento já descontado, bônus incluso).

- Migration `supabase/fase42-payslips-notes.sql`: coluna `notes text`
  em `payslips`.
- `PayModal` (`RHPages.jsx`): campo de texto único "Observação do mês"
  (opcional, até 200 caracteres), incluído no payload de save
  automaticamente (já usa `{...form}`). No fluxo de conflito
  (sobrescrever holerite existente do mesmo mês), pré-preenche a
  observação já cadastrada pra não sumir sozinha se a pessoa só estiver
  reenviando o PDF.
- Aparece em dois lugares: na lista do admin (`RHHoleritesPage`, abaixo
  do nome do funcionário) e no app da equipe (`equipe/index.html`,
  função `loadMais()`, abaixo da referência do holerite) — decidi
  mostrar pro funcionário também porque "informação sobre o pagamento
  do mês" só faz sentido documentado se ele consegue ver.

Testado ao vivo (via SQL direto pra não precisar simular upload de PDF
verdadeiro): nota aparece certinho na lista do admin, build limpo, sem
erros. Não cheguei a testar visualmente no app da equipe (precisaria de
login de funcionário), mas o código segue o mesmo padrão de leitura já
usado ali pros outros campos do holerite.

---

### 2026-09-04 (8ª parte) — Atestados médicos: aprovação + reflexo automático no Relatório de Ponto

Raphael queria o mesmo fluxo das férias pros atestados que a equipe já
envia pelo app (`equipe/index.html` → `medical_certificates`): hoje
entrava direto sem aprovação nenhuma, e o Relatório de Ponto não sabia
que aquele dia tinha atestado (virava falta, ou só as horas parciais
contavam se a pessoa trabalhou parte do dia antes de passar mal).

**Descoberta importante durante a implementação**: o Raphael pediu pra
mexer no "Timesheet" pra isso, e existe de fato um
`src/modules/timesheet/TimesheetPage.jsx` com exatamente esse padrão de
aprovação de férias — só que **esse arquivo não está importado em
lugar nenhum, não tem rota, é código morto**. A tela de verdade,
roteada em `/rh/ferias` e `/rh/atestados`, é `RHFeriasPage` e
`RHAtestadosPage`, dentro de `src/modules/rh/RHPages.jsx` (plural,
diferente de `RHPage.jsx` singular, que também parece não-roteado).
Cheguei a implementar a aprovação em `TimesheetPage.jsx` primeiro (por
causa do nome "Timesheet"), percebi o engano ao tentar abrir a rota, e
refiz a mesma coisa no lugar certo (`RHAtestadosPage`). Deixei as
mudanças em `TimesheetPage.jsx` como estão (inofensivo por estar morto,
não vale o esforço de reverter) — **mas se algum dia esse arquivo for
resgatado/roteado, ele já vem com atestados também**, e se for
definitivamente lixo, dá pra apagar os dois (`TimesheetPage.jsx` e
`RHPage.jsx`) numa faxina futura.

**O que foi feito, no lugar certo:**

1. **Banco** (`supabase/fase41-atestados-aprovacao.sql`): adiciona
   `status`/`reviewed_by`/`reviewed_at`/`reject_reason` em
   `medical_certificates` (mesmas colunas que `vacation_requests` já
   tinha). Atestados enviados ANTES dessa feature (16 registros) viraram
   `aprovado` automaticamente — não é revisão retroativa, é reconhecer
   que já tinham sido aceitos na prática.
2. **Aprovação** (`RHAtestadosPage`, `RHPages.jsx`): reescrita pra
   espelhar `RHFeriasPage` linha por linha — filtro Pendentes/Aprovados/
   Rejeitados/Todos, badge de status, botões Aprovar/Rejeitar, modal de
   confirmação com motivo opcional de rejeição, função `review()` fazendo
   o update. Contador de pendentes no menu igual férias.
3. **Relatório de Ponto** (`RHRelatorioPage.jsx`): mesmo padrão do home
   office da Isabelly — nova função `isAtestadoDay(empId, dateStr)`,
   fetch de `medical_certificates` aprovados (com `date_end` calculado
   no cliente a partir de `date + days_off`, já que a tabela não tem
   coluna de fim), aplicado em `calcEmpStats`, `totalDays`, no extrato
   impresso/exportado e no `DayRow` da tela. **Diferença importante do
   home office**: no atestado os registros REAIS de ponto daquele dia
   continuam aparecendo nas colunas Entrada/Almoço/Retorno/Saída (só o
   Total e o Saldo são sobrescritos pra meta cheia) — cobre exatamente o
   caso que o Raphael descreveu (trabalhou 3h, passou mal, atestado pro
   resto do dia).
4. **Fix descoberto testando com dado real**: a Ana Carolina tinha
   férias aprovadas justamente no dia em que testei um atestado —
   sem tratamento, o dia mostrava os dois selos (Férias + Atestado) com
   Total "0h" porque a meta do dia já tinha sido zerada pela férias,
   ficando visualmente contraditório ("atestado médico" ao lado de
   "0h"/"em dia" sem crédito nenhum). Corrigido: férias tem prioridade —
   `isAtestado` só é considerado quando o dia NÃO é dia de férias
   (`!isVacationDay(...) && isAtestadoDay(...)`), nos dois pontos do
   `DayRow` e no extrato impresso.

Testado ao vivo com um atestado de teste real (inserido e removido via
SQL): fluxo pendente → aprovar no `/rh/atestados` → reflexo automático
no Relatório de Ponto sem nenhum passo manual extra, badge "🩺
Atestado", ponto parcial real preservado, saldo neutro, e o caso de
sobreposição com férias corrigido. Build limpo, sem erros no console.

**Fora de escopo** (mencionado ao Raphael): Ponto Semanal e Horas Fim de
Semana não recebem esse tratamento, só o Relatório de Ponto.

Plano completo em `C:\Users\User\.claude\plans\curried-coalescing-shamir.md`.

---

### 2026-09-04 (7ª parte) — Horas de fim de semana do Marlon somem do Relatório de Ponto geral

Raphael notou que as horas de fim de semana do Marlon (que já têm tela
própria — "Horas Fim de Semana", filtrada por `system_users.
weekend_hours_separate = true`) continuavam contando E aparecendo no
Relatório de Ponto geral, inflando o saldo dele artificialmente (ex:
Agosto foi de "+16h60m" pra "-15h25m" depois do fix — a diferença toda
era hora de fim de semana já contabilizada em outro lugar).

Já existia o flag certo no banco (`weekend_hours_separate`, só o Marlon
tem `true` hoje) — só faltava o Relatório de Ponto respeitar ele. Antes
esse flag só era lido pela própria tela de Horas Fim de Semana.

**Fix, todo em `RHRelatorioPage.jsx`**: adicionei `weekend_hours_separate`
no select de `system_users` (não vinha antes) e, em todo lugar que lê os
registros de um dia de fim de semana pra esse funcionário, troco pra uma
lista vazia — `calcEmpStats` (não soma no total nem na meta),
`totalDays` (não conta como dia trabalhado), o extrato impresso/
exportado, e a tabela on-screen (`DayRow`, via a prop `records`). Como o
resto do código já trata "sem registro em fim de semana" como uma
célula neutra `—`, não precisei inventar um estado novo — o dia
simplesmente fica em branco, como se não tivesse acontecido nada ali
(porque, pra fins deste relatório, não aconteceu — já está na tela
certa).

Só toquei no Relatório de Ponto — Ponto Semanal e outras telas que
também possam somar hora de fim de semana não foram tocadas; avisar se
precisar do mesmo tratamento lá.

Testado ao vivo: Agosto do Marlon caiu de 167h59m pra bater com só os
dias úteis, sábado/domingo aparecem 100% em branco na tabela (antes
mostravam os horários batidos). Build limpo, sem erros no console.

---

### 2026-09-04 (6ª parte) — Home office fixo da Isabelly (quinta/sexta) no Relatório de Ponto

Combinado com o Raphael: a partir de agosto/2026, Isabelly Vitoria
Asensio (id `b6a29004-dc27-4fb1-b481-905f0acdaf53`) trabalha remoto toda
quinta e sexta — não bate ponto nesses dias. Antes, isso aparecia como
falta (débito de meta) no Relatório de Ponto, distorcendo o saldo dela
pra muito mais negativo do que a realidade.

**Regra implementada** (só pra ela, é uma exceção nomeada — ver
comentário no código, mesmo espírito do caso do Eduardo com salário
fixo): quinta/sexta a partir de 2026-08-01, SE não for feriado, o dia
conta como 100% batido — total = meta do dia, saldo = 0 — com um selo
"🏠 Home office" na linha, em vez de olhar os registros reais de ponto
(que não existem nesses dias, de propósito). Feriado nesses dias
continua sem contar normalmente (não é dia útil). Dia futuro (ainda não
aconteceu) não mostra o selo nem soma — só quando o dia realmente chega,
igual qualquer outro dia do calendário.

Função nova `isHomeOfficeDay(empId, dateStr, isHoliday)` em
`RHRelatorioPage.jsx`, aplicada em TODOS os lugares que calculam
horas/meta pra ela nessa tela: `calcEmpStats` (total do mês, usado nos
cards e na barra de resumo do extrato), o loop de dias do extrato
impresso/exportado, e o `DayRow` da tabela on-screen (badge + total +
saldo). Aproveitei pra eliminar 2 cálculos de `totalDays` duplicados que
já existiam soltos no arquivo (agora usam o retorno de `calcEmpStats`
direto, ao invés de recalcular igual).

**Fora de escopo por enquanto**: só mexi no Relatório de Ponto
(`RHRelatorioPage.jsx`) — Ponto Semanal e Horas Fim de Semana não foram
tocados; se o Raphael usar aqueles pra tirar o horário dela também, a
mesma regra precisa ser replicada lá.

Testado ao vivo: Setembro (mês corrente) mostra Qui 03 e Sex 04 com o
selo "Home office" e saldo "em dia", dia futuro (Qui 10) sem o selo
ainda; Agosto mostra o saldo bem menor que antes (5h29m ao invés do
salto que a falta de quinta/sexta inteira geraria). Build limpo, sem
erros no console.

Arquivo: `src/modules/rh/RHRelatorioPage.jsx`.

---

### 2026-09-04 (5ª parte) — Fix: rodapé do Extrato de Ponto mostrava saldo negativo errado

Raphael reportou que Ana Carolina e Isabelly apareciam com o mês "não
batendo" no Relatório de Ponto — o card "Saldo do mês" no topo do
extrato mostrava um número (ex: 4h17m faltando) e o rodapé da tabela
("Meta do período: ... / saldo") mostrava outro completamente diferente
(ex: -5h43m). Ele suspeitava (corretamente) que a conta de cima
("Saldo do mês") era a certa.

**Causa raiz**: `fmtH()` (`rhHelpers.jsx`) usa `Math.floor()` pra
separar as horas inteiras — funciona bem pra números positivos, mas
`Math.floor()` de um negativo arredonda pra baixo (mais negativo), não
trunca. Em todo `RHRelatorioPage.jsx` isso é contornado corretamente
chamando sempre `fmtH(Math.abs(saldo))` e colocando o sinal (+/-) por
fora manualmente — só o rodapé do extrato impresso/exportado
(`saldoFinal`, linha ~1148) passava o `saldoH` já negativo direto pro
`fmtH()`, sem `Math.abs`. Pra -4h17m (-4.2833), isso dava
`Math.floor(-4.2833) = -5`, sobrando 0.7167h = 43min → "-5h43m", o
número errado que apareceu pro Raphael.

Corrigido pra usar o mesmo padrão do resto do arquivo (`Math.abs` +
sinal manual). Verifiquei a conta isolada em Node reproduzindo o bug
antigo (-5h43m) e confirmando o resultado novo (-4h17m, batendo com o
card do topo) — não consegui tirar screenshot do extrato em si porque
ele abre numa aba via `window.open` + `document.write` (URL
`about:blank`), que a automação de navegador não consegue inspecionar;
mas a causa raiz e a matemática do fix estão confirmadas.

Arquivo: `src/modules/rh/RHRelatorioPage.jsx` (linha ~1150).

---

### 2026-09-04 (4ª parte) — Pedidos: navegação por dia (setas), não lista com todos os dias juntos

O Raphael corrigiu o rumo do ajuste anterior: o que ele queria de volta
não era uma lista com TODOS os dias empilhados com cabeçalho — era o
navegador de dia horizontal mesmo (igual Produção/Expedição): mostra só
UM dia por vez, seta pra voltar/avançar, botão "Hoje". Troquei.

`OrdersPage.jsx` ganhou `viewDate` (mesmo padrão `todayISO`/`addDays` já
usado em `ProductionPage.jsx`) e a barra de navegação (Calendar + label
Hoje/Ontem/data + ‹ Hoje › + date-input + refresh), no mesmo lugar onde
fica em Produção (acima dos KPIs). A lista principal agora mostra só
`dayFiltered` (pedidos do `viewDate`).

Detalhe importante: busca (`search`) e os chips de "precisa de atenção"
(`filterAtt`) **escapam do recorte do dia de propósito** — procurar um
pedido específico ou revisar "Sem SKU"/"Cancelados" cruzando todos os
dias é mais útil do que ficar preso ao dia selecionado. Nesse caso
(`escapeDayView`) a lista volta a mostrar todos os dias agrupados (o
comportamento que eu tinha feito na tentativa anterior, que acabou
sendo reaproveitado só para esse caso), com um aviso discreto "busca/
filtro mostrando todos os dias" ao lado do navegador, que fica com as
setas desabilitadas nesse modo. O filtro de plataforma (aba ML/Shopee/
Manual) continua combinando normalmente com o dia selecionado.

KPIs (Pedidos/Itens/A caminho/Entregues) passaram a refletir sempre o
recorte visível no momento (`visibleOrders` = dia selecionado, ou todos
os dias quando busca/atenção escapam) — antes um mostrava 200 no topo
enquanto a lista só tinha 14 do dia, inconsistente.

Testado ao vivo: Hoje/Ontem navegam certo, contagens batem, busca
escapa e agrupa por dia com o aviso, "Manual + Hoje" (0 itens) mostra o
empty-state "Nada nesse dia" corretamente. Build limpo, sem erros.

Arquivo: `src/modules/orders/OrdersPage.jsx`.

---

### 2026-09-04 (3ª parte) — Ajustes nas abas (Pedidos + Produção) e Pedidos voltou a agrupar por dia

Três ajustes pedidos pelo Raphael depois das entregas anteriores do dia:

1. **Fundo colorido nas abas**: o estilo anterior (sublinhado colorido
   embaixo do texto, `border-b-2 overflow-x-auto`) trocado por um
   segmented control de verdade — cada aba vira uma pílula com
   fundo/borda na cor da plataforma quando ativa (rose=Todas,
   amber=ML em Pedidos / amarelo-azul em Produção — mantendo a cor de
   marca real do ML que já existia lá, laranja=Shopee, slate=Manual/
   Avulso). Mesmo padrão nas duas telas.
2. **Overflow/altura**: o `overflow-x-auto` + margem negativa
   (`-mb-0.5`, truque pro sublinhado colar na borda) causava barra de
   rolagem horizontal e altura inconsistente. Trocado por
   `flex flex-wrap gap-2` sem borda inferior nem overflow — quebra
   linha em vez de rolar, altura sempre igual (mesmo padding em todas
   as pílulas).
3. **Pedidos voltou a agrupar por dia**: o Raphael lembrou que a lista
   principal de Pedidos era organizada por dia (Hoje/Ontem/etc, como já
   é a aba Histórico) — a versão que eu tinha montado nesta sessão
   usava paginação numérica solta (10 por página), sem contexto de dia.
   Troquei a paginação por seções por dia (`groupedByDay`, reaproveitando
   `dayGroupLabel()`), cada uma com cabeçalho "Hoje/Ontem/data · N
   pedidos · N itens" — sem paginação numérica, a lista inteira (até
   200 pedidos mais recentes) renderiza agrupada.

Testado ao vivo nas duas telas: abas com fundo colorido, sem scroll,
altura uniforme; Pedidos mostra "Hoje" e "Ontem" corretamente ao rolar.
Build limpo, sem erros no console.

Arquivos: `src/modules/orders/OrdersPage.jsx` (removida paginação
numérica, `groupedByDay`, novo estilo de abas),
`src/modules/production/ProductionPage.jsx` (novo estilo de abas).

---

### 2026-09-04 (2ª parte) — Produção: mesmo padrão de abas por plataforma

Raphael pediu pra replicar na Esteira (Produção) o mesmo estilo de abas
que acabou de entrar em Pedidos. Antes, as 3 faixas (ML/Shopee/Avulso)
apareciam todas juntas, empilhadas, sem separação de verdade — só um
rótulo colorido no topo de cada uma. Agora tem uma barra de abas de
verdade acima das faixas ("Todas | 🛒 Mercado Livre | 🛍️ Shopee | ✍️
Avulso", com contagem de produtos por aba e sublinhado colorido),
reaproveitando as cores já usadas nesta própria tela (`SOURCE_CONFIG`:
amarelo/azul=ML, laranja=Shopee, slate=Avulso — cores de marca, já
estabelecidas desde a Fase 40, mantive em vez de importar o âmbar de
Pedidos). Clicar numa aba filtra pra mostrar só aquela faixa; "Todas"
volta a empilhar como antes. Empty-state próprio quando a aba
selecionada não tem nada pendente no dia.

A produção já tinha bastante cor de estado por item desde a Fase 40
(`StatusBadge`/`STATUS_CONFIG` — pendente/em produção/embalagem/pronto/
enviado/coberto por estoque), então essa parte não precisou de mudança,
só a separação por aba mesmo.

Testado ao vivo: build limpo, sem erros no console, todas as 3 abas +
"Todas" alternam corretamente, empty-state da aba "Avulso" (0 hoje)
confirmado.

Arquivo: `src/modules/production/ProductionPage.jsx` (novo estado
`platformFilter`, barra de abas, `visibleSources`/`visibleGroups`).

---

### 2026-09-04 — Pedidos: abas por plataforma + estado visual do item no pipeline

Sugestão do Vini (repassada pelo Raphael): separar visualmente Mercado
Livre / Shopee / Manuais na tela de Pedidos (não só filtro misturado), e
colorir cada item do pedido pelo estado real dele (aguardando produção /
em produção / na expedição).

**Parte A — abas de plataforma**: o filtro que já existia (`filterSrc`)
virou uma barra de abas de verdade, acima dos KPIs, reaproveitando as
cores já estabelecidas em `platformStyle()` (âmbar=ML, laranja=Shopee,
slate=Manual) — sublinhado colorido na aba ativa. Risco baixo, é só
apresentação do que já existia.

**Parte B — estado do item**: aqui tem uma limitação real do modelo de
dados que vale registrar. **Não existe (e não dá pra ter de forma
simples) um vínculo 1:1 entre `order_items` e `production_order_items`**
— na importação em lote do XLSX (`useOrders.js`, função de import),
várias unidades do MESMO sku vindas de PEDIDOS DIFERENTES do mesmo lote
viram UMA linha agregada só na esteira (isso é proposital, é assim que a
produção pensa: "preciso fazer X rodinhas hoje", não por pedido). Then,
adicionar uma FK exigiria uma tabela de junção (produção ↔ vários
order_items), complexidade desnecessária pro que foi pedido.

Solução adotada: sinal **por SKU, não por pedido individual**. Nova
função `fetchProductionStatus()` em `useOrders.js` busca
`production_order_items` com status ativo (exclui `arquivado` e
`coberto_estoque`) e monta um mapa sku → "rank" mais avançado
(pendente=1, em_producao=2, embalagem=3, pronto=4, enviado=5). Na tela,
cada item do pedido mostra:
- **"Na expedição"** (azul) se `order_items.picked = true` — sinal 100%
  confiável, já existia.
- **"Em produção"** (âmbar) se o sku tem rank ≥ 2 na esteira ativa —
  ou seja, "esse produto está sendo feito hoje", não necessariamente
  ESSA unidade específica.
- **"Aguardando produção"** (slate) caso contrário (inclui sku sem
  match, ou só `pendente`/`coberto_estoque`).

Testado ao vivo: os 3 estados renderizam certo (confirmado com pedido
real `#4V0KF0YH` que tinha um item em `embalagem` → mostrou "Em
produção"). Full e cancelado não mostram selo (não entram em produção).

Arquivos: `src/modules/orders/hooks/useOrders.js` (nova
`fetchProductionStatus`/`productionStatusBySku`),
`src/modules/orders/OrdersPage.jsx` (`itemPipelineState()`, abas,
`OrderCard` recebe `prodBySku`).

---

### 2026-09-03 — Nova tela: Estoque Full (consulta, investigação ao vivo primeiro)

Raphael pediu pra investigar se a API do ML dava acesso a informação
sobre "Envios Full" (agendamento, datas, produtos). Os docs oficiais do
ML bloqueiam fetch direto (mesmo problema já visto antes), então testei
direto contra a API real usando o token já conectado (extraído do banco
sem nunca aparecer no meu output — só usado dentro de um comando bash,
nunca impresso). Achados confirmados ao vivo:

- **`GET /users/{seller}/items/search?logistic_type=fulfillment`** —
  lista os anúncios que estão no Full (13 hoje).
- Item **sem** variação: o `available_quantity` do próprio anúncio já É
  o estoque real no Full.
- Item **com** variação: cada uma tem um `inventory_id` próprio, e só
  dá pra saber o estoque de cada uma via
  **`GET /inventories/{inventory_id}/stock/fulfillment`** (devolve
  total/disponível/indisponível, com motivo quando indisponível).
- **Não existe** endpoint de agendamento/envio de reposição pro centro
  de distribuição — testei vários caminhos prováveis, todos 404. Isso
  é 100% manual, só pelo painel do vendedor do próprio ML.

**Implementado:** nova tela `/ml/full` — "Estoque Full", mesmo padrão
visual do módulo (`fulfillmentStock()` em `ml-insights/index.ts`, ação
`fulfillment_stock`). Lista ordenada do menor estoque pro maior, cor por
nível (crítico ≤5, atenção ≤15, ok acima disso — limites informais,
fáceis de ajustar depois se quiserem outro corte), aviso fixo no topo
deixando claro que é só consulta (reposição continua manual). Item com
variação expande mostrando o estoque de cada uma. Testado ao vivo com
os 13 produtos reais da conta (258 unidades ao todo, 6 em estado
crítico) — achei e corrigi 2 bugs de pluralização em português
("variaçãoões", "indisponívelis") durante o teste visual antes de
fechar. Sem erro de console. Item novo no menu (`Sidebar.jsx`) e rota
(`App.jsx`), mesmo gate `ml-insights` das outras telas do módulo.

---

### 2026-09-02 (12ª parte) — Fix rápido: fotos não apareciam na Produção

Raphael reportou logo depois da Fase 40. Causa: `products.photo_url`
não é uma URL de verdade, é só o CAMINHO no bucket privado do Storage —
precisa virar URL assinada (`useSignedUrl`) antes de usar num `<img>`,
mesmo padrão já usado no `ThumbPhoto` de `FeiraCombinadaModal.jsx`. Eu
tinha esquecido isso e usado o caminho puro direto no `src` do
`ProductGroupCard`. Corrigido com um `ProductThumb` local (mesmo
padrão), testado ao vivo — fotos reais aparecendo (gaiola, caixa,
escada, etc.), sem erro de console.

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
