import { useState } from 'react'
import { useChat } from '../store/chat-store.js'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface NetworkSettingsProps {
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Field style helpers (CSS vars only)
// ---------------------------------------------------------------------------

const fieldStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  marginBottom: 12,
}

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 11,
  color: 'var(--ink-1)',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
}

const inputStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 13,
  color: 'var(--ink-0)',
  background: 'var(--bg-3)',
  border: '1px solid var(--line-2)',
  borderRadius: 'var(--radius-sm)',
  padding: '6px 9px',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}

const checkRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 12,
}

const sectionHeadStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 11,
  color: 'var(--ink-2)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  marginBottom: 8,
  marginTop: 4,
  borderBottom: '1px solid var(--line)',
  paddingBottom: 6,
}

const netRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 10px',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--bg-3)',
  border: '1px solid var(--line)',
  marginBottom: 6,
}

const btnStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 12,
  padding: '4px 10px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--line-2)',
  cursor: 'pointer',
  background: 'none',
  color: 'var(--ink-1)',
}

const submitBtnStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 13,
  fontWeight: 600,
  padding: '8px 18px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--green)',
  cursor: 'pointer',
  background: 'var(--green)',
  color: 'var(--on-accent)',
  marginTop: 8,
}

// ---------------------------------------------------------------------------
// NetworkSettings
// ---------------------------------------------------------------------------

export function NetworkSettings({ onClose }: NetworkSettingsProps) {
  const networks = useChat((s) => s.networks)

  // Form state
  const [name, setName] = useState('')
  const [host, setHost] = useState('')
  const [port, setPort] = useState(6697)
  const [tls, setTls] = useState(true)
  const [nick, setNick] = useState('')
  const [username, setUsername] = useState('')
  const [realname, setRealname] = useState('')
  const [saslAccount, setSaslAccount] = useState('')
  const [saslPassword, setSaslPassword] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const input: {
      name: string
      host: string
      port: number
      tls: boolean
      nick: string
      username?: string
      realname?: string
      saslAccount?: string
      saslPassword?: string
    } = {
      name: name.trim(),
      host: host.trim(),
      port,
      tls,
      nick: nick.trim(),
    }
    if (username.trim()) input.username = username.trim()
    if (realname.trim()) input.realname = realname.trim()
    if (saslAccount.trim()) input.saslAccount = saslAccount.trim()
    if (saslPassword) input.saslPassword = saslPassword

    useChat.getState().addNetwork(input)
    onClose()
  }

  const networkList = Object.values(networks)

  return (
    <div>
      {/* Add Network Form */}
      <form onSubmit={handleSubmit}>
        <div style={fieldStyle}>
          <label htmlFor="ns-name" style={labelStyle}>Name</label>
          <input
            id="ns-name"
            style={inputStyle}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Libera.Chat"
            required
            autoComplete="off"
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 10 }}>
          <div style={fieldStyle}>
            <label htmlFor="ns-host" style={labelStyle}>Host</label>
            <input
              id="ns-host"
              style={inputStyle}
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="irc.libera.chat"
              required
              autoComplete="off"
            />
          </div>
          <div style={fieldStyle}>
            <label htmlFor="ns-port" style={labelStyle}>Port</label>
            <input
              id="ns-port"
              style={inputStyle}
              type="number"
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              min={1}
              max={65535}
              required
            />
          </div>
        </div>

        <div style={checkRowStyle}>
          <input
            id="ns-tls"
            type="checkbox"
            checked={tls}
            onChange={(e) => setTls(e.target.checked)}
          />
          <label htmlFor="ns-tls" style={{ ...labelStyle, textTransform: 'none', fontSize: 13, color: 'var(--ink-0)' }}>
            TLS (recommended)
          </label>
        </div>

        <div style={fieldStyle}>
          <label htmlFor="ns-nick" style={labelStyle}>Nick</label>
          <input
            id="ns-nick"
            style={inputStyle}
            type="text"
            value={nick}
            onChange={(e) => setNick(e.target.value)}
            placeholder="yournick"
            required
            autoComplete="off"
          />
        </div>

        <div style={fieldStyle}>
          <label htmlFor="ns-username" style={labelStyle}>Username <span style={{ color: 'var(--ink-3)' }}>(optional)</span></label>
          <input
            id="ns-username"
            style={inputStyle}
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="same as nick"
            autoComplete="off"
          />
        </div>

        <div style={fieldStyle}>
          <label htmlFor="ns-realname" style={labelStyle}>Realname <span style={{ color: 'var(--ink-3)' }}>(optional)</span></label>
          <input
            id="ns-realname"
            style={inputStyle}
            type="text"
            value={realname}
            onChange={(e) => setRealname(e.target.value)}
            placeholder="Your Name"
            autoComplete="off"
          />
        </div>

        <div style={fieldStyle}>
          <label htmlFor="ns-sasl-account" style={labelStyle}>SASL Account <span style={{ color: 'var(--ink-3)' }}>(optional)</span></label>
          <input
            id="ns-sasl-account"
            style={inputStyle}
            type="text"
            value={saslAccount}
            onChange={(e) => setSaslAccount(e.target.value)}
            placeholder="account name"
            autoComplete="off"
          />
        </div>

        <div style={fieldStyle}>
          <label htmlFor="ns-sasl-password" style={labelStyle}>SASL Password <span style={{ color: 'var(--ink-3)' }}>(optional)</span></label>
          <input
            id="ns-sasl-password"
            style={inputStyle}
            type="password"
            value={saslPassword}
            onChange={(e) => setSaslPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
          />
        </div>

        <button type="submit" style={submitBtnStyle} aria-label="Add network">
          Add Network
        </button>
      </form>

      {/* Existing networks */}
      {networkList.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={sectionHeadStyle}>Existing Networks</div>
          {networkList.map((net) => (
            <div key={net.id} style={netRowStyle}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: net.connected ? 'var(--green)' : 'var(--ink-3)',
                  flexShrink: 0,
                }}
                aria-hidden
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--ink-0)', fontWeight: 600 }}>
                  {net.name}
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-2)' }}>
                  {net.host}
                </div>
              </div>
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 11,
                  color: net.connected ? 'var(--green)' : 'var(--ink-3)',
                  marginRight: 8,
                }}
              >
                {net.connected ? 'Connected' : 'Disconnected'}
              </span>
              {!net.connected && (
                <button
                  type="button"
                  style={btnStyle}
                  aria-label={`Connect to ${net.name}`}
                  onClick={() => useChat.getState().connectNetwork(net.id)}
                >
                  Connect
                </button>
              )}
              <button
                type="button"
                style={{ ...btnStyle, color: 'var(--red)', borderColor: 'var(--red)' }}
                aria-label={`Remove ${net.name}`}
                onClick={() => useChat.getState().removeNetwork(net.id)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
