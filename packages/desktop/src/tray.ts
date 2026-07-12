/**
 * System-tray integration for bool desktop.
 *
 * Creates a Tray with a context menu (Show bool / Quit) and click-to-toggle
 * window visibility. Call `setUnread(tray, count)` to update the tooltip
 * (badge overlay support comes in Task 3).
 *
 * This file is Electron glue — not imported by pure tests.
 */
import { Tray, Menu, BrowserWindow, nativeImage } from 'electron'

export interface TrayCallbacks {
  onShow: () => void
  onQuit: () => void
}

/**
 * Creates a system tray icon for `win` and returns the Tray instance.
 *
 * @param win       The main BrowserWindow
 * @param callbacks `onShow` — called to bring the window to front; `onQuit` — called to quit the app
 * @param iconPath  Absolute path to the tray icon image file
 */
export function createTray(
  win: BrowserWindow,
  { onShow, onQuit }: TrayCallbacks,
  iconPath: string,
): Tray {
  const icon = nativeImage.createFromPath(iconPath)
  const tray = new Tray(icon)

  tray.setToolTip('bool')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show bool',
      click: () => onShow(),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => onQuit(),
    },
  ])

  tray.setContextMenu(contextMenu)

  // Left-click / primary-click: toggle window visibility
  tray.on('click', () => {
    if (win.isVisible()) {
      win.hide()
    } else {
      onShow()
    }
  })

  return tray
}

/**
 * Updates the tray tooltip to reflect an unread count.
 * Pass `count = 0` to reset to the default tooltip.
 * (Badge overlay rendering is deferred to Task 3.)
 */
export function setUnread(tray: Tray, count: number): void {
  if (count > 0) {
    tray.setToolTip(`bool (${count} unread)`)
  } else {
    tray.setToolTip('bool')
  }
}
