import { test, expect } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'
import { cleanup, launch, signIn, signup, signupsConfirmInstantly } from './helpers'
import type { TestUser } from './helpers'

test.describe.serial('edit comments', () => {
  let browser: Browser
  let author: TestUser
  let other: TestUser
  let page: Page
  let postId: string
  let commentId: string

  test.beforeAll(async () => {
    test.skip(!(await signupsConfirmInstantly()), 'Confirm email is on, so throwaway accounts can not sign up')
    author = await signup('a')
    other = await signup('b')
    const { data: post } = await author.client.from('posts').insert({ user_id: author.id, content: 'Comment test post', visibility: 'public' }).select().single()
    postId = post.id
    const { data: comment } = await author.client.from('comments').insert({ user_id: author.id, post_id: postId, content: 'first words' }).select().single()
    commentId = comment.id
    await other.client.from('comments').insert({ user_id: other.id, post_id: postId, content: 'words from someone else' })
    browser = await launch()
    page = await signIn(browser, author)
    await page.goto(`/post/${postId}`)
    await expect(page.locator('.comment-thread', { hasText: 'first words' })).toBeVisible()
  })

  test.afterAll(async () => {
    await browser?.close()
    await cleanup([author, other].filter(Boolean))
  })

  test('only your own comment has Edit, and nothing is marked edited yet', async () => {
    const edit = (text: string) => page.locator('.comment-thread', { hasText: text }).getByRole('button', { name: 'Edit' })
    await expect(edit('first words')).toHaveCount(1)
    await expect(edit('words from someone else')).toHaveCount(0)
    await expect(page.locator('.comment-edited')).toHaveCount(0)
  })

  test('Escape keeps the old text and returns focus to Edit', async () => {
    const button = page.locator('.comment-action-btn', { hasText: 'Edit' })
    await button.click()
    const input = page.getByLabel('Edit your comment')
    await expect(input).toHaveValue('first words')
    await input.fill('thrown away')
    await page.keyboard.press('Escape')
    await expect(input).toHaveCount(0)
    await expect(page.getByText('first words')).toBeVisible()
    await expect(button).toBeFocused()
  })

  test('a saved edit shows (edited) and survives a reload', async () => {
    await page.locator('.comment-action-btn', { hasText: 'Edit' }).click()
    const input = page.getByLabel('Edit your comment')
    await input.fill('')
    await expect(page.locator('.comment-edit-form button[type=submit]')).toBeDisabled()
    await input.fill('new words')
    await page.locator('.comment-edit-form button[type=submit]').click()
    const edited = page.locator('.comment-thread', { hasText: 'new words' }).locator('.comment-edited')
    await expect(edited).toBeVisible()
    await page.reload()
    await expect(edited).toBeVisible()
    const { data } = await author.client.from('comments').select('content, updated_at').eq('id', commentId).single()
    expect(data?.content).toBe('new words')
    expect(data?.updated_at).toBeTruthy()
  })

  test('a mention added by an edit notifies once', async () => {
    const count = async () => (await other.client.from('notifications').select('id').eq('type', 'mention').eq('comment_id', commentId)).data?.length
    await author.client.from('comments').update({ content: `hello @${other.username}` }).eq('id', commentId)
    expect(await count()).toBe(1)
    await author.client.from('comments').update({ content: `hello again @${other.username}` }).eq('id', commentId)
    expect(await count()).toBe(1)
  })

  test('the database refuses other edits', async () => {
    const stranger = await other.client.from('comments').update({ content: 'hacked' }).eq('id', commentId).select('id')
    expect(stranger.data ?? []).toHaveLength(0)
    const stamp = await author.client.from('comments').update({ updated_at: null }).eq('id', commentId).select('id')
    expect(stamp.error?.code).toBe('42501')
    const owner = await author.client.from('comments').update({ user_id: other.id }).eq('id', commentId).select('id')
    expect(owner.error?.code).toBe('42501')
    const long = await author.client.from('comments').update({ content: 'x'.repeat(301) }).eq('id', commentId).select('id')
    expect(long.error?.code).toBe('23514')
  })
})
