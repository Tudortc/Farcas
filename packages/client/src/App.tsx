import { useEffect, useState } from 'react'
import { createWsClient } from './ws-client.js'

export function App() {
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const client = createWsClient({ url: `${proto}://${location.host}/ws` })
    client.onMessage((msg) => {
      if (msg.type === 'welcome') setConnected(true)
    })
    client.send({ type: 'hello', clientVersion: 1 })
    return () => client.close()
  }, [])

  return <main>{connected ? 'Connected' : 'Connecting…'}</main>
}
