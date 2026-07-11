import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './styles/base.css'
import { applyAppearance, useAppearance } from './theme.js'
import { useChat } from './store/chat-store.js'
import { App } from './App.js'

// Apply persisted appearance before first render
applyAppearance(useAppearance.getState().theme, useAppearance.getState().density)

// Debug/e2e hook: expose the stores for tooling (harmless; not a data source).
;(window as unknown as { __bool?: unknown }).__bool = { useChat, useAppearance }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
