/** Truncate `s` to at most `max` characters, appending '…' if truncated. */
export function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max) + '…'
}
