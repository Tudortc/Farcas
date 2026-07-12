import { useChat } from '../store/chat-store.js'

/** Connection status dot — driven by useChat().connection */
export function ConnDot() {
  const connection = useChat((s) => s.connection)
  return (
    <span
      className={`conn-dot${connection === 'open' ? ' open' : connection === 'connecting' ? ' connecting' : ''}`}
      title={connection}
      aria-label={`Connection: ${connection}`}
    />
  )
}
