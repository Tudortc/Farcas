import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useChat } from '../store/chat-store.js'
import { Reactions } from './Reactions.js'

beforeEach(() => {
  useChat.setState(useChat.getInitialState(), true)
})

// Mock emoji-mart so jsdom doesn't try to render the picker
vi.mock('@emoji-mart/react', () => ({
  default: ({ onEmojiSelect }: { onEmojiSelect: (e: { native: string }) => void }) => (
    <div data-testid="emoji-picker">
      <button onClick={() => onEmojiSelect({ native: '🎉' })}>🎉</button>
    </div>
  ),
}))
vi.mock('@emoji-mart/data', () => ({ default: {} }))

describe('Reactions', () => {
  const MSGID = 'msg-001'
  const SELECTED = '1:#general'

  function seed(reactionMap: Record<string, string[]>) {
    useChat.setState({
      selected: SELECTED,
      networks: { 1: { id: 1, name: 'Freenode', host: 'irc.freenode.net', nick: 'me', connected: true } },
      reactions: { [MSGID]: reactionMap },
    })
  }

  it('renders nothing when there are no reactions and no msgid', () => {
    useChat.setState({ selected: SELECTED })
    const { container } = render(<Reactions msgid={undefined} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders pills with emoji and count', () => {
    seed({ '👍': ['alice', 'bob'], '❤️': ['carol'] })
    render(<Reactions msgid={MSGID} />)
    expect(screen.getByText(/👍/)).toBeInTheDocument()
    expect(screen.getByText(/2/)).toBeInTheDocument()
    expect(screen.getByText(/❤️/)).toBeInTheDocument()
    expect(screen.getByText(/1/)).toBeInTheDocument()
  })

  it('marks a pill as aria-pressed when current user has reacted', () => {
    seed({ '👍': ['alice', 'me'] })
    render(<Reactions msgid={MSGID} />)
    const pill = screen.getByRole('button', { name: /👍/ })
    expect(pill).toHaveAttribute('aria-pressed', 'true')
  })

  it('marks a pill as NOT aria-pressed when current user has not reacted', () => {
    seed({ '👍': ['alice', 'bob'] })
    render(<Reactions msgid={MSGID} />)
    const pill = screen.getByRole('button', { name: /👍/ })
    expect(pill).toHaveAttribute('aria-pressed', 'false')
  })

  it('clicking a pill toggles the reaction (react called with !mine)', () => {
    const reactMock = vi.fn()
    useChat.setState({ react: reactMock })
    seed({ '👍': ['alice'] }) // current user "me" is NOT in the list
    render(<Reactions msgid={MSGID} />)
    const pill = screen.getByRole('button', { name: /👍/ })
    fireEvent.click(pill)
    expect(reactMock).toHaveBeenCalledWith(MSGID, '👍', true) // add=true because !mine
  })

  it('clicking a pill that the current user has reacted to calls react with false', () => {
    const reactMock = vi.fn()
    useChat.setState({ react: reactMock })
    seed({ '👍': ['me', 'alice'] }) // "me" IS in the list
    render(<Reactions msgid={MSGID} />)
    const pill = screen.getByRole('button', { name: /👍/ })
    fireEvent.click(pill)
    expect(reactMock).toHaveBeenCalledWith(MSGID, '👍', false) // add=false because mine=true → toggle to false
  })

  it('renders a + button to open the emoji picker', () => {
    seed({ '👍': ['alice'] })
    render(<Reactions msgid={MSGID} />)
    const addBtn = screen.getByRole('button', { name: /add reaction/i })
    expect(addBtn).toBeInTheDocument()
  })

  it('clicking + opens the emoji picker', () => {
    seed({ '👍': ['alice'] })
    render(<Reactions msgid={MSGID} />)
    const addBtn = screen.getByRole('button', { name: /add reaction/i })
    fireEvent.click(addBtn)
    expect(screen.getByTestId('emoji-picker')).toBeInTheDocument()
  })

  it('selecting an emoji from picker calls react with add=true', () => {
    const reactMock = vi.fn()
    useChat.setState({ react: reactMock })
    seed({ '👍': ['alice'] })
    render(<Reactions msgid={MSGID} />)
    const addBtn = screen.getByRole('button', { name: /add reaction/i })
    fireEvent.click(addBtn)
    // The mocked picker renders a button with the emoji
    const emojiBtn = screen.getByRole('button', { name: '🎉' })
    fireEvent.click(emojiBtn)
    expect(reactMock).toHaveBeenCalledWith(MSGID, '🎉', true)
  })

  it('renders the + button even when there are no reactions (and msgid is provided)', () => {
    useChat.setState({
      selected: SELECTED,
      networks: { 1: { id: 1, name: 'Freenode', host: 'irc.freenode.net', nick: 'me', connected: true } },
      reactions: {},
    })
    render(<Reactions msgid={MSGID} />)
    expect(screen.getByRole('button', { name: /add reaction/i })).toBeInTheDocument()
  })
})
