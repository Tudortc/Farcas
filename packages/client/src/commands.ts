export interface CommandContext {
  activeTarget: string | null
  isChannel: boolean
}

export type ParsedCommand =
  | { kind: 'text'; text: string }
  | { kind: 'action'; text: string }
  | { kind: 'join'; channel: string }
  | { kind: 'part'; reason?: string }
  | { kind: 'msg'; nick: string; text: string }
  | { kind: 'nick'; nick: string }
  | { kind: 'topic'; topic: string }
  | { kind: 'whois'; nick: string }
  | { kind: 'kick'; nick: string; reason?: string }
  | { kind: 'mode'; modes: string; args?: string }
  | { kind: 'list'; filter?: string }
  | { kind: 'error'; message: string }

export function normalizeChannel(name: string): string {
  return name.startsWith('#') || name.startsWith('&') ? name : `#${name}`
}

export function parseCommand(input: string, ctx: CommandContext): ParsedCommand {
  const trimmed = input.trim()
  // '//' escapes a literal leading slash
  if (trimmed.startsWith('//')) return { kind: 'text', text: trimmed.slice(1) }
  if (!trimmed.startsWith('/')) return { kind: 'text', text: input.trim() }

  const spaceIdx = trimmed.indexOf(' ')
  const cmd = (spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx)).toLowerCase()
  const rest = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim()
  const needChannel = (name: string) =>
    ctx.isChannel ? null : ({ kind: 'error', message: `${name} can only be used in a channel` } as const)

  switch (cmd) {
    case '/me':
      return rest ? { kind: 'action', text: rest } : { kind: 'error', message: '/me needs an action' }
    case '/join': {
      const chan = rest.split(' ')[0]
      return chan ? { kind: 'join', channel: normalizeChannel(chan) } : { kind: 'error', message: '/join needs a channel' }
    }
    case '/part':
      return needChannel('/part') ?? { kind: 'part', ...(rest ? { reason: rest } : {}) }
    case '/msg':
    case '/query': {
      const idx = rest.indexOf(' ')
      if (idx === -1) return { kind: 'error', message: '/msg needs a nick and a message' }
      return { kind: 'msg', nick: rest.slice(0, idx), text: rest.slice(idx + 1).trim() }
    }
    case '/nick':
      return rest ? { kind: 'nick', nick: rest.split(' ')[0]! } : { kind: 'error', message: '/nick needs a nickname' }
    case '/topic':
      return needChannel('/topic') ?? (rest ? { kind: 'topic', topic: rest } : { kind: 'error', message: '/topic needs text' })
    case '/whois':
      return rest ? { kind: 'whois', nick: rest.split(' ')[0]! } : { kind: 'error', message: '/whois needs a nick' }
    case '/kick': {
      const channelErr = needChannel('/kick')
      if (channelErr) return channelErr
      const idx = rest.indexOf(' ')
      if (!rest) return { kind: 'error', message: '/kick needs a nick' }
      return idx === -1
        ? { kind: 'kick', nick: rest }
        : { kind: 'kick', nick: rest.slice(0, idx), reason: rest.slice(idx + 1).trim() }
    }
    case '/mode': {
      if (!rest) return { kind: 'error', message: '/mode needs flags' }
      const idx = rest.indexOf(' ')
      return idx === -1
        ? { kind: 'mode', modes: rest }
        : { kind: 'mode', modes: rest.slice(0, idx), args: rest.slice(idx + 1).trim() }
    }
    case '/list':
      return rest ? { kind: 'list', filter: rest.split(' ')[0] } : { kind: 'list' }
    default:
      return { kind: 'error', message: `Unknown command: ${cmd}` }
  }
}
