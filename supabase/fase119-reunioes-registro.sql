-- fase119 (21/10): registro pós-reunião (one-a-one) — SÓ diretoria.
-- Tabela sem acesso direto pela API (RLS ligado, sem policy, revoke total);
-- leitura/gravação só pelas funções abaixo, que conferem no banco se o token
-- da sessão (fase106) é de um usuário admin. O funcionário continua vendo só
-- título/data/pauta em `meetings` pelo app /equipe.
create table if not exists public.meeting_records (
  meeting_id uuid primary key references public.meetings(id) on delete cascade,
  summary text, positives text, improvements text,
  agreements jsonb not null default '[]'::jsonb,   -- [{id,text,owner,due,done}]
  private_notes text, mood text, next_meeting date,
  created_by text, created_at timestamptz not null default now(),
  updated_by text, updated_at timestamptz not null default now()
);
alter table public.meeting_records enable row level security;
revoke all on public.meeting_records from anon, authenticated;

create or replace function public.meeting_admin_name(p_token text) returns text
language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_name text; v_role text;
begin
  v_id := public.session_user_id(p_token);
  if v_id is null then return null; end if;
  select name, role into v_name, v_role from public.system_users where id = v_id;
  if v_role <> 'admin' then return null; end if;
  return v_name;
end $$;
revoke all on function public.meeting_admin_name(text) from public, anon, authenticated;

create or replace function public.meeting_records_list(p_token text) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
begin
  if public.meeting_admin_name(p_token) is null then raise exception 'Só a Diretoria vê os registros das reuniões (saia e entre de novo se for diretor).'; end if;
  return coalesce((select jsonb_agg(to_jsonb(r)) from public.meeting_records r), '[]'::jsonb);
end $$;

create or replace function public.meeting_record_save(p_token text, p_meeting_id uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare v_name text; v_row public.meeting_records;
begin
  v_name := public.meeting_admin_name(p_token);
  if v_name is null then raise exception 'Só a Diretoria registra reuniões (saia e entre de novo se for diretor).'; end if;
  insert into public.meeting_records as r (meeting_id, summary, positives, improvements, agreements, private_notes, mood, next_meeting, created_by, updated_by)
  values (p_meeting_id, nullif(p_data->>'summary',''), nullif(p_data->>'positives',''), nullif(p_data->>'improvements',''),
          coalesce(p_data->'agreements','[]'::jsonb), nullif(p_data->>'private_notes',''), nullif(p_data->>'mood',''),
          nullif(p_data->>'next_meeting','')::date, v_name, v_name)
  on conflict (meeting_id) do update set
    summary = excluded.summary, positives = excluded.positives, improvements = excluded.improvements,
    agreements = excluded.agreements, private_notes = excluded.private_notes, mood = excluded.mood,
    next_meeting = excluded.next_meeting, updated_by = v_name, updated_at = now()
  returning * into v_row;
  return to_jsonb(v_row);
end $$;

grant execute on function public.meeting_records_list(text) to anon, authenticated;
grant execute on function public.meeting_record_save(text, uuid, jsonb) to anon, authenticated;
