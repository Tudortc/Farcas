import { test, expect } from './helpers.js'
import { registerNewUser } from './helpers.js'

/**
 * Guard against uncaught JavaScript exceptions. Resource 404s (e.g. favicon)
 * and framework warnings are reported in docs/audit/E2E-AUDIT.md rather than
 * failing the suite; a thrown exception, however, is always a real regression.
 */
function collectPageErrors(page: import('@playwright/test').Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(String(err)))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`)
  })
  return errors
}

test.describe('Console / runtime error audit', () => {
  test('login screen loads without uncaught JS errors', async ({ page }) => {
    const errors = collectPageErrors(page)
    await page.goto('/')
    await expect(page.getByRole('form', { name: 'Sign in' })).toBeVisible()
    // Ignore resource-load 404s surfaced only as console errors without a stack.
    const fatal = errors.filter((e) => !/Failed to load resource/.test(e))
    expect(fatal, `Unexpected errors:\n${fatal.join('\n')}`).toEqual([])
  })

  test('authenticated app loads without uncaught JS errors', async ({ page }) => {
    const errors = collectPageErrors(page)
    await registerNewUser(page)
    await page.waitForTimeout(500) // let WS connect + initial render settle
    const fatal = errors.filter((e) => !/Failed to load resource/.test(e))
    expect(fatal, `Unexpected errors:\n${fatal.join('\n')}`).toEqual([])
  })
})
