import { test, expect } from './helpers.js'

test.describe('Command palette', () => {
  test('opens with Cmd/Ctrl-K and closes with Escape', async ({ authedPage: page }) => {
    const palette = page.getByRole('dialog', { name: 'Command palette' })
    await expect(palette).toHaveCount(0)

    await page.keyboard.press('ControlOrMeta+k')
    await expect(palette).toBeVisible()
    await expect(page.getByPlaceholder(/jump to a channel/i)).toBeFocused()

    await page.keyboard.press('Escape')
    await expect(palette).toHaveCount(0)
  })

  test('shows scope chips and an empty state for non-matching queries', async ({
    authedPage: page,
  }) => {
    await page.keyboard.press('ControlOrMeta+k')
    const palette = page.getByRole('dialog', { name: 'Command palette' })
    await expect(palette).toBeVisible()

    for (const chip of ['All', 'Channels', 'People', 'Actions']) {
      await expect(palette.getByText(chip, { exact: true })).toBeVisible()
    }

    await page.getByPlaceholder(/jump to a channel/i).fill('zzz-nonexistent-xyz')
    await expect(palette.getByText('No results found.')).toBeVisible()
  })

  test('exposes built-in actions (search / theme / density)', async ({ authedPage: page }) => {
    await page.keyboard.press('ControlOrMeta+k')
    const palette = page.getByRole('dialog', { name: 'Command palette' })
    await expect(palette.getByText(/Actions & Commands/i)).toBeVisible()
    // Filtering to "search" should keep at least one actionable result.
    await page.getByPlaceholder(/jump to a channel/i).fill('search')
    await expect(palette.getByRole('option').first()).toBeVisible()
  })

  test('clicking the scrim closes the palette', async ({ authedPage: page }) => {
    await page.keyboard.press('ControlOrMeta+k')
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible()
    await page.locator('.cp-scrim').click({ position: { x: 5, y: 5 } })
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toHaveCount(0)
  })
})
