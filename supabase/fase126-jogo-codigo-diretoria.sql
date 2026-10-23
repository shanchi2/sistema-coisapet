-- fase126 — Código de login do MinhaCoisaPet gerado pela Diretoria (23/10)
--
-- O Resend (e-mail do código de login) estourou a cota do mês. Enquanto não
-- volta, a Diretoria gera o código de 6 números pelo sistema (tela
-- MinhaCoisaPet) e passa pra pessoa; no jogo, "Já tenho um código". O
-- código entra na mesma tabela do código por e-mail (só o hash, 15 min,
-- 5 tentativas) — o verify_code do game-api não muda.
create or replace function public.game_admin_login_code(p_token text, p_email text) returns text
language plpgsql security definer set search_path to 'public' as $$
declare v_email text := lower(trim(coalesce(p_email, ''))); v_code text;
begin
  if public.meeting_admin_name(p_token) is null then raise exception 'Só a Diretoria gera código de acesso.'; end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then raise exception 'E-mail inválido'; end if;
  v_code := lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');
  insert into game_login_codes (email, code_hash, expires_at, ip)
  values (v_email, encode(extensions.digest(v_email || ':' || v_code, 'sha256'), 'hex'), now() + interval '15 minutes', 'diretoria');
  return v_code;
end $$;
revoke all on function public.game_admin_login_code(text, text) from public;
grant execute on function public.game_admin_login_code(text, text) to anon, authenticated;
