import { useEffect, useState } from 'react'
import { authClient } from './auth-client.js'

type AdminUser = { id: string; username?: string | null; role?: string | null }

export function AdminPanel() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  async function refresh() {
    const res = await authClient.admin.listUsers({ query: { limit: 100 } })
    setUsers((res.data?.users as AdminUser[]) ?? [])
  }
  useEffect(() => {
    void refresh()
  }, [])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    await authClient.admin.createUser({ email, password, name: username, role: 'user', data: { username } })
    setUsername('')
    setEmail('')
    setPassword('')
    await refresh()
  }

  return (
    <section aria-label="Admin panel">
      <h2>Users</h2>
      <ul>
        {users.map((u) => (
          <li key={u.id}>
            <span>{u.username}</span> <em>{u.role}</em>
            <button
              onClick={async () => {
                await authClient.admin.setRole({ userId: u.id, role: u.role === 'admin' ? 'user' : 'admin' })
                await refresh()
              }}
            >
              {u.role === 'admin' ? 'Demote' : 'Make admin'}
            </button>
            <button
              onClick={async () => {
                await authClient.admin.removeUser({ userId: u.id })
                await refresh()
              }}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={create} aria-label="Create user">
        <input aria-label="New username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" required />
        <input aria-label="New email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required />
        <input aria-label="New password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required />
        <button type="submit">Create user</button>
      </form>
    </section>
  )
}
