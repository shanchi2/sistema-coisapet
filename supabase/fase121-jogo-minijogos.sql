-- MinhaCoisaPet 0.6 (22/10): fliperama com 5 minijogos (Corrida, Chuva de
-- Sementes, Labirinto de Túneis, Rodinha Turbo, Memória CoisaPet).
-- Recordes por jogo (pro jogador e pro ranking da semana). Mesmo isolamento:
-- só a game-api (service role) chama.
create or replace function public.game_player_bests(p_id uuid, p_day date)
returns table (game text, best int, today_best int, today_count int)
language sql stable security definer set search_path to 'public' as $$
  select s.game, max(s.score)::int,
         coalesce(max(s.score) filter (where s.day = p_day), 0)::int,
         (count(*) filter (where s.day = p_day))::int
  from game_scores s where s.player_id = p_id group by s.game
$$;
revoke all on function public.game_player_bests(uuid, date) from public, anon, authenticated;

create or replace function public.game_week_best(p_start date, p_game text)
returns table (player_id uuid, best int)
language sql stable security definer set search_path to 'public' as $$
  select s.player_id, max(s.score)::int from game_scores s
  join game_players p on p.id = s.player_id and p.whatsapp is not null
  where s.game = p_game and s.day >= p_start and s.day < p_start + 7
  group by s.player_id order by 2 desc limit 30
$$;
revoke all on function public.game_week_best(date, text) from public, anon, authenticated;
