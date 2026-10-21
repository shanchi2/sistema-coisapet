-- MinhaCoisaPet 0.5 (21/10): login OBRIGATÓRIO (e-mail + WhatsApp) e tudo o
-- que dá propósito ao jogo — nível de tutor (XP), ofensiva de dias, missões do
-- dia, pergunta do dia, conquistas, minijogos com recorde, ranking semanal com
-- ligas, metas com prêmio (por mérito, sem sorteio — Lei 5.768/71), álbum,
-- amigos/visitas e concurso mensal de terrário.
-- Mesmo isolamento da fase110: RLS ligado, sem policy, REVOKE de anon/
-- authenticated. Só a Edge Function `game-api` (service role) mexe aqui; a
-- Diretoria vê jogadores/prêmios pelo sistema via funções com p_token.

-- ── Jogador: cadastro + progresso ────────────────────────────────────
alter table public.game_players
  add column if not exists tutor_name    text,
  add column if not exists whatsapp      text unique,          -- só dígitos, com DDI 55
  add column if not exists marketing_ok  boolean not null default false, -- aceitou novidades no WhatsApp
  add column if not exists marketing_at  timestamptz,
  add column if not exists terms_at      timestamptz,          -- aceitou os termos/privacidade
  add column if not exists friend_code   text unique,          -- código pra adicionar amigo
  add column if not exists xp            int not null default 0,
  add column if not exists streak        int not null default 0,
  add column if not exists best_streak   int not null default 0,
  add column if not exists last_day      date,                 -- último dia (SP) que cuidou do pet
  add column if not exists achievements  jsonb not null default '{}'::jsonb, -- {key: iso_date}
  add column if not exists quiz_right    int not null default 0,
  add column if not exists quiz_total    int not null default 0,
  add column if not exists pet_name      text,                 -- cópia pública (ranking/perfil)
  add column if not exists pet_species   text,
  add column if not exists pet_public    jsonb;                -- vitrine: ambiente montado, status

-- Cada XP ganho (idempotente: a mesma fonte/ref só conta 1x por dia)
create table if not exists public.game_xp (
  id         bigserial primary key,
  player_id  uuid not null references public.game_players(id) on delete cascade,
  day        date not null,
  source     text not null,   -- checkin | mission | quiz | run | achievement | visit | contest
  ref        text not null default '',
  xp         int not null,
  created_at timestamptz not null default now(),
  unique (player_id, day, source, ref)
);
create index if not exists game_xp_day_idx on public.game_xp (day, player_id);

-- Partidas dos minijogos
create table if not exists public.game_scores (
  id         bigserial primary key,
  player_id  uuid not null references public.game_players(id) on delete cascade,
  game       text not null,   -- corrida | …
  score      int not null,
  ms         int not null,
  day        date not null,
  created_at timestamptz not null default now()
);
create index if not exists game_scores_idx on public.game_scores (game, day, player_id);

-- Pergunta do dia (o gabarito nunca sai do servidor antes da resposta)
create table if not exists public.game_quiz (
  id       serial primary key,
  question text not null,
  options  jsonb not null,   -- ["a","b","c"]
  answer   int not null,     -- índice certo
  explain  text not null,
  active   boolean not null default true
);
create table if not exists public.game_quiz_answers (
  player_id uuid not null references public.game_players(id) on delete cascade,
  day       date not null,
  quiz_id   int not null,
  choice    int not null,
  correct   boolean not null,
  primary key (player_id, day)
);

-- Metas com prêmio: a Diretoria liga/desliga e escreve o prêmio no sistema
create table if not exists public.game_reward_goals (
  key     text primary key,
  label   text not null,
  descr   text not null,
  reward  text not null,
  active  boolean not null default false,
  sort    int not null default 0
);
create table if not exists public.game_rewards (
  id         bigserial primary key,
  player_id  uuid not null references public.game_players(id) on delete cascade,
  goal_key   text not null references public.game_reward_goals(key),
  code       text not null unique,
  reward     text not null,      -- texto do prêmio no momento em que ganhou
  created_at timestamptz not null default now(),
  used_at    timestamptz,
  used_by    text,
  unique (player_id, goal_key)
);

-- Amigos e visitas (carinho na visita: 1x por dia por amigo)
create table if not exists public.game_friends (
  player_id  uuid not null references public.game_players(id) on delete cascade,
  friend_id  uuid not null references public.game_players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (player_id, friend_id)
);
create table if not exists public.game_visits (
  visitor_id uuid not null references public.game_players(id) on delete cascade,
  host_id    uuid not null references public.game_players(id) on delete cascade,
  day        date not null,
  primary key (visitor_id, host_id, day)
);

-- Concurso mensal de terrário (vota em quantos quiser, 1 voto por terrário, não vale o seu)
create table if not exists public.game_contest_entries (
  id         bigserial primary key,
  month      text not null,   -- 2026-10
  player_id  uuid not null references public.game_players(id) on delete cascade,
  snapshot   jsonb not null,  -- { name, species, setup, comfort }
  votes      int not null default 0,
  created_at timestamptz not null default now(),
  unique (month, player_id)
);
create table if not exists public.game_contest_votes (
  entry_id  bigint not null references public.game_contest_entries(id) on delete cascade,
  voter_id  uuid not null references public.game_players(id) on delete cascade,
  primary key (entry_id, voter_id)
);

-- Códigos de compra (cartãozinho na embalagem): cada um vale 1 vez
create table if not exists public.game_codes (
  code       text primary key,
  items      text[] not null,
  note       text,
  created_at timestamptz not null default now(),
  used_by    uuid references public.game_players(id) on delete set null,
  used_at    timestamptz
);

do $$ declare t text; begin
  foreach t in array array['game_xp','game_scores','game_quiz','game_quiz_answers','game_reward_goals','game_rewards',
                           'game_friends','game_visits','game_contest_entries','game_contest_votes','game_codes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
revoke all on sequence public.game_xp_id_seq, public.game_scores_id_seq, public.game_quiz_id_seq,
  public.game_rewards_id_seq, public.game_contest_entries_id_seq from anon, authenticated;

-- Placar da semana: XP desta semana e da anterior (a liga vem da anterior)
create or replace function public.game_week_board(p_start date)
returns table (player_id uuid, xp_week int, xp_last int, best_run int)
language sql stable security definer set search_path to 'public' as $$
  select p.id,
         coalesce((select sum(x.xp) from game_xp x where x.player_id = p.id and x.day >= p_start and x.day < p_start + 7), 0)::int,
         coalesce((select sum(x.xp) from game_xp x where x.player_id = p.id and x.day >= p_start - 7 and x.day < p_start), 0)::int,
         coalesce((select max(s.score) from game_scores s where s.player_id = p.id and s.game = 'corrida' and s.day >= p_start and s.day < p_start + 7), 0)::int
  from game_players p
  where p.whatsapp is not null
$$;
revoke all on function public.game_week_board(date) from public, anon, authenticated;

-- ── Diretoria (sistema): jogadores/mailing e prêmios ─────────────────
create or replace function public.game_admin_overview(p_token text) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
begin
  if public.meeting_admin_name(p_token) is null then raise exception 'Só a Diretoria vê os jogadores do MinhaCoisaPet.'; end if;
  return jsonb_build_object(
    'players', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'email', email, 'tutor_name', tutor_name, 'whatsapp', whatsapp, 'marketing_ok', marketing_ok,
        'created_at', created_at, 'last_seen_at', last_seen_at, 'xp', xp, 'streak', streak, 'best_streak', best_streak,
        'pet_name', pet_name, 'pet_species', pet_species) order by created_at desc) from game_players), '[]'::jsonb),
    'goals', coalesce((select jsonb_agg(to_jsonb(g) order by sort) from game_reward_goals g), '[]'::jsonb),
    'rewards', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'code', r.code, 'reward', r.reward, 'goal_key', r.goal_key,
        'created_at', r.created_at, 'used_at', r.used_at, 'used_by', r.used_by, 'tutor_name', p.tutor_name, 'email', p.email,
        'whatsapp', p.whatsapp, 'pet_name', p.pet_name) order by r.created_at desc)
        from game_rewards r join game_players p on p.id = r.player_id), '[]'::jsonb),
    'codes', coalesce((select jsonb_agg(jsonb_build_object('code', c.code, 'items', c.items, 'note', c.note, 'created_at', c.created_at,
        'used_at', c.used_at, 'used_by', p.email) order by c.created_at desc)
        from (select * from game_codes order by created_at desc limit 300) c left join game_players p on p.id = c.used_by), '[]'::jsonb)
  );
end $$;

create or replace function public.game_admin_goal_save(p_token text, p_key text, p_reward text, p_active boolean) returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  if public.meeting_admin_name(p_token) is null then raise exception 'Só a Diretoria edita os prêmios.'; end if;
  update game_reward_goals set reward = coalesce(nullif(trim(p_reward), ''), reward), active = p_active where key = p_key;
end $$;

create or replace function public.game_admin_reward_use(p_token text, p_id bigint, p_used boolean) returns void
language plpgsql security definer set search_path to 'public' as $$
declare v_name text;
begin
  v_name := public.meeting_admin_name(p_token);
  if v_name is null then raise exception 'Só a Diretoria marca prêmios.'; end if;
  update game_rewards set used_at = case when p_used then now() end, used_by = case when p_used then v_name end where id = p_id;
end $$;

-- Gera N códigos de compra (8 caracteres sem letras confusas) pros itens dados
create or replace function public.game_admin_codes_create(p_token text, p_items text[], p_qty int, p_note text) returns text[]
language plpgsql security definer set search_path to 'public' as $$
declare v_out text[] := '{}'; v_code text; v_chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; i int; j int;
begin
  if public.meeting_admin_name(p_token) is null then raise exception 'Só a Diretoria gera códigos.'; end if;
  if p_qty < 1 or p_qty > 500 then raise exception 'Quantidade entre 1 e 500'; end if;
  if coalesce(array_length(p_items, 1), 0) = 0 then raise exception 'Escolha ao menos um item'; end if;
  for i in 1..p_qty loop
    loop
      v_code := 'CP-';
      for j in 1..8 loop
        v_code := v_code || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
        if j = 4 then v_code := v_code || '-'; end if;
      end loop;
      exit when not exists (select 1 from game_codes where code = v_code);
    end loop;
    insert into game_codes (code, items, note) values (v_code, p_items, nullif(trim(p_note), ''));
    v_out := v_out || v_code;
  end loop;
  return v_out;
end $$;

grant execute on function public.game_admin_overview(text) to anon, authenticated;
grant execute on function public.game_admin_goal_save(text, text, text, boolean) to anon, authenticated;
grant execute on function public.game_admin_reward_use(text, bigint, boolean) to anon, authenticated;
grant execute on function public.game_admin_codes_create(text, text[], int, text) to anon, authenticated;

-- ── Metas (começam DESLIGADAS: a Diretoria define o prêmio e liga) ────
insert into public.game_reward_goals (key, label, descr, reward, sort) values
  ('ofensiva_7',  'Uma semana de cuidado', 'Cuide do seu pet 7 dias seguidos.',             'Defina o prêmio no sistema', 1),
  ('ofensiva_30', 'Tutor de verdade',      'Cuide do seu pet 30 dias seguidos.',            'Defina o prêmio no sistema', 2),
  ('nivel_10',    'Tutor nível 10',        'Chegue ao nível 10 de tutor.',                  'Defina o prêmio no sistema', 3),
  ('sabichao_20', 'Sabichão',              'Acerte 20 perguntas do dia.',                   'Defina o prêmio no sistema', 4),
  ('liga_diamante','Liga Diamante',        'Termine uma semana na Liga Diamante.',          'Defina o prêmio no sistema', 5)
on conflict (key) do nothing;

-- ── Perguntas do dia (cuidados reais com hamster) ────────────────────
insert into public.game_quiz (question, options, answer, explain)
select q, o::jsonb, a, e from (values
  ('Hamster sírio pode morar junto com outro hamster?', '["Sim, ele adora companhia","Não, ele é solitário e pode brigar feio","Só se forem irmãos"]', 1, 'O hamster sírio é solitário: adulto, ele defende o território e brigas entre dois podem machucar muito. Mesmo irmãos se separam quando crescem.'),
  ('Qual é a temperatura mais confortável pro hamster?', '["Entre 10 °C e 15 °C","Entre 20 °C e 24 °C","Entre 28 °C e 32 °C"]', 1, 'Entre 20 °C e 24 °C ele fica confortável. Acima de 28 °C o calor já é perigoso, e frio demais pode fazer ele hibernar, o que é arriscado.'),
  ('Como o hamster toma banho?', '["Com água morna e xampu","Rolando na areia própria","Ele não precisa se limpar"]', 1, 'Hamster não toma banho de água: molhado, ele perde a proteção do pelo e pode adoecer. Ele se limpa sozinho e rolando numa areia fininha própria.'),
  ('Qual areia serve pro banho de areia?', '["Areia de gato","Areia de praia","Areia fininha própria, sem pó (ex.: quartzo)"]', 2, 'Areia de gato tem perfume e grãos que machucam, e areia de praia pode ter sujeira. Use areia fininha própria pra roedores, sem pó.'),
  ('Qual o tamanho mínimo de roda pra um hamster sírio?', '["15 cm","20 cm","25 cm ou mais"]', 2, 'Com 25 cm ou mais ele corre com as costas retas. Roda pequena faz ele correr curvado e pode causar problema na coluna.'),
  ('Quando o hamster fica mais ativo?', '["De manhã","À noite","Na hora do almoço"]', 1, 'Hamster é noturno: dorme de dia e brinca de noite. Por isso não é legal acordar ele durante o dia.'),
  ('Qual a profundidade de substrato ideal?', '["Uns 2 cm","Uns 5 cm","Uns 15 a 20 cm"]', 2, 'Na natureza ele vive em tocas embaixo da terra. Com 15 a 20 cm de substrato ele consegue cavar túneis de verdade.'),
  ('Qual desses alimentos é PERIGOSO pro hamster?', '["Cenoura","Chocolate","Brócolis"]', 1, 'Chocolate é tóxico pra hamster. Cenoura e brócolis podem, em pedacinhos e de vez em quando.'),
  ('Os dentes do hamster…', '["Param de crescer quando ele vira adulto","Crescem a vida toda","Caem e nascem de novo"]', 1, 'Os dentes da frente crescem a vida inteira. Por isso ele precisa de madeira e coisas seguras pra roer e gastar os dentes.'),
  ('Qual fruta é melhor evitar?', '["Maçã sem sementes","Laranja","Pera sem sementes"]', 1, 'Frutas cítricas como laranja e limão são ácidas demais pro hamster. Maçã e pera, sem sementes e em pedacinho, podem de vez em quando.'),
  ('De quanto em quanto tempo trocar a água?', '["Todo dia","Uma vez por semana","Só quando acabar"]', 0, 'Água parada estraga e junta bactéria. Troque todo dia, mesmo que ainda tenha no bebedouro.'),
  ('Quanto tempo vive um hamster, em média?', '["6 meses","2 a 3 anos","10 anos"]', 1, 'Um hamster vive, em média, de 2 a 3 anos. Com bons cuidados ele aproveita bem cada dia!'),
  ('Pra que servem as bochechas do hamster?', '["Pra guardar e carregar comida","Pra respirar melhor","Pra assustar outros bichos"]', 0, 'As bochechas são bolsinhas: ele enche de comida e leva pro esconderijo, onde guarda a despensa dele.'),
  ('Quantas sementes de girassol por dia?', '["À vontade","Umas 1 ou 2","Só no aniversário dele"]', 1, 'Semente de girassol é gostosa mas gordurosa. 1 ou 2 por dia, como petisco, é o suficiente.'),
  ('Cebola e alho são…', '["Ótimos pra saúde dele","Tóxicos pro hamster","Bons só cozidos"]', 1, 'Cebola, alho e alho-poró fazem mal pro hamster, crus ou cozidos. Nunca ofereça.'),
  ('Por que o hamster precisa de esconderijo?', '["Pra guardar os brinquedos","Porque na natureza ele é presa e precisa se sentir seguro","Ele não precisa"]', 1, 'Na natureza muitos bichos caçam o hamster. Sem toca ele vive assustado; com ela, dorme tranquilo.'),
  ('Como limpar o terrário do jeito certo?', '["Trocar tudo todo dia","Tirar a sujeira todo dia e trocar tudo só de vez em quando","Nunca limpar"]', 1, 'Tire a sujeira e a comida velha todo dia, mas troque o substrato inteiro só de vez em quando: o cheiro do ninho dá segurança pra ele.'),
  ('Qual o jeito certo de pegar o hamster?', '["Pegar por cima, de surpresa","Com as mãos em concha, por baixo, com calma","Pelo pelo das costas"]', 1, 'Mão vindo de cima parece um pássaro caçador! Deixe ele cheirar sua mão e pegue por baixo, em concha, sempre pertinho do chão.'),
  ('Que ninho é seguro?', '["Algodão sintético fofinho","Papel sem tinta picado","Pedaços de pano com fiapo"]', 1, 'Algodão sintético e fiapos enrolam nas patinhas e fazem mal se engolidos. Papel sem tinta picado é seguro e ele adora.'),
  ('Onde deixar o terrário em casa?', '["Perto da janela, no sol","Longe de sol direto, vento e ar-condicionado","Na cozinha, perto do fogão"]', 1, 'Mudanças de temperatura fazem mal. Um cantinho calmo, sem sol direto e sem correntes de vento, é o ideal.'),
  ('Que tipo de roda é a mais segura?', '["Roda de grade com espaços","Roda de superfície lisa","Roda pequena de plástico"]', 1, 'Na roda de grade a patinha pode prender e machucar. Superfície lisa e tamanho certo são o ideal.'),
  ('O hamster enxerga bem?', '["Muito bem, como uma águia","Enxerga pouco, e usa muito o olfato","Enxerga só à noite, perfeitamente"]', 1, 'Hamster enxerga pouco e reconhece as coisas (e você!) muito pelo cheiro. Por isso é bom deixar ele cheirar sua mão.'),
  ('O hamster às vezes come o próprio cocô. Isso é…', '["Sinal de doença","Normal: ele aproveita nutrientes","Falta de comida"]', 1, 'Parece estranho, mas é normal! Ele aproveita vitaminas que ficaram de fora na primeira digestão.'),
  ('A bolinha de passear (hamster ball) é…', '["A melhor forma de exercício","Pouco recomendada: estressa e esquenta","Obrigatória"]', 1, 'Dentro da bolinha ele enxerga pouco, esquenta e pode bater nas coisas. Uma roda boa e um terrário amplo são melhores.'),
  ('Qual a melhor “casa” pro hamster?', '["Gaiola pequena de grade","Terrário amplo com bastante chão","Aquário pequeno sem tampa"]', 1, 'Espaço de chão é o mais importante: terrário amplo, com substrato fundo, evita que ele roa grade e fique estressado.'),
  ('O que fazer se o hamster estiver dormindo de dia?', '["Acordar pra brincar","Deixar ele dormir","Balançar o terrário"]', 1, 'Dormir de dia é o normal dele. Acordar o hamster estressa e pode até fazer ele morder. Brinque à noite!')
) v(q, o, a, e)
where not exists (select 1 from public.game_quiz);

-- Partida enviada uma vez só + XP total sempre = soma do extrato (sem corrida entre pedidos)
alter table public.game_scores add column if not exists run_ref text unique;
create or replace function public.game_xp_sync(p_id uuid) returns int
language sql security definer set search_path to 'public' as $$
  update game_players set xp = (select coalesce(sum(xp), 0) from game_xp where player_id = p_id) where id = p_id returning xp
$$;
revoke all on function public.game_xp_sync(uuid) from public, anon, authenticated;
