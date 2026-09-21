import { useEffect, useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { isSaleSoundMuted, setSaleSoundMuted, onSaleSoundPrefChange } from '../../lib/soundPrefs'

// Liga/desliga o som dos pop-ups de venda (ML/Shopee) — pedido do
// Raphael, 21/09 (pessoal da fábrica incomodado com o som tocando toda
// hora). Fica ao lado do sino no Header. Preferência é por aparelho
// (localStorage), não por login — ver src/lib/soundPrefs.js.
export function SaleSoundToggle() {
  const [muted, setMuted] = useState(() => isSaleSoundMuted())

  useEffect(() => onSaleSoundPrefChange(setMuted), [])

  return (
    <button
      onClick={() => setSaleSoundMuted(!muted)}
      className="relative p-2 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
      aria-label={muted ? 'Ativar som dos pedidos' : 'Desativar som dos pedidos'}
      title={muted ? 'Som dos pedidos desligado — clique pra ligar' : 'Som dos pedidos ligado — clique pra desligar'}
    >
      {muted ? <VolumeX size={20} strokeWidth={1.5} className="text-slate-400" /> : <Volume2 size={20} strokeWidth={1.5} />}
    </button>
  )
}
