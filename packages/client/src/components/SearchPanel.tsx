import { useState, useEffect, useRef, useCallback } from 'react'
import { useChat, targetKey } from '../store/chat-store.js'
import type { StoredMsg } from '@bool/shared'
import { IrcBody } from './IrcBody.js'
import { useFocusRestore } from './Dialog.js'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SearchPanelProps {
  open: boolean
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()

  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

  if (isToday) return `Today · ${time}`
  if (isYesterday) return `Yesterday · ${time}`
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${time}`
}

// ---------------------------------------------------------------------------
// Icons (inline SVG — no extra dep)
// ---------------------------------------------------------------------------

function IconSearch() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
      style={{ width: 19, height: 19, color: 'var(--green)', flexShrink: 0 }}
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Single result hit
// ---------------------------------------------------------------------------

interface HitProps {
  msg: StoredMsg
  networkName: string
  onSelect: (msg: StoredMsg) => void
}

function Hit({ msg, networkName, onSelect }: HitProps) {
  return (
    <div
      className="sp-hit"
      data-testid="search-hit"
      role="button"
      tabIndex={0}
      onClick={() => onSelect(msg)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(msg)
        }
      }}
    >
      <div className="sp-hit-head">
        <span className="sp-hit-ch">{msg.target}</span>
        <span className="sp-hit-net">· {networkName}</span>
        <span className="sp-hit-when">{formatTimestamp(msg.ts)}</span>
      </div>
      <div className="sp-ctx">
        <div className="sp-cline sp-cline-match">
          <span className="sp-t">
            {new Date(msg.ts).toLocaleTimeString(undefined, {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          <span className="sp-n">{msg.sender}</span>
          <span className="sp-m"><IrcBody text={msg.body} /></span>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SearchPanel
// ---------------------------------------------------------------------------

export function SearchPanel({ open, onClose }: SearchPanelProps) {
  // Restore focus to the previously focused element when the panel closes
  useFocusRestore(open)

  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const search = useChat((s) => s.search)
  const select = useChat((s) => s.select)
  const loadHistory = useChat((s) => s.loadHistory)
  const searchResults = useChat((s) => s.searchResults)
  const networks = useChat((s) => s.networks)

  // Focus input when panel opens
  useEffect(() => {
    if (open) {
      // Small delay to ensure the element is mounted and visible
      requestAnimationFrame(() => inputRef.current?.focus())
    } else {
      // Clear query on close
      setQuery('')
    }
  }, [open])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'Enter') {
        const trimmed = query.trim()
        if (trimmed) {
          search(trimmed)
        }
      }
    },
    [query, search, onClose],
  )

  const handleSelect = useCallback(
    (msg: StoredMsg) => {
      const key = targetKey(msg.networkId, msg.target)
      select(key)
      loadHistory(key)
      onClose()
    },
    [select, loadHistory, onClose],
  )

  if (!open) return null

  const results = searchResults?.results ?? []

  return (
    <>
      {/* Scrim */}
      <div className="sp-scrim" aria-hidden onClick={onClose} />

      {/* Panel */}
      <div
        className="sp-panel"
        role="dialog"
        aria-modal
        aria-label="Search messages"
      >
        {/* Search bar */}
        <div className="sp-bar">
          <IconSearch />
          <input
            ref={inputRef}
            className="sp-input"
            placeholder="in:#channel from:user …"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Search query"
            autoComplete="off"
            spellCheck={false}
          />
          <span className="sp-esc" aria-hidden>
            ESC
          </span>
        </div>

        {/* Meta row — result count */}
        {searchResults && (
          <div className="sp-meta">
            <span>
              <strong>{results.length}</strong>{' '}
              {results.length === 1 ? 'message' : 'messages'} for{' '}
              <strong>&ldquo;{searchResults.query}&rdquo;</strong>
            </span>
          </div>
        )}

        {/* Results list */}
        <div className="sp-results" role="list" aria-label="Search results">
          {results.map((msg) => {
            const net = networks[msg.networkId]
            const netName = net?.name ?? `Network ${msg.networkId}`
            return (
              <Hit key={`${msg.id}-${msg.networkId}-${msg.target}`} msg={msg} networkName={netName} onSelect={handleSelect} />
            )
          })}
        </div>

        {/* Syntax hint footer */}
        <div className="sp-hint" aria-label="Search syntax hints">
          <span>
            <span className="sp-hint-k">in:</span>#channel
          </span>
          <span>
            <span className="sp-hint-k">from:</span>user
          </span>
          <span>
            <span className="sp-hint-k">before:</span>date
          </span>
          <span>
            <span className="sp-hint-k">after:</span>date
          </span>
          <span>
            <span className="sp-hint-k">has:</span>link,image,code
          </span>
          <span className="sp-hint-right">↵ jump to message</span>
        </div>
      </div>
    </>
  )
}
