import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './site.css'
import { SiteHome } from './SiteHome'

// Em dev: basename="/"  →  acessa http://localhost:5175/
// Em prod: basename="/site" →  acessa coisapet.com.br/site/
const isDev = import.meta.env.DEV
const base  = isDev ? '/' : '/site'

createRoot(document.getElementById('root-site')).render(
  <StrictMode>
    <BrowserRouter basename={base}>
      <Routes>
        <Route path="/" element={<SiteHome />} />
        <Route path="*" element={<SiteHome />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
)
