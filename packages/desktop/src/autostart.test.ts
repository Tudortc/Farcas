/**
 * Tests for autostart.ts — electron-free pure helpers.
 */
import { describe, it, expect } from 'vitest'
import { loginItemSettings, readAutostart, writeAutostart } from './autostart'

describe('loginItemSettings', () => {
  it('returns openAtLogin:true, openAsHidden:true when enabled is true', () => {
    expect(loginItemSettings(true)).toEqual({ openAtLogin: true, openAsHidden: true })
  })

  it('returns openAtLogin:false, openAsHidden:false when enabled is false', () => {
    expect(loginItemSettings(false)).toEqual({ openAtLogin: false, openAsHidden: false })
  })
})

describe('readAutostart / writeAutostart', () => {
  it('returns false for a missing file (no file in store)', () => {
    const store: Record<string, string> = {}
    const fs = {
      readFileSync: (path: string, _enc: BufferEncoding) => {
        if (store[path] === undefined) throw new Error('ENOENT')
        return store[path]!
      },
      writeFileSync: (path: string, data: string) => {
        store[path] = data
      },
    }
    expect(readAutostart('/fake/dir', fs)).toBe(false)
  })

  it('round-trips writeAutostart then readAutostart (true)', () => {
    const store: Record<string, string> = {}
    const fs = {
      readFileSync: (path: string, _enc: BufferEncoding) => {
        if (store[path] === undefined) throw new Error('ENOENT')
        return store[path]!
      },
      writeFileSync: (path: string, data: string) => {
        store[path] = data
      },
    }
    writeAutostart('/fake/dir', true, fs)
    expect(readAutostart('/fake/dir', fs)).toBe(true)
  })

  it('round-trips writeAutostart then readAutostart (false)', () => {
    const store: Record<string, string> = {}
    const fs = {
      readFileSync: (path: string, _enc: BufferEncoding) => {
        if (store[path] === undefined) throw new Error('ENOENT')
        return store[path]!
      },
      writeFileSync: (path: string, data: string) => {
        store[path] = data
      },
    }
    writeAutostart('/fake/dir', false, fs)
    expect(readAutostart('/fake/dir', fs)).toBe(false)
  })
})
