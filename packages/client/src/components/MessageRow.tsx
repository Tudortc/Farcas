import type { StoredMsg } from '@bool/shared'
import { IrcBody } from './IrcBody.js'
import { Reactions } from './Reactions.js'
import { ReplyContext } from './ReplyContext.js'
import { useChat } from '../store/chat-store.js'

// ---- Nick color hashing ----
// Deterministically map a nick to one of the --m-* palette variables.
const NICK_PALETTE = [
  'var(--m-blue)',
  'var(--m-green)',
  'var(--m-cyan)',
  'var(--m-magenta)',
  'var(--m-red)',
  'var(--m-yellow)',
  'var(--m-orange)',
]

function hashNick(nick: string): string {
  let h = 0
  for (let j = 0; j < nick.length; j++) {
    h = ((h << 5) - h + nick.charCodeAt(j)) | 0
  }
  return NICK_PALETTE[Math.abs(h) % NICK_PALETTE.length]!
}

// Format ts (epoch ms) as HH:MM
function formatTime(ts: number): string {
  const d = new Date(ts)
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  return `${h}:${m}`
}

// ---- ReplyButton ----

interface ReplyButtonProps {
  msgid: string
}

function ReplyButton({ msgid }: ReplyButtonProps) {
  const setReplyTarget = useChat((s) => s.setReplyTarget)
  return (
    <button
      aria-label="Reply"
      className="reply-btn"
      onClick={() => setReplyTarget(msgid)}
      style={{
        display: 'none', // shown via .msg:hover .reply-btn / .cont:hover .reply-btn in CSS
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1px 6px',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--line-2)',
        background: 'var(--bg-3)',
        color: 'var(--ink-2)',
        fontSize: 'var(--meta-fs)',
        fontFamily: 'var(--sans)',
        cursor: 'pointer',
        lineHeight: 1.4,
        flexShrink: 0,
      }}
    >
      ↩ Reply
    </button>
  )
}

// ---- MessageRow ----

export interface MessageRowProps {
  msg: StoredMsg
  /** When true, this is a consecutive message from the same sender; hide nick/meta */
  grouped?: boolean
}

export function MessageRow({ msg, grouped }: MessageRowProps) {
  const time = formatTime(msg.ts)
  const nickColor = hashNick(msg.sender)

  if (msg.kind === 'action') {
    if (grouped) {
      return (
        <div className="cont">
          <div className="gutter">{time}</div>
          <div className="body">
            {msg.replyTo && <ReplyContext replyTo={msg.replyTo} />}
            <div className="text" style={{ fontStyle: 'italic', color: 'var(--ink-1)' }}>
              * <span style={{ color: nickColor }}>{msg.sender}</span>{' '}
              <IrcBody text={msg.body} />
            </div>
            {msg.msgid && <Reactions msgid={msg.msgid} />}
          </div>
          {msg.msgid && <ReplyButton msgid={msg.msgid} />}
        </div>
      )
    }
    return (
      <div className="msg">
        <div className="gutter">{time}</div>
        <div className="body">
          {msg.replyTo && <ReplyContext replyTo={msg.replyTo} />}
          <div className="text" style={{ fontStyle: 'italic', color: 'var(--ink-1)' }}>
            * <span style={{ color: nickColor }}>{msg.sender}</span>{' '}
            <IrcBody text={msg.body} />
          </div>
          {msg.msgid && <Reactions msgid={msg.msgid} />}
        </div>
        {msg.msgid && <ReplyButton msgid={msg.msgid} />}
      </div>
    )
  }

  if (msg.kind === 'notice') {
    if (grouped) {
      return (
        <div className="cont">
          <div className="gutter">{time}</div>
          <div className="body">
            {msg.replyTo && <ReplyContext replyTo={msg.replyTo} />}
            <div
              className="text"
              style={{
                color: 'var(--ink-2)',
                fontStyle: 'italic',
                borderLeft: '2px solid var(--line-2)',
                paddingLeft: '8px',
              }}
            >
              <IrcBody text={msg.body} />
            </div>
            {msg.msgid && <Reactions msgid={msg.msgid} />}
          </div>
          {msg.msgid && <ReplyButton msgid={msg.msgid} />}
        </div>
      )
    }
    return (
      <div className="msg">
        <div className="gutter">{time}</div>
        <div className="body">
          <div className="msg-head">
            <span className="nick" style={{ color: 'var(--ink-2)' }}>
              -{msg.sender}-
            </span>
          </div>
          {msg.replyTo && <ReplyContext replyTo={msg.replyTo} />}
          <div
            className="text"
            style={{
              color: 'var(--ink-2)',
              fontStyle: 'italic',
              borderLeft: '2px solid var(--line-2)',
              paddingLeft: '8px',
            }}
          >
            <IrcBody text={msg.body} />
          </div>
          {msg.msgid && <Reactions msgid={msg.msgid} />}
        </div>
        {msg.msgid && <ReplyButton msgid={msg.msgid} />}
      </div>
    )
  }

  // Default: regular privmsg
  if (grouped) {
    return (
      <div className="cont">
        <div className="gutter">{time}</div>
        <div className="body">
          {msg.replyTo && <ReplyContext replyTo={msg.replyTo} />}
          <div className="text">
            <IrcBody text={msg.body} />
          </div>
          {msg.msgid && <Reactions msgid={msg.msgid} />}
        </div>
        {msg.msgid && <ReplyButton msgid={msg.msgid} />}
      </div>
    )
  }

  return (
    <div className="msg">
      <div className="gutter">{time}</div>
      <div className="body">
        <div className="msg-head">
          <span className="nick" style={{ color: nickColor }}>
            {msg.sender}
          </span>
        </div>
        {msg.replyTo && <ReplyContext replyTo={msg.replyTo} />}
        <div className="text">
          <IrcBody text={msg.body} />
        </div>
        {msg.msgid && <Reactions msgid={msg.msgid} />}
      </div>
      {msg.msgid && <ReplyButton msgid={msg.msgid} />}
    </div>
  )
}
