import { useChat } from '../store/chat-store.js'
import type { NameEntry } from '../store/types.js'

// ---- Nick color hashing (mirrors MessageRow.tsx) ----
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

function isOp(entry: NameEntry): boolean {
  return entry.modes.includes('o') || entry.modes.includes('@')
}

function isVoiced(entry: NameEntry): boolean {
  return entry.modes.includes('v') || entry.modes.includes('+')
}

interface MemberRowProps {
  entry: NameEntry
  sigil?: string
  sigilColor?: string
}

function MemberRow({ entry, sigil, sigilColor }: MemberRowProps) {
  const color = hashNick(entry.nick)
  const initial = entry.nick[0]?.toUpperCase() ?? '?'

  return (
    <div className="mem" title={entry.nick}>
      <div className="av" style={{ background: color }}>
        <span style={{ color: 'var(--bg-0)', fontFamily: 'var(--mono)', fontWeight: 700, fontSize: '10px' }}>
          {initial}
        </span>
      </div>
      {sigil && (
        <span
          className={sigil === '@' ? 'op-mark' : 'voice-mark'}
          aria-hidden="true"
          style={{ color: sigilColor, fontFamily: 'var(--mono)', fontSize: '12px', fontWeight: 700 }}
        >
          {sigil}
        </span>
      )}
      <span className="nm">{entry.nick}</span>
    </div>
  )
}

interface MemberGroupProps {
  label: string
  members: NameEntry[]
  sigil?: string
  sigilColor?: string
}

function MemberGroup({ label, members, sigil, sigilColor }: MemberGroupProps) {
  if (members.length === 0) return null
  return (
    <div>
      <div className="mem-grp">
        {label} <span style={{ color: 'var(--green)', fontFamily: 'var(--mono)' }}>·</span>{' '}
        <span style={{ color: 'var(--ink-2)' }}>{members.length}</span>
      </div>
      {members.map((entry) => (
        <MemberRow
          key={entry.nick}
          entry={entry}
          sigil={sigil}
          sigilColor={sigilColor}
        />
      ))}
    </div>
  )
}

export function MemberList() {
  const selected = useChat((s) => s.selected)
  const targets = useChat((s) => s.targets)

  const target = selected != null ? targets[selected] : null
  const names = target?.names ?? []

  const ops = names.filter(isOp)
  const voiced = names.filter((n) => !isOp(n) && isVoiced(n))
  const regular = names.filter((n) => !isOp(n) && !isVoiced(n))

  const totalCount = names.length

  return (
    <>
      <div
        className="mem-head"
        style={{
          padding: '11px 12px',
          borderBottom: '1px solid var(--line)',
          fontFamily: 'var(--mono)',
          fontSize: '11px',
          letterSpacing: '1px',
          textTransform: 'uppercase',
          color: 'var(--ink-2)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>Members</span>
        {totalCount > 0 && (
          <b style={{ color: 'var(--green)', fontFamily: 'var(--mono)' }}>{totalCount}</b>
        )}
      </div>

      {names.length === 0 ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--ink-3)',
            fontFamily: 'var(--mono)',
            fontSize: '12px',
          }}
        >
          {selected == null ? null : 'No members'}
        </div>
      ) : (
        <div className="mem-scroll">
          <MemberGroup
            label="Ops"
            members={ops}
            sigil="@"
            sigilColor="var(--amber)"
          />
          <MemberGroup
            label="Voiced"
            members={voiced}
            sigil="+"
            sigilColor="var(--cyan)"
          />
          <MemberGroup
            label="Online"
            members={regular}
          />
        </div>
      )}
    </>
  )
}
