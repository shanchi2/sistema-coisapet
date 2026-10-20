-- fase116 (20/10): cache dos blocos pesados da TV da Produção (mural de
-- elogios, estoque nos marketplaces, pós-venda). Só a Edge Function
-- `tv-feed` (service role) lê/grava — RLS ligado e sem policy.
create table if not exists public.tv_cache (key text primary key, data jsonb not null, updated_at timestamptz not null default now());
alter table public.tv_cache enable row level security;
