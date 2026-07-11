import type { ReactNode } from 'react'
import { useSession } from './auth-client.js'
import { LoginForm } from './LoginForm.js'

export function AuthGate({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession()
  if (isPending) return <main>Loading…</main>
  if (!session) return <LoginForm />
  return <>{children}</>
}
