import { useEffect, useRef, useCallback, useId } from 'react'

// ---------------------------------------------------------------------------
// Shared hook: restores focus to the element that was focused before `open`
// became true, when `open` becomes false.
// ---------------------------------------------------------------------------

export function useFocusRestore(open: boolean): void {
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement
    } else {
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus()
        previousFocusRef.current = null
      }
    }
  }, [open])
}

// ---------------------------------------------------------------------------
// Focus-trap helpers
// ---------------------------------------------------------------------------

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)).filter((el) => {
    const cs = getComputedStyle(el)
    return !el.closest('[hidden]') && cs.display !== 'none' && cs.visibility !== 'hidden'
  })
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

export function Dialog({ open, onClose, title, children }: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  // Remember the element that was focused before the dialog opened
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const titleId = useId()

  // Capture previously focused element when dialog opens; restore on close
  useEffect(() => {
    if (open) {
      // Capture the currently focused element
      previousFocusRef.current = document.activeElement as HTMLElement

      // Focus the first focusable element inside the dialog body (children area)
      const id = setTimeout(() => {
        // First try to focus within the body (children) area
        if (bodyRef.current) {
          const focusable = getFocusableElements(bodyRef.current)
          if (focusable.length > 0) {
            focusable[0]!.focus()
            return
          }
        }
        // Fall back to first focusable in whole dialog
        if (dialogRef.current) {
          const focusable = getFocusableElements(dialogRef.current)
          if (focusable.length > 0) {
            focusable[0]!.focus()
          } else {
            dialogRef.current.focus()
          }
        }
      }, 0)

      return () => clearTimeout(id)
    } else {
      // Restore focus when dialog closes
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus()
        previousFocusRef.current = null
      }
    }
  }, [open])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = getFocusableElements(dialogRef.current)
        if (focusable.length === 0) return

        const first = focusable[0]!
        const last = focusable[focusable.length - 1]!

        if (e.shiftKey) {
          // Shift+Tab: if focus is on first element, wrap to last
          if (document.activeElement === first) {
            e.preventDefault()
            last.focus()
          }
        } else {
          // Tab: if focus is on last element, wrap to first
          if (document.activeElement === last) {
            e.preventDefault()
            first.focus()
          }
        }
      }
    },
    [onClose],
  )

  if (!open) return null

  return (
    <>
      {/* Scrim */}
      <div
        data-dialog-scrim
        aria-hidden
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 900,
          background: 'var(--scrim)',
          backdropFilter: 'blur(2px)',
        }}
      />

      {/* Dialog panel */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 901,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            pointerEvents: 'auto',
            background: 'var(--bg-2)',
            border: '1px solid var(--line-2)',
            borderRadius: 'var(--radius)',
            boxShadow: `0 8px 40px -8px var(--shadow-overlay)`,
            width: 'min(560px, 92vw)',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 18px 12px',
              borderBottom: '1px solid var(--line)',
              flexShrink: 0,
            }}
          >
            <span
              id={titleId}
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--ink-0)',
                letterSpacing: '0.02em',
              }}
            >
              {title}
            </span>
            <button
              type="button"
              aria-label="Close dialog"
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--ink-2)',
                cursor: 'pointer',
                fontFamily: 'var(--mono)',
                fontSize: 16,
                lineHeight: 1,
                padding: '2px 4px',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              ✕
            </button>
          </div>

          {/* Body */}
          <div
            ref={bodyRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '18px',
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </>
  )
}
