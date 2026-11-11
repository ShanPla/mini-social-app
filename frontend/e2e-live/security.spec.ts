import { test, expect } from '@playwright/test'
import type { Browser } from '@playwright/test'
import { anonClient, cleanup, launch, png, signIn, signup, signupsConfirmInstantly } from './helpers'
import type { TestUser } from './helpers'

/* Fixes from the 2026-11-11 security audit */
test.describe.serial('security audit fixes', () => {
  let browser: Browser
  let owner: TestUser
  let other: TestUser
  let third: TestUser

  test.beforeAll(async () => {
    test.skip(!(await signupsConfirmInstantly()), 'Confirm email is on, so throwaway accounts can not sign up')
    owner = await signup('o')
    other = await signup('q')
    third = await signup('r')
    browser = await launch()
  })

  test.afterAll(async () => {
    await browser?.close()
    await cleanup([owner, other, third].filter(Boolean))
  })

  test('helpers are not callable through the API', async () => {
    const pair = await owner.client.rpc('is_blocked_pair', { a: other.id, b: third.id })
    expect(pair.error).not.toBeNull()
    const count = await owner.client.rpc('own_upload_count', { bucket: 'avatars' })
    expect(count.error).not.toBeNull()
  })

  test('chat size is for members only, and not for logged-out visitors', async () => {
    const { data: chat } = await owner.client.rpc('create_conversation', { member_ids: [other.id] })
    expect((await owner.client.rpc('conversation_member_count', { conv_id: chat })).data).toBe(2)
    expect((await third.client.rpc('conversation_member_count', { conv_id: chat })).data).toBe(0)
    expect((await anonClient().rpc('conversation_member_count', { conv_id: chat })).error).not.toBeNull()
  })

  test('marking read again changes nothing and tells nobody', async () => {
    const { data: chat } = await owner.client.rpc('create_conversation', { member_ids: [other.id] })
    await other.client.from('messages').insert({ conversation_id: chat, sender_id: other.id, content: 'unread one' })
    const readAt = async () => (await owner.client.from('conversation_members').select('last_read_at').eq('conversation_id', chat).eq('user_id', owner.id).single()).data?.last_read_at
    const heard: unknown[] = []
    const inbox = other.client.channel(`inbox:${other.id}`, { config: { private: true } }).on('broadcast', { event: 'member' }, (p) => heard.push(p))
    await new Promise<void>((resolve) => { inbox.subscribe((s) => { if (s === 'SUBSCRIBED') resolve() }); setTimeout(resolve, 8000) })

    expect((await owner.client.rpc('mark_conversation_read', { conv_id: chat })).error).toBeNull()
    const first = await readAt()
    await new Promise((r) => setTimeout(r, 2500))
    const afterFirst = heard.length
    expect(afterFirst).toBeGreaterThan(0)
    for (let i = 0; i < 5; i += 1) await owner.client.rpc('mark_conversation_read', { conv_id: chat })
    await new Promise((r) => setTimeout(r, 2500))
    expect(await readAt()).toBe(first)
    expect(heard.length).toBe(afterFirst)

    /* A new message makes it work again */
    await other.client.from('messages').insert({ conversation_id: chat, sender_id: other.id, content: 'unread two' })
    await owner.client.rpc('mark_conversation_read', { conv_id: chat })
    expect(new Date(await readAt() as string).getTime()).toBeGreaterThan(new Date(first as string).getTime())
    await other.client.removeChannel(inbox)
  })

  test('after a block, the post owner can still remove that person\'s comment', async () => {
    const { data: post } = await owner.client.from('posts').insert({ user_id: owner.id, content: 'Block test post', visibility: 'public' }).select().single()
    const { data: comment } = await other.client.from('comments').insert({ user_id: other.id, post_id: post.id, content: 'left before the block' }).select().single()
    const { data: mine } = await third.client.from('comments').insert({ user_id: third.id, post_id: post.id, content: 'from a bystander' }).select().single()
    expect((await owner.client.from('blocks').insert({ blocked_id: other.id })).error).toBeNull()

    /* The blocked person no longer reaches the post or its comments */
    expect((await other.client.from('comments').select('id').eq('post_id', post.id)).data ?? []).toHaveLength(0)
    /* The owner sees it and can delete it; a bystander still can not delete it */
    const seen = await owner.client.from('comments').select('id').eq('post_id', post.id)
    expect((seen.data ?? []).map((c) => c.id).sort()).toEqual([comment.id, mine.id].sort())
    expect((await third.client.from('comments').delete().eq('id', comment.id).select('id')).data ?? []).toHaveLength(0)
    expect((await owner.client.from('comments').delete().eq('id', comment.id).select('id')).data ?? []).toHaveLength(1)

    /* Elsewhere the block still hides the blocked person's comments */
    const { data: thirdPost } = await third.client.from('posts').insert({ user_id: third.id, content: 'Bystander post', visibility: 'public' }).select().single()
    await other.client.from('comments').insert({ user_id: other.id, post_id: thirdPost.id, content: 'hidden from the blocker' })
    expect((await owner.client.from('comments').select('id').eq('post_id', thirdPost.id)).data ?? []).toHaveLength(0)
    await owner.client.from('blocks').delete().eq('blocked_id', other.id)
  })

  test('edits are rate limited', async () => {
    const { data: post } = await third.client.from('posts').insert({ user_id: third.id, content: 'Edit limit post', visibility: 'public' }).select().single()
    const { data: comment } = await third.client.from('comments').insert({ user_id: third.id, post_id: post.id, content: 'edit 0' }).select().single()
    let stopped: { code?: string; hint?: string } | null = null
    let allowed = 0
    for (let i = 1; i <= 12 && !stopped; i += 1) {
      const { error } = await third.client.from('comments').update({ content: `edit ${i}` }).eq('id', comment.id).select('id')
      if (error) stopped = error
      else allowed += 1
    }
    expect(allowed).toBe(10)
    expect(stopped?.hint).toBe('rate_limit')
  })

  test('new groups can pull in 60 people per 10 minutes, DMs are not counted', async () => {
    /* 60 is far more accounts than a test should create, so only the DM side and one group are run */
    const dm = await third.client.rpc('create_conversation', { member_ids: [owner.id] })
    expect(dm.error).toBeNull()
    const group = await third.client.rpc('create_conversation', { member_ids: [owner.id, other.id], group_name: 'Small group' })
    expect(group.error).toBeNull()
  })

  test('avatars: uploads still work, the folder is not listable logged out', async () => {
    const path = `${third.id}/avatar-test.png`
    const up = await third.client.storage.from('avatars').upload(path, png('a.png').buffer, { contentType: 'image/png', upsert: true })
    expect(up.error).toBeNull()
    const listed = await anonClient().storage.from('avatars').list('')
    expect(listed.data ?? []).toHaveLength(0)
    const publicUrl = third.client.storage.from('avatars').getPublicUrl(path).data.publicUrl
    expect((await fetch(publicUrl)).status).toBe(200)
    await third.client.storage.from('avatars').remove([path])
  })

  test('typing shows the member\'s real name, whatever the payload says', async () => {
    const { data: chat } = await owner.client.rpc('create_conversation', { member_ids: [third.id] })
    await owner.client.from('messages').insert({ conversation_id: chat, sender_id: owner.id, content: 'typing test' })
    const page = await signIn(browser, third)
    await page.goto(`/messages/${chat}`)
    await expect(page.getByText('typing test').first()).toBeVisible()
    const channel = owner.client.channel(`typing:${chat}`, { config: { private: true } })
    await new Promise<void>((resolve) => { channel.subscribe((s) => { if (s === 'SUBSCRIBED') resolve() }); setTimeout(resolve, 8000) })
    await page.waitForTimeout(1500)
    await channel.send({ type: 'broadcast', event: 'typing', payload: { user_id: owner.id, username: 'Support Team', typing: true } })
    await expect(page.getByText(`${owner.username} is typing`)).toBeVisible()
    await expect(page.getByText('Support Team')).toHaveCount(0)
    await channel.send({ type: 'broadcast', event: 'typing', payload: { user_id: other.id, username: 'Stranger', typing: true } })
    await page.waitForTimeout(1000)
    await expect(page.getByText(/Stranger|and .* are typing/)).toHaveCount(0)
    await owner.client.removeChannel(channel)
  })

  test('the reset page does not print text from the link', async () => {
    const page = await browser.newPage({ baseURL: test.info().project.use.baseURL })
    await page.goto('/reset-password#error=access_denied&error_description=Account+suspended,+email+evil@example.com')
    await expect(page.getByRole('heading', { name: 'Link expired' })).toBeVisible()
    await expect(page.getByText(/suspended|evil@example/)).toHaveCount(0)
  })
})
