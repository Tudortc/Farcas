import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useChat } from '../store/chat-store.js'
import { NetworkSettings } from './NetworkSettings.js'

beforeEach(() => {
  useChat.setState((useChat as any).getInitialState?.() ?? {}, true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

// Seed a network in the store
function seedNetwork() {
  useChat.setState({
    networks: {
      42: { id: 42, name: 'Libera.Chat', host: 'irc.libera.chat', nick: 'dmf', connected: true },
    },
  })
}

describe('NetworkSettings', () => {
  it('renders the add network form fields', () => {
    render(<NetworkSettings onClose={() => {}} />)
    // Use exact text to avoid matching "Username" or "Realname" for "Name"
    expect(screen.getByLabelText(/^name$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^host$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^port$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^nick$/i)).toBeInTheDocument()
  })

  it('has Port defaulting to 6697 and TLS defaulting to checked', () => {
    render(<NetworkSettings onClose={() => {}} />)
    const portInput = screen.getByLabelText(/port/i) as HTMLInputElement
    expect(portInput.value).toBe('6697')
    const tlsCheckbox = screen.getByLabelText(/tls/i) as HTMLInputElement
    expect(tlsCheckbox.checked).toBe(true)
  })

  it('calls addNetwork with correct fields when form is submitted', async () => {
    const addNetworkSpy = vi.spyOn(useChat.getState(), 'addNetwork').mockImplementation(() => {})
    render(<NetworkSettings onClose={() => {}} />)

    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: 'My IRC Net' } })
    fireEvent.change(screen.getByLabelText(/^host$/i), { target: { value: 'irc.example.com' } })
    fireEvent.change(screen.getByLabelText(/^nick$/i), { target: { value: 'testnick' } })
    // port stays 6697, TLS stays checked

    fireEvent.click(screen.getByRole('button', { name: /add network/i }))

    await waitFor(() => {
      expect(addNetworkSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'My IRC Net',
          host: 'irc.example.com',
          nick: 'testnick',
          port: 6697,
          tls: true,
        }),
      )
    })
  })

  it('calls onClose after form submission', async () => {
    vi.spyOn(useChat.getState(), 'addNetwork').mockImplementation(() => {})
    const onClose = vi.fn()
    render(<NetworkSettings onClose={onClose} />)

    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: 'Net' } })
    fireEvent.change(screen.getByLabelText(/^host$/i), { target: { value: 'irc.test.net' } })
    fireEvent.change(screen.getByLabelText(/^nick$/i), { target: { value: 'mynick' } })

    fireEvent.click(screen.getByRole('button', { name: /add network/i }))

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('lists existing networks from the store', () => {
    seedNetwork()
    render(<NetworkSettings onClose={() => {}} />)
    expect(screen.getByText('Libera.Chat')).toBeInTheDocument()
    expect(screen.getByText(/irc\.libera\.chat/)).toBeInTheDocument()
  })

  it('shows a Remove button for each existing network', () => {
    seedNetwork()
    render(<NetworkSettings onClose={() => {}} />)
    const removeBtn = screen.getByRole('button', { name: /remove/i })
    expect(removeBtn).toBeInTheDocument()
  })

  it('calls removeNetwork with the correct id when Remove is clicked', () => {
    seedNetwork()
    // Attach a spy to the actual removeNetwork action via module-level _send mock approach
    // We spy on the store's _send by intercepting via addNetwork/removeNetwork pattern
    // Since removeNetwork sends net:remove via _send which is null in test, we mock it
    const removeNetworkMock = vi.fn()
    // Patch the store state to inject a mock removeNetwork action
    useChat.setState({ removeNetwork: removeNetworkMock } as any)

    render(<NetworkSettings onClose={() => {}} />)
    const removeBtn = screen.getByRole('button', { name: /remove/i })
    fireEvent.click(removeBtn)

    expect(removeNetworkMock).toHaveBeenCalledWith(42)
  })

  it('shows a Connect button for disconnected networks', () => {
    useChat.setState({
      networks: {
        5: { id: 5, name: 'TestNet', host: 'irc.test.net', nick: 'me', connected: false },
      },
    })
    render(<NetworkSettings onClose={() => {}} />)
    expect(screen.getByRole('button', { name: /connect/i })).toBeInTheDocument()
  })

  it('shows a Connected indicator for connected networks', () => {
    seedNetwork() // Libera.Chat is connected: true
    render(<NetworkSettings onClose={() => {}} />)
    expect(screen.getByText(/connected/i)).toBeInTheDocument()
  })

  it('includes optional fields Username, Realname, SASL account, SASL password', () => {
    render(<NetworkSettings onClose={() => {}} />)
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/realname/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/sasl account/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/sasl password/i)).toBeInTheDocument()
  })
})
