import { supabase } from './supabaseClient';
import type { Post } from './supabaseClient';
import { storagePathFromPublicUrl } from './storage';

/*
 * Display URLs for post photos.
 *
 * The database keeps the public https URL of every photo (image_url, the CHECK
 * requires https) and that never changes. For showing a photo we sign the
 * storage path instead, so the same code works while the post-images bucket is
 * public and after it turns private. Signed links are kept in a module cache
 * and signed again once fewer than five minutes are left. If signing fails, or
 * the URL is not one of our post-images URLs, the original URL is used.
 *
 * The signed link goes in display_url / display_image_url. Anything that writes
 * to the database or deletes files keeps using image_url.
 */
const BUCKET = 'post-images';
/* 12 hours: a feed tab left open all day keeps its photos; the list re-signs
   on every fetch anyway, so a shorter link would only break idle tabs */
export const POST_IMAGE_TTL_S = 12 * 60 * 60;
const POST_IMAGE_RENEW_MS = 5 * 60 * 1000;

type Signed = { url: string; expiresAt: number };
const cache = new Map<string, Signed>();

/* Test hook */
export function clearPostImageCache(): void {
  cache.clear();
}

function fresh(entry: Signed | undefined, now: number): entry is Signed {
  return !!entry && entry.expiresAt - now >= POST_IMAGE_RENEW_MS;
}

/* Sign every path that is missing or about to expire, in one request */
async function ensureSigned(paths: string[]): Promise<void> {
  const now = Date.now();
  const missing = Array.from(new Set(paths)).filter((p) => !fresh(cache.get(p), now));
  if (missing.length === 0) return;
  try {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(missing, POST_IMAGE_TTL_S);
    if (error || !data) return;
    const expiresAt = Date.now() + POST_IMAGE_TTL_S * 1000;
    for (const item of data) {
      if (item.path && item.signedUrl) cache.set(item.path, { url: item.signedUrl, expiresAt });
    }
  } catch {
    /* fall back to the stored URLs */
  }
}

/* The signed link for a stored URL, or the stored URL itself */
function displayFor(url: string): string {
  const path = storagePathFromPublicUrl(url, BUCKET);
  if (!path) return url;
  const entry = cache.get(path);
  return entry ? entry.url : url;
}

function pathsOf(posts: Post[]): string[] {
  const paths: string[] = [];
  for (const post of posts) {
    for (const img of post.post_images || []) {
      const p = storagePathFromPublicUrl(img.image_url, BUCKET);
      if (p) paths.push(p);
    }
    if (post.image_url) {
      const p = storagePathFromPublicUrl(post.image_url, BUCKET);
      if (p) paths.push(p);
    }
  }
  return paths;
}

/* The same posts, with display_url on each photo (and display_image_url for the legacy single image) */
export async function withSignedImages(posts: Post[]): Promise<Post[]> {
  const paths = pathsOf(posts);
  if (paths.length === 0) return posts;
  await ensureSigned(paths);
  return posts.map((post) => ({
    ...post,
    post_images: post.post_images?.map((img) => ({ ...img, display_url: displayFor(img.image_url) })),
    display_image_url: post.image_url ? displayFor(post.image_url) : undefined,
  }));
}

export async function withSignedImage(post: Post): Promise<Post> {
  return (await withSignedImages([post]))[0];
}

/* Photo rows alone (EditPostModal reads them back after saving) */
export async function withSignedRows<T extends { image_url: string }>(rows: T[]): Promise<(T & { display_url: string })[]> {
  await ensureSigned(rows.map((r) => storagePathFromPublicUrl(r.image_url, BUCKET)).filter((p): p is string => !!p));
  return rows.map((r) => ({ ...r, display_url: displayFor(r.image_url) }));
}

/* What to put in <img src> for a post, in order */
export function postImageUrls(post: Post): string[] {
  if (post.post_images?.length) {
    return [...post.post_images].sort((a, b) => a.position - b.position).map((img) => img.display_url ?? img.image_url);
  }
  return post.image_url ? [post.display_image_url ?? post.image_url] : [];
}
