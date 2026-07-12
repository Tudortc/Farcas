/**
 * Electron main process entry point for bool desktop.
 *
 * Security posture:
 *  - contextIsolation: true, nodeIntegration: false
 *  - webSecurity: true
 *  - Strict navigation guard: only the configured server origin is allowed
 *  - External links are opened via shell.openExternal
 *  - Server URL is validated (http/https + host) before loading
 *  - Single-instance lock: second instance focuses the existing window
 *
 * Features added in Task 2:
 *  - Window-state persistence: bounds saved on move/resize (debounced) + close
 *  - Minimize-to-tray: closing the window hides it; Quit from the tray menu
 *    (or Cmd-Q / app.quit()) actually exits
 *  - System tray: Show bool / Quit context menu, click-to-toggle
 *
 * Features added in Task 3:
 *  - Native mention notifications via bool.notify(payload) IPC
 *  - Unread badge via bool.setBadge(count) IPC (app.badgeCount + tray tooltip)
 *  - Launch-at-login via bool.setAutostart(enabled) IPC (persisted preference)
 */
import { app, BrowserWindow, ipcMain, shell, screen, Tray, Notification } from 'electron'
import { join } from 'node:path'
import { isExternalHttpUrl, isValidServerUrl, normalizeServerUrl } from './url'
import { loadConfig, saveConfig } from './config'
import { sanitizeBounds, loadWindowState, saveWindowState } from './window-state'
import { createTray, setUnread } from './tray'
import { buildNotification, shouldNotify } from './notify'
import { loginItemSettings, readAutostart, writeAutostart } from './autostart'

const CONFIG_DIR = app.getPath('userData')
const ICON_PATH = join(__dirname, '..', 'assets', 'tray.png')

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

/** Set to true before app.quit() so the close handler lets the window die. */
let appIsQuitting = false

// ---------------------------------------------------------------------------
// Single-instance lock
// ---------------------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
  process.exit(0)
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    if (!mainWindow.isVisible()) mainWindow.show()
    mainWindow.focus()
  }
})

// ---------------------------------------------------------------------------
// Security helpers
// ---------------------------------------------------------------------------

/**
 * Opens a URL in the default system browser ONLY for http/https schemes.
 * All other schemes (file://, javascript:, custom protocols) are silently dropped
 * to prevent OS-level scheme handler escalation.
 */
function openExternalSafe(u: string): void {
  if (isExternalHttpUrl(u)) void shell.openExternal(u).catch(() => undefined)
}

// ---------------------------------------------------------------------------
// Debounce helper
// ---------------------------------------------------------------------------
function debounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  ms: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  return (...args: Parameters<T>) => {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      fn(...args)
    }, ms)
  }
}

// ---------------------------------------------------------------------------
// Window-state helpers
// ---------------------------------------------------------------------------
function persistBounds(win: BrowserWindow): void {
  const b = win.getBounds()
  saveWindowState(CONFIG_DIR, b)
}

const persistBoundsDebounced = debounce(persistBounds, 400)

// ---------------------------------------------------------------------------
// Window creation helpers
// ---------------------------------------------------------------------------
function createWindow(url: string): BrowserWindow {
  const primaryDisplay = screen.getPrimaryDisplay()
  const workArea = primaryDisplay.workArea

  const saved = loadWindowState(CONFIG_DIR)
  const bounds = sanitizeBounds(saved, workArea)

  const win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      sandbox: true,
    },
  })

  // Restrict navigation to the configured server origin
  let serverOrigin: string
  try {
    serverOrigin = new URL(url).origin
  } catch {
    serverOrigin = url
  }

  win.webContents.on('will-navigate', (event, navigationUrl) => {
    try {
      const target = new URL(navigationUrl)
      if (target.origin !== serverOrigin) {
        event.preventDefault()
        openExternalSafe(navigationUrl)
      }
    } catch {
      event.preventDefault()
    }
  })

  win.webContents.setWindowOpenHandler(({ url: openUrl }) => {
    openExternalSafe(openUrl)
    return { action: 'deny' }
  })

  // Persist bounds on move and resize (debounced)
  win.on('move', () => persistBoundsDebounced(win))
  win.on('resize', () => persistBoundsDebounced(win))

  // Minimize-to-tray: intercept close, hide instead of destroying
  win.on('close', (event) => {
    if (!appIsQuitting) {
      event.preventDefault()
      win.hide()
    } else {
      // Save final bounds before the window is destroyed
      persistBounds(win)
    }
  })

  win.loadURL(url).catch((err: unknown) => {
    console.error('[bool] Failed to load server URL:', err)
  })

  return win
}

function createSetupWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 600,
    height: 400,
    resizable: false,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      sandbox: true,
    },
  })

  // Only allow navigation within the local first-run page
  win.webContents.on('will-navigate', (event) => {
    event.preventDefault()
  })

  win.webContents.setWindowOpenHandler(({ url: openUrl }) => {
    openExternalSafe(openUrl)
    return { action: 'deny' }
  })

  // Setup window also minimizes to tray on close
  win.on('close', (event) => {
    if (!appIsQuitting) {
      event.preventDefault()
      win.hide()
    }
  })

  win.loadFile(join(__dirname, 'index.html')).catch((err: unknown) => {
    console.error('[bool] Failed to load setup screen:', err)
  })

  return win
}

// ---------------------------------------------------------------------------
// Tray helpers
// ---------------------------------------------------------------------------
function showWindow(): void {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
}

function quitApp(): void {
  appIsQuitting = true
  app.quit()
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------
ipcMain.handle('bool:getServerUrl', (): string | null => {
  const cfg = loadConfig(CONFIG_DIR)
  return cfg.serverUrl
})

/**
 * Show a native OS notification for a mention or DM.
 * Gated by shouldNotify — skipped when the window is focused.
 * On click, the window is restored and focused.
 */
ipcMain.on('bool:notify', (_event, payload: unknown) => {
  const safe = payload as { title: string; body: string; tag?: string; data?: unknown }
  if (!mainWindow) return
  if (!shouldNotify({ focused: mainWindow.isFocused() })) return

  const { title, body } = buildNotification({
    title: typeof safe.title === 'string' ? safe.title : '',
    body: typeof safe.body === 'string' ? safe.body : '',
    tag: typeof safe.tag === 'string' ? safe.tag : undefined,
  })

  if (!Notification.isSupported()) return

  const notification = new Notification({ title, body, silent: false })
  notification.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      if (!mainWindow.isVisible()) mainWindow.show()
      mainWindow.focus()
    }
  })
  notification.show()
})

/**
 * Set the unread badge count.
 * Updates app.badgeCount (macOS/Linux) and the tray tooltip.
 */
ipcMain.on('bool:setBadge', (_event, count: unknown) => {
  const n = typeof count === 'number' && Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0
  // app.badgeCount is supported on macOS and some Linux environments
  app.badgeCount = n
  if (tray) {
    setUnread(tray, n)
  }
})

/**
 * Enable or disable launch-at-login.
 * Persists the preference and applies it via app.setLoginItemSettings.
 */
ipcMain.on('bool:setAutostart', (_event, enabled: unknown) => {
  const value = typeof enabled === 'boolean' ? enabled : false
  writeAutostart(CONFIG_DIR, value)
  app.setLoginItemSettings(loginItemSettings(value))
})

ipcMain.handle(
  'bool:setServerUrl',
  (_event, raw: unknown): { ok: true } | { ok: false; error: string } => {
    if (typeof raw !== 'string' || !raw.trim()) {
      return { ok: false, error: 'URL must be a non-empty string.' }
    }

    const normalised = normalizeServerUrl(raw)

    if (!isValidServerUrl(normalised)) {
      return { ok: false, error: 'Invalid URL — must be http:// or https:// with a host.' }
    }

    saveConfig(CONFIG_DIR, { serverUrl: normalised })

    if (mainWindow) {
      // destroy() bypasses the minimize-to-tray close handler cleanly
      mainWindow.destroy()
    }
    mainWindow = createWindow(normalised)

    return { ok: true }
  },
)

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  // Apply persisted launch-at-login preference on every startup
  const autostartEnabled = readAutostart(CONFIG_DIR)
  app.setLoginItemSettings(loginItemSettings(autostartEnabled))

  const cfg = loadConfig(CONFIG_DIR)
  const url = cfg.serverUrl

  if (url && isValidServerUrl(url)) {
    mainWindow = createWindow(url)
  } else {
    mainWindow = createSetupWindow()
  }

  // Wire up system tray
  if (mainWindow) {
    tray = createTray(mainWindow, { onShow: showWindow, onQuit: quitApp }, ICON_PATH)
  }

  app.on('activate', () => {
    // macOS: show or re-open when dock icon is clicked
    if (mainWindow) {
      showWindow()
    } else {
      const cfg2 = loadConfig(CONFIG_DIR)
      if (cfg2.serverUrl && isValidServerUrl(cfg2.serverUrl)) {
        mainWindow = createWindow(cfg2.serverUrl)
      } else {
        mainWindow = createSetupWindow()
      }
      if (mainWindow && tray === null) {
        tray = createTray(mainWindow, { onShow: showWindow, onQuit: quitApp }, ICON_PATH)
      }
    }
  })
})

app.on('before-quit', () => {
  appIsQuitting = true
})

app.on('window-all-closed', () => {
  // With minimize-to-tray, windows are hidden, not closed — so this fires
  // only when appIsQuitting is true (real quit).
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
