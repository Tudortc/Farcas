import '../styles/app.css'
import { useChat } from '../store/chat-store.js'

export function MainPane() {
  const selected = useChat((s) => s.selected)
  const targets = useChat((s) => s.targets)

  const target = selected != null ? targets[selected] : null
  const isChannel = target?.kind === 'channel'
  const name = target?.target ?? null
  const topic = target?.topic ?? null

  return (
    <main className="main">
      <header className="topbar">
        <div className="ch">
          {name != null ? (
            <h1>
              {isChannel && <span className="hash">#</span>}
              {isChannel ? name.slice(1) : name}
            </h1>
          ) : (
            <h1 style={{ color: 'var(--ink-3)', fontWeight: 400 }}>bool</h1>
          )}
        </div>
        {topic && (
          <div className="topic" title={topic}>
            {topic}
          </div>
        )}
        <div className="spacer" />
      </header>

      {/* Message body — Task 4 will mount the message list here */}
      {name != null ? (
        <div
          style={{
            flex: 1,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
          id="message-pane"
        >
          {/* Message list placeholder — replaced in Task 4 */}
        </div>
      ) : (
        <div className="msgs-empty">
          <span className="symbol">#</span>
          <span>Select a channel</span>
        </div>
      )}
    </main>
  )
}
