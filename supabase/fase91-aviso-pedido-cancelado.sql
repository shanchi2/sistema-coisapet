-- Fase 91 (01/10/2026) — Aviso de PEDIDO CANCELADO (com som próprio na tela)
-- Pedido do Raphael: cancelamento com barulho diferente (som triste /
-- cornetada curta). Antes não existia aviso nenhum quando um pedido que já
-- tinha entrado era cancelado depois — o status só mudava em silêncio.
--
-- Trigger no banco (pega TODO caminho: webhook ML/Shopee, botão Atualizar,
-- planilha): quando status_ml passa de não-cancelado → cancelado, cria 1
-- notificação 'order_cancelled' pra cada admin/produção ativo (mesmo
-- público do pop-up de venda). Pedido Full e pedido velho (> 45 dias,
-- ex: reimportação de histórico) não avisam.
create or replace function public.notify_order_cancelled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_items  text;
  v_picked boolean;
  v_plat   text;
  v_line1  text;
  v_line2  text;
begin
  if not (coalesce(new.status_ml, '') ilike '%cancelad%')
     or coalesce(old.status_ml, '') ilike '%cancelad%'
     or coalesce(new.is_full, false)
     or coalesce(new.archived, false)
     or coalesce(new.data_venda, now()) < now() - interval '45 days' then
    return new;
  end if;

  select string_agg(oi.qty || '× ' || left(oi.titulo, 40), ', '), bool_or(coalesce(oi.picked, false))
    into v_items, v_picked
    from order_items oi where oi.order_id = new.id;

  v_plat  := case new.source when 'ml' then 'ML' when 'shopee' then 'Shopee' else 'Manual' end;
  v_line1 := coalesce(split_part(new.comprador, ' / ', 1), 'Comprador') || ' · #' || coalesce(new.num_venda, '?');
  v_line2 := case
    when v_picked then '⚠️ Já tinha item separado — tirar da expedição'
    when new.ship_date is not null then '🚫 Era pro dia ' || to_char(new.ship_date, 'DD/MM') || ' — não sai mais'
    else '🚫 Não sai mais'
  end;

  insert into notifications (user_id, type, title, body, link)
  select u.id, 'order_cancelled', '🚫 Pedido cancelado — ' || v_plat,
         v_line1 || E'\n' || v_line2 || coalesce(E'\n' || v_items, ''), '/pedidos'
    from system_users u
   where u.active and u.role in ('admin', 'producao');

  return new;
end;
$$;

drop trigger if exists trg_notify_order_cancelled on orders;
create trigger trg_notify_order_cancelled
  after update of status_ml on orders
  for each row execute function public.notify_order_cancelled();
