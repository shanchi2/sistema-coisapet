-- Fase 77 (26/09) — usuário pode optar por NÃO receber as notificações
-- por e-mail (continua recebendo o alerta no sino do sistema). Quem
-- decide é a edge function send-notification-email, que pula o envio
-- quando email_notifications = false.
alter table system_users add column if not exists email_notifications boolean not null default true;
