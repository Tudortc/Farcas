import '../styles/app.css'
import { useChat, targetKey } from '../store/chat-store.js'
import type { NetworkState, TargetState } from '../store/types.js'

/** Derive a two-letter abbreviation from a network name */
function netAbbr(name: string): string {
  const words = name.split(/[\s.-]+/).filter(Boolean)
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

function ChannelRow({
  target,
  isActive,
  onSelect,
}: {
  target: TargetState
  isActive: boolean
  onSelect: () => void
}) {
  const isChannel = target.kind === 'channel'
  const hasUnread = target.unread > 0
  const classes = ['chan', isActive ? 'active' : '', hasUnread ? 'unread' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <button
      type="button"
      className={classes}
      onClick={onSelect}
      title={target.target}
    >
      {isChannel ? (
        <span className="hash">#</span>
      ) : (
        <span
          className="dm-av"
          style={{ background: 'var(--blue)' }}
          aria-hidden="true"
        >
          {target.target[0]?.toUpperCase()}
        </span>
      )}
      <span className="name">{isChannel ? target.target.slice(1) : target.target}</span>
      {hasUnread && (
        <span className="b">{target.unread}</span>
      )}
    </button>
  )
}

function NetworkGroup({
  network,
  targets,
  selected,
  onSelect,
}: {
  network: NetworkState
  targets: TargetState[]
  selected: string | null
  onSelect: (key: string) => void
}) {
  const channels = targets.filter((t) => t.kind === 'channel')
  const dms = targets.filter((t) => t.kind === 'pm')

  return (
    <>
      <div className="side-head">
        <div className="net-title">
          <span className={`dot${network.connected ? '' : ' off'}`} aria-hidden="true" />
          {network.name}
        </div>
        <div className="net-sub">{network.host}</div>
      </div>
      <div className="side-scroll">
        {channels.length > 0 && (
          <div className="grp">
            <div className="grp-h">
              Channels
              <span className="count">{channels.length}</span>
            </div>
            {channels.map((t) => {
              const key = targetKey(t.networkId, t.target)
              return (
                <ChannelRow
                  key={key}
                  target={t}
                  isActive={selected === key}
                  onSelect={() => onSelect(key)}
                />
              )
            })}
          </div>
        )}
        {dms.length > 0 && (
          <div className="grp">
            <div className="grp-h">
              Direct Messages
              <span className="count">{dms.length}</span>
            </div>
            {dms.map((t) => {
              const key = targetKey(t.networkId, t.target)
              return (
                <ChannelRow
                  key={key}
                  target={t}
                  isActive={selected === key}
                  onSelect={() => onSelect(key)}
                />
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}

export function Sidebar() {
  const networks = useChat((s) => s.networks)
  const targets = useChat((s) => s.targets)
  const selected = useChat((s) => s.selected)
  const select = useChat((s) => s.select)

  const networkList = Object.values(networks)
  const targetList = Object.values(targets)

  // Total unread per network for rail badges
  function networkUnread(netId: number): number {
    return targetList
      .filter((t) => t.networkId === netId)
      .reduce((sum, t) => sum + t.unread, 0)
  }

  // Determine active network from selected key
  const activeNetId =
    selected != null
      ? Number(selected.split(':')[0])
      : networkList[0]?.id ?? null

  // For multi-network: show the active network's channels in the side panel
  const activeNetwork = activeNetId != null ? networks[activeNetId] : null
  const activeTargets = activeNetId != null
    ? targetList.filter((t) => t.networkId === activeNetId)
    : []

  return (
    <div style={{ display: 'contents' }}>
      {/* Network rail */}
      <nav className="rail" aria-label="Networks">
        <div className="rail-logo" aria-label="bool">b</div>
        <div className="rail-sep" />
        {networkList.map((net) => {
          const unread = networkUnread(net.id)
          const isActive = net.id === activeNetId
          return (
            <div
              key={net.id}
              className={`net-btn${isActive ? ' active' : ''}`}
              title={net.name}
              onClick={() => {
                // Select first target of this network
                const first = targetList.find((t) => t.networkId === net.id)
                if (first) select(targetKey(first.networkId, first.target))
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  const first = targetList.find((t) => t.networkId === net.id)
                  if (first) select(targetKey(first.networkId, first.target))
                }
              }}
            >
              {netAbbr(net.name)}
              {unread > 0 && <span className="badge">{unread}</span>}
            </div>
          )
        })}
        {networkList.length === 0 && (
          <div
            className="net-btn"
            title="No networks — connect one"
            style={{ color: 'var(--ink-3)', borderStyle: 'dashed' }}
          >
            +
          </div>
        )}
      </nav>

      {/* Channel sidebar */}
      <aside className="side" aria-label="Channels">
        {activeNetwork ? (
          <NetworkGroup
            network={activeNetwork}
            targets={activeTargets}
            selected={selected}
            onSelect={select}
          />
        ) : (
          <div className="side-scroll" style={{ color: 'var(--ink-3)', padding: '24px 12px', fontFamily: 'var(--mono)', fontSize: '12px' }}>
            No network connected
          </div>
        )}
      </aside>
    </div>
  )
}
