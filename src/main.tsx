import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import '@fontsource-variable/geist/wght.css'
import './styles.css'
import { App } from './app'

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // Updates take effect at the next visit without interrupting an active editor.
  registerSW({ onRegisterError: error => console.warn('無法準備離線資源。', error) })
}
