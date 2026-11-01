import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const createSignedUrls = vi.fn();
const from = vi.fn<(bucket: string) => { createSignedUrls: typeof createSignedUrls }>(() => ({ createSignedUrls }));

vi.mock('../supabaseClient', () => ({
  supabase: { storage: { from: (bucket: string) => from(bucket) } },
}));

import { withSignedImages, withSignedRows, postImageUrls, clearPostImageCache, POST_IMAGE_TTL_S } from '../postImages';
import type { Post } from '../supabaseClient';

const BASE = 'https://x.supabase.co/storage/v1/object/public/post-images';

function post(id: string, urls: string[], legacy: string | null = null): Post {
  return {
    id,
    user_id: 'u1',
    content: 'hi',
    image_url: legacy,
    visibility: 'public',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: null,
    like_count: 0,
    comment_count: 0,
    liked_by_me: false,
    post_images: urls.map((image_url, i) => ({ id: `${id}-${i}`, post_id: id, image_url, position: i })),
  };
}

/* The stub signs every requested path the way Storage does */
function signAll() {
  createSignedUrls.mockImplementation(async (paths: string[]) => ({
    data: paths.map((path) => ({ path, signedUrl: `https://x.supabase.co/storage/v1/object/sign/post-images/${path}?token=t`, error: null })),
    error: null,
  }));
}

describe('postImages', () => {
  beforeEach(() => {
    clearPostImageCache();
    createSignedUrls.mockReset();
    from.mockClear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('signs the storage path of each photo in one request and keeps the stored URL', async () => {
    signAll();
    const [out] = await withSignedImages([post('p1', [`${BASE}/u1/p1/a.jpg`, `${BASE}/u1/p1/b.png`])]);
    expect(from).toHaveBeenCalledWith('post-images');
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
    expect(createSignedUrls).toHaveBeenCalledWith(['u1/p1/a.jpg', 'u1/p1/b.png'], POST_IMAGE_TTL_S);
    expect(out.post_images![0].display_url).toContain('/object/sign/');
    expect(out.post_images![0].image_url).toBe(`${BASE}/u1/p1/a.jpg`);
  });

  it('reuses cached links until fewer than five minutes are left', async () => {
    signAll();
    const p = post('p1', [`${BASE}/u1/p1/a.jpg`]);
    await withSignedImages([p]);
    await withSignedImages([p]);
    expect(createSignedUrls).toHaveBeenCalledTimes(1);

    /* Just short of the lifetime only 4 minutes remain: sign again */
    vi.setSystemTime(Date.now() + POST_IMAGE_TTL_S * 1000 - 4 * 60 * 1000);
    await withSignedImages([p]);
    expect(createSignedUrls).toHaveBeenCalledTimes(2);
  });

  it('only asks for paths it does not have yet', async () => {
    signAll();
    await withSignedImages([post('p1', [`${BASE}/u1/p1/a.jpg`])]);
    await withSignedImages([post('p1', [`${BASE}/u1/p1/a.jpg`]), post('p2', [`${BASE}/u1/p2/c.jpg`])]);
    expect(createSignedUrls).toHaveBeenLastCalledWith(['u1/p2/c.jpg'], POST_IMAGE_TTL_S);
  });

  it('falls back to the stored URL when signing fails', async () => {
    createSignedUrls.mockResolvedValue({ data: null, error: { message: 'nope' } });
    const url = `${BASE}/u1/p1/a.jpg`;
    const [out] = await withSignedImages([post('p1', [url])]);
    expect(out.post_images![0].display_url).toBe(url);
  });

  it('falls back when the request throws', async () => {
    createSignedUrls.mockRejectedValue(new Error('offline'));
    const url = `${BASE}/u1/p1/a.jpg`;
    const [out] = await withSignedImages([post('p1', [url])]);
    expect(out.post_images![0].display_url).toBe(url);
  });

  it('leaves URLs outside the post-images bucket alone and makes no request', async () => {
    const other = 'https://cdn.example.com/pic.jpg';
    const [out] = await withSignedImages([post('p1', [other])]);
    expect(createSignedUrls).not.toHaveBeenCalled();
    expect(postImageUrls(out)).toEqual([other]);
  });

  it('signs the legacy single image too', async () => {
    signAll();
    const [out] = await withSignedImages([post('p1', [], `${BASE}/u1/old.jpg`)]);
    expect(out.display_image_url).toContain('/object/sign/');
    expect(postImageUrls(out)).toEqual([out.display_image_url]);
  });

  it('signs bare photo rows', async () => {
    signAll();
    const rows = await withSignedRows([{ id: '1', image_url: `${BASE}/u1/p1/a.jpg` }]);
    expect(rows[0].display_url).toContain('/object/sign/');
    expect(rows[0].image_url).toBe(`${BASE}/u1/p1/a.jpg`);
  });

  it('postImageUrls orders by position and prefers display_url', () => {
    const p = post('p1', ['https://a/1', 'https://a/2']);
    p.post_images![0].position = 1;
    p.post_images![1].position = 0;
    p.post_images![1].display_url = 'https://signed/2';
    expect(postImageUrls(p)).toEqual(['https://signed/2', 'https://a/1']);
  });
});
