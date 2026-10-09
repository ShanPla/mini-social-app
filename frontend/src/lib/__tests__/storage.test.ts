import { describe, it, expect } from 'vitest';
import { storagePathFromPublicUrl } from '../storage';

const BASE = 'https://abc123.supabase.co/storage/v1/object/public';

describe('storagePathFromPublicUrl', () => {
  it('pulls the object path out of one of our public URLs', () => {
    expect(storagePathFromPublicUrl(`${BASE}/post-images/user-1/post-2/0.jpg`, 'post-images'))
      .toBe('user-1/post-2/0.jpg');
    expect(storagePathFromPublicUrl(`${BASE}/avatars/user-1/avatar.png`, 'avatars'))
      .toBe('user-1/avatar.png');
  });

  it('drops the cache-busting query an avatar URL carries', () => {
    expect(storagePathFromPublicUrl(`${BASE}/avatars/user-1/avatar.png?t=1736412345678`, 'avatars'))
      .toBe('user-1/avatar.png');
  });

  it('decodes an escaped name, which is what storage needs back', () => {
    expect(storagePathFromPublicUrl(`${BASE}/post-images/user-1/post-2/my%20photo.jpg`, 'post-images'))
      .toBe('user-1/post-2/my photo.jpg');
  });

  it('returns the raw path when it is not valid escaping, rather than throwing', () => {
    expect(storagePathFromPublicUrl(`${BASE}/post-images/user-1/100%.jpg`, 'post-images'))
      .toBe('user-1/100%.jpg');
  });

  it('is null for anything outside that bucket, so cleanup never deletes a stranger', () => {
    /* an avatar set from an outside link */
    expect(storagePathFromPublicUrl('https://example.com/some/photo.jpg', 'avatars')).toBeNull();
    /* the right shape, the wrong bucket */
    expect(storagePathFromPublicUrl(`${BASE}/avatars/user-1/avatar.png`, 'post-images')).toBeNull();
    /* a signed URL from the private bucket is not a public one */
    expect(storagePathFromPublicUrl('https://abc123.supabase.co/storage/v1/object/sign/chat-images/c/u/x.jpg?token=y', 'chat-images'))
      .toBeNull();
    expect(storagePathFromPublicUrl('', 'post-images')).toBeNull();
  });
});
