import { test, expect } from '@playwright/test'
import { newCredentials, registerNewUser, expectAppShell } from './helpers.js'

test.describe('Authentication', () => {
  test('login screen renders with expected controls', async ({ page }) => {
    await page.goto('/')
    const form = page.getByRole('form', { name: 'Sign in' })
    await expect(form).toBeVisible()
    await expect(page.getByRole('heading', { name: 'bool', level: 1 })).toBeVisible()
    await expect(form.getByRole('textbox', { name: 'Username' })).toBeVisible()
    await expect(form.getByRole('textbox', { name: 'Password' })).toBeVisible()
    await expect(form.getByRole('button', { name: 'Sign in' })).toBeVisible()
    // Email field is only shown in register mode.
    await expect(form.getByRole('textbox', { name: 'Email' })).toHaveCount(0)
  })

  test('toggles between sign in and register', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /need an account\? register/i }).click()
    const register = page.getByRole('form', { name: 'Register' })
    await expect(register).toBeVisible()
    await expect(register.getByRole('textbox', { name: 'Email' })).toBeVisible()
    await expect(register.getByRole('button', { name: /create account/i })).toBeVisible()

    await page.getByRole('button', { name: /have an account\? sign in/i }).click()
    await expect(page.getByRole('form', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Email' })).toHaveCount(0)
  })

  test('registering a new account lands in the app shell', async ({ page }) => {
    await registerNewUser(page)
    await expectAppShell(page)
    // The bool logo mark in the network rail confirms we are authenticated.
    await expect(page.getByLabel('bool', { exact: true })).toBeVisible()
  })

  test('registered user stays signed in after reload (session persists)', async ({ page }) => {
    await registerNewUser(page)
    await page.reload()
    await expectAppShell(page)
    await expect(page.getByRole('form', { name: 'Sign in' })).toHaveCount(0)
  })

  test('sign in with wrong credentials shows an error and stays on login', async ({ page }) => {
    await page.goto('/')
    const form = page.getByRole('form', { name: 'Sign in' })
    await form.getByRole('textbox', { name: 'Username' }).fill('nobody_here_x')
    await form.getByRole('textbox', { name: 'Password' }).fill('definitely-wrong')
    await form.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByRole('form', { name: 'Sign in' })).toBeVisible()
  })

  test('sign in works with a previously registered account', async ({ page }) => {
    const creds = newCredentials()
    await registerNewUser(page, creds)
    // Clear session by wiping cookies/storage, then sign in with the same creds.
    await page.context().clearCookies()
    await page.goto('/')
    const form = page.getByRole('form', { name: 'Sign in' })
    await form.getByRole('textbox', { name: 'Username' }).fill(creds.username)
    await form.getByRole('textbox', { name: 'Password' }).fill(creds.password)
    await form.getByRole('button', { name: 'Sign in' }).click()
    await expectAppShell(page)
  })

  test('duplicate username registration is rejected', async ({ page }) => {
    const creds = newCredentials()
    await registerNewUser(page, creds)
    await page.context().clearCookies()
    await page.goto('/')
    await page.getByRole('button', { name: /need an account\? register/i }).click()
    const register = page.getByRole('form', { name: 'Register' })
    await register.getByRole('textbox', { name: 'Username' }).fill(creds.username)
    await register.getByRole('textbox', { name: 'Email' }).fill(`dupe-${creds.email}`)
    await register.getByRole('textbox', { name: 'Password' }).fill(creds.password)
    await register.getByRole('button', { name: /create account/i }).click()
    await expect(page.getByRole('alert')).toBeVisible()
  })
})
