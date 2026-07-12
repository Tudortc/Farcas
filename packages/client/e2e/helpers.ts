import { test as base, expect, type Page } from '@playwright/test'

export interface Credentials {
  username: string
  email: string
  password: string
}

let seq = 0

/** Unique-per-invocation credentials so parallel workers never collide. */
export function newCredentials(): Credentials {
  const id = `${Date.now().toString(36)}${(seq++).toString(36)}${Math.floor(
    Math.random() * 1e6,
  ).toString(36)}`
  const username = `e2e_${id}`
  return { username, email: `${username}@e2e.local`, password: 'e2e-Passw0rd!' }
}

/** Register a brand-new account via the UI and wait for the app shell. */
export async function registerNewUser(page: Page, creds = newCredentials()): Promise<Credentials> {
  await page.goto('/')
  await page.getByRole('button', { name: /need an account\? register/i }).click()
  const form = page.getByRole('form', { name: 'Register' })
  await form.getByRole('textbox', { name: 'Username' }).fill(creds.username)
  await form.getByRole('textbox', { name: 'Email' }).fill(creds.email)
  await form.getByRole('textbox', { name: 'Password' }).fill(creds.password)
  await form.getByRole('button', { name: /create account/i }).click()
  await expectAppShell(page)
  return creds
}

/** Assert the authenticated app shell has rendered. */
export async function expectAppShell(page: Page): Promise<void> {
  await expect(page.getByRole('navigation', { name: 'Networks' })).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'Channels' })).toBeVisible()
}

/** Fixture that provides a `page` already registered + inside the app shell. */
export const test = base.extend<{ authedPage: Page; creds: Credentials }>({
  creds: async ({}, use) => {
    await use(newCredentials())
  },
  authedPage: async ({ page, creds }, use) => {
    await registerNewUser(page, creds)
    await use(page)
  },
})

export { expect }
