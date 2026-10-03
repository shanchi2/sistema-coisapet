import { Sun, Moon, MonitorSmartphone } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'

const LABEL = {
  light: 'Tema claro — clique pra escuro',
  dark:  'Tema escuro — clique pra automático (segue o computador)',
  auto:  'Tema automático (segue o computador) — clique pra claro',
}

export function ThemeToggle() {
  const { theme, cycleTheme } = useTheme()
  const Icon = theme === 'dark' ? Moon : theme === 'auto' ? MonitorSmartphone : Sun
  return (
    <button onClick={cycleTheme} title={LABEL[theme]} aria-label={LABEL[theme]}
      className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
      <Icon size={17}/>
    </button>
  )
}
