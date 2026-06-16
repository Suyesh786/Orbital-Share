import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Always add 'electron' class — we are always in Tauri desktop context.
// This enables transparent tray popover backgrounds and -webkit-app-region drag.
document.documentElement.classList.add('electron')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
