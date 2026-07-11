import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

// Memoize the derived key: re-derive only if the secret changes.
let _cachedKey: Buffer | null = null
let _cachedSecret: string | null = null

function key(): Buffer {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) throw new Error('BETTER_AUTH_SECRET is required for secret encryption')
  if (_cachedKey && _cachedSecret === secret) return _cachedKey
  _cachedKey = scryptSync(secret, 'bool-secret-salt', 32)
  _cachedSecret = secret
  return _cachedKey
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':')
}

export function decryptSecret(blob: string): string {
  const parts = blob.split(':')
  if (parts.length !== 3) throw new Error('malformed secret blob')
  const [ivB, tagB, ctB] = parts
  if (!ivB || !tagB || !ctB) throw new Error('malformed secret blob')
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(ctB, 'base64')), decipher.final()]).toString('utf8')
}
