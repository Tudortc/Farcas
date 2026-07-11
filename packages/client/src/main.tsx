import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './styles/base.css'
import { applyAppearance, useAppearance } from './theme.js'
import { App } from './App.js'

// Apply persisted appearance before first render
applyAppearance(useAppearance.getState().theme, useAppearance.getState().density)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
