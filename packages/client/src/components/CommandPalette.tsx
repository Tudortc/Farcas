import { useState, useEffect, useCallback } from 'react'
import {
  CommandInput,
  CommandItem,
  CommandList,
  CommandGroup,
  CommandEmpty,
  CommandRoot,
} from 'cmdk'
import { useChat } from '../store/chat-store.js'
import { useAppearance, type ThemeId } from '../theme.js'
import { useFocusRestore } from './Dialog.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  onOpenSearch?: () => void
}

// ---------------------------------------------------------------------------
// Icons (inline SVG — no extra dep)
// ---------------------------------------------------------------------------

function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

function IconDensity() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  )
}

function IconTheme() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />
    </svg>
  )
}

function IconConnect() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Keyboard shortcut hint
// ---------------------------------------------------------------------------

function Kbd({ keys }: { keys: string[] }) {
  return (
    <span className="cp-kbd" aria-hidden>
      {keys.map((k, i) => (
        <span key={i}>{k}</span>
      ))}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Global hook — Cmd/Ctrl-K toggles palette open state
// ---------------------------------------------------------------------------

export function usePaletteShortcut(): [boolean, () => void] {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Cmd/Ctrl-K toggles the palette; Cmd/Ctrl-P also opens it (and
      // suppresses the browser's print dialog, which would otherwise hijack it).
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'p')) {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const close = useCallback(() => setOpen(false), [])
  return [open, close]
}

// ---------------------------------------------------------------------------
// CommandPalette component
// ---------------------------------------------------------------------------

const THEMES: { id: ThemeId; label: string }[] = [
  { id: 'a', label: 'Direction A — Terminal-Modern' },
  { id: 'b', label: 'Direction B — Soft-Editorial' },
  { id: 'c', label: 'Direction C — Neo-Aurora' },
  { id: 'shimmer', label: 'Shimmer — Warm Dark' },
]

export function CommandPalette({ open, onClose, onOpenSearch }: CommandPaletteProps) {
  // Restore focus to the previously focused element when the palette closes
  useFocusRestore(open)

  const targets = useChat((s) => s.targets)
  const networks = useChat((s) => s.networks)
  const select = useChat((s) => s.select)
  const { density, setDensity, theme, setTheme } = useAppearance()

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    },
    [onClose],
  )

  if (!open) return null

  const channelTargets = Object.entries(targets).filter(([, t]) => t.kind === 'channel')
  const pmTargets = Object.entries(targets).filter(([, t]) => t.kind === 'pm')

  function handleSelectChannel(key: string) {
    select(key)
    onClose()
  }

  function handleToggleDensity() {
    setDensity(density === 'compact' ? 'comfortable' : 'compact')
    onClose()
  }

  function handleSwitchTheme(id: ThemeId) {
    setTheme(id)
    onClose()
  }

  function handleOpenSearch() {
    if (onOpenSearch) {
      onOpenSearch()
    } else {
      document.dispatchEvent(new CustomEvent('bool:open-search'))
    }
    onClose()
  }

  return (
    <>
      {/* Scrim */}
      <div className="cp-scrim" aria-hidden onClick={onClose} />

      {/* Palette */}
      <div className="cp-palette" role="dialog" aria-modal aria-label="Command palette">
        <CommandRoot
          className="cp-command"
          label="Command palette"
          loop
          onKeyDown={handleKeyDown}
        >
          {/* Search input row */}
          <div className="cp-search-row">
            <span className="cp-prompt" aria-hidden>›</span>
            <CommandInput
              className="cp-input"
              placeholder="Jump to a channel, DM, or run a command…"
              autoFocus
            />
            <span className="cp-esc-hint" aria-hidden>ESC</span>
          </div>

          {/* Scope chips — visual only for now, full scope filtering is a future enhancement */}
          <div className="cp-scope" role="group" aria-label="Filter scope">
            {(['All', 'Channels', 'People', 'Actions'] as const).map((chip, i) => (
              <span key={chip} className={`cp-chip${i === 0 ? ' active' : ''}`}>
                {chip}
              </span>
            ))}
          </div>

          {/* List */}
          <CommandList className="cp-list">
            <CommandEmpty className="cp-empty">No results found.</CommandEmpty>

            {/* Channels */}
            {channelTargets.length > 0 && (
              <CommandGroup heading="Channels" className="cp-group">
                {channelTargets.map(([key, t]) => {
                  const network = networks[t.networkId]
                  return (
                    <CommandItem
                      key={key}
                      value={`channel:${t.target}:${network?.name ?? ''}`}
                      onSelect={() => handleSelectChannel(key)}
                      className="cp-item"
                      keywords={[t.target, network?.name ?? '']}
                    >
                      <span className="cp-icon cp-icon-hash" aria-hidden>#</span>
                      <span className="cp-main">
                        <span className="cp-name">{t.target}</span>
                        {network && (
                          <span className="cp-sub">
                            {network.name}
                            {t.unread > 0 && ` · ${t.unread} unread`}
                          </span>
                        )}
                      </span>
                      {network && <span className="cp-net-tag">{network.name}</span>}
                      {t.unread > 0 && <span className="cp-badge">{t.unread}</span>}
                      <Kbd keys={['↵']} />
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}

            {/* People / DMs */}
            {pmTargets.length > 0 && (
              <CommandGroup heading="People" className="cp-group">
                {pmTargets.map(([key, t]) => {
                  const initial = t.target[0]?.toUpperCase() ?? '?'
                  return (
                    <CommandItem
                      key={key}
                      value={`pm:${t.target}`}
                      onSelect={() => handleSelectChannel(key)}
                      className="cp-item"
                      keywords={[t.target]}
                    >
                      <span
                        className="cp-icon cp-icon-dm"
                        aria-hidden
                        style={{ background: 'var(--blue)', color: 'var(--bg-0)' }}
                      >
                        {initial}
                      </span>
                      <span className="cp-main">
                        <span className="cp-name">{t.target}</span>
                        <span className="cp-sub">Direct message</span>
                      </span>
                      <Kbd keys={['↵']} />
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}

            {/* Networks — connect / reconnect actions */}
            {Object.values(networks).length > 0 && (
              <CommandGroup heading="Networks" className="cp-group">
                {Object.values(networks).map((net) => (
                  <CommandItem
                    key={`connect-${net.id}`}
                    value={`connect-network:${net.name}`}
                    onSelect={() => {
                      useChat.getState().connectNetwork(net.id)
                      onClose()
                    }}
                    className="cp-item"
                    keywords={[net.name, 'connect', 'network']}
                  >
                    <span className="cp-icon cp-icon-act" aria-hidden>
                      <IconConnect />
                    </span>
                    <span className="cp-main">
                      <span className="cp-name">Connect to {net.name}</span>
                      <span className="cp-sub">
                        {net.host} · {net.connected ? 'connected' : 'disconnected'}
                      </span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {/* Actions */}
            <CommandGroup heading="Actions & Commands" className="cp-group">
              {/* Search */}
              <CommandItem
                value="search-messages"
                onSelect={handleOpenSearch}
                className="cp-item"
                keywords={['search', 'find', 'messages', 'history']}
              >
                <span className="cp-icon cp-icon-act" aria-hidden>
                  <IconSearch />
                </span>
                <span className="cp-main">
                  <span className="cp-name">Search messages…</span>
                  <span className="cp-sub">Full-text search across every network</span>
                </span>
                <Kbd keys={['⌘', '⇧', 'F']} />
              </CommandItem>

              {/* Toggle density */}
              <CommandItem
                value="toggle-density"
                onSelect={handleToggleDensity}
                className="cp-item"
                keywords={['density', 'compact', 'comfortable', 'layout']}
              >
                <span className="cp-icon cp-icon-act" aria-hidden>
                  <IconDensity />
                </span>
                <span className="cp-main">
                  <span className="cp-name">Toggle density · Compact ⇄ Comfortable</span>
                  <span className="cp-sub">
                    Currently: {density === 'compact' ? 'Compact' : 'Comfortable'}
                  </span>
                </span>
                <Kbd keys={['⌘', 'D']} />
              </CommandItem>

              {/* Switch theme — one item per theme */}
              {THEMES.map((t) => (
                <CommandItem
                  key={`theme-${t.id}`}
                  value={`switch-theme-${t.id}`}
                  onSelect={() => handleSwitchTheme(t.id)}
                  className="cp-item"
                  keywords={['theme', 'appearance', t.label, t.id]}
                >
                  <span className="cp-icon cp-icon-act" aria-hidden>
                    <IconTheme />
                  </span>
                  <span className="cp-main">
                    <span className="cp-name">
                      Switch theme{theme === t.id ? ' ✓' : ''} · {t.label}
                    </span>
                    <span className="cp-sub">Appearance</span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </CommandRoot>

        {/* Footer */}
        <div className="cp-footer">
          <span>
            <span className="cp-foot-key">↑</span>
            <span className="cp-foot-key">↓</span>
            {' navigate'}
          </span>
          <span>
            <span className="cp-foot-key">↵</span>
            {' select'}
          </span>
          <span className="cp-foot-right">fuzzy · powered by cmdk</span>
        </div>
      </div>
    </>
  )
}
