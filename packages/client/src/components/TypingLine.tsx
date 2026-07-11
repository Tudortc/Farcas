import { useState, useEffect } from 'react'
import { useChat } from '../store/chat-store.js'

export interface TypingLineProps {
  /** Override for the current timestamp — used in tests to avoid real timers */
  now?: number
}

const STALE_MS = 6000

function formatTypers(nicks: string[]): string {
  if (nicks.length === 1) return `${nicks[0]} is typing…`
  if (nicks.length === 2) return `${nicks[0]} and ${nicks[1]} are typing…`
  return 'several people are typing…'
}

export function TypingLine({ now: nowProp }: TypingLineProps) {
  const [tick, setTick] = useState(() => Date.now())

  useEffect(() => {
    if (nowProp !== undefined) return // test mode — no real interval
    const id = setInterval(() => setTick(Date.now()), 1000)
    return () => clearInterval(id)
  }, [nowProp])

  const now = nowProp ?? tick

  const selected = useChat((s) => s.selected)
  const typing = useChat((s) => s.typing)
  const networks = useChat((s) => s.networks)

  if (!selected) return null

  // Derive current user's nick from the network parsed out of selected key
  const colonIdx = selected.indexOf(':')
  const networkId = colonIdx !== -1 ? Number(selected.slice(0, colonIdx)) : NaN
  const ownNick = !isNaN(networkId) ? networks[networkId]?.nick : undefined

  const targetTyping = typing[selected] ?? {}
  const activeNicks = Object.entries(targetTyping)
    .filter(([nick, ts]) => nick !== ownNick && now - ts < STALE_MS)
    .map(([nick]) => nick)

  if (activeNicks.length === 0) return null

  return (
    <div
      className="typing-line"
      aria-live="polite"
      aria-atomic="true"
      style={{
        padding: '2px 16px',
        fontSize: 'var(--meta-fs)',
        color: 'var(--ink-2)',
        fontFamily: 'var(--sans)',
        minHeight: '18px',
        userSelect: 'none',
      }}
    >
      <span
        style={{
          display: 'inline-block',
          marginRight: '4px',
          animation: 'typing-blink 1.2s step-start infinite',
        }}
        aria-hidden="true"
      >
        ·
      </span>
      {formatTypers(activeNicks)}
    </div>
  )
}
