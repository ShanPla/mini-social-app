import { test, expect } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'
import {
  PHOTO_ROWS, UPLOADS, cancelAndDiscard, cleanup, failPosts, latestPostId, launch, openEditPost, png,
  signIn, signedPhotos, signup, signupsConfirmInstantly, storedPhotos,
} from './helpers'
import type { TestUser } from './helpers'

/* The server allows 5 posts a minute per person, so each group gets its own account */
test.describe.serial('photo uploads that fail', () => {
  let browser: Browser
  let user: TestUser
  let page: Page

  test.beforeAll(async () => {
    test.skip(!(await signupsConfirmInstantly()), 'Confirm email is on, so throwaway accounts can not sign up')
    user = await signup('p')
    browser = await launch()
    page = await signIn(browser, user)
  })

  test.afterAll(async () => {
    await browser?.close()
    if (user) await cleanup([user])
  })

  const composer = () => page.locator('.compose-card')
  const retryBar = () => page.locator('.compose-retry')
  const publish = async (text: string, files: string[]) => {
    await composer().locator('textarea').fill(text)
    await composer().locator('input[type=file]').setInputFiles(files.map(png))
    await page.getByRole('button', { name: 'Publish' }).click()
  }

  test('publishing: one photo fails, Retry adds it', async () => {
    await page.goto('/feed')
    await failPosts(page, UPLOADS, 1)
    await publish('retry one', ['a.png', 'b.png'])
    await expect(retryBar()).toContainText('1 of 2')
    const card = page.locator('.post-card', { hasText: 'retry one' })
    await expect(card).toHaveCount(1)
    await expect(composer().locator('textarea')).toHaveValue('')
    await expect(page.getByRole('button', { name: 'Publish' })).toBeDisabled()
    const postId = await latestPostId(user, 'retry one')
    expect(await storedPhotos(user, postId)).toHaveLength(1)

    await failPosts(page, UPLOADS, 0)
    await retryBar().getByRole('button', { name: 'Retry' }).click()
    await expect(retryBar()).toHaveCount(0)
    expect(await storedPhotos(user, postId)).toHaveLength(2)
    await expect(signedPhotos(card)).toHaveCount(2)
    await expect(card).toHaveCount(1)
  })

  test('publishing: a failed Retry keeps the bar, Skip drops the photos', async () => {
    await page.waitForTimeout(3500)
    await failPosts(page, UPLOADS, 99)
    await publish('retry two', ['c.png'])
    await expect(retryBar()).toContainText('1 of 1')
    await retryBar().getByRole('button', { name: 'Retry' }).click()
    await page.waitForTimeout(1500)
    await expect(retryBar()).toBeVisible()
    await retryBar().getByRole('button', { name: 'Skip these photos' }).click()
    await expect(retryBar()).toHaveCount(0)
    await expect(page.locator('.post-card', { hasText: 'retry two' })).toHaveCount(1)
  })

  test('publishing: a photo-only post with no photo publishes nothing', async () => {
    await page.waitForTimeout(3500)
    const before = (await user.client.from('posts').select('id').eq('user_id', user.id)).data?.length
    await composer().locator('input[type=file]').setInputFiles([png('d.png')])
    await page.getByRole('button', { name: 'Publish' }).click()
    await expect(page.getByText('nothing was published')).toBeVisible()
    await expect(composer().locator('.compose-preview-item')).toHaveCount(1)
    await expect(retryBar()).toHaveCount(0)
    expect((await user.client.from('posts').select('id').eq('user_id', user.id)).data?.length).toBe(before)
    await page.getByRole('button', { name: 'Clear all' }).click()
    await failPosts(page, UPLOADS, 0)
  })

  test('editing: only the failed photo stays, Save again adds it once', async () => {
    const card = page.locator('.post-card', { hasText: 'retry one' })
    const postId = await latestPostId(user, 'retry one')
    const dialog = await openEditPost(page, card)
    await dialog.locator('textarea').fill('retry one v2')
    await failPosts(page, UPLOADS, 1)
    await dialog.locator('input[type=file]').setInputFiles([png('e.png'), png('f.png')])
    await dialog.getByRole('button', { name: 'Save Changes' }).click()
    await expect(dialog.locator('.edit-error')).toContainText('1 of 2')
    await expect.poll(async () => (await storedPhotos(user, postId)).length).toBe(3)

    await failPosts(page, UPLOADS, 0)
    await dialog.getByRole('button', { name: 'Save Changes' }).click()
    await expect(dialog).toHaveCount(0)
    const photos = await storedPhotos(user, postId)
    expect(new Set(photos.map((p) => p.image_url)).size).toBe(4)
    await expect(signedPhotos(page.locator('.post-card', { hasText: 'retry one v2' }))).toHaveCount(4)
  })

  test('editing: Cancel after a partial save leaves the card correct', async () => {
    const card = page.locator('.post-card', { hasText: 'retry one v2' })
    const dialog = await openEditPost(page, card)
    await dialog.locator('textarea').fill('retry one v3')
    await failPosts(page, UPLOADS, 99)
    await dialog.locator('input[type=file]').setInputFiles([png('g.png')])
    await dialog.getByRole('button', { name: 'Save Changes' }).click()
    await expect(dialog.locator('.edit-error')).toBeVisible()
    await cancelAndDiscard(page, dialog)
    await failPosts(page, UPLOADS, 0)
    await expect(page.locator('.post-card', { hasText: 'retry one v3' })).toBeVisible()
  })
})

test.describe.serial('an edit can not leave a post blank', () => {
  let browser: Browser
  let user: TestUser
  let page: Page
  let postId: string
  let originalId: string

  test.beforeAll(async () => {
    test.skip(!(await signupsConfirmInstantly()), 'Confirm email is on, so throwaway accounts can not sign up')
    user = await signup('b')
    browser = await launch()
    page = await signIn(browser, user)
    await page.goto('/feed')
    const composer = page.locator('.compose-card')
    await composer.locator('input[type=file]').setInputFiles([png('only.png')])
    await page.getByRole('button', { name: 'Publish' }).click()
    await expect(page.getByText('Post published')).toBeVisible()
    postId = await latestPostId(user, '')
    originalId = (await storedPhotos(user, postId))[0].id
    /* The post's own page: on the feed the top card can be somebody else's */
    await page.goto(`/post/${postId}`)
    await expect(signedPhotos(page.locator('.post-card'))).toHaveCount(1)
  })

  test.afterAll(async () => {
    await browser?.close()
    if (user) await cleanup([user])
  })

  const card = () => page.locator('.post-card')
  const replacePhoto = async (name: string) => {
    const dialog = await openEditPost(page, card())
    await dialog.getByRole('button', { name: /remove/i }).first().click()
    await dialog.locator('input[type=file]').setInputFiles([png(name)])
    await dialog.getByRole('button', { name: 'Save Changes' }).click()
    return dialog
  }
  const oldPhotoStays = async () => {
    const photos = await storedPhotos(user, postId)
    expect(photos.map((p) => p.id)).toEqual([originalId])
    await expect(signedPhotos(card())).toHaveCount(1)
  }

  test('every new photo fails to upload: nothing changes', async () => {
    await failPosts(page, UPLOADS, 99)
    const dialog = await replacePhoto('new.png')
    await expect(dialog.locator('.edit-error')).toBeVisible()
    await cancelAndDiscard(page, dialog)
    await failPosts(page, UPLOADS, 0)
    await oldPhotoStays()
  })

  test('the new photo uploads but can not be attached: the old one stays', async () => {
    await failPosts(page, PHOTO_ROWS, 99)
    const dialog = await replacePhoto('new.png')
    await expect(dialog.locator('.edit-error')).toContainText('could not be attached')
    await expect.poll(async () => (await storedPhotos(user, postId)).length).toBe(1)
    await cancelAndDiscard(page, dialog)
    await failPosts(page, PHOTO_ROWS, 0)
    await oldPhotoStays()
  })

  test('uploads working: the photo is replaced', async () => {
    const dialog = await replacePhoto('new2.png')
    await expect(dialog).toHaveCount(0)
    const photos = await storedPhotos(user, postId)
    expect(photos).toHaveLength(1)
    expect(photos[0].id).not.toBe(originalId)
  })

  test('removing everything is refused', async () => {
    const dialog = await openEditPost(page, card())
    await dialog.getByRole('button', { name: /remove/i }).first().click()
    await dialog.getByRole('button', { name: 'Save Changes' }).click()
    await expect(dialog.getByText('Post must have text or at least one image.')).toBeVisible()
    await cancelAndDiscard(page, dialog)
  })
})

test('a post published while the feed loads stays in the list', async () => {
  test.skip(!(await signupsConfirmInstantly()), 'Confirm email is on, so throwaway accounts can not sign up')
  const user = await signup('f')
  const browser = await launch()
  try {
    const page = await signIn(browser, user)
    /* The answer is held back, so the query ran before the post existed */
    await page.route('**/rest/v1/rpc/fetch_posts', async (route) => {
      const response = await route.fetch()
      await new Promise((resolve) => setTimeout(resolve, 4000))
      await route.fulfill({ response }).catch(() => {})
    })
    await page.goto('/feed')
    await page.locator('.compose-card textarea').fill('published during load')
    await page.getByRole('button', { name: 'Publish' }).click()
    await expect(page.getByText('Post published')).toBeVisible()
    await page.waitForTimeout(6000)
    await expect(page.locator('.post-card', { hasText: 'published during load' })).toHaveCount(1)
  } finally {
    await browser.close()
    await cleanup([user])
  }
})
