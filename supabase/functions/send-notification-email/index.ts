import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_KEY  = Deno.env.get('RESEND_KEY')!
const FROM_EMAIL  = 'noreply@coisapet.com.br'
const FROM_NAME   = 'CoisaPet Sistema'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const TYPE_LABELS: Record<string, string> = {
  task_assigned: '📋 Tarefa atribuída a você',
  task_created:  '🆕 Nova tarefa criada',
  task_moved:    '🔄 Tarefa atualizada',
  task_comment:  '💬 Novo comentário',
  employee_message: '💬 Nova mensagem do app',
  purchase_request: '🛍️ Compra da Lousa',
  batch_deleted: '🗑️ Pedidos Apagados',
}

const TYPE_COLORS: Record<string, string> = {
  task_assigned: '#8b5cf6',
  task_created:  '#3b82f6',
  task_moved:    '#f59e0b',
  task_comment:  '#22c55e',
  employee_message: '#f43f5e',
  purchase_request: '#f59e0b',
  batch_deleted: '#e11d48',
}

function buildEmailHtml(notification: any, userName: string): string {
  const label   = TYPE_LABELS[notification.type]  || 'Notificação'
  const color   = TYPE_COLORS[notification.type]  || '#6366f1'
  const code    = notification.task_code ? `<span style="font-family:monospace;background:#f1f5f9;padding:2px 8px;border-radius:6px;font-size:13px;color:#64748b">#${notification.task_code}</span>` : ''
  const body    = notification.body ? `<p style="color:#5C4A3A;font-size:14px;line-height:1.6;margin:8px 0 0">${notification.body}</p>` : ''
  const SITE_URL = 'https://coisapet.com.br/sistema'
  const ctaUrl  = notification.link ? `${SITE_URL}${notification.link}` : null
  const cta     = ctaUrl ? `
        <tr>
          <td style="padding:0 36px 28px">
            <a href="${ctaUrl}" style="display:inline-block;background:#3D1F0D;color:#fff;font-size:13px;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:12px">
              Ver tarefa →
            </a>
          </td>
        </tr>` : ''

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#fdf8f3;font-family:'Nunito',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fdf8f3;padding:40px 20px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">

        <!-- Header -->
        <tr>
          <td style="background:#3D1F0D;padding:28px 36px;text-align:center">
            <p style="margin:0;color:#C4956A;font-size:22px;font-weight:800;letter-spacing:-0.5px">🐾 CoisaPet</p>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.6);font-size:12px">Sistema de Gestão</p>
          </td>
        </tr>

        <!-- Badge tipo -->
        <tr>
          <td style="padding:28px 36px 0">
            <span style="display:inline-block;background:${color}18;color:${color};font-size:12px;font-weight:700;padding:5px 14px;border-radius:100px;border:1px solid ${color}30">
              ${label}
            </span>
          </td>
        </tr>

        <!-- Conteúdo -->
        <tr>
          <td style="padding:16px 36px 28px">
            <p style="margin:0;color:#3D1F0D;font-size:16px;font-weight:700;line-height:1.4">
              ${notification.title} ${code}
            </p>
            ${body}
          </td>
        </tr>
        ${cta}

        <!-- Divider -->
        <tr><td style="padding:0 36px"><hr style="border:none;border-top:1px solid #f0e8df;margin:0"/></td></tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 36px;text-align:center">
            <p style="margin:0;color:#8B7355;font-size:12px">
              Olá <strong>${userName}</strong>, você recebeu esta notificação porque é membro desta tarefa.
            </p>
            <p style="margin:8px 0 0;color:#C4956A;font-size:11px">
              CoisaPet® · Sistema interno
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const payload = await req.json()
    // Payload vem do database webhook: { type, table, record }
    const notification = payload.record

    if (!notification?.id) {
      return new Response('No notification record', { status: 400 })
    }

    // Busca email e nome do usuário
    const db = createClient(SUPABASE_URL, SUPABASE_KEY)
    const { data: user, error: userErr } = await db
      .from('system_users')
      .select('name, email, notification_email, email_notifications')
      .eq('id', notification.user_id)
      .single()

    // 🔍 DIAGNÓSTICO — remove essa linha depois de confirmar que está tudo certo
    console.log('[DEBUG v2] user_id:', notification.user_id, '| email:', user?.email, '| notification_email:', user?.notification_email, '| userErr:', userErr)

    // Usuário optou por não receber notificação por e-mail (fase77, 26/09) —
    // o alerta no sino já foi criado (é o insert que disparou isto), só não envia.
    if (user && user.email_notifications === false) {
      return new Response(JSON.stringify({ ok: true, skipped: 'email_notifications desligado' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const recipientEmail = user?.notification_email || user?.email

    if (userErr || !recipientEmail) {
      console.error('Usuário não encontrado:', userErr)
      return new Response('User not found', { status: 404 })
    }

    // Monta e envia o email via Resend
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:    `${FROM_NAME} <${FROM_EMAIL}>`,
        to:      [recipientEmail],
        subject: `${TYPE_LABELS[notification.type] || 'Notificação'}: ${notification.title}`,
        html:    buildEmailHtml(notification, user.name),
      }),
    })

    const emailData = await emailRes.json()

    if (!emailRes.ok) {
      console.error('Resend error:', emailData)
      return new Response(JSON.stringify({ error: emailData }), { status: 500 })
    }

    console.log('Email enviado:', emailData.id, '→', recipientEmail)
    return new Response(JSON.stringify({ ok: true, emailId: emailData.id }), {
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('Erro na Edge Function:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})