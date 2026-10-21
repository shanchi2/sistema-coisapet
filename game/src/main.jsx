import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Segurar o dedo (toque longo) no Android vira "clique direito" e abre menu:
// bloqueia em tudo, menos nos campos de texto (copiar/colar código)
document.addEventListener('contextmenu', e => { if (!e.target.closest?.('input, textarea')) e.preventDefault() })

ReactDOM.createRoot(document.getElementById('root')).render(<App />)
