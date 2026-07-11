import { useEffect, useRef } from 'react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import type { StoredMsg } from '@bool/shared'
import { useChat } from '../store/chat-store.js'
import { MessageRow } from './MessageRow.js'

export function MessageList() {
  const selected = useChat((s) => s.selected)
  const messages = useChat((s) => s.messages)
  const loadHistory = useChat((s) => s.loadHistory)
  const markRead = useChat((s) => s.markRead)

  const msgs: StoredMsg[] = selected != null ? (messages[selected] ?? []) : []
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const prevSelected = useRef<string | null>(null)
  // Debounce timer for marking read on incoming messages
  const markReadTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // When selected target changes: load history + mark read immediately (no debounce)
  useEffect(() => {
    if (!selected) return
    if (selected !== prevSelected.current) {
      prevSelected.current = selected
      loadHistory(selected)
      const latest = msgs.length > 0 ? msgs[msgs.length - 1]!.ts : Date.now()
      markRead(selected, latest)
    }
  }, [selected, loadHistory, markRead, msgs])

  // Also mark read when new messages arrive for the selected target — debounced 400ms
  useEffect(() => {
    if (!selected || msgs.length === 0) return
    // Skip if this is just the initial target-select (already handled above)
    if (selected !== prevSelected.current) return
    const latest = msgs[msgs.length - 1]!.ts
    if (markReadTimer.current != null) clearTimeout(markReadTimer.current)
    markReadTimer.current = setTimeout(() => {
      markRead(selected, latest)
      markReadTimer.current = null
    }, 400)
    return () => {
      if (markReadTimer.current != null) clearTimeout(markReadTimer.current)
    }
  }, [msgs.length, selected, markRead])

  if (!selected) return null

  function renderRow(index: number) {
    const msg = msgs[index]
    if (!msg) return null
    const prev = msgs[index - 1]
    const grouped =
      prev != null &&
      prev.sender === msg.sender &&
      prev.kind === msg.kind &&
      msg.kind !== 'notice' &&
      msg.ts - prev.ts < 5 * 60 * 1000 // 5 min threshold for grouping
    return <MessageRow key={msg.id} msg={msg} grouped={grouped} />
  }

  if (msgs.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--ink-3)',
          fontFamily: 'var(--mono)',
          fontSize: '13px',
        }}
      >
        No messages yet
      </div>
    )
  }

  return (
    <Virtuoso
      ref={virtuosoRef}
      style={{ flex: 1, overflowY: 'auto' }}
      className="msgs"
      totalCount={msgs.length}
      itemContent={renderRow}
      followOutput="smooth"
      alignToBottom
      atTopStateChange={(atTop) => {
        if (atTop && selected) {
          loadHistory(selected)
        }
      }}
      components={{
        // Scroll container padding
        List: ({ style, children, ...props }) => (
          <div
            style={{ ...style, padding: '10px 0 4px' }}
            {...props}
          >
            {children}
          </div>
        ),
      }}
    />
  )
}
