import { createAuthClient } from 'better-auth/react'
import { usernameClient, adminClient } from 'better-auth/client/plugins'

export const authClient = createAuthClient({
  baseURL: '/api/auth',
  plugins: [usernameClient(), adminClient()],
})

export const { signUp, signIn, signOut, useSession } = authClient
