import { useState, useRef, type KeyboardEvent } from 'react'

interface SlashCommand {
  cmd: string
  desc: string
  args: string
}

const SLASH_COMMANDS: SlashCommand[] = [
  { cmd: '/join', desc: 'Join a channel', args: '<channel>' },
  { cmd: '/part', desc: 'Leave the current channel', args: '[reason]' },
  { cmd: '/msg', desc: 'Open a private message with a user', args: '<nick> <text>' },
  { cmd: '/me', desc: 'Send an action message to the channel', args: '<action>' },
  { cmd: '/nick', desc: 'Change your nickname', args: '<newnick>' },
  { cmd: '/mode', desc: 'Set channel or user modes', args: '<target> <flags>' },
  { cmd: '/topic', desc: 'Set or view the channel topic', args: '[topic]' },
  { cmd: '/whois', desc: 'Get info about a user', args: '<nick>' },
  { cmd: '/kick', desc: 'Kick a user from the channel', args: '<nick> [reason]' },
  { cmd: '/list', desc: 'List available channels', args: '' },
]

interface ComposerProps {
  onSend: (text: string) => void
  placeholder?: string
}

export function Composer({ onSend, placeholder = 'Message · / for commands' }: ComposerProps) {
  const [value, setValue] = useState('')
  const [selectedHint, setSelectedHint] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const showHints = value.startsWith('/')
  const hintFilter = value.toLowerCase()
  const matchedCommands = showHints
    ? SLASH_COMMANDS.filter((c) => c.cmd.startsWith(hintFilter))
    : []

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const trimmed = value.trim()
      if (!trimmed) return
      onSend(trimmed)
      setValue('')
      setSelectedHint(0)
    }
    if (e.key === 'ArrowUp' && showHints && matchedCommands.length > 0) {
      e.preventDefault()
      setSelectedHint((s) => Math.max(0, s - 1))
    }
    if (e.key === 'ArrowDown' && showHints && matchedCommands.length > 0) {
      e.preventDefault()
      setSelectedHint((s) => Math.min(matchedCommands.length - 1, s + 1))
    }
    if (e.key === 'Tab' && showHints && matchedCommands.length > 0) {
      e.preventDefault()
      const cmd = matchedCommands[selectedHint]
      if (cmd) {
        setValue(cmd.cmd + ' ')
      }
    }
    if (e.key === 'Escape' && showHints) {
      setValue('')
    }
  }

  function handleHintClick(cmd: SlashCommand) {
    setValue(cmd.cmd + ' ')
    textareaRef.current?.focus()
  }

  return (
    <div className="composer">
      {showHints && matchedCommands.length > 0 && (
        <div className="autocomplete" role="listbox" aria-label="Slash commands">
          <div className="ac-h">
            Slash commands — matching &ldquo;{value}&rdquo;
          </div>
          {matchedCommands.map((c, i) => (
            <div
              key={c.cmd}
              role="option"
              aria-selected={i === selectedHint}
              className={`ac-item${i === selectedHint ? ' sel' : ''}`}
              onClick={() => handleHintClick(c)}
            >
              <span className="cmd">{c.cmd}</span>
              <span className="desc">{c.desc}</span>
              {c.args && <span className="args">{c.args}</span>}
            </div>
          ))}
        </div>
      )}

      <div className="input-wrap">
        <span className="prompt" aria-hidden="true">›</span>
        <textarea
          ref={textareaRef}
          className="field"
          role="textbox"
          aria-label="Message input"
          aria-multiline="true"
          placeholder={placeholder}
          value={value}
          rows={1}
          onChange={(e) => {
            setValue(e.target.value)
            setSelectedHint(0)
          }}
          onKeyDown={handleKeyDown}
          style={{
            resize: 'none',
            background: 'none',
            border: 'none',
            outline: 'none',
            flex: 1,
            color: 'var(--ink-0)',
            fontSize: 'var(--msg-fs)',
            lineHeight: 1.4,
            fontFamily: 'var(--sans)',
            minHeight: '20px',
          }}
        />
      </div>

      <div className="comp-foot">
        <span>
          <span className="k">↵</span> send
        </span>
        <span>
          <span className="k">⇧↵</span> newline
        </span>
        <span>
          <span className="k">/</span> commands
        </span>
      </div>
    </div>
  )
}
