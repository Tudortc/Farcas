import { useState } from 'react'
import { authClient } from './auth-client.js'

export function LoginForm() {
  const [mode, setMode] = useState<'signin' | 'register'>('signin')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res =
      mode === 'signin'
        ? await authClient.signIn.username({ username, password })
        : await authClient.signUp.email({ email, password, name: username, username })
    setBusy(false)
    if (res.error) setError(res.error.message ?? 'Authentication failed')
  }

  return (
    <form onSubmit={submit} aria-label={mode === 'signin' ? 'Sign in' : 'Register'}>
      <h1>bool</h1>
      <input
        aria-label="Username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Username"
        required
      />
      {mode === 'register' && (
        <input
          aria-label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
        />
      )}
      <input
        aria-label="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        required
      />
      <button type="submit" disabled={busy}>
        {mode === 'signin' ? 'Sign in' : 'Create account'}
      </button>
      {error && <p role="alert">{error}</p>}
      <button type="button" onClick={() => setMode(mode === 'signin' ? 'register' : 'signin')}>
        {mode === 'signin' ? 'Need an account? Register' : 'Have an account? Sign in'}
      </button>
    </form>
  )
}
