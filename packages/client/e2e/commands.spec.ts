import { test, expect } from './helpers.js'

test('join a channel via the sidebar + affordance', async ({ authedPage: page }) => {
  // Add a network so the join affordance is available.
  await page.getByRole('button', { name: 'Add network' }).click()
  const dialog = page.getByRole('dialog', { name: 'Network Settings' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Name', { exact: true }).fill('E2E Join Net')
  await dialog.getByLabel('Host').fill('127.0.0.1')
  await dialog.getByLabel('Port').fill('1')
  await dialog.getByLabel('TLS (recommended)').uncheck()
  await dialog.getByLabel('Nick').fill('e2ebot')
  await dialog.getByRole('button', { name: 'Add network' }).click()
  await expect(page.getByRole('dialog', { name: 'Network Settings' })).toHaveCount(0)

  // Open the join-channel affordance and join a channel.
  await page.getByRole('button', { name: /join a channel/i }).click()
  const input = page.getByRole('textbox', { name: /channel to join/i })
  await input.fill('#e2e-test')
  await input.press('Enter')
  // The channel row appears in the sidebar once joined.
  await expect(page.getByRole('button', { name: /e2e-test/i })).toBeVisible({ timeout: 15000 })
})

test('sign out returns to the login screen', async ({ authedPage: page }) => {
  // Open the command palette and sign out.
  await page.keyboard.press('ControlOrMeta+k')
  await page.getByText(/sign out/i).click()
  await expect(page.getByRole('button', { name: /sign in|register|log in/i })).toBeVisible({
    timeout: 15000,
  })
})
