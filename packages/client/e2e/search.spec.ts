import { test, expect } from './helpers.js'

test.describe('Search panel', () => {
  test('opens with Cmd/Ctrl-Shift-F and focuses the query input', async ({ authedPage: page }) => {
    const panel = page.getByRole('dialog', { name: 'Search messages' })
    await expect(panel).toHaveCount(0)

    await page.keyboard.press('ControlOrMeta+Shift+F')
    await expect(panel).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Search query' })).toBeVisible()
  })

  test('shows the search-syntax hints', async ({ authedPage: page }) => {
    await page.keyboard.press('ControlOrMeta+Shift+F')
    const panel = page.getByRole('dialog', { name: 'Search messages' })
    const hints = panel.getByLabel('Search syntax hints')
    await expect(hints).toBeVisible()
    for (const token of ['in:', 'from:', 'before:', 'after:', 'has:']) {
      await expect(hints.getByText(token, { exact: true })).toBeVisible()
    }
  })

  test('closes with Escape', async ({ authedPage: page }) => {
    await page.keyboard.press('ControlOrMeta+Shift+F')
    const panel = page.getByRole('dialog', { name: 'Search messages' })
    await expect(panel).toBeVisible()
    await page.getByRole('textbox', { name: 'Search query' }).focus()
    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)
  })

  test('can be launched from the command palette', async ({ authedPage: page }) => {
    await page.keyboard.press('ControlOrMeta+k')
    await page.getByPlaceholder(/jump to a channel/i).fill('search')
    await page.getByRole('option').first().click()
    await expect(page.getByRole('dialog', { name: 'Search messages' })).toBeVisible()
  })
})
