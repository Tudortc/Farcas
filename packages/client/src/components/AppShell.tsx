import '../styles/app.css'
import { useState, useEffect, useCallback } from 'react'
import { useChat } from '../store/chat-store.js'
import { Sidebar } from './Sidebar.js'
import { MainPane } from './MainPane.js'
import { CommandPalette, usePaletteShortcut } from './CommandPalette.js'
import { SearchPanel } from './SearchPanel.js'
import { MemberList } from './MemberList.js'
import { Dialog } from './Dialog.js'
import { NetworkSettings } from './NetworkSettings.js'

/** Dismissible error banner for net:error messages */
function ErrorBanner() {
  const lastError = useChat((s) => s.lastError)
  const [dismissed, setDismissed] = useState<typeof lastError>(null)

  if (!lastError || lastError === dismissed) return null

  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        top: 8,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        background: 'var(--bg-3)',
        border: '1px solid var(--red)',
        borderRadius: 'var(--radius)',
        padding: '8px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        fontFamily: 'var(--mono)',
        fontSize: 12,
        color: 'var(--red)',
        boxShadow: '0 4px 20px -4px rgba(0,0,0,0.5)',
        maxWidth: 'min(600px, 90vw)',
      }}
    >
      <span style={{ flex: 1 }}>Network error: {lastError.message}</span>
      <button
        type="button"
        aria-label="Dismiss error"
        onClick={() => setDismissed(lastError)}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--ink-2)',
          cursor: 'pointer',
          fontFamily: 'var(--mono)',
          fontSize: 13,
          padding: '0 2px',
          lineHeight: 1,
        }}
      >
        ✕
      </button>
    </div>
  )
}

/** Hook: Cmd/Ctrl-Shift-F and bool:open-search event open the search panel */
function useSearchShortcut(): [boolean, () => void] {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'F') {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    function onOpenSearch() {
      setOpen(true)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('bool:open-search', onOpenSearch)
    // Also listen on document for compatibility with CommandPalette which dispatches on document
    document.addEventListener('bool:open-search', onOpenSearch)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('bool:open-search', onOpenSearch)
      document.removeEventListener('bool:open-search', onOpenSearch)
    }
  }, [])

  const close = useCallback(() => setOpen(false), [])
  return [open, close]
}

export function AppShell() {
  const [paletteOpen, closePalette] = usePaletteShortcut()
  const [searchOpen, closeSearch] = useSearchShortcut()
  const [networkSettingsOpen, setNetworkSettingsOpen] = useState(false)

  const openNetworkSettings = useCallback(() => setNetworkSettingsOpen(true), [])
  const closeNetworkSettings = useCallback(() => setNetworkSettingsOpen(false), [])

  return (
    <div className="app">
      {/* Net error banner */}
      <ErrorBanner />

      {/* Global Cmd-K command palette */}
      <CommandPalette open={paletteOpen} onClose={closePalette} />

      {/* Global Cmd-Shift-F / bool:open-search search panel */}
      <SearchPanel open={searchOpen} onClose={closeSearch} />

      {/* Network settings dialog */}
      <Dialog open={networkSettingsOpen} onClose={closeNetworkSettings} title="Network Settings">
        <NetworkSettings onClose={closeNetworkSettings} />
      </Dialog>

      {/* Sidebar renders the rail + channel sidebar as two grid columns */}
      <Sidebar onOpenNetworkSettings={openNetworkSettings} />

      {/* Center message pane */}
      <MainPane />

      {/* Right member pane */}
      <aside className="members" aria-label="Members">
        <MemberList />
      </aside>
    </div>
  )
}
