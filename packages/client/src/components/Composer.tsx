import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { useChat } from '../store/chat-store.js'

const REPLY_SNIPPET_MAX = 60

function truncate(text: string): string {
  if (text.length <= REPLY_SNIPPET_MAX) return text
  return text.slice(0, REPLY_SNIPPET_MAX) + '…'
}

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

const THROTTLE_MS = 2000
const IDLE_MS = 5000

export function Composer({ onSend, placeholder = 'Message · / for commands' }: ComposerProps) {
  const [value, setValue] = useState('')
  const [selectedHint, setSelectedHint] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Typing indicator state
  const selected = useChat((s) => s.selected)
  const setTyping = useChat((s) => s.setTyping)
  const lastTypingSentRef = useRef<number>(0)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reply state
  const replyingTo = useChat((s) => s.replyingTo)
  const setReplyTarget = useChat((s) => s.setReplyTarget)
  const sendReply = useChat((s) => s.sendReply)
  const messages = useChat((s) => s.messages)

  // Look up the message being replied to for the chip preview
  const replyMsg = replyingTo && selected
    ? (messages[selected] ?? []).find((m) => m.msgid === replyingTo) ?? null
    : null

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (idleTimerRef.current != null) clearTimeout(idleTimerRef.current)
    }
  }, [])

  function dispatchTypingDone() {
    if (selected) setTyping(selected, 'done')
    lastTypingSentRef.current = 0
  }

  function handleTypingActive() {
    if (!selected) return
    const now = Date.now()
    if (now - lastTypingSentRef.current >= THROTTLE_MS) {
      setTyping(selected, 'active')
      lastTypingSentRef.current = now
    }
    // Reset the idle timer
    if (idleTimerRef.current != null) clearTimeout(idleTimerRef.current)
    idleTimerRef.current = setTimeout(dispatchTypingDone, IDLE_MS)
  }

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
      if (replyingTo) {
        sendReply(trimmed, replyingTo)
        setReplyTarget(null)
      } else {
        onSend(trimmed)
      }
      setValue('')
      setSelectedHint(0)
      // Clear idle timer and send done immediately on send
      if (idleTimerRef.current != null) {
        clearTimeout(idleTimerRef.current)
        idleTimerRef.current = null
      }
      dispatchTypingDone()
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
      {replyingTo && (
        <div className="reply-chip" aria-label="Replying to message">
          <span className="reply-chip-label">
            ↩ Replying to{' '}
            {replyMsg ? (
              <>
                <strong>{replyMsg.sender}</strong>
                {': '}
                {truncate(replyMsg.body)}
              </>
            ) : (
              <em>(message)</em>
            )}
          </span>
          <button
            type="button"
            className="reply-chip-cancel"
            aria-label="Cancel reply"
            onClick={() => setReplyTarget(null)}
          >
            ✕
          </button>
        </div>
      )}

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
            if (e.target.value.trim()) handleTypingActive()
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
