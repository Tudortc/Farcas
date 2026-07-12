import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { MainPane } from './MainPane.js'
import { useChat } from '../store/chat-store.js'

beforeEach(() => useChat.setState(useChat.getInitialState?.() ?? {}, true) as any)

describe('MainPane connection indicator', () => {
  it('renders the ConnDot with a connection aria-label', () => {
    render(<MainPane />)
    expect(screen.getByLabelText(/connection:/i)).toBeInTheDocument()
  })
})
