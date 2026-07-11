import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AdminPanel } from './AdminPanel.js'

vi.mock('./auth-client.js', () => ({
  authClient: {
    admin: {
      listUsers: vi.fn().mockResolvedValue({
        data: { users: [{ id: '1', username: 'alice', role: 'admin' }, { id: '2', username: 'bob', role: 'user' }] },
      }),
      createUser: vi.fn(),
      setRole: vi.fn(),
      removeUser: vi.fn(),
    },
  },
}))

describe('AdminPanel', () => {
  it('lists users after loading', async () => {
    render(<AdminPanel />)
    expect(await screen.findByText('alice')).toBeInTheDocument()
    expect(await screen.findByText('bob')).toBeInTheDocument()
  })
})
