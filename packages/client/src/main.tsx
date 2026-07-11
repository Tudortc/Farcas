import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './styles/tokens.css'
import './styles/base.css'
import { applyAppearance, useAppearance } from './theme.js'
import { useChat } from './store/chat-store.js'
import { App } from './App.js'

// Register the service worker (vite-plugin-pwa; no-ops where unsupported)
registerSW({ immediate: true })

// Apply persisted appearance before first render
applyAppearance(useAppearance.getState().theme, useAppearance.getState().density)

// Debug/e2e hook: expose the stores for tooling (harmless; not a data source).
;(window as unknown as { __bool?: unknown }).__bool = { useChat, useAppearance }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
