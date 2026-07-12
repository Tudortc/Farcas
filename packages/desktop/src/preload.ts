/**
 * Preload script — runs in the renderer context with Node integration OFF.
 * Exposes a minimal typed IPC surface via contextBridge.
 *
 * Task 1: getServerUrl / setServerUrl
 * Task 3: notify / setBadge / setAutostart
 */
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('bool', {
  /**
   * Returns the currently configured server URL (or null if not yet set).
   */
  getServerUrl: (): Promise<string | null> => ipcRenderer.invoke('bool:getServerUrl'),

  /**
   * Validates, normalises, saves the given URL, then instructs main to load it.
   * Resolves with { ok: true } on success or { ok: false, error: string } on failure.
   */
  setServerUrl: (url: string): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke('bool:setServerUrl', url),

  /**
   * Posts a mention/DM notification to main. Main will show a native OS
   * notification if the window is not currently focused.
   *
   * Payload shape matches M7: { title, body, tag?, data? }
   */
  notify: (payload: {
    title: string
    body: string
    tag?: string
    data?: { networkId?: string; target?: string }
  }): void => {
    ipcRenderer.send('bool:notify', payload)
  },

  /**
   * Sets the unread-message badge count.
   * Updates app.badgeCount (macOS/Linux) and the tray icon tooltip.
   */
  setBadge: (count: number): void => {
    ipcRenderer.send('bool:setBadge', count)
  },

  /**
   * Enables or disables launch-at-login.
   * The setting is persisted and applied immediately via app.setLoginItemSettings.
   */
  setAutostart: (enabled: boolean): void => {
    ipcRenderer.send('bool:setAutostart', enabled)
  },
})
