/**
 * Persistent configuration for bool desktop — electron-free, fully testable.
 *
 * Config is stored as JSON in `<dir>/config.json`.
 * An injectable `fs` parameter lets tests pass a fake/temp-dir implementation.
 */
import { join } from 'node:path'
import * as nodefs from 'node:fs'

export interface Config {
  serverUrl: string | null
}

export interface FsImpl {
  readFileSync(path: string, encoding: BufferEncoding): string
  writeFileSync(path: string, data: string): void
}

function configPath(dir: string): string {
  return join(dir, 'config.json')
}

/**
 * Reads `<dir>/config.json` and returns `{ serverUrl }`.
 * Returns `{ serverUrl: null }` on any error (missing file, parse error, wrong shape).
 */
export function loadConfig(dir: string, fs: FsImpl = nodefs): Config {
  try {
    const raw = fs.readFileSync(configPath(dir), 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'serverUrl' in parsed &&
      typeof (parsed as Record<string, unknown>)['serverUrl'] === 'string'
    ) {
      return { serverUrl: (parsed as { serverUrl: string })['serverUrl'] }
    }
    return { serverUrl: null }
  } catch {
    return { serverUrl: null }
  }
}

/**
 * Writes `cfg` to `<dir>/config.json` as JSON.
 */
export function saveConfig(dir: string, cfg: Config, fs: FsImpl = nodefs): void {
  fs.writeFileSync(configPath(dir), JSON.stringify(cfg, null, 2))
}
