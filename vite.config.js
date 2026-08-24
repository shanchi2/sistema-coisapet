import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // 'command' é 'serve' em dev e 'build' em produção
  base: command === 'build' ? '/sistema' : '/',
}))