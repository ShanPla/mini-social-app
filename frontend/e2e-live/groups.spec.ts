import { test, expect } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'
import { cleanup, launch, signIn, signup, signupsConfirmInstantly } from './helpers'
import type { TestUser } from './helpers'

test.describe.serial('group chats', () => {
  let browser: Browser
  let creator: TestUser
  let member: TestUser
  let third: TestUser
  let creatorPage: Page
  let memberPage: Page
  let thirdPage: Page
  let chatId: string

  const header = (page: Page) => page.locator('.messages-thread-title h3')
  const info = (page: Page) => page.getByTitle('Conversation info')
  const leave = async (page: Page) => {
    await info(page).click()
    await page.getByRole('button', { name: 'Leave group' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Leave' }).click()
  }

  test.beforeAll(async () => {
    test.skip(!(await signupsConfirmInstantly()), 'Confirm email is on, so throwaway accounts can not sign up')
    creator = await signup('c')
    member = await signup('m')
    third = await signup('t')
    const { data, error } = await creator.client.rpc('create_conversation', { member_ids: [member.id, third.id], group_name: 'Old name' })
    if (error) throw new Error(error.message)
    chatId = data
    await member.client.from('messages').insert({ conversation_id: chatId, sender_id: member.id, content: 'hello group' })
    browser = await launch()
    creatorPage = await signIn(browser, creator)
    memberPage = await signIn(browser, member)
    thirdPage = await signIn(browser, third)
    for (const page of [creatorPage, memberPage, thirdPage]) {
      await page.goto(`/messages/${chatId}`)
      await expect(page.getByText('hello group').first()).toBeVisible()
    }
    await creatorPage.waitForTimeout(2500)
  })

  test.afterAll(async () => {
    await browser?.close()
    await cleanup([creator, member, third].filter(Boolean))
  })

  test('a message arrives live', async () => {
    await creator.client.from('messages').insert({ conversation_id: chatId, sender_id: creator.id, content: 'live message' })
    await expect(thirdPage.getByText('live message').first()).toBeVisible()
  })

  test('a reaction is stored and shows live', async () => {
    const { data: message } = await member.client.from('messages').select('id').eq('conversation_id', chatId).eq('content', 'hello group').single()
    /* Written as escapes: a thumbs up, then a change to a heart */
    const added = await third.client.from('message_reactions').insert({ message_id: message!.id, emoji: '\u{1F44D}' })
    expect(added.error).toBeNull()
    const chip = creatorPage.locator('.msg-row', { hasText: 'hello group' }).locator('.msg-chip')
    await expect(chip.first()).toBeVisible()
    const changed = await third.client.from('message_reactions').update({ emoji: '❤️' }).eq('message_id', message!.id).eq('user_id', third.id)
    expect(changed.error).toBeNull()
    /* Anything outside the six allowed emoji is refused */
    const refused = await member.client.from('message_reactions').insert({ message_id: message!.id, emoji: 'x' })
    expect(refused.error).not.toBeNull()
  })

  test('only the creator can rename, and everyone sees it live', async () => {
    await info(memberPage).click()
    await expect(memberPage.getByRole('button', { name: 'Leave group' })).toBeVisible()
    await expect(memberPage.getByTitle('Rename group')).toHaveCount(0)
    await memberPage.getByTitle('Close').click()
    const denied = await member.client.from('conversations').update({ name: 'Hacked' }).eq('id', chatId).select('id')
    expect(denied.data ?? []).toHaveLength(0)

    await info(creatorPage).click()
    await creatorPage.getByTitle('Rename group').click()
    await creatorPage.getByLabel('Group name').fill('New name')
    await creatorPage.getByTitle('Save', { exact: true }).click()
    await creatorPage.getByTitle('Close').click()
    for (const page of [creatorPage, memberPage, thirdPage]) await expect(header(page)).toHaveText('New name')
  })

  test('leaving by choice: no [removed] notice, and the chat is gone', async () => {
    await leave(memberPage)
    await memberPage.waitForTimeout(2000)
    await expect(memberPage.getByText(/You were removed from/)).toHaveCount(0)
    await memberPage.goto(`/messages/${chatId}`)
    await expect(memberPage.getByText('Conversation not found')).toBeVisible()
    const rows = await member.client.from('messages').select('id').eq('conversation_id', chatId)
    expect(rows.data ?? []).toHaveLength(0)
    await info(creatorPage).click()
    await expect(creatorPage.getByRole('dialog').getByText(member.username)).toHaveCount(0)
    await creatorPage.getByTitle('Close').click()
  })

  test('being removed by the creator: a live notice, and the chat is gone', async () => {
    await creator.client.rpc('create_conversation', { member_ids: [third.id], group_name: 'Second group' }).then(async ({ data, error }) => {
      if (error) throw new Error(error.message)
      await creator.client.from('messages').insert({ conversation_id: data, sender_id: creator.id, content: 'second group hello' })
      await creatorPage.goto(`/messages/${data}`)
      await thirdPage.goto(`/messages/${data}`)
      await expect(thirdPage.getByText('second group hello').first()).toBeVisible()
      await expect(creatorPage.getByText('second group hello').first()).toBeVisible()
      await thirdPage.waitForTimeout(2500)
      await info(creatorPage).click()
      await creatorPage.getByTitle(`Remove ${third.username}`).click()
      await creatorPage.getByRole('alertdialog').getByRole('button', { name: 'Remove' }).click()
      await expect(thirdPage.getByText(/You were removed from/).first()).toBeVisible()
      const rows = await third.client.from('messages').select('id').eq('conversation_id', data)
      expect(rows.data ?? []).toHaveLength(0)
      await creatorPage.getByTitle('Close').click()
    })
  })

  test('the creator leaves: the next member takes over, live', async () => {
    await creatorPage.goto(`/messages/${chatId}`)
    await thirdPage.goto(`/messages/${chatId}`)
    await expect(thirdPage.getByText('hello group').first()).toBeVisible()
    await thirdPage.waitForTimeout(2500)
    await leave(creatorPage)
    await thirdPage.waitForTimeout(2500)
    await info(thirdPage).click()
    await expect(thirdPage.getByTitle('Rename group')).toBeVisible()
    await thirdPage.getByTitle('Close').click()
  })

  test('the last member out leaves the group empty', async () => {
    await leave(thirdPage)
    await thirdPage.waitForTimeout(1500)
    const { data } = await creator.client.rpc('conversation_member_count', { conv_id: chatId })
    expect(data).toBe(0)
  })
})
