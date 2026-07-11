import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { Dialog } from './Dialog.js'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Dialog', () => {
  it('does not render when closed', () => {
    render(
      <Dialog open={false} onClose={() => {}} title="Test">
        <button>inside</button>
      </Dialog>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders with role="dialog" and aria-modal when open', () => {
    render(
      <Dialog open onClose={() => {}} title="Test Dialog">
        <button>inside</button>
      </Dialog>,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('renders the title', () => {
    render(
      <Dialog open onClose={() => {}} title="My Dialog Title">
        <span>content</span>
      </Dialog>,
    )
    expect(screen.getByText('My Dialog Title')).toBeInTheDocument()
  })

  it('renders children', () => {
    render(
      <Dialog open onClose={() => {}} title="Test">
        <span data-testid="child">hello</span>
      </Dialog>,
    )
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  it('focuses the first focusable element inside the dialog body (children) when opened', async () => {
    render(
      <Dialog open onClose={() => {}} title="Test">
        <button data-testid="first-btn">First</button>
        <button data-testid="second-btn">Second</button>
      </Dialog>,
    )
    // Flush timers (setTimeout-based focus scheduling)
    act(() => {
      vi.runAllTimers()
    })
    // The dialog focuses the first focusable in the body (children) area,
    // which is "first-btn" (not the close button in the header)
    expect(document.activeElement).toBe(screen.getByTestId('first-btn'))
  })

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn()
    render(
      <Dialog open onClose={onClose} title="Test">
        <button>inside</button>
      </Dialog>,
    )
    const dialog = screen.getByRole('dialog')
    fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when the scrim is clicked', () => {
    const onClose = vi.fn()
    render(
      <Dialog open onClose={onClose} title="Test">
        <button>inside</button>
      </Dialog>,
    )
    const scrim = document.querySelector('[data-dialog-scrim]') as HTMLElement
    expect(scrim).not.toBeNull()
    fireEvent.click(scrim)
    expect(onClose).toHaveBeenCalled()
  })

  it('restores focus to the previously focused element on close', () => {
    // Render an opener button outside the dialog
    const { rerender } = render(
      <div>
        <button data-testid="opener">Open</button>
        <Dialog open={false} onClose={() => {}} title="Test">
          <button data-testid="inside">inside</button>
        </Dialog>
      </div>,
    )

    // Focus the opener button
    const opener = screen.getByTestId('opener')
    opener.focus()
    expect(document.activeElement).toBe(opener)

    // Open the dialog
    rerender(
      <div>
        <button data-testid="opener">Open</button>
        <Dialog open onClose={() => {}} title="Test">
          <button data-testid="inside">inside</button>
        </Dialog>
      </div>,
    )

    act(() => {
      vi.runAllTimers()
    })

    // Now close the dialog
    rerender(
      <div>
        <button data-testid="opener">Open</button>
        <Dialog open={false} onClose={() => {}} title="Test">
          <button data-testid="inside">inside</button>
        </Dialog>
      </div>,
    )

    // Focus should be restored to the opener
    expect(document.activeElement).toBe(opener)
  })

  it('traps Tab focus within the dialog — wraps from last to first focusable', () => {
    render(
      <Dialog open onClose={() => {}} title="Test">
        <button data-testid="btn-a">A</button>
        <button data-testid="btn-b">B</button>
      </Dialog>,
    )

    act(() => {
      vi.runAllTimers()
    })

    const dialog = screen.getByRole('dialog')

    // Find the last focusable element in the whole dialog (may be close button or btn-b)
    // Simulate pressing Tab from the last focusable — should wrap to the first focusable
    const closeBtn = screen.getByRole('button', { name: /close dialog/i })

    // Tab from close button (which may be last) should wrap to first (btn-a)
    closeBtn.focus()
    fireEvent.keyDown(closeBtn, { key: 'Tab', code: 'Tab', shiftKey: false })
    // Expect focus to wrap to the first focusable in the dialog
    const btnA = screen.getByTestId('btn-a')
    // The close button is first (header) or last in DOM depending on implementation.
    // What matters: Tab from last element wraps to first element.
    // After Tab on the last item, activeElement should be the first focusable.
    // In our implementation, we fire keyDown and the handler wraps focus.
    // The dialog's first focusable depends on DOM order.
    // We verify: pressing Tab on the last focusable element wraps to first.
    const allFocusable = Array.from(
      dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'),
    ) as HTMLElement[]
    const lastEl = allFocusable[allFocusable.length - 1]!
    const firstEl = allFocusable[0]!

    lastEl.focus()
    fireEvent.keyDown(lastEl, { key: 'Tab', code: 'Tab', shiftKey: false })
    expect(document.activeElement).toBe(firstEl)
  })

  it('traps Shift+Tab focus within the dialog — wraps from first to last focusable', () => {
    render(
      <Dialog open onClose={() => {}} title="Test">
        <button data-testid="btn-a">A</button>
        <button data-testid="btn-b">B</button>
      </Dialog>,
    )

    act(() => {
      vi.runAllTimers()
    })

    const dialog = screen.getByRole('dialog')
    const allFocusable = Array.from(
      dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'),
    ) as HTMLElement[]
    const firstEl = allFocusable[0]!
    const lastEl = allFocusable[allFocusable.length - 1]!

    // Focus the first element and press Shift+Tab — should wrap to last
    firstEl.focus()
    fireEvent.keyDown(firstEl, { key: 'Tab', code: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(lastEl)
  })
})
