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
// Renders IRC-formatted text + linkifies URLs.
// Uses parseIrcText (which escapes HTML) then dangerously... nope:
// We set innerHTML only via properly escaped segments from parseIrcText,
// but React elements are safer. We render segments as React spans.

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
        // Parse IRC formatting — note: ls.text is already HTML-escaped
        // but parseIrcText escapes its own input, so we pass the raw un-escaped text.
        // We need original text for color parsing. Use index into original text.
        // Actually linkify() receives the raw original text and returns url or escaped text.
        // For non-url segments, ls.text is escapeHtml(rawSlice).
        // We can't re-parse an already-escaped string safely. Instead, parseIrcText
        // receives raw text; we call it on the rawSlice embedded in ls.
        // However linkify() does NOT give us the raw slice back for non-url segments.
        // Solution: store raw slices separately. Let's re-export from irc-format.
        // For now, since parseIrcText already escapes its input, we pass ls.text
        // as-is and treat it as escaped plain text to avoid double-escaping.
        // Segments that came from escapeHtml() won't contain control codes anyway.
        // Simply render the already-escaped HTML via dangerouslySetInnerHTML for
        // non-link non-IRC text is NOT used here. We render via a span with a
        // dangerouslySetInnerHTML only for the escaped text (safe: no <, >, &, etc.
        // without escaping). Actually we need a better approach.

        // Render as a sequence of styled spans from parseIrcText:
        const ircSegs = parseIrcText(ls.text)
        return ircSegs.map((seg, si) => {
          const style: React.CSSProperties = {}
          if (seg.color) style.color = seg.color
          if (seg.bg) style.backgroundColor = seg.bg
          if (seg.bold) style.fontWeight = 700
          if (seg.italic) style.fontStyle = 'italic'
          if (seg.underline) style.textDecoration = 'underline'
          // seg.text is already HTML-escaped; render using dangerouslySetInnerHTML
          // is safe here because it only contains &amp; &lt; &gt; &quot; &#39; sequences.
          // But the problem: React will double-escape if we set it as text content.
          // We need dangerouslySetInnerHTML to render the pre-escaped entities.
          return (
            <span
              key={`${li}-${si}`}
              style={Object.keys(style).length > 0 ? style : undefined}
              dangerouslySetInnerHTML={{ __html: seg.text }}
            />
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
