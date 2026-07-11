import { describe, it, expect } from 'vitest'
import { encryptSecret, decryptSecret } from './crypto.js'

describe('secret crypto', () => {
  it('round-trips a secret', () => {
    const blob = encryptSecret('hunter2')
    expect(blob).not.toContain('hunter2')
    expect(decryptSecret(blob)).toBe('hunter2')
  })
  it('produces different ciphertext each time (random IV)', () => {
    expect(encryptSecret('x')).not.toBe(encryptSecret('x'))
  })
})
