-- fase115 (20/10): "Estoque nos Marketplaces" ganha módulo próprio no
-- Controle de Acesso (antes usava o módulo `producao`). Começa com as mesmas
-- permissões que `producao` tinha, pra ninguém perder/ganhar acesso.
insert into role_permissions (module, role, enabled)
select 'estoque-marketplaces', role, enabled from role_permissions where module = 'producao'
on conflict do nothing;
