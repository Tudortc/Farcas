import '../styles/app.css'
import { useChat } from '../store/chat-store.js'
import { Sidebar } from './Sidebar.js'
import { MainPane } from './MainPane.js'

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

export function AppShell() {
  return (
    <div className="app">
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
