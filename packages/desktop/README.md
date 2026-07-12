# bool Desktop

Electron wrapper that loads the bool web client from a self-hosted server and adds native OS integration: system tray, native notifications, unread badge, launch-at-login, and single-instance enforcement.

## Development

### Prerequisites

- Node.js >= 20
- pnpm >= 9

### Running in dev mode

1. Build the TypeScript sources first:

   ```sh
   pnpm --filter @bool/desktop build
   ```

2. Start the Electron app:

   ```sh
   pnpm --filter @bool/desktop dev
   ```

   Electron loads and shows a first-run setup screen.
   Enter your bool server URL (e.g. `https://bool.example.com`) and press **Connect**.
   The app navigates to your server and from then on launches directly to it.

> **Note:** The dev command runs `electron ./dist/main.js` directly — no hot-reload.
> Re-run `build` after any source change, then restart `dev`.

## Building a distributable package

Packages are produced by [electron-builder](https://www.electron.build/).

```sh
# Produce platform-native installers (dmg / nsis / AppImage) in release/
pnpm --filter @bool/desktop dist

# Unpackaged directory only (faster, useful for smoke-testing the build)
pnpm --filter @bool/desktop pack
```

Output lands in `packages/desktop/release/`.

Icon files expected by the build:

| Platform | Path |
|----------|------|
| All      | `packages/desktop/assets/icon.png` (512x512; electron-builder derives icns/ico automatically) |

> **Note:** Producing a real distributable (especially a code-signed `.dmg` or `.exe`) requires a desktop OS with the target platform's toolchain.  A CI/CD machine or a local macOS / Windows machine is needed for the final packaging step.  The `pnpm --filter @bool/desktop dev` workflow works on any desktop OS and does not require signing.

## Native features

| Feature | How it works |
|---------|--------------|
| Native notifications | The bool client calls `window.bool.notify(payload)` — main shows an `Notification` if the window is not focused. Click brings the window to front. |
| Unread badge | `window.bool.setBadge(count)` sets `app.badgeCount` (macOS dock / Linux taskbar) and updates the tray tooltip. |
| Launch at login | `window.bool.setAutostart(true/false)` persists the pref to `userData/autostart.json` and calls `app.setLoginItemSettings`. When enabled the app starts hidden in the tray. |
| Minimize to tray | Closing the window hides it; use **Quit** in the tray menu (or Cmd-Q) to exit. |
| Single instance | A second launch focuses the existing window instead of opening a duplicate. |
