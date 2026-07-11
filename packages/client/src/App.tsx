import { useEffect, useState } from 'react'
import { createWsClient } from './ws-client.js'
import { AuthGate } from './AuthGate.js'
import { authClient, useSession } from './auth-client.js'
import { AdminPanel } from './AdminPanel.js'

function ConnectedApp() {
  const { data: session } = useSession()
  const [connected, setConnected] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  const isAdmin = session?.user.role === 'admin'

  useEffect(() => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const client = createWsClient({ url: `${proto}://${location.host}/ws` })
    client.onMessage((msg) => {
      if (msg.type === 'welcome') setConnected(true)
    })
    client.send({ type: 'hello', clientVersion: 1 })
    return () => client.close()
  }, [])

  return (
    <main>
      <header>
        <span>{session?.user.username}</span>
        {isAdmin && <button onClick={() => setShowAdmin((v) => !v)}>Admin</button>}
        <button onClick={() => void authClient.signOut()}>Sign out</button>
      </header>
      <p>{connected ? 'Connected' : 'Connecting…'}</p>
      {showAdmin && isAdmin && <AdminPanel />}
    </main>
  )
}

export function App() {
  return (
    <AuthGate>
      <ConnectedApp />
    </AuthGate>
  )
}
