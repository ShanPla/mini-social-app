import { test, expect } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'
import { anonClient, cleanup, launch, signIn, signup, signupsConfirmInstantly } from './helpers'
import type { TestUser } from './helpers'

test.describe.serial('what the database keeps private', () => {
  let browser: Browser
  let first: TestUser
  let second: TestUser
  let page: Page

  test.beforeAll(async () => {
    test.skip(!(await signupsConfirmInstantly()), 'Confirm email is on, so throwaway accounts can not sign up')
    first = await signup('x')
    second = await signup('y')
    browser = await launch()
    page = await signIn(browser, first)
  })

  test.afterAll(async () => {
    await browser?.close()
    await cleanup([first, second].filter(Boolean))
  })

  test('admin status is yours to ask about, nobody else\'s', async () => {
    expect((await first.client.rpc('i_am_admin')).data).toBe(false)
    expect((await anonClient().rpc('i_am_admin')).error?.code).toBe('42501')
    const secret = await first.client.from('profiles').select('is_admin').eq('id', second.id)
    expect(secret.error?.code).toBe('42501')
    expect((await first.client.from('profiles').select('*').eq('id', second.id)).error?.code).toBe('42501')
    const shown = await first.client.from('profiles').select('id, username, display_name, bio, avatar_url, created_at').eq('id', second.id).single()
    expect(shown.data?.username).toBe(second.username)
  })

  test('the app works with named columns, and the admin page stays closed', async () => {
    const problems: string[] = []
    page.on('response', (r) => {
      if (r.status() >= 400 && !r.url().includes('/_vercel/')) problems.push(`${r.status()} ${r.url().split('?')[0]}`)
    })
    await page.goto('/feed')
    await expect(page.locator('.profile-card-top')).toBeVisible()
    await page.goto(`/profile/${second.id}`)
    await expect(page.getByText(second.username).first()).toBeVisible()
    await page.goto(`/profile/${first.id}`)
    await page.getByRole('button', { name: 'Edit Profile' }).click()
    await page.getByLabel('Bio').fill('Saved by the test')
    await page.getByRole('button', { name: /^Save/ }).first().click()
    await expect(page.getByText('Profile saved')).toBeVisible()
    await page.goto('/admin/reports')
    await expect(page.getByText('Page not found').first()).toBeVisible()
    expect(problems).toEqual([])
  })

  test('read and hidden times move only through the server', async () => {
    const { data: chat } = await first.client.rpc('create_conversation', { member_ids: [second.id] })
    const row = async () => (await first.client.from('conversation_members').select('last_read_at, hidden_at').eq('conversation_id', chat).eq('user_id', first.id).single()).data
    const update = (values: Record<string, string>) => first.client.from('conversation_members').update(values).eq('conversation_id', chat).eq('user_id', first.id).select('user_id')
    expect((await update({ last_read_at: '2020-01-01T00:00:00Z' })).error?.code).toBe('42501')
    expect((await update({ hidden_at: '2020-01-01T00:00:00Z' })).error?.code).toBe('42501')
    const before = await row()
    await page.waitForTimeout(1100)
    expect((await first.client.rpc('mark_conversation_read', { conv_id: chat })).error).toBeNull()
    expect(new Date((await row())!.last_read_at).getTime()).toBeGreaterThan(new Date(before!.last_read_at).getTime())
    expect((await first.client.rpc('hide_conversation', { conv_id: chat })).error).toBeNull()
    expect((await row())?.hidden_at).toBeTruthy()
  })

  test('a username changes once in 7 days, and the form says when', async () => {
    const rename = (username: string) => second.client.from('profiles').update({ username }).eq('id', second.id).select('username')
    expect((await rename(`${second.username}x`)).error).toBeNull()
    const refused = await rename(`${second.username}y`)
    expect(refused.error?.code).toBe('P0001')
    expect(refused.error?.message).toContain('You can change your username again on')
    const bioOnly = await second.client.from('profiles').update({ username: `${second.username}x`, bio: 'still fine' }).eq('id', second.id).select('username')
    expect(bioOnly.error).toBeNull()
    const stamp = await second.client.from('profiles').select('username_changed_at').eq('id', second.id)
    expect(stamp.error?.code).toBe('42501')

    const secondPage = await signIn(browser, second)
    await secondPage.goto(`/profile/${second.id}`)
    await secondPage.getByRole('button', { name: 'Edit Profile' }).click()
    await secondPage.getByPlaceholder('Username').fill(`${second.username}z`)
    await secondPage.getByRole('button', { name: /^Save/ }).first().click()
    await expect(secondPage.getByText(/You can change your username again on/)).toBeVisible()
  })

  /* Last, because it blocks this network address from the check for a minute */
  test('username checks stop after 60 a minute, even with a faked address', async () => {
    const anon = anonClient()
    let allowed = 0
    let stopped: { code?: string; hint?: string } | null = null
    for (let i = 0; i < 70 && !stopped; i += 1) {
      const { error } = await anon.rpc('username_available', { name: `free_name_${i}` })
      if (error) stopped = error
      else allowed += 1
    }
    expect(allowed).toBeLessThanOrEqual(60)
    expect(stopped?.hint).toBe('rate_limit')

    const fresh = await browser.newPage({ baseURL: test.info().project.use.baseURL })
    await fresh.goto('/register')
    await fresh.getByLabel('Username').fill('some_free_name')
    await fresh.waitForTimeout(1500)
    await expect(fresh.locator('form')).not.toContainText(/taken/i)
  })
})
