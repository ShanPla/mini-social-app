import { describe, it, expect, vi } from 'vitest';

vi.mock('../supabaseClient', () => ({ supabase: {} }));

import { parseProfileStats } from '../profileStats';

describe('parseProfileStats', () => {
  it('reads the single row of profile_stats, as a row or a one-item array', () => {
    const row = { posts_count: 3, followers_count: '12', following_count: 0 };
    expect(parseProfileStats(row)).toEqual({ posts: 3, followers: 12, following: 0 });
    expect(parseProfileStats([row])).toEqual({ posts: 3, followers: 12, following: 0 });
  });

  it('returns null when there is no row', () => {
    expect(parseProfileStats(null)).toBeNull();
    expect(parseProfileStats([])).toBeNull();
  });
});
