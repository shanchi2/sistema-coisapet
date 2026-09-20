import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ShoppingBag, X, Trash2, ArrowRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'

function getSession() {
  try { return JSON.parse(localStorage.getItem('coisapet_session') || '{}') } catch { return {} }
}

// Só admin (diretoria) e produção veem esses avisos — pedido do
// Raphael, 19/09 (mesmo critério do MLSaleToast.jsx).
const ALLOWED_ROLES = ['admin', 'producao']

// Som próprio da Shopee (arquivo enviado pelo Raphael, 19/09) — fica em
// public/sounds/ pra servir direto, sem passar pelo bundler. Se não
// carregar por algum motivo, cai no "cha-ching" sintético de reserva
// (mesmo padrão do MLSaleToast.jsx).
const SHOPEE_SOUND_URL = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/sounds/shopee.mp3`

function playSaleChime() {
  try {
    const audio = new Audio(SHOPEE_SOUND_URL)
    audio.volume = 0.7
    audio.play().catch(() => playFallbackChime())
  } catch {
    playFallbackChime()
  }
}

// Reserva — usado se o mp3 não existir/não carregar.
function playFallbackChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    ;[{ freq: 1046.5, start: 0 }, { freq: 1318.5, start: 0.09 }].forEach(({ freq, start }) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain()
      osc.type = 'triangle'; osc.frequency.value = freq
      const t0 = ctx.currentTime + start
      gain.gain.setValueAtTime(0.0001, t0)
      gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35)
      osc.connect(gain); gain.connect(ctx.destination)
      osc.start(t0); osc.stop(t0 + 0.35)
    })
  } catch { /* navegador bloqueou áudio — sem problema, segue sem som */ }
}

function flashTitle(message) {
  if (!document.hidden) return
  if (window.__shopeeTitleFlash) return
  const original = document.title
  let on = false
  const id = setInterval(() => {
    document.title = on ? original : message
    on = !on
  }, 1200)
  window.__shopeeTitleFlash = true
  function stop() {
    clearInterval(id)
    document.title = original
    window.__shopeeTitleFlash = false
    document.removeEventListener('visibilitychange', onVisible)
  }
  function onVisible() { if (!document.hidden) stop() }
  document.addEventListener('visibilitychange', onVisible)
}

const PANEL_ID = 'shopee-sale-panel'
const MAX_VISIBLE = 5

// Painel único (mesmo padrão do MLSaleToast.jsx — ver comentário lá pro
// motivo da mudança: um card por venda empilhava além da tela e o
// "Limpar tudo" ficava inalcançável). No máximo 5 cards visíveis, "Ver
// tudo"/"Limpar" fixos no topo do painel.
export function ShopeeSaleToast() {
  const navigate = useNavigate()
  const pendingRef = useRef(new Map())

  useEffect(() => {
    const me = getSession()
    if (!me?.id || !ALLOWED_ROLES.includes(me.role)) return

    function renderPanel() {
      const total = pendingRef.current.size
      if (total === 0) { toast.dismiss(PANEL_ID); return }
      const items = [...pendingRef.current.values()].slice(-MAX_VISIBLE).reverse()
      const hiddenCount = total - items.length
      toast.custom(t => (
        <SalePanel
          t={t}
          items={items}
          hiddenCount={hiddenCount}
          onOpenOne={id => { markRead(id); navigate('/pedidos') }}
          onCloseOne={id => markRead(id)}
          onViewAll={() => clearAll(true)}
          onClear={() => clearAll(false)}
        />
      ), { id: PANEL_ID, position: 'bottom-right', duration: Infinity })
    }

    async function markRead(id) {
      pendingRef.current.delete(id)
      renderPanel()
      await supabase.from('notifications').update({ read: true }).eq('id', id)
    }

    async function clearAll(goToPedidos) {
      const ids = [...pendingRef.current.keys()]
      pendingRef.current.clear()
      toast.dismiss(PANEL_ID)
      if (goToPedidos) navigate('/pedidos')
      if (ids.length) await supabase.from('notifications').update({ read: true }).in('id', ids)
    }

    function showSaleToast(n, { playSound = true } = {}) {
      pendingRef.current.set(n.id, n)
      if (playSound) {
        if (navigator.vibrate) navigator.vibrate(60)
        playSaleChime()
        flashTitle('🛒 Novo pedido!')
        window.dispatchEvent(new CustomEvent('shopee-sale-ping'))
      }
      renderPanel()
    }

    // Ao abrir a tela: mostra tudo que ainda não foi visto, sem som
    // (só a chegada em tempo real toca o "cha-ching").
    async function loadUnseen() {
      const { data } = await supabase.from('notifications')
        .select('*').eq('user_id', me.id).eq('type', 'shopee_order_synced').eq('read', false)
        .order('created_at', { ascending: true }).limit(30)
      ;(data || []).forEach(n => showSaleToast(n, { playSound: false }))
    }
    loadUnseen()

    const channel = supabase
      .channel(`shopee-sale-toast:${me.id}`)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'notifications',
        filter: `user_id=eq.${me.id}`,
      }, payload => {
        const n = payload.new
        if (n.type !== 'shopee_order_synced') return
        showSaleToast(n)
      })
      .subscribe()

    // Helper de teste visual — só mostra o card (+ som + título), não
    // grava nada no banco. Cole no console: testShopeeToast()
    window.testShopeeToast = (overrides = {}) => showSaleToast({
      id: 'teste-' + Date.now(),
      body: 'João da Silva · São Paulo/SP\n3 itens · ✅ Vai pro picklist',
      link: '/pedidos',
      ...overrides,
    })

    return () => { supabase.removeChannel(channel); delete window.testShopeeToast; toast.dismiss(PANEL_ID) }
  }, [navigate])

  return null
}

function SalePanel({ t, items, hiddenCount, onOpenOne, onCloseOne, onViewAll, onClear }) {
  const total = items.length + hiddenCount
  return (
    <div
      className="w-72 max-w-[85vw] bg-white rounded-xl shadow-2xl border-2 overflow-hidden flex flex-col"
      style={{
        borderColor: '#EE4D2D',
        animation: `${t.visible ? 'shopee-toast-in' : 'shopee-toast-out'} .3s cubic-bezier(.2,.8,.2,1) forwards`,
        boxShadow: '0 10px 26px -10px rgba(238,77,45,.4), 0 3px 8px -3px rgba(15,23,42,0.15)',
      }}
    >
      <style>{`
        @keyframes shopee-toast-in  { 0% { opacity:0; transform:translateY(14px) scale(.94);} 60% { transform:translateY(-2px) scale(1.015);} 100% { opacity:1; transform:translateY(0) scale(1);} }
        @keyframes shopee-toast-out { from { opacity:1; transform:translateY(0) scale(1);} to { opacity:0; transform:translateY(8px) scale(.95);} }
      `}</style>
      {/* Cabeçalho fixo no topo — "Ver tudo"/"Limpar" sempre visíveis,
          nunca some atrás da pilha de cards. */}
      <div className="flex items-center justify-between gap-2 px-2.5 py-2" style={{ background: '#FFF3EE', borderBottom: '1px solid #FBD4C4' }}>
        <span className="text-[10px] font-black" style={{ color: '#C23E1C' }}>
          🛒 {total} nova{total === 1 ? '' : 's'} venda{total === 1 ? '' : 's'} — Shopee
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onViewAll}
            className="flex items-center gap-1 text-[10px] font-bold bg-white rounded-lg px-2 py-1 hover:bg-orange-50 transition-colors"
            style={{ color: '#EE4D2D', border: '1px solid #FBD4C4' }}>
            Ver tudo <ArrowRight size={10} />
          </button>
          <button onClick={onClear}
            className="flex items-center gap-1 text-[10px] font-bold text-white rounded-lg px-2 py-1 hover:opacity-90 transition-opacity"
            style={{ background: 'linear-gradient(135deg, #F43F5E, #E11D48)' }}>
            <Trash2 size={10} /> Limpar
          </button>
        </div>
      </div>

      <div className="flex flex-col divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
        {items.map(n => <SaleCardRow key={n.id} notification={n} onOpen={() => onOpenOne(n.id)} onClose={() => onCloseOne(n.id)} />)}
      </div>

      {hiddenCount > 0 && (
        <div className="px-2.5 py-1.5 bg-slate-50 text-center">
          <span className="text-[10px] text-slate-500 font-semibold">+{hiddenCount} mais em Pedidos</span>
        </div>
      )}
    </div>
  )
}

function SaleCardRow({ notification, onOpen, onClose }) {
  const [linha1, linha2] = (notification.body || '').split('\n')
  const cancelado = (linha2 || '').includes('🚫')
  const semSku    = (linha2 || '').includes('⚠️')
  const accent    = cancelado ? '#F43F5E' : semSku ? '#F59E0B' : '#EE4D2D' // #EE4D2D = laranja da Shopee

  return (
    <div onClick={onOpen} role="button" className="cursor-pointer flex items-start gap-2 p-2.5 hover:bg-slate-50 transition-colors">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs shadow-sm" style={{ background: '#EE4D2D' }}>
        <ShoppingBag size={13} className="text-white" />
      </div>
      <div className="flex-1 min-w-0">
        {linha1 && <p className="text-[10px] text-slate-700 truncate font-semibold">{linha1}</p>}
        {linha2 && <p className="text-[10px] font-extrabold mt-0.5 truncate" style={{ color: accent }}>{linha2}</p>}
      </div>
      <button
        onClick={e => { e.stopPropagation(); onClose() }}
        className="shrink-0 p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-black/5 transition-colors"
        aria-label="Fechar"
      >
        <X size={12} />
      </button>
    </div>
  )
}
