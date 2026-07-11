import type { StoredMsg } from '@bool/shared'
import { parseIrcText, linkify } from './irc-format.js'

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

// ---- Body rendering ----
// Renders IRC-formatted text + linkifies URLs as React elements.
// linkify() splits into [text | url] runs (raw text, no HTML escaping).
// parseIrcText() splits text runs into styled sub-segments (raw text).
// React escapes all text content automatically — no dangerouslySetInnerHTML.

interface BodyProps {
  text: string
}

function IrcBody({ text }: BodyProps) {
  // First linkify on raw text, then parse each non-link segment for IRC codes.
  const linkSegs = linkify(text)

  return (
    <>
      {linkSegs.map((ls, li) => {
        if (ls.url) {
          return (
            <a
              key={li}
              className="link"
              href={ls.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {ls.text}
            </a>
          )
        }
        // ls.text is raw (unescaped); parseIrcText returns raw segments too.
        // React escapes seg.text when rendered as a child — no double-escaping.
        const ircSegs = parseIrcText(ls.text)
        return ircSegs.map((seg, si) => {
          const style: React.CSSProperties = {}
          if (seg.color) style.color = seg.color
          if (seg.bg) style.backgroundColor = seg.bg
          if (seg.bold) style.fontWeight = 700
          if (seg.italic) style.fontStyle = 'italic'
          if (seg.underline) style.textDecoration = 'underline'
          return (
            <span
              key={`${li}-${si}`}
              style={Object.keys(style).length > 0 ? style : undefined}
            >
              {seg.text}
            </span>
          )
        })
      })}
    </>
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
            <div className="text" style={{ fontStyle: 'italic', color: 'var(--ink-1)' }}>
              * <span style={{ color: nickColor }}>{msg.sender}</span>{' '}
              <IrcBody text={msg.body} />
            </div>
          </div>
        </div>
      )
    }
    return (
      <div className="msg">
        <div className="gutter">{time}</div>
        <div className="body">
          <div className="text" style={{ fontStyle: 'italic', color: 'var(--ink-1)' }}>
            * <span style={{ color: nickColor }}>{msg.sender}</span>{' '}
            <IrcBody text={msg.body} />
          </div>
        </div>
      </div>
    )
  }

  if (msg.kind === 'notice') {
    if (grouped) {
      return (
        <div className="cont">
          <div className="gutter">{time}</div>
          <div className="body">
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
          </div>
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
        </div>
      </div>
    )
  }

  // Default: regular privmsg
  if (grouped) {
    return (
      <div className="cont">
        <div className="gutter">{time}</div>
        <div className="body">
          <div className="text">
            <IrcBody text={msg.body} />
          </div>
        </div>
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
        <div className="text">
          <IrcBody text={msg.body} />
        </div>
      </div>
    </div>
  )
}
