/**
 * Tests for window-state.ts (electron-free, pure).
 */
import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sanitizeBounds, loadWindowState, saveWindowState } from './window-state.js'

const DEFAULT_WIDTH = 1100
const DEFAULT_HEIGHT = 760
const MIN_WIDTH = 480
const MIN_HEIGHT = 360

/** A typical work area representing a 1920x1080 display at (0, 0) */
const workArea = { x: 0, y: 0, width: 1920, height: 1080 }

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'bool-winstate-test-'))
}

// ---------------------------------------------------------------------------
// sanitizeBounds
// ---------------------------------------------------------------------------
describe('sanitizeBounds', () => {
  it('keeps an on-screen bounds unchanged', () => {
    const saved = { x: 100, y: 100, width: 1200, height: 800 }
    const result = sanitizeBounds(saved, workArea)
    expect(result).toEqual({ x: 100, y: 100, width: 1200, height: 800 })
  })

  it('moves a window that is off-screen to the left back on-screen', () => {
    const saved = { x: -5000, y: 100, width: 1200, height: 800 }
    const result = sanitizeBounds(saved, workArea)
    expect(result.x).toBeGreaterThanOrEqual(workArea.x)
    expect(result.y).toBeGreaterThanOrEqual(workArea.y)
    expect(result.width).toBeGreaterThanOrEqual(MIN_WIDTH)
    expect(result.height).toBeGreaterThanOrEqual(MIN_HEIGHT)
  })

  it('moves a window that is off-screen far to the right back on-screen', () => {
    const saved = { x: 50000, y: 100, width: 1200, height: 800 }
    const result = sanitizeBounds(saved, workArea)
    // x + width must be within the work area
    expect(result.x).toBeLessThan(workArea.x + workArea.width)
    expect(result.x).toBeGreaterThanOrEqual(workArea.x)
  })

  it('moves a window that is off-screen far above back on-screen', () => {
    const saved = { x: 100, y: -9000, width: 1200, height: 800 }
    const result = sanitizeBounds(saved, workArea)
    expect(result.y).toBeGreaterThanOrEqual(workArea.y)
  })

  it('moves a window that is off-screen far below back on-screen', () => {
    const saved = { x: 100, y: 90000, width: 1200, height: 800 }
    const result = sanitizeBounds(saved, workArea)
    expect(result.y).toBeLessThan(workArea.y + workArea.height)
  })

  it('bumps a too-small width to the minimum', () => {
    const saved = { x: 100, y: 100, width: 100, height: 800 }
    const result = sanitizeBounds(saved, workArea)
    expect(result.width).toBeGreaterThanOrEqual(MIN_WIDTH)
  })

  it('bumps a too-small height to the minimum', () => {
    const saved = { x: 100, y: 100, width: 1200, height: 10 }
    const result = sanitizeBounds(saved, workArea)
    expect(result.height).toBeGreaterThanOrEqual(MIN_HEIGHT)
  })

  it('returns the default size when saved is null/undefined', () => {
    const result = sanitizeBounds(null, workArea)
    expect(result.width).toBe(DEFAULT_WIDTH)
    expect(result.height).toBe(DEFAULT_HEIGHT)
    // Should be positioned within work area
    expect(result.x).toBeGreaterThanOrEqual(workArea.x)
    expect(result.y).toBeGreaterThanOrEqual(workArea.y)
  })

  it('returns the default size when saved is undefined', () => {
    const result = sanitizeBounds(undefined, workArea)
    expect(result.width).toBe(DEFAULT_WIDTH)
    expect(result.height).toBe(DEFAULT_HEIGHT)
  })

  it('returns the default size when saved has NaN values', () => {
    const saved = { x: NaN, y: NaN, width: NaN, height: NaN }
    const result = sanitizeBounds(saved, workArea)
    expect(result.width).toBe(DEFAULT_WIDTH)
    expect(result.height).toBe(DEFAULT_HEIGHT)
    expect(Number.isFinite(result.x)).toBe(true)
    expect(Number.isFinite(result.y)).toBe(true)
  })

  it('clamps window that is larger than work area to work area size', () => {
    const saved = { x: 0, y: 0, width: 99999, height: 99999 }
    const result = sanitizeBounds(saved, workArea)
    expect(result.width).toBeLessThanOrEqual(workArea.width)
    expect(result.height).toBeLessThanOrEqual(workArea.height)
  })
})

// ---------------------------------------------------------------------------
// save / load round-trip
// ---------------------------------------------------------------------------
describe('loadWindowState / saveWindowState', () => {
  it('returns null when no state file exists', () => {
    const dir = makeTmpDir()
    try {
      const state = loadWindowState(dir)
      expect(state).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('saves and loads a window bounds round-trip', () => {
    const dir = makeTmpDir()
    try {
      const bounds = { x: 200, y: 150, width: 1280, height: 900 }
      saveWindowState(dir, bounds)
      const loaded = loadWindowState(dir)
      expect(loaded).toEqual(bounds)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns null for corrupt JSON', () => {
    const dir = makeTmpDir()
    const store: Record<string, string> = { [join(dir, 'window-state.json')]: 'not json!!' }
    const fakeFs = {
      readFileSync: (path: string, _enc: BufferEncoding): string => {
        if (path in store) return store[path]!
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      },
      writeFileSync: (path: string, data: string) => {
        store[path] = data
      },
    }
    const result = loadWindowState(dir, fakeFs)
    expect(result).toBeNull()
  })

  it('uses injectable fs for save and load (no disk I/O)', () => {
    const store: Record<string, string> = {}
    const fakeFs = {
      readFileSync: (path: string, _enc: BufferEncoding): string => {
        if (path in store) return store[path]!
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      },
      writeFileSync: (path: string, data: string) => {
        store[path] = data
      },
    }

    const bounds = { x: 50, y: 80, width: 1100, height: 760 }
    saveWindowState('/fake/dir', bounds, fakeFs)
    const loaded = loadWindowState('/fake/dir', fakeFs)
    expect(loaded).toEqual(bounds)
  })
})
