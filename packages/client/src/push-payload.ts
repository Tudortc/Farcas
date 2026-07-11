export interface PushPayload {
  title: string
  body: string
  tag?: string
  data?: { networkId?: number; target?: string }
}

const DEFAULT_PAYLOAD: PushPayload = { title: 'bool', body: '' }

/**
 * Parse a raw push event data string into a structured PushPayload.
 * Returns a safe default on missing or malformed input.
 */
export function parsePushPayload(raw: string | undefined): PushPayload {
  if (!raw) return { ...DEFAULT_PAYLOAD }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const title = typeof parsed.title === 'string' ? parsed.title : 'bool'
    const body = typeof parsed.body === 'string' ? parsed.body : ''
    const tag = typeof parsed.tag === 'string' ? parsed.tag : undefined
    const data =
      parsed.data && typeof parsed.data === 'object'
        ? (parsed.data as PushPayload['data'])
        : undefined
    return { title, body, ...(tag !== undefined ? { tag } : {}), ...(data !== undefined ? { data } : {}) }
  } catch {
    return { ...DEFAULT_PAYLOAD }
  }
}
