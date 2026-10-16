import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' → funciona tanto em game.coisapet.com.br quanto em coisapet.com.br/game/
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 2000 },
})
