import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// Mutable state controlled per-test
let mockSessionReturn: { data: unknown; isPending: boolean } = { data: null, isPending: false }

vi.mock('./auth-client.js', () => ({
  useSession: () => mockSessionReturn,
  authClient: {
    signIn: { username: vi.fn().mockResolvedValue({ error: null }) },
    signUp: { email: vi.fn().mockResolvedValue({ error: null }) },
    signOut: vi.fn(),
  },
}))

import { AuthGate } from './AuthGate.js'
import { LoginForm } from './LoginForm.js'

beforeEach(() => {
  mockSessionReturn = { data: null, isPending: false }
})

describe('AuthGate', () => {
  it('renders Loading… while session is pending', () => {
    mockSessionReturn = { data: null, isPending: true }
    render(<AuthGate><div>INNER</div></AuthGate>)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(screen.queryByText('INNER')).not.toBeInTheDocument()
  })

  it('renders LoginForm when there is no session', () => {
    mockSessionReturn = { data: null, isPending: false }
    render(<AuthGate><div>INNER</div></AuthGate>)
    // Username input is the login affordance present in LoginForm's sign-in mode
    expect(screen.getByLabelText('Username')).toBeInTheDocument()
    expect(screen.queryByText('INNER')).not.toBeInTheDocument()
  })

  it('renders children when a session exists', () => {
    mockSessionReturn = { data: { user: { username: 'alice' } }, isPending: false }
    render(<AuthGate><div>INNER</div></AuthGate>)
    expect(screen.getByText('INNER')).toBeInTheDocument()
    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument()
  })
})

describe('LoginForm', () => {
  it('starts in sign-in mode (no Email field) and shows Email field after toggling to register', () => {
    render(<LoginForm />)

    // Sign-in mode: no email field
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Username')).toBeInTheDocument()

    // Toggle to register
    fireEvent.click(screen.getByRole('button', { name: 'Need an account? Register' }))

    // Register mode: email field appears
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  })
})
