import { betterAuth } from 'better-auth'
import { username, admin } from 'better-auth/plugins'
import { getDb } from './db.js'

const adminUserIds = (process.env.BOOL_ADMIN_IDS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const trustedOrigins = (process.env.BOOL_TRUSTED_ORIGINS ?? 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

export const auth = betterAuth({
  database: getDb(),
  emailAndPassword: { enabled: true },
  trustedOrigins,
  plugins: [username(), admin({ defaultRole: 'user', adminRoles: ['admin'], adminUserIds })],
})
