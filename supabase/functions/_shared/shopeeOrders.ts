// Atualização de pedidos Shopee já existentes (30/09, Fase 83) — usada
// pelo botão "Atualizar pedidos" da Expedição (modo manual), pelo cron
// shopee-shipping-deadline-recheck e, pro nome, pelo shopee-process-webhook.
//
// O que atualiza em cada pedido:
// - status (PT + código cru), prazo de envio (dia + hora exata),
//   days_to_ship, transportadora, mensagem do comprador;
// - nome REAL do destinatário: a Shopee só entrega mascarado ("****") no
//   get_order_detail — o nome de verdade só vem como IMAGEM PNG no
//   logistics/get_shipping_document_data_info (dado de etiqueta), e só
//   depois que o envio foi organizado (tem package_number). Guardamos só
//   a imagem do nome; CPF/telefone/endereço que vêm junto são ignorados.
// - ship_date recalculado pela regra do banco (compute_ship_date: corte
//   13h configurável + prazo da Shopee), só pra pedido sem nada separado
//   e nunca pra antes de hoje. Mudou → badge "dia corrigido" na Expedição.
import { adminClient, shopeeFetch, shopeeWrite } from './shopee.ts'
import { toISODateBR } from './dateBR.ts'

type DB = ReturnType<typeof adminClient>

export const ORDER_STATUS_PT: Record<string, string> = {
  UNPAID:              'Aguardando pagamento',
  READY_TO_SHIP:       'Pronto para envio',
  PROCESSED:           'Processando',
  RETRY_SHIP:          'Reenvio',
  SHIPPED:             'A caminho',
  TO_CONFIRM_RECEIVE:  'Aguardando confirmação de recebimento',
  COMPLETED:           'Entregue',
  IN_CANCEL:           'Cancelamento solicitado',
  CANCELLED:           'Cancelado',
  TO_RETURN:           'Devolução',
  INVOICE_PENDING:     'Aguardando nota fiscal',
}

const DETAIL_FIELDS = 'buyer_username,note,order_status,ship_by_date,days_to_ship,shipping_carrier,checkout_shipping_carrier,package_list,total_amount'

const fmtBR = (d: string) => { const [, m, dd] = d.split('-'); return `${dd}/${m}` }

// Busca a imagem do nome do destinatário (data URL) — null se ainda não dá
export async function fetchRecipientNameImage(integration: any, orderSn: string, packageNumber?: string | null): Promise<string | null> {
  try {
    const res = await shopeeWrite('/api/v2/logistics/get_shipping_document_data_info', integration, {
      order_sn: orderSn,
      ...(packageNumber ? { package_number: packageNumber } : {}),
      recipient_address_info: [{ key: 'name' }],
    })
    const info = res?.response?.recipient_address_info || []
    const img = info.find((i: any) => i.key === 'name')?.image
    return typeof img === 'string' && img.startsWith('data:image') ? img : null
  } catch {
    return null
  }
}

async function pool<T>(items: T[], size: number, fn: (x: T) => Promise<void>) {
  let i = 0
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) { const x = items[i++]; await fn(x) }
  }))
}

type OrderRow = {
  id: string; num_venda: string; data_venda: string | null; ship_date: string
  status_ml: string | null; comprador_nome_img: string | null
  items?: { picked: boolean }[]
}

export type RefreshResult = {
  checked: number; updated: number; names: number; cancelled: number
  moved: { num_venda: string; from: string; to: string }[]
  not_found: number
}

export async function refreshShopeeOrders(db: DB, integration: any, orders: OrderRow[], opts: { recomputeDay?: boolean } = {}): Promise<RefreshResult> {
  const result: RefreshResult = { checked: 0, updated: 0, names: 0, cancelled: 0, moved: [], not_found: 0 }
  const today = toISODateBR(new Date())
  const list = orders.filter(o => o.num_venda)

  for (let g = 0; g < list.length; g += 50) {
    const group = list.slice(g, g + 50)
    const detail = await shopeeFetch('/api/v2/order/get_order_detail', integration, {
      order_sn_list: group.map(o => o.num_venda).join(','),
      response_optional_fields: DETAIL_FIELDS,
    }).catch(() => null)
    const bySn: Record<string, any> = {}
    for (const o of detail?.response?.order_list ?? []) bySn[o.order_sn] = o

    await pool(group, 5, async (o) => {
      const api = bySn[o.num_venda]
      result.checked++
      if (!api) { result.not_found++; return }

      const deadline = api.ship_by_date ? toISODateBR(new Date(api.ship_by_date * 1000)) : null
      const statusPt = api.order_status ? (ORDER_STATUS_PT[api.order_status] ?? api.order_status) : o.status_ml
      const cancelled = ['CANCELLED', 'IN_CANCEL'].includes(api.order_status)
      const anyPicked = (o.items || []).some(it => it.picked)
      const pkg = (api.package_list || [])[0]

      const patch: Record<string, unknown> = {
        status_ml: statusPt,
        marketplace_status: api.order_status ?? null,
        shipping_deadline: deadline,
        ship_by_at: api.ship_by_date ? new Date(api.ship_by_date * 1000).toISOString() : null,
        days_to_ship: api.days_to_ship ?? null,
        shipping_carrier: pkg?.shipping_carrier || api.shipping_carrier || api.checkout_shipping_carrier || null,
        buyer_message: (api.message_to_seller || '').trim() || null,
        marketplace_refreshed_at: new Date().toISOString(),
        shipping_deadline_checked_at: deadline ? new Date().toISOString() : null,
      }
      if (api.buyer_username) patch.comprador = api.buyer_username
      if (api.total_amount != null) patch.gross_value = api.total_amount
      if (cancelled && anyPicked && !/cancelad/i.test(o.status_ml || '')) patch.needs_attention = true
      if (cancelled && !/cancelad/i.test(o.status_ml || '')) result.cancelled++

      // Nome real (imagem) — só enquanto não tem e o envio já foi organizado
      if (!o.comprador_nome_img && !cancelled && pkg?.package_number) {
        const img = await fetchRecipientNameImage(integration, o.num_venda, pkg.package_number)
        if (img) { patch.comprador_nome_img = img; result.names++ }
      }

      // Recalcula o dia (só pedido de hoje em diante, sem nada separado)
      if (opts.recomputeDay && !cancelled && !anyPicked && o.ship_date >= today) {
        const { data: computed } = await db.rpc('compute_ship_date', {
          p_source: 'shopee', p_data_venda: o.data_venda, p_shipping_deadline: deadline,
        })
        let next = computed as string | null
        if (next && next < today) next = today
        if (next && next !== o.ship_date) {
          patch.ship_date = next
          patch.day_auto_corrected = true
          patch.day_auto_corrected_note = `Dia ajustado na atualização: era ${fmtBR(o.ship_date)}, agora ${fmtBR(next)}${deadline ? ` (prazo da Shopee: ${fmtBR(deadline)})` : ''}.`
          result.moved.push({ num_venda: o.num_venda, from: o.ship_date, to: next })
        }
      }

      const { error } = await db.from('orders').update(patch).eq('id', o.id)
      if (!error) result.updated++
      else console.error('[refreshShopeeOrders]', o.num_venda, error)
    })
  }
  return result
}

export const REFRESH_SELECT = 'id, num_venda, data_venda, ship_date, status_ml, comprador_nome_img, items:order_items(picked)'
