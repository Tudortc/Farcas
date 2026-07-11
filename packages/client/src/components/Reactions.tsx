import { useState, useRef, useEffect } from 'react'
import { useChat } from '../store/chat-store.js'
import { EmojiPicker } from './EmojiPicker.js'

export interface ReactionsProps {
  msgid: string | undefined
}

export function Reactions({ msgid }: ReactionsProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const addBtnRef = useRef<HTMLButtonElement>(null)

  const reactions = useChat((s) => s.reactions)
  const react = useChat((s) => s.react)
  const selected = useChat((s) => s.selected)
  const networks = useChat((s) => s.networks)

  // Close picker on click outside
  useEffect(() => {
    if (!pickerOpen) return
    function onPointerDown(e: PointerEvent) {
      const inPicker = pickerRef.current?.contains(e.target as Node)
      const inBtn = addBtnRef.current?.contains(e.target as Node)
      if (!inPicker && !inBtn) setPickerOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [pickerOpen])

  if (!msgid) return null

  // Derive current user's nick
  const colonIdx = selected ? selected.indexOf(':') : -1
  const networkId = colonIdx !== -1 ? Number(selected!.slice(0, colonIdx)) : NaN
  const ownNick = !isNaN(networkId) ? networks[networkId]?.nick : undefined

  const msgReactions = reactions[msgid] ?? {}
  const pills = Object.entries(msgReactions)

  function handlePillClick(emoji: string, mine: boolean) {
    react(msgid!, emoji, !mine)
  }

  function handleEmojiSelect(emoji: string) {
    react(msgid!, emoji, true)
    setPickerOpen(false)
  }

  return (
    <div
      className="reactions"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '4px',
        alignItems: 'center',
        padding: '2px 0',
        position: 'relative',
      }}
    >
      {pills.map(([emoji, nicks]) => {
        const mine = ownNick ? nicks.includes(ownNick) : false
        return (
          <button
            key={emoji}
            className="rx-pill"
            aria-label={`${emoji} ${nicks.length}`}
            aria-pressed={mine}
            onClick={() => handlePillClick(emoji, mine)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px',
              padding: '1px 6px',
              borderRadius: 'var(--radius-sm)',
              border: `1px solid ${mine ? 'var(--green-dim)' : 'var(--line-2)'}`,
              background: mine ? 'var(--glow)' : 'var(--bg-3)',
              color: mine ? 'var(--green)' : 'var(--ink-1)',
              fontSize: 'var(--meta-fs)',
              fontFamily: 'var(--sans)',
              cursor: 'pointer',
              lineHeight: 1.4,
            }}
          >
            <span>{emoji}</span>
            <span>{nicks.length}</span>
          </button>
        )
      })}

      <button
        ref={addBtnRef}
        className="rx-add"
        aria-label="Add reaction"
        onClick={() => setPickerOpen((v) => !v)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '22px',
          height: '22px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--line-2)',
          background: 'var(--bg-3)',
          color: 'var(--ink-2)',
          fontSize: '13px',
          cursor: 'pointer',
          lineHeight: 1,
        }}
      >
        +
      </button>

      {pickerOpen && (
        <div
          ref={pickerRef}
          style={{
            position: 'absolute',
            bottom: '28px',
            left: 0,
            zIndex: 100,
          }}
        >
          <EmojiPicker onSelect={handleEmojiSelect} />
        </div>
      )}
    </div>
  )
}
