import { useState } from 'react'
import '../styles/app.css'
import { useChat, targetKey } from '../store/chat-store.js'
import type { NetworkState, TargetState } from '../store/types.js'
import { normalizeChannel } from '../commands.js'

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
  const statusTargets = targets.filter((t) => t.kind === 'status')

  const [joinOpen, setJoinOpen] = useState(false)
  const [joinValue, setJoinValue] = useState('')
  const join = useChat((s) => s.join)

  function submitJoin() {
    const v = joinValue.trim()
    if (v) join(network.id, normalizeChannel(v))
    setJoinValue('')
    setJoinOpen(false)
  }

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
        {(
          <div className="grp">
            <div className="grp-h">
              Channels
              <span className="count">{channels.length}</span>
              <button
                type="button"
                className="grp-add"
                aria-label="Join a channel"
                title="Join a channel"
                onClick={() => setJoinOpen((v) => !v)}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer' }}
              >
                +
              </button>
            </div>
            {joinOpen && (
              <input
                className="join-input"
                aria-label="Channel to join"
                placeholder="#channel — Enter to join"
                autoFocus
                value={joinValue}
                onChange={(e) => setJoinValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); submitJoin() }
                  if (e.key === 'Escape') { setJoinValue(''); setJoinOpen(false) }
                }}
              />
            )}
            {channels.length > 0 && channels.map((t) => {
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
        {statusTargets.length > 0 && (
          <div className="grp">
            <div className="grp-h">Server</div>
            {statusTargets.map((t) => {
              const key = targetKey(t.networkId, t.target)
              return (
                <button
                  key={key}
                  type="button"
                  className={`chan${selected === key ? ' active' : ''}`}
                  onClick={() => onSelect(key)}
                  title={network.name}
                >
                  <span className="hash">*</span>
                  <span className="name">{network.name}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}

export interface SidebarProps {
  onOpenNetworkSettings?: () => void
}

export function Sidebar({ onOpenNetworkSettings }: SidebarProps = {}) {
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
            <button
              key={net.id}
              type="button"
              className={`net-btn${isActive ? ' active' : ''}`}
              title={net.name}
              onClick={() => {
                // Select first target of this network
                const first = targetList.find((t) => t.networkId === net.id)
                if (first) select(targetKey(first.networkId, first.target))
              }}
            >
              {netAbbr(net.name)}
              {unread > 0 && <span className="badge">{unread}</span>}
            </button>
          )
        })}
        {/* Add network button — always visible, opens Network Settings */}
        <button
          type="button"
          className="net-btn"
          title="Add network"
          aria-label="Add network"
          onClick={onOpenNetworkSettings}
          style={{ color: 'var(--ink-3)', borderStyle: 'dashed' }}
        >
          +
        </button>
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
