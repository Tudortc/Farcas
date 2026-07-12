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
 */
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { isValidServerUrl, normalizeServerUrl } from './url'
import { loadConfig, saveConfig } from './config'

const CONFIG_DIR = app.getPath('userData')

let mainWindow: BrowserWindow | null = null

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
    mainWindow.focus()
  }
})

// ---------------------------------------------------------------------------
// Window creation helpers
// ---------------------------------------------------------------------------
function createWindow(url: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
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

  win.loadFile(join(__dirname, 'index.html')).catch((err: unknown) => {
    console.error('[bool] Failed to load setup screen:', err)
  })

  return win
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
      mainWindow.close()
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

  app.on('activate', () => {
    // macOS: re-open window when dock icon is clicked and no window is open
    if (BrowserWindow.getAllWindows().length === 0) {
      const cfg2 = loadConfig(CONFIG_DIR)
      if (cfg2.serverUrl && isValidServerUrl(cfg2.serverUrl)) {
        mainWindow = createWindow(cfg2.serverUrl)
      } else {
        mainWindow = createSetupWindow()
      }
    }
  })
})

app.on('window-all-closed', () => {
  // On macOS, apps stay in the dock even with no windows open (handled above).
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
