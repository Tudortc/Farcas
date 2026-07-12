import { test, expect } from './helpers.js'

async function openNetworkSettings(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Add network' }).click()
  const dialog = page.getByRole('dialog', { name: 'Network Settings' })
  await expect(dialog).toBeVisible()
  // The dialog moves focus to the first field on open (setTimeout(0)); wait for
  // that to settle so a subsequent close/click can't race the focus grab.
  await expect(dialog.getByLabel('Name', { exact: true })).toBeFocused()
}

test.describe('Network settings', () => {
  test('opens the dialog with the expected fields', async ({ authedPage: page }) => {
    await openNetworkSettings(page)
    const dialog = page.getByRole('dialog', { name: 'Network Settings' })
    await expect(dialog.getByLabel('Name', { exact: true })).toBeVisible()
    await expect(dialog.getByLabel('Host')).toBeVisible()
    await expect(dialog.getByLabel('Port')).toBeVisible()
    await expect(dialog.getByLabel('Nick')).toBeVisible()
    await expect(dialog.getByLabel('TLS (recommended)')).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Add network' })).toBeVisible()
  })

  test('closes via the close button and via Escape', async ({ authedPage: page }) => {
    await openNetworkSettings(page)
    await page.getByRole('button', { name: 'Close dialog' }).click()
    await expect(page.getByRole('dialog', { name: 'Network Settings' })).toHaveCount(0)

    await openNetworkSettings(page)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Network Settings' })).toHaveCount(0)
  })

  test('required-field validation blocks submitting an empty form', async ({ authedPage: page }) => {
    await openNetworkSettings(page)
    const dialog = page.getByRole('dialog', { name: 'Network Settings' })
    await dialog.getByRole('button', { name: 'Add network' }).click()
    // HTML5 validation keeps the dialog open and marks the Name field invalid.
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel('Name', { exact: true })).toHaveJSProperty(
      'validity.valid',
      false,
    )
  })

  async function addTestNetwork(page: import('@playwright/test').Page, name: string) {
    await openNetworkSettings(page)
    const dialog = page.getByRole('dialog', { name: 'Network Settings' })
    await dialog.getByLabel('Name', { exact: true }).fill(name)
    await dialog.getByLabel('Host').fill('127.0.0.1')
    await dialog.getByLabel('Port').fill('1')
    await dialog.getByLabel('TLS (recommended)').uncheck()
    await dialog.getByLabel('Nick').fill('e2ebot')
    await dialog.getByRole('button', { name: 'Add network' }).click()
    await expect(page.getByRole('dialog', { name: 'Network Settings' })).toHaveCount(0)
  }

  test('adding a network persists it and shows it in the sidebar', async ({ authedPage: page }) => {
    await addTestNetwork(page, 'E2E Test Net')
    const channels = page.getByRole('complementary', { name: 'Channels' })
    await expect(channels.getByText('E2E Test Net')).toBeVisible({ timeout: 10_000 })
    // And it is listed as an existing network in the settings dialog.
    await openNetworkSettings(page)
    await expect(page.getByRole('button', { name: 'Remove E2E Test Net' })).toBeVisible()
  })

  test('removing a network takes effect (verified after reload)', async ({ authedPage: page }) => {
    await addTestNetwork(page, 'E2E Test Net')
    await openNetworkSettings(page)
    await page.getByRole('button', { name: 'Remove E2E Test Net' }).click()

    // Server-side removal is authoritative: after a reload the network is gone.
    await page.reload()
    await expect(page.getByRole('navigation', { name: 'Networks' })).toBeVisible()
    await expect(page.getByRole('complementary', { name: 'Channels' }).getByText('E2E Test Net')).toHaveCount(0)
  })

  test('removing a network updates the live UI without reload', async ({ authedPage: page }) => {
    // KNOWN BUG: the client `net:list` reducer (chat-store.ts) merges the
    // authoritative list into existing state and never prunes networks that
    // the server dropped, so a removed network lingers until a page reload.
    // See docs/audit/E2E-AUDIT.md.
    test.fixme(true, 'net:list reducer does not prune removed networks from live state')
    await addTestNetwork(page, 'E2E Test Net')
    await openNetworkSettings(page)
    await page.getByRole('button', { name: 'Remove E2E Test Net' }).click()
    await expect(page.getByRole('button', { name: 'Remove E2E Test Net' })).toHaveCount(0)
  })
})
