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
 */
import { app, BrowserWindow, ipcMain, shell, screen, Tray } from 'electron'
import { join } from 'node:path'
import { isValidServerUrl, normalizeServerUrl } from './url'
import { loadConfig, saveConfig } from './config'
import { sanitizeBounds, loadWindowState, saveWindowState } from './window-state'
import { createTray } from './tray'

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
        shell.openExternal(navigationUrl).catch(() => undefined)
      }
    } catch {
      event.preventDefault()
    }
  })

  win.webContents.setWindowOpenHandler(({ url: openUrl }) => {
    shell.openExternal(openUrl).catch(() => undefined)
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
    shell.openExternal(openUrl).catch(() => undefined)
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
      // Allow the close to actually destroy the window when replacing it
      appIsQuitting = true
      mainWindow.close()
      appIsQuitting = false
    }
    mainWindow = createWindow(normalised)

    return { ok: true }
  },
)

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
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
