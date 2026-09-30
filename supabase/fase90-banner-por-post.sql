-- Fase 90 (01/10/2026) — Banner do blog escolhido POST A POST
-- Antes: 1 configuração global, produto sorteado das categorias e cupom
-- sempre no texto. Agora cada post decide:
--   banner_mode:        'padrao' (sorteio geral, como antes) · 'escolhidos'
--                       (produtos ticados no post) · 'nenhum' (sem banner)
--   banner_product_ids: produtos ticados (modo 'escolhidos')
--   banner_species:     tipo(s) de bicho do post — só filtra a lista de
--                       produtos no editor (ex: porquinho-da-índia)
--   banner_coupon:      'padrao' (segue o global) · 'sim' · 'nao' (só banner)
-- E o global ganha show_coupon (divulgar cupom ou só banner).
alter table blog_posts add column if not exists banner_mode text not null default 'padrao';
alter table blog_posts add column if not exists banner_product_ids uuid[] not null default '{}';
alter table blog_posts add column if not exists banner_species text[] not null default '{}';
alter table blog_posts add column if not exists banner_coupon text not null default 'padrao';
alter table blog_posts drop constraint if exists blog_posts_banner_mode_check;
alter table blog_posts add constraint blog_posts_banner_mode_check check (banner_mode in ('padrao','escolhidos','nenhum'));
alter table blog_posts drop constraint if exists blog_posts_banner_coupon_check;
alter table blog_posts add constraint blog_posts_banner_coupon_check check (banner_coupon in ('padrao','sim','nao'));

alter table blog_banner_settings add column if not exists show_coupon boolean not null default true;
