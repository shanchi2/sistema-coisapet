import { createContext, useCallback, useContext, useEffect, useState } from 'react'

// Tema do sistema (03/10): 'light' | 'dark' | 'auto' (segue o Windows/
// celular). Guardado no navegador de cada máquina (localStorage) — cada PC
// lembra o seu. A troca de cores em si é só a classe `dark` no <html>; o
// resto é CSS (tailwind.config.js + src/index.css). O index.html aplica a
// classe antes do React carregar, pra não "piscar" branco ao abrir à noite.
const STORAGE_KEY = 'coisapet-theme'
const ThemeContext = createContext(null)

function readPref() {
  try { return localStorage.getItem(STORAGE_KEY) || 'light' } catch { return 'light' }
}
const systemDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches

export function ThemeProvider({ children }) {
  const [pref, setPref] = useState(readPref)
  const [osDark, setOsDark] = useState(systemDark)

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return
    const onChange = (e) => setOsDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const isDark = pref === 'dark' || (pref === 'auto' && osDark)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
  }, [isDark])

  const setTheme = useCallback((next) => {
    setPref(next)
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* modo privado etc. */ }
  }, [])

  // Claro → Escuro → Automático → Claro
  const cycleTheme = useCallback(() => {
    setTheme(pref === 'light' ? 'dark' : pref === 'dark' ? 'auto' : 'light')
  }, [pref, setTheme])

  return (
    <ThemeContext.Provider value={{ theme: pref, isDark, setTheme, cycleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme precisa estar dentro de <ThemeProvider>')
  return ctx
}
