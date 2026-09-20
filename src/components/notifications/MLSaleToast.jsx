import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ShoppingBag, X, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'

function getSession() {
  try { return JSON.parse(localStorage.getItem('coisapet_session') || '{}') } catch { return {} }
}

// Só admin (diretoria) e produção veem esses avisos — pedido do
// Raphael, 19/09: antes qualquer role logada via Layout.jsx recebia
// (na prática só quem tinha notificação no banco: admin+administrativo).
const ALLOWED_ROLES = ['admin', 'producao']

// Som próprio do ML (arquivo enviado pelo Raphael, 19/09) — fica em
// public/sounds/ pra servir direto, sem passar pelo bundler. Se não
// carregar por algum motivo, cai no "cha-ching" sintético de reserva.
const ML_SOUND_URL = `${import.meta.env.BASE_URL}sounds/mercadolivre.mp3`

function playSaleChime() {
  try {
    const audio = new Audio(ML_SOUND_URL)
    audio.volume = 0.7
    audio.play().catch(() => playFallbackChime())
  } catch {
    playFallbackChime()
  }
}

// Reserva — usado se o mp3 não existir/não carregar. Duas notas
// subindo (dó-mi), gerado na hora, sem depender de arquivo de áudio.
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

const CLEAR_ALL_ID = 'ml-sale-clear-all'

// Card flutuante no canto inferior direito, disparado em tempo real quando
// chega uma venda nova do Mercado Livre (ml-process-webhook grava em
// `notifications`, isso aqui escuta via Realtime e mostra o card). Fica
// montado uma vez em Layout.jsx — funciona em qualquer tela do sistema,
// não só em Pedidos. Também dispara som, pisca o título da aba, e avisa
// o sino (via evento 'ml-sale-ping') pra ele reagir também.
//
// 19/09 (pedido do Raphael): antes sumia sozinho em 10s e só avisava
// quem estivesse com a aba aberta NA HORA EXATA da venda — perdia
// venda que aconteceu enquanto ele estava longe do sistema. Agora: ao
// abrir a tela, já mostra tudo que ainda não foi visto (não só daqui
// pra frente), e cada card fica até ser fechado manualmente (um por um
// ou "Limpar tudo").
export function MLSaleToast() {
  const navigate = useNavigate()
  const pendingRef = useRef(new Map()) // notificationId -> true, enquanto o card ainda está na tela

  useEffect(() => {
    const me = getSession()
    if (!me?.id || !ALLOWED_ROLES.includes(me.role)) return

    async function markRead(id) {
      pendingRef.current.delete(id)
      updateClearAllControl()
      await supabase.from('notifications').update({ read: true }).eq('id', id)
    }

    function updateClearAllControl() {
      const n = pendingRef.current.size
      if (n > 1) {
        toast.custom(t => <ClearAllPill count={n} onClear={clearAll} />, { id: CLEAR_ALL_ID, position: 'bottom-right', duration: Infinity })
      } else {
        toast.dismiss(CLEAR_ALL_ID)
      }
    }

    async function clearAll() {
      const ids = [...pendingRef.current.keys()]
      pendingRef.current.clear()
      ids.forEach(id => toast.dismiss(id))
      toast.dismiss(CLEAR_ALL_ID)
      if (ids.length) await supabase.from('notifications').update({ read: true }).in('id', ids)
    }

    function showSaleToast(n, { playSound = true } = {}) {
      pendingRef.current.set(n.id, true)
      if (playSound) {
        if (navigator.vibrate) navigator.vibrate(60)
        playSaleChime()
        flashTitle('🛒 Novo pedido!')
        window.dispatchEvent(new CustomEvent('ml-sale-ping'))
      }
      toast.custom(t => (
        <MLSaleCard t={t} notification={n}
          onOpen={() => { markRead(n.id); navigate(n.link || '/pedidos'); toast.dismiss(n.id) }}
          onClose={() => { markRead(n.id); toast.dismiss(n.id) }} />
      ), { position: 'bottom-right', duration: Infinity, id: n.id })
      updateClearAllControl()
    }

    // Ao abrir a tela (login ou F5): mostra tudo que ainda não foi
    // visto, não só o que acontecer daqui pra frente. Sem som — só a
    // notificação em tempo real toca o "cha-ching" de propósito, senão
    // toca uma rajada de sons ao abrir com várias pendentes.
    async function loadUnseen() {
      const { data } = await supabase.from('notifications')
        .select('*').eq('user_id', me.id).eq('type', 'ml_order_synced').eq('read', false)
        .order('created_at', { ascending: true }).limit(30)
      ;(data || []).forEach(n => showSaleToast(n, { playSound: false }))
    }
    loadUnseen()

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
      id: 'teste-' + Date.now(),
      body: 'João da Silva · São Paulo/SP\n3 itens · ✅ Vai pro picklist',
      link: '/pedidos',
      ...overrides,
    })

    return () => { supabase.removeChannel(channel); delete window.testMLToast; toast.dismiss(CLEAR_ALL_ID) }
  }, [navigate])

  return null
}

function ClearAllPill({ count, onClear }) {
  return (
    <button onClick={onClear}
      className="w-64 max-w-[80vw] flex items-center justify-center gap-2 text-white text-xs font-black px-4 py-2.5 rounded-xl shadow-2xl transition-transform hover:scale-[1.03] active:scale-95"
      style={{ background: 'linear-gradient(135deg, #F43F5E, #E11D48)', boxShadow: '0 8px 20px -6px rgba(225,29,72,.6)' }}>
      <Trash2 size={14} /> Limpar tudo ({count})
    </button>
  )
}

function MLSaleCard({ t, notification, onOpen, onClose }) {
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
      className="cursor-pointer w-64 max-w-[80vw] bg-white rounded-xl shadow-2xl border-2 overflow-hidden"
      style={{
        borderColor: accent,
        animation: `${t.visible ? 'ml-toast-in' : 'ml-toast-out'} .3s cubic-bezier(.2,.8,.2,1) forwards`,
        boxShadow: `0 8px 20px -8px ${accent}55, 0 3px 8px -3px rgba(15,23,42,0.15)`,
      }}
    >
      <style>{`
        @keyframes ml-toast-in  { 0% { opacity:0; transform:translateY(14px) scale(.94);} 60% { transform:translateY(-2px) scale(1.015);} 100% { opacity:1; transform:translateY(0) scale(1);} }
        @keyframes ml-toast-out { from { opacity:1; transform:translateY(0) scale(1);} to { opacity:0; transform:translateY(8px) scale(.95);} }
      `}</style>
      <div className="flex items-start gap-2 p-2.5" style={{ background: wash }}>
        <div className="w-8 h-8 rounded-lg bg-amber-400 flex items-center justify-center shrink-0 text-sm shadow-md">
          🛒
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-black text-slate-800 leading-tight">Nova venda — Mercado Livre!</p>
          {linha1 && <p className="text-[10px] text-slate-600 mt-0.5 truncate font-semibold">{linha1}</p>}
          {linha2 && (
            <p className="text-[10px] font-extrabold mt-0.5 truncate" style={{ color: accent }}>
              {linha2}
            </p>
          )}
        </div>
        <button
          onClick={e => { e.stopPropagation(); onClose() }}
          className="shrink-0 p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-black/5 transition-colors"
          aria-label="Fechar"
        >
          <X size={13} />
        </button>
      </div>
      <div className="px-2.5 py-1.5 bg-white">
        <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700">
          <ShoppingBag size={10} /> Ver em Pedidos →
        </span>
      </div>
    </div>
  )
}
