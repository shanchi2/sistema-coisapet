-- fase122 (22/10): notificações do sistema SÓ no sino — sem e-mail.
-- O gatilho mandava 1 e-mail (Resend) por notificação, inclusive cada pedido
-- sincronizado do ML/Shopee pra ~6 pessoas: +8 mil e-mails em outubro, cota
-- mensal do plano grátis (3 mil) estourada → travou também o código de login
-- do jogo MinhaCoisaPet. Decisão do Raphael: nenhuma notificação por e-mail.
-- A edge function send-notification-email também virou "não envia nada".
-- Obs.: o gatilho guarda a chave service_role na definição; o ideal é
-- apagá-lo de vez (drop trigger) pelo painel do Supabase.
alter table public.notifications disable trigger on_notification_insert;
