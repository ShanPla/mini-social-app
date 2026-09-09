import { supabase } from './supabaseClient';

/*
 * Cleanup helpers for the public image buckets. All best effort: by the
 * time these run the database row is already gone or replaced, and an
 * orphaned file is not worth interrupting the user for, so failures only
 * reach the console.
 */

/* The object path inside `bucket` for one of our own public URLs, else null */
export function storagePathFromPublicUrl(url: string, bucket: string): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  const rest = url.slice(i + marker.length).split('?')[0];
  try {
    return decodeURIComponent(rest);
  } catch {
    return rest;
  }
}

/* Remove post images by their public URLs (skips anything not in the bucket) */
export async function removePostImageFiles(urls: string[]): Promise<void> {
  const paths = urls
    .map((u) => storagePathFromPublicUrl(u, 'post-images'))
    .filter((p): p is string => !!p);
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from('post-images').remove(paths);
  if (error) console.warn('post-images cleanup failed:', error.message);
}

/* Remove every file in `folder` of `bucket`, except `keep` (a bare file name) */
export async function pruneFolder(bucket: string, folder: string, keep?: string): Promise<void> {
  const { data, error } = await supabase.storage.from(bucket).list(folder);
  if (error || !data) return;
  const targets = data.filter((f) => f.name !== keep).map((f) => `${folder}/${f.name}`);
  if (targets.length === 0) return;
  const { error: rmError } = await supabase.storage.from(bucket).remove(targets);
  if (rmError) console.warn(`${bucket} cleanup failed:`, rmError.message);
}
