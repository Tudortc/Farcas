import { pruneOlderThan } from './messages.js'

const DAY_MS = 86_400_000

export function retentionDays(): number {
  const n = Number.parseInt(process.env.BOOL_RETENTION_DAYS ?? '', 10)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function runRetention(now: number): number {
  const days = retentionDays()
  if (days <= 0) return 0
  return pruneOlderThan(now - days * DAY_MS)
}
