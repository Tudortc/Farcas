// Numerics already represented as structured events (NAMES / TOPIC); skip to avoid duplication.
const SUPPRESS = new Set(['353', '366', '332', '333'])

/**
 * Format an inbound IRC numeric reply into a readable status-buffer line.
 * Returns null for non-numeric lines and for numerics already handled elsewhere.
 */
export function formatNumeric(rawLine: string, selfNick: string): string | null {
  let line = rawLine.trim()
  if (line.startsWith(':')) {
    const sp = line.indexOf(' ')
    if (sp === -1) return null
    line = line.slice(sp + 1)
  }
  const sp = line.indexOf(' ')
  const command = sp === -1 ? line : line.slice(0, sp)
  if (!/^\d{3}$/.test(command)) return null
  if (SUPPRESS.has(command)) return null

  const rest = sp === -1 ? '' : line.slice(sp + 1)
  let params = rest
  let trailing = ''
  if (rest.startsWith(':')) {
    trailing = rest.slice(1)
    params = ''
  } else {
    const ti = rest.indexOf(' :')
    if (ti !== -1) {
      params = rest.slice(0, ti)
      trailing = rest.slice(ti + 2)
    }
  }
  const paramList = params.split(' ').filter(Boolean)
  if (paramList[0] === selfNick) paramList.shift()
  const text = [...paramList, trailing].filter(Boolean).join(' ').trim()
  return text.length > 0 ? text : null
}
