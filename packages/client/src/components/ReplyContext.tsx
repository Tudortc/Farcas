import { useChat } from '../store/chat-store.js'
import { truncate } from '../utils/truncate.js'

const SNIPPET_MAX = 80

export interface ReplyContextProps {
  replyTo: string
}

export function ReplyContext({ replyTo }: ReplyContextProps) {
  const selected = useChat((s) => s.selected)
  const messages = useChat((s) => s.messages)

  const msgs = selected ? (messages[selected] ?? []) : []
  const referenced = msgs.find((m) => m.msgid === replyTo)

  if (!referenced) {
    return (
      <div
        className="reply-ctx"
        aria-label="Reply context"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: 'var(--meta-fs)',
          color: 'var(--ink-3)',
          marginBottom: '1px',
          paddingLeft: '2px',
        }}
      >
        <span aria-hidden="true">↳</span>
        <span style={{ fontStyle: 'italic' }}>(message)</span>
      </div>
    )
  }

  const snippet = truncate(referenced.body, SNIPPET_MAX)

  return (
    <div
      className="reply-ctx"
      aria-label="Reply context"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: 'var(--meta-fs)',
        color: 'var(--ink-2)',
        marginBottom: '1px',
        paddingLeft: '2px',
        borderLeft: '2px solid var(--line-2)',
        paddingRight: '4px',
      }}
    >
      <span aria-hidden="true">↳</span>
      <span
        style={{ color: 'var(--ink-1)', fontWeight: 500 }}
      >
        {referenced.sender}
      </span>
      <span>:</span>
      <span
        style={{
          color: 'var(--ink-2)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {snippet}
      </span>
    </div>
  )
}
