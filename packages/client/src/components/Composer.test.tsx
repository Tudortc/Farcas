import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Composer } from './Composer.js'
import { useChat } from '../store/chat-store.js'

describe('Composer', () => {
  let sendMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    sendMock = vi.fn()
    // Reset store to clean state
    useChat.setState((useChat as any).getInitialState(), true)
  })

  it('renders a textarea', () => {
    render(<Composer onSend={sendMock} />)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('Enter calls onSend with the typed text and clears the field', () => {
    render(<Composer onSend={sendMock} />)
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'hello irc' } })
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter', shiftKey: false })
    expect(sendMock).toHaveBeenCalledOnce()
    expect(sendMock).toHaveBeenCalledWith('hello irc')
    expect(textarea.value).toBe('')
  })

  it('Enter with only whitespace does NOT call onSend', () => {
    render(<Composer onSend={sendMock} />)
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: '   ' } })
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter', shiftKey: false })
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('Enter with empty string does NOT call onSend', () => {
    render(<Composer onSend={sendMock} />)
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter', shiftKey: false })
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('Shift+Enter does NOT call onSend (inserts newline)', () => {
    render(<Composer onSend={sendMock} />)
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'hello' } })
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter', shiftKey: true })
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('shows slash-command hints when text starts with /', () => {
    render(<Composer onSend={sendMock} />)
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: '/join' } })
    // The hint list should appear — look for the slash-command hint in the listbox
    const listbox = screen.getByRole('listbox')
    expect(listbox).toBeInTheDocument()
    // The /join command should appear as a hint item (the .cmd span)
    const cmdSpans = listbox.querySelectorAll('.cmd')
    const cmdTexts = Array.from(cmdSpans).map((el) => el.textContent)
    expect(cmdTexts).toContain('/join')
  })

  it('hides slash-command hints when text does not start with /', () => {
    render(<Composer onSend={sendMock} />)
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'hello' } })
    expect(screen.queryByText('/join')).not.toBeInTheDocument()
  })

  it('placeholder is visible', () => {
    render(<Composer onSend={sendMock} />)
    expect(screen.getByPlaceholderText(/Message|message|\//)).toBeInTheDocument()
  })
})

describe('Composer typing timer', () => {
  let sendMock: ReturnType<typeof vi.fn>
  let setTypingSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    sendMock = vi.fn()
    // Reset store and spy on setTyping
    useChat.setState((useChat as any).getInitialState(), true)
    // Set a selected target so typing state can be dispatched
    useChat.setState({ selected: '1:#general' })
    setTypingSpy = vi.fn()
    useChat.setState({ setTyping: setTypingSpy } as any)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('(a) typing input dispatches setTyping active', () => {
    render(<Composer onSend={sendMock} />)
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'h' } })
    expect(setTypingSpy).toHaveBeenCalledWith('1:#general', 'active')
  })

  it('(a) second keystroke within 2 s does NOT re-dispatch active', () => {
    render(<Composer onSend={sendMock} />)
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'h' } })
    fireEvent.change(textarea, { target: { value: 'hi' } })
    // Should still be exactly 1 call (throttled)
    expect(setTypingSpy).toHaveBeenCalledTimes(1)
    expect(setTypingSpy).toHaveBeenCalledWith('1:#general', 'active')
  })

  it('(b) after ~5 s idle, setTyping done fires', () => {
    render(<Composer onSend={sendMock} />)
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'h' } })
    expect(setTypingSpy).toHaveBeenCalledTimes(1)
    // Advance past the idle timeout (5000 ms)
    vi.advanceTimersByTime(5001)
    expect(setTypingSpy).toHaveBeenCalledWith('1:#general', 'done')
    expect(setTypingSpy).toHaveBeenCalledTimes(2)
  })

  it('(c) sending a message dispatches done and clears the idle timer', () => {
    render(<Composer onSend={sendMock} />)
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'hello' } })
    expect(setTypingSpy).toHaveBeenCalledWith('1:#general', 'active')
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter', shiftKey: false })
    expect(setTypingSpy).toHaveBeenCalledWith('1:#general', 'done')
    const callCountAfterSend = setTypingSpy.mock.calls.length
    // Advance past idle delay — no extra call should fire since timer was cleared
    vi.advanceTimersByTime(5001)
    expect(setTypingSpy).toHaveBeenCalledTimes(callCountAfterSend)
  })

  it('(d) unmount clears timers — no dispatch after unmount', () => {
    const { unmount } = render(<Composer onSend={sendMock} />)
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'h' } })
    const callCountAtUnmount = setTypingSpy.mock.calls.length
    unmount()
    // Advance past idle timeout — since we unmounted, idle timer is cleared
    vi.advanceTimersByTime(5001)
    expect(setTypingSpy).toHaveBeenCalledTimes(callCountAtUnmount)
  })
})
