import { useState } from 'react'
import { notificationState, enablePush, disablePush } from '../push-client.js'

/**
 * NotificationsToggle — surfaces the Web Push opt-in/opt-out control.
 *
 * Uses CSS design-system variables; no hardcoded palette.
 * Renders nothing when push notifications are unsupported.
 */
export function NotificationsToggle() {
  const initial = notificationState()
  // Track pending state locally so the UI can reflect in-flight changes
  const [state, setState] = useState<'unsupported' | 'default' | 'granted' | 'denied'>(initial)
  const [busy, setBusy] = useState(false)

  if (state === 'unsupported') return null

  const handleEnable = async () => {
    if (busy) return
    setBusy(true)
    try {
      const ok = await enablePush()
      if (ok) setState('granted')
    } finally {
      setBusy(false)
    }
  }

  const handleDisable = async () => {
    if (busy) return
    setBusy(true)
    try {
      await disablePush()
      setState('default')
    } finally {
      setBusy(false)
    }
  }

  if (state === 'denied') {
    return (
      <div className="notifications-toggle notifications-toggle--denied">
        <span className="notifications-toggle__hint">
          Blocked — enable in your browser settings
        </span>
      </div>
    )
  }

  if (state === 'granted') {
    return (
      <div className="notifications-toggle notifications-toggle--on">
        <span className="notifications-toggle__label">Notifications on</span>
        <button
          type="button"
          className="notifications-toggle__btn"
          onClick={handleDisable}
          disabled={busy}
          aria-label="Disable notifications"
        >
          Disable
        </button>
      </div>
    )
  }

  // state === 'default'
  return (
    <div className="notifications-toggle">
      <button
        type="button"
        className="notifications-toggle__btn"
        onClick={handleEnable}
        disabled={busy}
        aria-label="Enable notifications"
      >
        Enable notifications
      </button>
    </div>
  )
}
