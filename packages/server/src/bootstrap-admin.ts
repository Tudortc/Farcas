type SessionLike = { user: { id: string; role?: string | null } }

function adminIds(): string[] {
  return (process.env.BOOL_ADMIN_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function isAdmin(session: SessionLike | null): boolean {
  if (!session) return false
  if (session.user.role === 'admin') return true
  return adminIds().includes(session.user.id)
}

export function firstAdminHint(): string {
  return [
    'No admin configured yet.',
    'Register the first user, then either:',
    '  - set BOOL_ADMIN_IDS=<that user id> and restart, or',
    "  - run: UPDATE user SET role='admin' WHERE username='<name>'; in bool.db",
  ].join('\n')
}
