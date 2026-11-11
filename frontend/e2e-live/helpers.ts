import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { chromium, expect } from '@playwright/test'
import type { Browser, Locator, Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

/*
 * Helpers for the signed-in tests. They run against the REAL Supabase project
 * named in frontend/.env, so every test works only on accounts it creates here
 * and deletes again. Never point a test at content it did not create.
 */
const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.includes('='))
    .map((line) => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()]),
)

const newClient = () => createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
export const anonClient = newClient

export type TestUser = { client: SupabaseClient; id: string; email: string; username: string; password: string }

/* Throwaway accounts need sign-ups without a confirmation email */
export async function signupsConfirmInstantly(): Promise<boolean> {
  const res = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: env.VITE_SUPABASE_ANON_KEY } })
  const settings = await res.json() as { mailer_autoconfirm?: boolean }
  return settings.mailer_autoconfirm === true
}

export async function signup(label: string): Promise<TestUser> {
  const client = newClient()
  const tag = randomBytes(3).toString('hex')
  const username = `e2e${label}_${tag}`
  const email = `e2e${label}.${tag}@example.com`
  const password = `E2e-${randomBytes(9).toString('hex')}`
  const { data, error } = await client.auth.signUp({ email, password, options: { data: { username } } })
  if (error || !data.session || !data.user) throw new Error(`signup failed: ${error?.message ?? 'no session'}`)
  client.realtime.setAuth(data.session.access_token)
  return { client, id: data.user.id, email, username, password }
}

/* Removes the accounts and their post photos; chat photos are the test's own job */
export async function cleanup(users: TestUser[]): Promise<void> {
  for (const user of users) {
    const bucket = user.client.storage.from('post-images')
    const { data: folders } = await bucket.list(user.id)
    for (const folder of folders ?? []) {
      const { data: files } = await bucket.list(`${user.id}/${folder.name}`)
      if (files?.length) await bucket.remove(files.map((f) => `${user.id}/${folder.name}/${f.name}`))
    }
    await user.client.rpc('delete_my_account')
  }
}

export async function signIn(browser: Browser, user: TestUser): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  await page.goto('/login')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password', { exact: true }).fill(user.password)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.waitForURL('**/feed')
  return page
}

export const launch = () => chromium.launch({ channel: 'chrome' })

/* A 1x1 PNG */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
export const png = (name: string) => ({ name, mimeType: 'image/png', buffer: PNG })

const FAILURE = { status: 500, contentType: 'application/json', body: '{"statusCode":"500","error":"test","message":"forced failure"}' }

/* The next `count` POSTs to a URL fail; call with 0 to let everything through */
export async function failPosts(page: Page, url: string, count: number): Promise<void> {
  let left = count
  await page.unroute(url).catch(() => {})
  if (count === 0) return
  await page.route(url, (route) => {
    if (route.request().method() === 'POST' && left > 0) {
      left -= 1
      return route.fulfill(FAILURE)
    }
    return route.continue()
  })
}
export const UPLOADS = '**/storage/v1/object/post-images/**'
export const PHOTO_ROWS = '**/rest/v1/post_images*'

export const signedPhotos = (card: Locator) => card.locator('img[src*="/object/sign/"]')

export async function storedPhotos(user: TestUser, postId: string) {
  const { data } = await user.client.from('post_images').select('id, image_url, position').eq('post_id', postId)
  return data ?? []
}

export async function latestPostId(user: TestUser, content: string): Promise<string> {
  const { data, error } = await user.client.from('posts').select('id').eq('user_id', user.id).eq('content', content)
    .order('created_at', { ascending: false }).limit(1).single()
  if (error || !data) throw new Error(`post not found: ${content}`)
  return data.id
}

/* The composer is one line until it is tapped; a draft or a retry keeps it open */
export async function openComposer(page: Page): Promise<Locator> {
  const prompt = page.locator('.compose-prompt')
  const form = page.locator('.compose-card textarea')
  await expect(prompt.or(form).first()).toBeVisible()
  if (await prompt.count()) await prompt.click()
  await expect(form).toBeVisible()
  return page.locator('.compose-card')
}

export async function openEditPost(page: Page, card: Locator): Promise<Locator> {
  await card.locator('button[aria-haspopup=menu]').click()
  await page.getByRole('menuitem', { name: 'Edit post' }).click()
  const dialog = page.locator('.edit-modal-box')
  await expect(dialog).toBeVisible()
  return dialog
}

export async function cancelAndDiscard(page: Page, dialog: Locator): Promise<void> {
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Discard' }).click()
  await expect(dialog).toHaveCount(0)
}
