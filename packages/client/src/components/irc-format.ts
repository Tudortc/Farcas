/**
 * irc-format.ts — mIRC formatting parser + URL linkifier.
 *
 * Returns raw text segments (no HTML escaping); render as React elements.
 * React escapes text content automatically — never use dangerouslySetInnerHTML.
 */

import LinkifyIt from 'linkify-it'

// ---- mIRC color map ----
// Maps mIRC color numbers (0–15) to CSS variables from tokens.css.
// Numbers beyond 7 reuse or fall back to nearest match in our palette.
const MIRC_COLOR: Record<number, string> = {
  0: 'var(--ink-0)',        // white → primary text
  1: 'var(--ink-3)',        // black → faint (on dark bg)
  2: 'var(--m-blue)',       // navy blue
  3: 'var(--m-green)',      // green
  4: 'var(--m-red)',        // red
  5: 'var(--red)',          // maroon → red
  6: 'var(--m-magenta)',    // purple → magenta
  7: 'var(--m-orange)',     // olive → orange
  8: 'var(--m-yellow)',     // yellow → yellow
  9: 'var(--m-green)',      // lime green
  10: 'var(--m-cyan)',      // teal → cyan
  11: 'var(--cyan)',        // aqua
  12: 'var(--m-blue)',      // blue
  13: 'var(--m-magenta)',   // fuchsia/pink
  14: 'var(--ink-2)',       // grey
  15: 'var(--ink-1)',       // light grey → secondary
}

// ---- Segment types ----

export interface IrcTextSegment {
  text: string
  color?: string
  bg?: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
}

export interface LinkSegment {
  text: string
  url?: string
}

// ---- parseIrcText ----

/**
 * Parse a raw IRC message body containing mIRC control codes.
 * Returns an array of segments with RAW (unescaped) text.
 * Control codes are stripped from the text content.
 * Render each segment as a React element — React escapes the text.
 */
export function parseIrcText(body: string): IrcTextSegment[] {
  const segments: IrcTextSegment[] = []
  let i = 0
  let color: string | undefined
  let bg: string | undefined
  let bold = false
  let italic = false
  let underline = false
  let buf = ''

  function flush() {
    if (buf.length > 0) {
      const seg: IrcTextSegment = { text: buf }
      if (color) seg.color = color
      if (bg) seg.bg = bg
      if (bold) seg.bold = true
      if (italic) seg.italic = true
      if (underline) seg.underline = true
      segments.push(seg)
      buf = ''
    }
  }

  while (i < body.length) {
    const ch = body[i]!

    if (ch === '\x03') {
      // mIRC color code: \x03[fg[,bg]]
      flush()
      i++
      // Try to parse fg number (1 or 2 digits)
      const numStart = i
      while (i < body.length && i - numStart < 2 && body[i]! >= '0' && body[i]! <= '9') {
        i++
      }
      if (i > numStart) {
        const fgNum = parseInt(body.slice(numStart, i), 10)
        color = MIRC_COLOR[fgNum] ?? 'var(--ink-0)'
        // Optional bg: ,DD
        if (body[i] === ',') {
          i++ // skip comma
          const bgStart = i
          while (i < body.length && i - bgStart < 2 && body[i]! >= '0' && body[i]! <= '9') {
            i++
          }
          if (i > bgStart) {
            const bgNum = parseInt(body.slice(bgStart, i), 10)
            bg = MIRC_COLOR[bgNum]
          }
        }
      } else {
        // \x03 with no numbers = reset color
        color = undefined
        bg = undefined
      }
    } else if (ch === '\x02') {
      // Bold toggle
      flush()
      bold = !bold
      i++
    } else if (ch === '\x1d') {
      // Italic toggle
      flush()
      italic = !italic
      i++
    } else if (ch === '\x1f') {
      // Underline toggle
      flush()
      underline = !underline
      i++
    } else if (ch === '\x0f') {
      // Reset all formatting
      flush()
      color = undefined
      bg = undefined
      bold = false
      italic = false
      underline = false
      i++
    } else {
      buf += ch
      i++
    }
  }

  flush()
  return segments
}

// ---- linkify ----

const linkifier = new LinkifyIt()

// Safe URL schemes — only these are linkified; javascript: and others are rendered as text
const SAFE_SCHEMES = /^(https?|ftp|mailto):/i

/**
 * Split a plain text string into text + URL segments.
 * Returns RAW (unescaped) text; render as React elements so React handles escaping.
 * Only http/https/ftp/mailto URLs are linkified; javascript: and other schemes are
 * left as plain text.
 */
export function linkify(text: string): LinkSegment[] {
  const matches = linkifier.match(text)
  if (!matches || matches.length === 0) {
    return [{ text }]
  }

  const result: LinkSegment[] = []
  let last = 0

  for (const match of matches) {
    if (match.index > last) {
      result.push({ text: text.slice(last, match.index) })
    }
    // Only emit a url for safe schemes; otherwise treat as plain text
    if (SAFE_SCHEMES.test(match.url)) {
      result.push({ text: match.text, url: match.url })
    } else {
      result.push({ text: match.text })
    }
    last = match.lastIndex
  }

  if (last < text.length) {
    result.push({ text: text.slice(last) })
  }

  return result
}
