import { test, expect } from './helpers.js'

async function openAppearance(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Appearance settings' }).click()
  await expect(page.getByRole('dialog', { name: 'Appearance settings' })).toBeVisible()
}

test.describe('Appearance (theme + density)', () => {
  test('opens the appearance popup from the topbar', async ({ authedPage: page }) => {
    await openAppearance(page)
    const menu = page.getByRole('dialog', { name: 'Appearance settings' })
    await expect(menu.getByText('Theme', { exact: true })).toBeVisible()
    await expect(menu.getByText('Density', { exact: true })).toBeVisible()
  })

  test('switching theme updates the document data-theme attribute', async ({ authedPage: page }) => {
    const html = page.locator('html')
    await openAppearance(page)
    const menu = page.getByRole('dialog', { name: 'Appearance settings' })

    await menu.getByRole('button', { name: 'B', exact: true }).click()
    await expect(html).toHaveAttribute('data-theme', 'b')

    await menu.getByRole('button', { name: 'Shimmer', exact: true }).click()
    await expect(html).toHaveAttribute('data-theme', 'shimmer')

    // Theme "A" is the default and clears the attribute entirely.
    await menu.getByRole('button', { name: 'A', exact: true }).click()
    await expect(html).not.toHaveAttribute('data-theme', /.+/)
  })

  test('toggling density updates the document data-density attribute', async ({
    authedPage: page,
  }) => {
    const html = page.locator('html')
    await openAppearance(page)
    const menu = page.getByRole('dialog', { name: 'Appearance settings' })

    await menu.getByRole('button', { name: 'Comfortable' }).click()
    await expect(html).toHaveAttribute('data-density', 'comfortable')
    await menu.getByRole('button', { name: 'Compact' }).click()
    await expect(html).toHaveAttribute('data-density', 'compact')
  })

  test('appearance choices persist across reload', async ({ authedPage: page }) => {
    await openAppearance(page)
    const menu = page.getByRole('dialog', { name: 'Appearance settings' })
    await menu.getByRole('button', { name: 'C', exact: true }).click()
    await menu.getByRole('button', { name: 'Comfortable' }).click()

    await page.reload()
    await expect(page.getByRole('navigation', { name: 'Networks' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'c')
    await expect(page.locator('html')).toHaveAttribute('data-density', 'comfortable')
  })

  test('selected theme is reflected via aria-pressed', async ({ authedPage: page }) => {
    await openAppearance(page)
    const menu = page.getByRole('dialog', { name: 'Appearance settings' })
    await menu.getByRole('button', { name: 'B', exact: true }).click()
    await expect(menu.getByRole('button', { name: 'B', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})
