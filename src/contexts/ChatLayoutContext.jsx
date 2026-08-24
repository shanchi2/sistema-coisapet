import { createContext, useContext, useState } from 'react'

const ChatLayoutContext = createContext(null)
const STORAGE_KEY = 'coisapet_chat_layout'
export const DOCKED_WIDTH = 320 // px — largura fixa do chat quando "preso" na lateral

export function ChatLayoutProvider({ children }) {
  const [mode, setModeState] = useState(() => localStorage.getItem(STORAGE_KEY) || 'floating') // 'floating' | 'docked'

  function setMode(m) {
    setModeState(m)
    try { localStorage.setItem(STORAGE_KEY, m) } catch {}
  }

  return (
    <ChatLayoutContext.Provider value={{ mode, setMode }}>
      {children}
    </ChatLayoutContext.Provider>
  )
}

export function useChatLayout() {
  const ctx = useContext(ChatLayoutContext)
  if (!ctx) throw new Error('useChatLayout precisa estar dentro de <ChatLayoutProvider>')
  return ctx
}
