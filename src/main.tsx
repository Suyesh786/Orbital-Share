import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { isElectron } from '@/lib/electron'
import './index.css'
import App from './App.tsx'

if (isElectron()) {
  document.documentElement.classList.add('electron')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
