import { test, expect } from '@playwright/test'

/* Signed-out smoke checks: nothing here needs an account */

test('login page renders its form', async ({ page }) => {
  await page.goto('/login')
  await expect(page.locator('form.login-form')).toBeVisible()
  await expect(page.getByRole('button', { name: /sign in|log in/i }).first()).toBeVisible()
})

test('register page renders', async ({ page }) => {
  await page.goto('/register')
  await expect(page).toHaveURL(/\/register$/)
  await expect(page.locator('form')).toBeVisible()
})

test('an unknown address shows the 404 page', async ({ page }) => {
  await page.goto('/does-not-exist')
  await expect(page.getByText('Page not found').first()).toBeVisible()
})

test('the feed redirects to login when signed out', async ({ page }) => {
  await page.goto('/feed')
  await expect(page).toHaveURL(/\/login$/)
})

test('robots.txt is served as text, not the app shell', async ({ request }) => {
  const res = await request.get('/robots.txt')
  expect(res.ok()).toBe(true)
  expect(res.headers()['content-type']).toContain('text/plain')
  expect(await res.text()).toContain('User-agent')
})

test('privacy page renders signed out', async ({ page }) => {
  await page.goto('/privacy')
  await expect(page).toHaveURL(/\/privacy$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeVisible()
  await expect(page.getByText('platonshan0@gmail.com')).toBeVisible()
})

test('terms page renders signed out', async ({ page }) => {
  await page.goto('/terms')
  await expect(page).toHaveURL(/\/terms$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Terms' })).toBeVisible()
})

test('a deep link sends a signed-out visitor to login', async ({ page }) => {
  await page.goto('/post/x')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Sign In' })).toBeVisible()
})

test('register links to the terms and privacy pages', async ({ page }) => {
  await page.goto('/register')
  await expect(page.getByRole('link', { name: 'Terms' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Privacy Policy' })).toBeVisible()
})

test('sign in and create account lead to each other', async ({ page }) => {
  /* With the slide between them (lib/authSwap.ts) the links must still land */
  await page.goto('/login')
  await page.getByRole('link', { name: 'Create an account' }).click()
  await expect(page).toHaveURL(/\/register$/)
  await expect(page.locator('.register-art')).toBeVisible()
  await page.getByRole('link', { name: /Back to Sign In/ }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByLabel('Email')).toBeEditable()
  await expect(page.locator('html')).not.toHaveClass(/auth-swap/)
})

test('forgot password opens from sign in and leads back', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('link', { name: 'Forgot password?' }).click()
  await expect(page).toHaveURL(/\/forgot-password$/)
  await expect(page.getByRole('heading', { name: 'Forgot your password?' })).toBeVisible()
  /* Nothing to send yet */
  await expect(page.getByRole('button', { name: 'Send reset link' })).toBeDisabled()
  await page.getByRole('link', { name: /Back to Sign In/ }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.locator('html')).not.toHaveClass(/auth-swap/)
})
