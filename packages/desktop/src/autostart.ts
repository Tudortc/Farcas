/**
 * Launch-at-login (autostart) helpers for bool desktop — electron-free, fully testable.
 *
 * `loginItemSettings` returns the shape expected by Electron's
 * `app.setLoginItemSettings`.  `readAutostart` / `writeAutostart` persist the
 * user's preference as JSON in userData, with an injectable `fs` parameter so
 * tests can pass a fake implementation.
 */
import { join } from 'node:path'
import * as nodefs from 'node:fs'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LoginItemSettings {
  openAtLogin: boolean
  openAsHidden: boolean
}

export interface FsImpl {
  readFileSync(path: string, encoding: BufferEncoding): string
  writeFileSync(path: string, data: string): void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function autostartPath(dir: string): string {
  return join(dir, 'autostart.json')
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the settings object to pass to `app.setLoginItemSettings`.
 * When enabled, `openAsHidden` is set to `true` so the app starts minimised
 * to the tray without a visible window.
 */
export function loginItemSettings(enabled: boolean): LoginItemSettings {
  return {
    openAtLogin: enabled,
    openAsHidden: enabled,
  }
}

/**
 * Reads the autostart preference from `<dir>/autostart.json`.
 * Returns `false` on any error (missing file, parse error, wrong shape).
 */
export function readAutostart(dir: string, fs: FsImpl = nodefs): boolean {
  try {
    const raw = fs.readFileSync(autostartPath(dir), 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'enabled' in parsed &&
      typeof (parsed as Record<string, unknown>)['enabled'] === 'boolean'
    ) {
      return (parsed as { enabled: boolean }).enabled
    }
    return false
  } catch {
    return false
  }
}

/**
 * Writes the autostart preference to `<dir>/autostart.json`.
 */
export function writeAutostart(dir: string, enabled: boolean, fs: FsImpl = nodefs): void {
  fs.writeFileSync(autostartPath(dir), JSON.stringify({ enabled }, null, 2))
}
