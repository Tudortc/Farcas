import '../styles/app.css'
import { useState } from 'react'
import { useChat } from '../store/chat-store.js'
import { MessageList } from './MessageList.js'
import { Composer } from './Composer.js'
import { AppearanceMenu } from './AppearanceMenu.js'

export function MainPane() {
  const selected = useChat((s) => s.selected)
  const targets = useChat((s) => s.targets)
  const send = useChat((s) => s.send)
  const [showAppearance, setShowAppearance] = useState(false)

  const target = selected != null ? targets[selected] : null
  const isChannel = target?.kind === 'channel'
  const name = target?.target ?? null
  const topic = target?.topic ?? null
  const memberCount = target?.names?.length ?? null

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
        {memberCount != null && (
          <div className="topbar-stat" title={`${memberCount} members`}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--ink-2)' }}>
              <b style={{ color: 'var(--ink-0)', fontWeight: 500 }}>{memberCount}</b> online
            </span>
          </div>
        )}
        <button
          type="button"
          className="tb-btn"
          title="Appearance (theme / density)"
          aria-label="Appearance settings"
          aria-expanded={showAppearance}
          onClick={() => setShowAppearance((v) => !v)}
        >
          {/* Half-moon icon for theme */}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />
          </svg>
        </button>
      </header>

      {showAppearance && (
        <div className="appearance-popup" role="dialog" aria-label="Appearance settings">
          <AppearanceMenu />
        </div>
      )}


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
          <MessageList />
          <Composer onSend={send} placeholder={`Message ${name} · / for commands`} />
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
