import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Composer } from './Composer.js'

describe('Composer', () => {
  let sendMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    sendMock = vi.fn()
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
