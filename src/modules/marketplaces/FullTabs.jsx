import { Warehouse, BarChart3 } from 'lucide-react'

// Abas da tela de Estoque Full (14/10): o estoque lá dentro e o que vendeu
export function FullTabs({ value, onChange }) {
  return (
    <div className="flex bg-white border border-slate-200 rounded-xl p-1 gap-1 w-fit shadow-sm">
      {[['estoque', 'Estoque no Full', Warehouse], ['vendas', 'Vendas do Full', BarChart3]].map(([k, l, Icon]) => (
        <button key={k} onClick={() => onChange(k)}
          className={`h-9 px-4 rounded-lg text-sm font-semibold flex items-center gap-2 transition ${value === k ? 'bg-[#00A650] text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
          <Icon size={15} />{l}
        </button>
      ))}
    </div>
  )
}
