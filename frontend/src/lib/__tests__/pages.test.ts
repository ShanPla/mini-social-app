import { describe, it, expect } from 'vitest';
import { pageForPath, pageLoaders } from '../pages';

describe('pageForPath', () => {
  it('maps the fixed paths to their pages', () => {
    expect(pageForPath('/login')).toBe('login');
    expect(pageForPath('/register')).toBe('register');
    expect(pageForPath('/forgot-password')).toBe('forgotPassword');
    expect(pageForPath('/reset-password')).toBe('resetPassword');
    expect(pageForPath('/search')).toBe('search');
    expect(pageForPath('/notifications')).toBe('notifications');
    expect(pageForPath('/settings')).toBe('settings');
    expect(pageForPath('/admin/reports')).toBe('adminReports');
  });

  it('maps paths with an id to profile and post pages', () => {
    expect(pageForPath('/profile/abc-123')).toBe('profile');
    expect(pageForPath('/post/42')).toBe('post');
  });

  it('treats messages with or without a conversation as the messages page', () => {
    expect(pageForPath('/messages')).toBe('messages');
    expect(pageForPath('/messages/some-conversation')).toBe('messages');
  });

  it('knows the front page', () => {
    expect(pageForPath('/')).toBe('landing');
  });

  it('falls back to the feed for anything unknown', () => {
    expect(pageForPath('/feed')).toBe('feed');
    expect(pageForPath('/does-not-exist')).toBe('feed');
  });

  it('only ever returns a page that has a loader', () => {
    const paths = ['/login', '/register', '/profile/x', '/post/x', '/messages', '/nope', '/'];
    for (const path of paths) expect(pageLoaders[pageForPath(path)]).toBeTypeOf('function');
  });
});
