import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './site.css'
import { SiteHome } from './SiteHome'

const base = import.meta.env.DEV ? '/' : '/site'

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
