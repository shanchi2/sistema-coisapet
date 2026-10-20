-- fase118 (20/10): TV da Produção com lista própria pro turno da noite
-- (João Vitor e Diovani, depois das 19h). O tv-feed escolhe `modules_night`
-- entre night_start e night_end (horário de Brasília). Começa igual à do dia.
alter table public.tv_settings add column if not exists modules_night jsonb;
alter table public.tv_settings add column if not exists night_start text not null default '19:00';
alter table public.tv_settings add column if not exists night_end text not null default '06:00';
update public.tv_settings set modules_night = modules where modules_night is null;
