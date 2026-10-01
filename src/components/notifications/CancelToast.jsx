import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Ban, X, Trash2, ArrowRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { playCancelSound } from '../../lib/sounds'

function getSession() {
  try { return JSON.parse(localStorage.getItem('coisapet_session') || '{}') } catch { return {} }
}

// Mesmo público do pop-up de venda (MLSaleToast/ShopeeSaleToast)
const ALLOWED_ROLES = ['admin', 'producao']
const PANEL_ID = 'order-cancel-panel'
const MAX_VISIBLE = 5

// Pop-up de PEDIDO CANCELADO (01/10, fase91) — notificação
// 'order_cancelled' criada por trigger no banco quando um pedido ML/Shopee
// vira cancelado. Painel vermelho no canto inferior ESQUERDO (o de vendas
// fica no direito) + "trombone triste" no lugar do som de venda.
export function CancelToast() {
  const navigate = useNavigate()
  const pendingRef = useRef(new Map())

  useEffect(() => {
    const me = getSession()
    if (!me?.id || !ALLOWED_ROLES.includes(me.role)) return

    function renderPanel() {
      const total = pendingRef.current.size
      if (total === 0) { toast.dismiss(PANEL_ID); return }
      const items = [...pendingRef.current.values()].slice(-MAX_VISIBLE).reverse()
      toast.custom(t => (
        <CancelPanel t={t} items={items} hiddenCount={total - items.length}
          onOpenOne={id => { markRead(id); navigate('/pedidos') }}
          onCloseOne={id => markRead(id)}
          onViewAll={() => clearAll(true)}
          onClear={() => clearAll(false)} />
      ), { id: PANEL_ID, position: 'bottom-left', duration: Infinity })
    }

    async function markRead(id) {
      pendingRef.current.delete(id)
      renderPanel()
      if (!String(id).startsWith('teste-')) await supabase.from('notifications').update({ read: true }).eq('id', id)
    }

    async function clearAll(goToPedidos) {
      const ids = [...pendingRef.current.keys()].filter(id => !String(id).startsWith('teste-'))
      pendingRef.current.clear()
      toast.dismiss(PANEL_ID)
      if (goToPedidos) navigate('/pedidos')
      if (ids.length) await supabase.from('notifications').update({ read: true }).in('id', ids)
    }

    function showCancel(n, { playSound = true } = {}) {
      pendingRef.current.set(n.id, n)
      if (playSound) {
        if (navigator.vibrate) navigator.vibrate([120, 80, 120])
        playCancelSound()
      }
      renderPanel()
    }

    // Ao abrir a tela: mostra os cancelamentos ainda não vistos, sem som
    supabase.from('notifications')
      .select('*').eq('user_id', me.id).eq('type', 'order_cancelled').eq('read', false)
      .order('created_at', { ascending: true }).limit(30)
      .then(({ data }) => (data || []).forEach(n => showCancel(n, { playSound: false })))

    const channel = supabase
      .channel(`order-cancel-toast:${me.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${me.id}` }, payload => {
        if (payload.new.type === 'order_cancelled') showCancel(payload.new)
      })
      .subscribe()

    // Teste visual/sonoro (não grava nada): no console do navegador, testCancelToast()
    window.testCancelToast = (overrides = {}) => showCancel({
      id: 'teste-' + Date.now(), title: '🚫 Pedido cancelado — Shopee',
      body: 'fulano · #2610019ABCDEF\n🚫 Era pro dia 01/10 — não sai mais\n1× Rodinha 25cm com Suporte', ...overrides,
    })

    return () => { supabase.removeChannel(channel); delete window.testCancelToast; toast.dismiss(PANEL_ID) }
  }, [navigate])

  return null
}

function CancelPanel({ t, items, hiddenCount, onOpenOne, onCloseOne, onViewAll, onClear }) {
  const total = items.length + hiddenCount
  return (
    <div className="w-80 max-w-[88vw] bg-white rounded-xl shadow-2xl border-2 border-rose-300 overflow-hidden flex flex-col"
      style={{ animation: `${t.visible ? 'cancel-in' : 'cancel-out'} .35s cubic-bezier(.2,.8,.2,1) forwards`, boxShadow: '0 10px 26px -10px rgba(225,29,72,.45)' }}>
      <style>{`
        @keyframes cancel-in  { 0% { opacity:0; transform:translateX(-14px) rotate(-1deg);} 40% { transform:translateX(4px) rotate(1deg);} 70% { transform:translateX(-2px);} 100% { opacity:1; transform:none;} }
        @keyframes cancel-out { from { opacity:1;} to { opacity:0; transform:translateY(8px) scale(.95);} }
      `}</style>
      <div className="flex items-center justify-between gap-2 px-2.5 py-2 bg-rose-50 border-b border-rose-200">
        <span className="text-[10px] font-black text-rose-800">🚫 {total} pedido{total === 1 ? '' : 's'} cancelado{total === 1 ? '' : 's'}</span>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onViewAll} className="flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-white border border-rose-300 rounded-lg px-2 py-1 hover:bg-rose-100">
            Ver <ArrowRight size={10} />
          </button>
          <button onClick={onClear} className="flex items-center gap-1 text-[10px] font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg px-2 py-1">
            <Trash2 size={10} /> Limpar
          </button>
        </div>
      </div>
      <div className="flex flex-col divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
        {items.map(n => {
          const [l1, l2, l3] = (n.body || '').split('\n')
          const warn = (l2 || '').includes('⚠️')
          return (
            <div key={n.id} onClick={() => onOpenOne(n.id)} role="button" className="cursor-pointer flex items-start gap-2 p-2.5 hover:bg-slate-50">
              <div className="w-7 h-7 rounded-lg bg-rose-500 flex items-center justify-center shrink-0 shadow-sm"><Ban size={13} className="text-white" /></div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black text-rose-700">{(n.title || '').replace('🚫 ', '')}</p>
                {l1 && <p className="text-[10px] text-slate-700 truncate font-semibold">{l1}</p>}
                {l2 && <p className={`text-[10px] font-extrabold mt-0.5 ${warn ? 'text-amber-600' : 'text-rose-500'}`}>{l2}</p>}
                {l3 && <p className="text-[10px] text-slate-400 truncate">{l3}</p>}
              </div>
              <button onClick={e => { e.stopPropagation(); onCloseOne(n.id) }} className="shrink-0 p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-black/5" aria-label="Fechar"><X size={12} /></button>
            </div>
          )
        })}
      </div>
      {hiddenCount > 0 && <div className="px-2.5 py-1.5 bg-slate-50 text-center"><span className="text-[10px] text-slate-500 font-semibold">+{hiddenCount} mais em Pedidos</span></div>}
    </div>
  )
}
