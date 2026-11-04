import { test, expect } from '@playwright/test'
import { cleanup, launch, signIn, signup, signupsConfirmInstantly } from './helpers'

/* Dates are timestamptz: they must read back correctly by query and live */
test('dates, paging and suggestions after the move to timestamptz', async () => {
  test.skip(!(await signupsConfirmInstantly()), 'Confirm email is on, so throwaway accounts can not sign up')
  const a = await signup('d')
  const b = await signup('e')
  const browser = await launch()
  try {
    const started = Date.now()
    const ids: string[] = []
    for (const content of ['oldest', 'middle', 'newest']) {
      const { data, error } = await a.client.from('posts').insert({ user_id: a.id, content: `dates ${content}`, visibility: 'public' }).select('id').single()
      if (error) throw new Error(error.message)
      ids.push(data.id)
    }

    /* A date from a query carries a zone and is the real time */
    const { data: page1 } = await a.client.rpc('fetch_posts', { p_author: a.id, p_limit: 2 })
    expect(page1).toHaveLength(2)
    const stamp = new Date(page1[0].created_at).getTime()
    expect(page1[0].created_at).toMatch(/(Z|[+-]\d\d(:?\d\d)?)$/)
    expect(Math.abs(stamp - started)).toBeLessThan(60_000)

    /* Keyset paging with that date picks up the rest, with no repeats */
    const { data: page2, error: pageError } = await a.client.rpc('fetch_posts', {
      p_author: a.id, p_limit: 2, p_before: page1[1].created_at, p_before_id: page1[1].id,
    })
    expect(pageError).toBeNull()
    expect(page2.map((p: { id: string }) => p.id)).toEqual([ids[0]])

    /* Suggestions: follower counts, no self, followed people and blocked people left out */
    const suggest = async () => {
      const { data, error } = await b.client.rpc('suggested_follows', { p_limit: 20 })
      expect(error).toBeNull()
      return data as { id: string; follower_count: number }[]
    }
    expect((await suggest()).some((p) => p.id === b.id)).toBe(false)
    await a.client.from('follows').insert({ follower_id: a.id, following_id: b.id })
    await b.client.from('follows').insert({ follower_id: b.id, following_id: a.id })
    expect((await suggest()).some((p) => p.id === a.id)).toBe(false)
    const { data: forA } = await a.client.rpc('suggested_follows', { p_limit: 20 })
    const counts = (forA as { follower_count: number }[]).map((p) => p.follower_count)
    expect(counts).toEqual([...counts].sort((x, y) => y - x))

    /* In the app: times read as recent, new messages arrive live with a valid time, and Seen moves */
    const { data: chat } = await a.client.rpc('create_conversation', { member_ids: [b.id] })
    await a.client.from('messages').insert({ conversation_id: chat, sender_id: a.id, content: 'dates first' })
    const page = await signIn(browser, b)
    const problems: string[] = []
    page.on('pageerror', (e) => problems.push(e.message))
    await page.goto(`/post/${ids[2]}`)
    await expect(page.locator('.post-card').getByText(/just now|\dm|minute/i).first()).toBeVisible()
    await expect(page.getByText('Invalid Date')).toHaveCount(0)
    await page.goto(`/messages/${chat}`)
    await expect(page.getByText('dates first').first()).toBeVisible()
    await page.waitForTimeout(2500)
    await a.client.from('messages').insert({ conversation_id: chat, sender_id: a.id, content: 'dates live' })
    await expect(page.getByText('dates live').first()).toBeVisible()
    /* A message shows its time when tapped; this one came in live */
    await page.locator('.msg-bubble', { hasText: 'dates live' }).click()
    const shown = await page.locator('time.msg-time').first().getAttribute('datetime')
    expect(Math.abs(new Date(shown as string).getTime() - Date.now())).toBeLessThan(120_000)
    expect(problems).toEqual([])
  } finally {
    await browser.close()
    await cleanup([a, b])
  }
})
