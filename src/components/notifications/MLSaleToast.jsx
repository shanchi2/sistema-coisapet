import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ShoppingBag, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'

function getSession() {
  try { return JSON.parse(localStorage.getItem('coisapet_session') || '{}') } catch { return {} }
}

// "Cha-ching" curto — duas notas subindo (dó-mi), gerado na hora, sem
// depender de arquivo de áudio. Timbre diferente do bipe único do chat
// (ChatWidget.jsx), de propósito, pra não confundir os dois avisos.
function playSaleChime() {
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

// Pisca o título da aba (só quando ela não está em foco) até a pessoa
// voltar pra ela — mesmo padrão clássico de "você tem algo novo".
function flashTitle(message) {
  if (!document.hidden) return
  if (window.__mlTitleFlash) return // já piscando, não empilha
  const original = document.title
  let on = false
  const id = setInterval(() => {
    document.title = on ? original : message
    on = !on
  }, 1200)
  window.__mlTitleFlash = true
  function stop() {
    clearInterval(id)
    document.title = original
    window.__mlTitleFlash = false
    document.removeEventListener('visibilitychange', onVisible)
  }
  function onVisible() { if (!document.hidden) stop() }
  document.addEventListener('visibilitychange', onVisible)
}

// Card flutuante no canto inferior direito, disparado em tempo real quando
// chega uma venda nova do Mercado Livre (ml-process-webhook grava em
// `notifications`, isso aqui escuta via Realtime e mostra o card). Fica
// montado uma vez em Layout.jsx — funciona em qualquer tela do sistema,
// não só em Pedidos. Também dispara som, pisca o título da aba, e avisa
// o sino (via evento 'ml-sale-ping') pra ele reagir também.
export function MLSaleToast() {
  const navigate = useNavigate()

  useEffect(() => {
    const me = getSession()
    if (!me?.id) return

    function showSaleToast(n) {
      if (navigator.vibrate) navigator.vibrate(60)
      playSaleChime()
      flashTitle('🛒 Novo pedido!')
      window.dispatchEvent(new CustomEvent('ml-sale-ping'))
      toast.custom(t => <MLSaleCard t={t} notification={n} onOpen={() => { navigate(n.link || '/pedidos'); toast.dismiss(t.id) }} />, {
        position: 'bottom-right',
        duration: 10000,
      })
    }

    const channel = supabase
      .channel(`ml-sale-toast:${me.id}`)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'notifications',
        filter: `user_id=eq.${me.id}`,
      }, payload => {
        const n = payload.new
        if (n.type !== 'ml_order_synced') return
        showSaleToast(n)
      })
      .subscribe()

    // Helper de teste visual — só mostra o card (+ som + título), não
    // grava nada no banco. Cole no console do navegador: testMLToast()
    // Pra ver os outros estados: testMLToast({ body: 'Maria Souza · Rio de Janeiro/RJ\n1 item · 🚫 Cancelado — não entra no picklist' })
    window.testMLToast = (overrides = {}) => showSaleToast({
      body: 'João da Silva · São Paulo/SP\n3 itens · ✅ Vai pro picklist',
      link: '/pedidos',
      ...overrides,
    })

    return () => { supabase.removeChannel(channel); delete window.testMLToast }
  }, [navigate])

  return null
}

function MLSaleCard({ t, notification, onOpen }) {
  const [linha1, linha2] = (notification.body || '').split('\n')
  const cancelado = (linha2 || '').includes('🚫')
  const isFull    = (linha2 || '').includes('📫')
  const semSku    = (linha2 || '').includes('⚠️')
  const accent    = cancelado ? '#F43F5E' : isFull ? '#6366F1' : semSku ? '#F59E0B' : '#22C55E'
  const wash      = cancelado ? '#FFF1F2' : isFull ? '#EEF2FF' : semSku ? '#FFFBEB' : '#ECFDF5'

  return (
    <div
      onClick={onOpen}
      role="button"
      className="cursor-pointer w-96 max-w-[92vw] bg-white rounded-2xl shadow-2xl border-2 overflow-hidden"
      style={{
        borderColor: accent,
        animation: `${t.visible ? 'ml-toast-in' : 'ml-toast-out'} .3s cubic-bezier(.2,.8,.2,1) forwards`,
        boxShadow: `0 12px 32px -10px ${accent}55, 0 4px 12px -4px rgba(15,23,42,0.15)`,
      }}
    >
      <style>{`
        @keyframes ml-toast-in  { 0% { opacity:0; transform:translateY(14px) scale(.94);} 60% { transform:translateY(-2px) scale(1.015);} 100% { opacity:1; transform:translateY(0) scale(1);} }
        @keyframes ml-toast-out { from { opacity:1; transform:translateY(0) scale(1);} to { opacity:0; transform:translateY(8px) scale(.95);} }
      `}</style>
      <div className="flex items-start gap-3.5 p-5" style={{ background: wash }}>
        <div className="w-14 h-14 rounded-2xl bg-amber-400 flex items-center justify-center shrink-0 text-2xl shadow-md">
          🛒
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-black text-slate-800 leading-tight">Nova venda — Mercado Livre!</p>
          {linha1 && <p className="text-[13px] text-slate-600 mt-1 truncate font-semibold">{linha1}</p>}
          {linha2 && (
            <p className="text-[13px] font-extrabold mt-1.5" style={{ color: accent }}>
              {linha2}
            </p>
          )}
        </div>
        <button
          onClick={e => { e.stopPropagation(); toast.dismiss(t.id) }}
          className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-black/5 transition-colors"
          aria-label="Fechar"
        >
          <X size={16} />
        </button>
      </div>
      <div className="px-5 py-3 bg-white">
        <span className="flex items-center gap-1.5 text-xs font-bold text-amber-700">
          <ShoppingBag size={13} /> Ver em Pedidos →
        </span>
      </div>
    </div>
  )
}
