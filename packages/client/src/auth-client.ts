import { createAuthClient } from 'better-auth/react'
import { usernameClient, adminClient } from 'better-auth/client/plugins'

// Better Auth requires an ABSOLUTE base URL in the browser (a relative '/api/auth'
// throws "Invalid base URL" at module load). Derive it from the current origin so
// it works behind the Vite dev proxy and when the server serves the built client.
const authBaseURL =
  typeof window !== 'undefined' ? `${window.location.origin}/api/auth` : 'http://localhost/api/auth'

export const authClient = createAuthClient({
  baseURL: authBaseURL,
  plugins: [usernameClient(), adminClient()],
})

export const { signUp, signIn, signOut, useSession } = authClient
