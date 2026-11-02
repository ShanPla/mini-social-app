import { describe, it, expect, vi } from 'vitest';
import type { Post } from '../supabaseClient';

vi.mock('../posts', () => ({ fetchPosts: vi.fn() }));

import { keepPublished } from '../usePostList';

const post = (id: string) => ({ id }) as Post;
const ids = (list: Post[]) => list.map((p) => p.id);

describe('keepPublished', () => {
  it('returns the page as it is when nothing was published meanwhile', () => {
    const page = [post('a')];
    expect(keepPublished([], page)).toBe(page);
  });

  it('puts a post the query missed in front of the page', () => {
    expect(ids(keepPublished([post('new')], [post('a'), post('b')]))).toEqual(['new', 'a', 'b']);
  });

  it('does not show a post twice when the query found it too', () => {
    expect(ids(keepPublished([post('a')], [post('a'), post('b')]))).toEqual(['a', 'b']);
  });
});
