import { test, expect } from './helpers.js'

test.describe('App shell (authenticated)', () => {
  test('renders the three-pane layout', async ({ authedPage: page }) => {
    await expect(page.getByRole('navigation', { name: 'Networks' })).toBeVisible()
    await expect(page.getByRole('complementary', { name: 'Channels' })).toBeVisible()
    await expect(page.getByRole('main')).toBeVisible()
    await expect(page.getByRole('complementary', { name: 'Members' })).toBeVisible()
  })

  test('shows the empty state for a fresh account with no networks', async ({ authedPage: page }) => {
    await expect(page.getByText('No network connected')).toBeVisible()
    await expect(page.getByText('Select a channel')).toBeVisible()
  })

  test('exposes a connection status indicator', async ({ authedPage: page }) => {
    await expect(page.getByLabel(/connection:/i)).toBeVisible()
  })

  test('always offers an "Add network" affordance in the rail', async ({ authedPage: page }) => {
    await expect(page.getByRole('button', { name: 'Add network' })).toBeVisible()
  })

  test('exposes an appearance/settings control in the topbar', async ({ authedPage: page }) => {
    await expect(page.getByRole('button', { name: 'Appearance settings' })).toBeVisible()
  })
})
