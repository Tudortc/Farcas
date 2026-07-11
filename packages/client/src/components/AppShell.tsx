import '../styles/app.css'
import { useState, useEffect, useCallback } from 'react'
import { useChat } from '../store/chat-store.js'
import { Sidebar } from './Sidebar.js'
import { MainPane } from './MainPane.js'
import { CommandPalette, usePaletteShortcut } from './CommandPalette.js'
import { SearchPanel } from './SearchPanel.js'

/** Connection status dot — driven by useChat().connection */
function ConnDot() {
  const connection = useChat((s) => s.connection)
  return (
    <span
      className={`conn-dot${connection === 'open' ? ' open' : connection === 'connecting' ? ' connecting' : ''}`}
      title={connection}
      aria-label={`Connection: ${connection}`}
    />
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

  return (
    <div className="app">
      {/* Global Cmd-K command palette */}
      <CommandPalette open={paletteOpen} onClose={closePalette} />

      {/* Global Cmd-Shift-F / bool:open-search search panel */}
      <SearchPanel open={searchOpen} onClose={closeSearch} />

      {/* Sidebar renders the rail + channel sidebar as two grid columns */}
      <Sidebar />

      {/* Center message pane */}
      <MainPane />

      {/* Right member pane — placeholder for Task 5 */}
      <aside className="members" aria-label="Members">
        <div
          style={{
            padding: '11px 12px',
            borderBottom: '1px solid var(--line)',
            fontFamily: 'var(--mono)',
            fontSize: '11px',
            letterSpacing: '1px',
            textTransform: 'uppercase',
            color: 'var(--ink-2)',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>Members</span>
          <ConnDot />
        </div>
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--ink-3)',
            fontFamily: 'var(--mono)',
            fontSize: '12px',
          }}
        >
          {/* member list mounts here in Task 5 */}
        </div>
      </aside>
    </div>
  )
}
