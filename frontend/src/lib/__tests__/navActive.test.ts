import { describe, it, expect } from 'vitest';
import { isActivePath } from '../navActive';

describe('isActivePath', () => {
  it('matches the path itself and pages below it', () => {
    expect(isActivePath('/messages', '/messages')).toBe(true);
    expect(isActivePath('/messages/abc', '/messages')).toBe(true);
  });

  it('only lights Profile on your own profile', () => {
    expect(isActivePath('/profile/me', '/profile/me')).toBe(true);
    expect(isActivePath('/profile/someone-else', '/profile/me')).toBe(false);
  });

  it('does not match a path that only shares a prefix', () => {
    expect(isActivePath('/feeds', '/feed')).toBe(false);
    expect(isActivePath('/profile/me2', '/profile/me')).toBe(false);
  });
});
