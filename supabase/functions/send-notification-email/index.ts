import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_KEY  = Deno.env.get('RESEND_KEY')!
const FROM_EMAIL  = 'noreply@coisapet.com.br'
const FROM_NAME   = 'CoisaPet Sistema'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const TYPE_LABELS: Record<string, string> = {
  task_assigned: 'ðŸ“‹ Tarefa atribuÃ­da a vocÃª',
  task_created:  'ðŸ†• Nova tarefa criada',
  task_moved:    'ðŸ”„ Tarefa atualizada',
  task_comment:  'ðŸ’¬ Novo comentÃ¡rio',
  employee_message: 'ðŸ’¬ Nova mensagem do app',
  purchase_request: 'ðŸ›ï¸ Compra da Lousa',
  batch_deleted: 'ðŸ—‘ï¸ Pedidos Apagados',
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
  const label   = TYPE_LABELS[notification.type]  || 'NotificaÃ§Ã£o'
  const color   = TYPE_COLORS[notification.type]  || '#6366f1'
  const code    = notification.task_code ? `<span style="font-family:monospace;background:#f1f5f9;padding:2px 8px;border-radius:6px;font-size:13px;color:#64748b">#${notification.task_code}</span>` : ''
  const body    = notification.body ? `<p style="color:#5C4A3A;font-size:14px;line-height:1.6;margin:8px 0 0">${notification.body}</p>` : ''
  const SITE_URL = 'https://coisapet.com.br/sistema'
  const ctaUrl  = notification.link ? `${SITE_URL}${notification.link}` : null
  const cta     = ctaUrl ? `
        <tr>
          <td style="padding:0 36px 28px">
            <a href="${ctaUrl}" style="display:inline-block;background:#3D1F0D;color:#fff;font-size:13px;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:12px">
              Ver tarefa â†’
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
            <p style="margin:0;color:#C4956A;font-size:22px;font-weight:800;letter-spacing:-0.5px">ðŸ¾ CoisaPet</p>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.6);font-size:12px">Sistema de GestÃ£o</p>
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

        <!-- ConteÃºdo -->
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
              OlÃ¡ <strong>${userName}</strong>, vocÃª recebeu esta notificaÃ§Ã£o porque Ã© membro desta tarefa.
            </p>
            <p style="margin:8px 0 0;color:#C4956A;font-size:11px">
              CoisaPetÂ® Â· Sistema interno
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

    // Busca email e nome do usuÃ¡rio
    const db = createClient(SUPABASE_URL, SUPABASE_KEY)
    const { data: user, error: userErr } = await db
      .from('system_users')
      .select('name, email, notification_email')
      .eq('id', notification.user_id)
      .single()

    // ðŸ” DIAGNÃ“STICO â€” remove essa linha depois de confirmar que estÃ¡ tudo certo
    console.log('[DEBUG v2] user_id:', notification.user_id, '| email:', user?.email, '| notification_email:', user?.notification_email, '| userErr:', userErr)

    const recipientEmail = user?.notification_email || user?.email

    if (userErr || !recipientEmail) {
      console.error('UsuÃ¡rio nÃ£o encontrado:', userErr)
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
        subject: `${TYPE_LABELS[notification.type] || 'NotificaÃ§Ã£o'}: ${notification.title}`,
        html:    buildEmailHtml(notification, user.name),
      }),
    })

    const emailData = await emailRes.json()

    if (!emailRes.ok) {
      console.error('Resend error:', emailData)
      return new Response(JSON.stringify({ error: emailData }), { status: 500 })
    }

    console.log('Email enviado:', emailData.id, 'â†’', recipientEmail)
    return new Response(JSON.stringify({ ok: true, emailId: emailData.id }), {
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('Erro na Edge Function:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})