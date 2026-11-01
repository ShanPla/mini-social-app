import { describe, it, expect } from 'vitest';
import { safeRedirect, redirectTarget } from '../redirect';

describe('safeRedirect', () => {
  it('accepts a same-site path, with its query', () => {
    expect(safeRedirect('/post/abc')).toBe('/post/abc');
    expect(safeRedirect('/search?q=ann')).toBe('/search?q=ann');
  });

  it('rejects anything that could leave the site', () => {
    expect(safeRedirect('//evil.example')).toBeNull();
    expect(safeRedirect('/\\evil.example')).toBeNull();
    expect(safeRedirect('https://evil.example')).toBeNull();
    expect(safeRedirect('javascript:alert(1)')).toBeNull();
    expect(safeRedirect('feed')).toBeNull();
  });

  it('rejects non-strings, control characters and the auth pages', () => {
    expect(safeRedirect(undefined)).toBeNull();
    expect(safeRedirect({ a: 1 })).toBeNull();
    expect(safeRedirect('/feed\n/evil')).toBeNull();
    expect(safeRedirect('/login')).toBeNull();
    expect(safeRedirect('/register?x=1')).toBeNull();
  });
});

describe('redirectTarget', () => {
  it('falls back to the feed', () => {
    expect(redirectTarget(null)).toBe('/feed');
    expect(redirectTarget({ from: '//x' })).toBe('/feed');
  });

  it('uses a safe from', () => {
    expect(redirectTarget({ from: '/profile/1' })).toBe('/profile/1');
  });
});
