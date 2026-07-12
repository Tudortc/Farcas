/**
 * Preload script — runs in the renderer context with Node integration OFF.
 * Exposes a minimal typed IPC surface via contextBridge.
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
})
