import { useEffect } from 'react'
import { AuthGate } from './AuthGate.js'
import { AppShell } from './components/AppShell.js'
import { useChat } from './store/chat-store.js'
import { useAppearance, applyAppearance } from './theme.js'

function ConnectedApp() {
  const init = useChat((s) => s.init)
  const { theme, density } = useAppearance()

  // Apply saved appearance on mount
  useEffect(() => {
    applyAppearance(theme, density)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Initialise the WS chat store once
  useEffect(() => {
    init()
  }, [init])

  return <AppShell />
}

export function App() {
  return (
    <AuthGate>
      <ConnectedApp />
    </AuthGate>
  )
}
