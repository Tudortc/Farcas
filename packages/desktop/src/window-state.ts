/**
 * Window-state persistence for bool desktop — electron-free, fully testable.
 *
 * Stores and restores window bounds (x, y, width, height) as JSON in userData.
 * `sanitizeBounds` clamps a saved bounds to the primary display work-area so
 * that a window saved on a now-disconnected monitor is always moved back
 * on-screen.
 */
import { join } from 'node:path'
import * as nodefs from 'node:fs'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MIN_WIDTH = 480
export const MIN_HEIGHT = 360
export const DEFAULT_WIDTH = 1100
export const DEFAULT_HEIGHT = 760

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

export interface WorkArea {
  x: number
  y: number
  width: number
  height: number
}

export interface FsImpl {
  readFileSync(path: string, encoding: BufferEncoding): string
  writeFileSync(path: string, data: string): void
}

// ---------------------------------------------------------------------------
// sanitizeBounds
// ---------------------------------------------------------------------------

/**
 * Clamps a saved window bounds to a visible display work-area.
 *
 * - If `saved` is missing or invalid, returns the default size centered in
 *   the work area.
 * - Enforces minimum size (MIN_WIDTH x MIN_HEIGHT).
 * - Clamps size to the work area dimensions.
 * - Moves the window back on-screen if it is (partially or fully) off-screen.
 */
export function sanitizeBounds(
  saved: Partial<Bounds> | null | undefined,
  workArea: WorkArea,
): Bounds {
  // Determine width and height first
  const rawW = saved?.width
  const rawH = saved?.height
  const rawX = saved?.x
  const rawY = saved?.y

  const isValidNumber = (n: unknown): n is number =>
    typeof n === 'number' && Number.isFinite(n)

  // If saved is missing or completely invalid, return default centered
  const hasValidSize = isValidNumber(rawW) && isValidNumber(rawH)
  const hasValidPos = isValidNumber(rawX) && isValidNumber(rawY)

  if (!hasValidSize && !hasValidPos) {
    return centeredDefault(workArea)
  }

  // Apply minimum and maximum size constraints
  let width = hasValidSize ? Math.max(rawW!, MIN_WIDTH) : DEFAULT_WIDTH
  let height = hasValidSize ? Math.max(rawH!, MIN_HEIGHT) : DEFAULT_HEIGHT

  // Clamp to work area size (don't exceed it)
  width = Math.min(width, workArea.width)
  height = Math.min(height, workArea.height)

  // Determine position
  let x = hasValidPos ? rawX! : workArea.x + Math.floor((workArea.width - width) / 2)
  let y = hasValidPos ? rawY! : workArea.y + Math.floor((workArea.height - height) / 2)

  // Clamp position so the window is on-screen
  // Right edge must be within work area
  if (x + width > workArea.x + workArea.width) {
    x = workArea.x + workArea.width - width
  }
  // Bottom edge must be within work area
  if (y + height > workArea.y + workArea.height) {
    y = workArea.y + workArea.height - height
  }
  // Left edge
  if (x < workArea.x) {
    x = workArea.x
  }
  // Top edge
  if (y < workArea.y) {
    y = workArea.y
  }

  return { x, y, width, height }
}

function centeredDefault(workArea: WorkArea): Bounds {
  const width = Math.min(DEFAULT_WIDTH, workArea.width)
  const height = Math.min(DEFAULT_HEIGHT, workArea.height)
  const x = workArea.x + Math.floor((workArea.width - width) / 2)
  const y = workArea.y + Math.floor((workArea.height - height) / 2)
  return { x, y, width, height }
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function statePath(dir: string): string {
  return join(dir, 'window-state.json')
}

/**
 * Loads the saved window bounds from `<dir>/window-state.json`.
 * Returns `null` on any error (missing file, parse error, wrong shape).
 */
export function loadWindowState(dir: string, fs: FsImpl = nodefs): Bounds | null {
  try {
    const raw = fs.readFileSync(statePath(dir), 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      isFiniteNumber((parsed as Record<string, unknown>)['x']) &&
      isFiniteNumber((parsed as Record<string, unknown>)['y']) &&
      isFiniteNumber((parsed as Record<string, unknown>)['width']) &&
      isFiniteNumber((parsed as Record<string, unknown>)['height'])
    ) {
      const b = parsed as Record<string, unknown>
      return {
        x: b['x'] as number,
        y: b['y'] as number,
        width: b['width'] as number,
        height: b['height'] as number,
      }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Writes `bounds` to `<dir>/window-state.json` as JSON.
 */
export function saveWindowState(dir: string, bounds: Bounds, fs: FsImpl = nodefs): void {
  fs.writeFileSync(statePath(dir), JSON.stringify(bounds, null, 2))
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}
