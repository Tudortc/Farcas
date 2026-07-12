import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadConfig, saveConfig } from './config.js'

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'bool-config-test-'))
}

describe('config round-trip', () => {
  it('saves and loads a config', () => {
    const dir = makeTmpDir()
    try {
      saveConfig(dir, { serverUrl: 'https://example.com' })
      const loaded = loadConfig(dir)
      expect(loaded).toEqual({ serverUrl: 'https://example.com' })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns {serverUrl:null} when file is missing', () => {
    const dir = makeTmpDir()
    try {
      const loaded = loadConfig(dir)
      expect(loaded).toEqual({ serverUrl: null })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns {serverUrl:null} when file contains garbage JSON', () => {
    const dir = makeTmpDir()
    try {
      writeFileSync(join(dir, 'config.json'), 'not json at all!!!')
      const loaded = loadConfig(dir)
      expect(loaded).toEqual({ serverUrl: null })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns {serverUrl:null} when serverUrl field is missing', () => {
    const dir = makeTmpDir()
    try {
      writeFileSync(join(dir, 'config.json'), JSON.stringify({ foo: 'bar' }))
      const loaded = loadConfig(dir)
      expect(loaded).toEqual({ serverUrl: null })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns {serverUrl:null} when serverUrl is not a string', () => {
    const dir = makeTmpDir()
    try {
      writeFileSync(join(dir, 'config.json'), JSON.stringify({ serverUrl: 42 }))
      const loaded = loadConfig(dir)
      expect(loaded).toEqual({ serverUrl: null })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('uses injectable fs for save and load', () => {
    const store: Record<string, string> = {}
    const fakeFs = {
      readFileSync: (path: string, _enc: BufferEncoding) => {
        if (path in store) return store[path]!
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      },
      writeFileSync: (path: string, data: string) => {
        store[path] = data
      },
    }

    saveConfig('/fake/dir', { serverUrl: 'https://injected.example.com' }, fakeFs)
    const loaded = loadConfig('/fake/dir', fakeFs)
    expect(loaded).toEqual({ serverUrl: 'https://injected.example.com' })
  })
})
