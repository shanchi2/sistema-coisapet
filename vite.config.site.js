import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/site' : '/',
  // Aponta a RAIZ do Vite para a pasta site-app
  // Assim ele não confunde com o index.html do ERP
  root: resolve(__dirname, 'site-app'),
  server: {
    port: 5175,
  },
  build: {
    outDir: resolve(__dirname, 'dist-site'),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      // Permite importar src/ normalmente de dentro de site-app/
      '~': resolve(__dirname, 'src'),
    },
  },
}))
