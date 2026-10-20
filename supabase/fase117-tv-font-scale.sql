-- fase117 (20/10): tamanho do texto por TV (TV de 32" do barracão pediu
-- ~20% maior). A TV lê pelo tv-feed (settings.font_scale) e multiplica a
-- escala base (16px numa tela de 1920). Muda em até 1 minuto.
alter table public.tv_screens add column if not exists font_scale integer not null default 100 check (font_scale between 70 and 160);
update public.tv_screens set font_scale = 120 where revoked_at is null;
