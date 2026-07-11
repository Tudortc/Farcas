import { parseIrcText, linkify } from './irc-format.js'

// Renders IRC-formatted text + linkifies URLs as React elements.
// linkify() splits into [text | url] runs (raw text, no HTML escaping).
// parseIrcText() splits text runs into styled sub-segments (raw text).
// React escapes all text content automatically — no dangerouslySetInnerHTML.

interface IrcBodyProps {
  text: string
}

export function IrcBody({ text }: IrcBodyProps) {
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
