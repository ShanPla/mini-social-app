import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ChatMember, Conversation } from '../supabaseClient';
import {
  otherMembers, conversationTitle, conversationAvatar, lastMessagePreview,
  shortTime, dayLabel, isDifferentDay, seenBy, sortConversations,
} from '../chat';

const ME = 'me-id';
const member = (over: Partial<ChatMember> & { user_id: string; username: string }): ChatMember => ({
  display_name: null, avatar_url: null, last_read_at: '2026-03-01 00:00:00', ...over,
});
const me = member({ user_id: ME, username: 'shan_p' });
const bea = member({ user_id: 'bea-id', username: 'bea', display_name: 'Bea Cruz' });
const caz = member({ user_id: 'caz-id', username: 'caz' });

const conv = (over: Partial<Conversation> = {}): Conversation => ({
  id: 'c1', is_group: false, name: null, created_by: ME,
  last_message_at: '2026-03-01 12:00:00', last_message: null, unread_count: 0,
  members: [me, bea], ...over,
});
const lastMessage = (over: Partial<NonNullable<Conversation['last_message']>> = {}) => ({
  id: 'm1', sender_id: bea.user_id, content: 'hello', image_url: null, created_at: '2026-03-01 12:00:00', ...over,
});

describe('otherMembers', () => {
  it('leaves me out', () => {
    expect(otherMembers(conv({ members: [me, bea, caz] }), ME)).toEqual([bea, caz]);
  });

  it('copes with a conversation whose members have not loaded', () => {
    expect(otherMembers(conv({ members: undefined as unknown as ChatMember[] }), ME)).toEqual([]);
  });
});

describe('conversationTitle', () => {
  it('names a DM after the other person, by display name', () => {
    expect(conversationTitle(conv(), ME)).toBe('Bea Cruz');
    expect(conversationTitle(conv({ members: [me, caz] }), ME)).toBe('caz');
  });

  it('uses the name of a named group', () => {
    expect(conversationTitle(conv({ is_group: true, name: 'Weekend plans', members: [me, bea, caz] }), ME))
      .toBe('Weekend plans');
  });

  it('lists the other people when a group has no name', () => {
    expect(conversationTitle(conv({ is_group: true, name: null, members: [me, bea, caz] }), ME))
      .toBe('Bea Cruz, caz');
  });

  it('says Deleted user for a DM whose other side is gone, and Just you for an empty group', () => {
    expect(conversationTitle(conv({ members: [me] }), ME)).toBe('Deleted user');
    expect(conversationTitle(conv({ is_group: true, name: null, members: [me] }), ME)).toBe('Just you');
  });
});

describe('conversationAvatar', () => {
  it('is the other person in a DM and nobody in a group', () => {
    expect(conversationAvatar(conv(), ME)).toEqual(bea);
    expect(conversationAvatar(conv({ is_group: true, members: [me, bea, caz] }), ME)).toBeNull();
    expect(conversationAvatar(conv({ members: [me] }), ME)).toBeNull();
  });
});

describe('lastMessagePreview', () => {
  it('invites you to start an empty conversation', () => {
    expect(lastMessagePreview(conv(), ME)).toBe('Say hello');
    expect(lastMessagePreview(conv({ is_group: true }), ME)).toBe('Group created');
  });

  it('shows just the text of what the other person sent in a DM', () => {
    expect(lastMessagePreview(conv({ last_message: lastMessage() }), ME)).toBe('hello');
  });

  it('marks your own messages with You, in a DM and in a group', () => {
    expect(lastMessagePreview(conv({ last_message: lastMessage({ sender_id: ME }) }), ME)).toBe('You: hello');
    expect(lastMessagePreview(conv({ is_group: true, members: [me, bea, caz], last_message: lastMessage({ sender_id: ME }) }), ME))
      .toBe('You: hello');
  });

  it('names the sender in a group', () => {
    expect(lastMessagePreview(conv({ is_group: true, members: [me, bea, caz], last_message: lastMessage() }), ME))
      .toBe('Bea Cruz: hello');
  });

  it('says a photo was sent when there is no text', () => {
    expect(lastMessagePreview(conv({ last_message: lastMessage({ content: null, image_url: 'c1/bea/x.jpg' }) }), ME))
      .toBe('Sent a photo');
    expect(lastMessagePreview(conv({ last_message: lastMessage({ content: '   ', image_url: 'c1/bea/x.jpg' }) }), ME))
      .toBe('Sent a photo');
  });

  it('handles a sender who deleted their account, or who is no longer a member', () => {
    expect(lastMessagePreview(conv({ is_group: true, last_message: lastMessage({ sender_id: null }) }), ME))
      .toBe('Deleted user: hello');
    expect(lastMessagePreview(conv({ is_group: true, members: [me], last_message: lastMessage() }), ME))
      .toBe('Someone: hello');
  });
});

describe('shortTime', () => {
  const now = new Date('2026-03-01T12:00:00Z');
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });
  afterEach(() => vi.useRealTimers());
  const ago = (minutes: number) => new Date(now.getTime() - minutes * 60000).toISOString().replace('Z', '');

  it.each([[0, 'now'], [1, '1m'], [59, '59m'], [60, '1h'], [60 * 23, '23h'], [60 * 24, '1d'], [60 * 24 * 6, '6d']])(
    '%i minutes ago reads as %s', (minutes, expected) => expect(shortTime(ago(minutes))).toBe(expected),
  );

  it('falls back to a date once it is a week old', () => {
    expect(shortTime(ago(60 * 24 * 7))).toMatch(/\d/);
    expect(shortTime(ago(60 * 24 * 7))).not.toMatch(/[dhm]$/);
  });
});

describe('dayLabel and isDifferentDay', () => {
  /* Fixed local noon, so the day arithmetic cannot straddle midnight */
  const today = new Date(2026, 2, 1, 12, 0, 0);
  /* The bare UTC stamp the database would hold for that local wall-clock time */
  const localStamp = (d: Date) => d.toISOString().replace('Z', '');
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(today); });
  afterEach(() => vi.useRealTimers());

  it('labels today and yesterday by name, and older days by date', () => {
    expect(dayLabel(localStamp(today))).toBe('Today');
    expect(dayLabel(localStamp(new Date(2026, 1, 28, 12)))).toBe('Yesterday');
    expect(dayLabel(localStamp(new Date(2026, 1, 20, 12)))).toMatch(/Feb/);
    expect(dayLabel(localStamp(new Date(2025, 1, 20, 12)))).toMatch(/2025/);
  });

  it('spots a change of day, ignoring the time of day', () => {
    expect(isDifferentDay(localStamp(new Date(2026, 2, 1, 0, 1)), localStamp(new Date(2026, 2, 1, 23, 59)))).toBe(false);
    expect(isDifferentDay(localStamp(new Date(2026, 2, 1, 23, 59)), localStamp(new Date(2026, 2, 2, 0, 1)))).toBe(true);
  });
});

describe('seenBy', () => {
  it('counts members who read at or after the message, except the sender', () => {
    const sent = '2026-03-01 12:00:00';
    const members = [
      member({ user_id: ME, username: 'shan_p', last_read_at: '2026-03-01 12:00:05' }),
      member({ user_id: 'bea-id', username: 'bea', last_read_at: '2026-03-01 12:00:00' }),
      member({ user_id: 'caz-id', username: 'caz', last_read_at: '2026-03-01 11:59:59' }),
    ];
    const seen = seenBy(conv({ is_group: true, members }), ME, sent);
    expect(seen.map((m) => m.username)).toEqual(['bea']);
  });
});

describe('sortConversations', () => {
  it('puts the newest activity first without disturbing the original list', () => {
    const older = conv({ id: 'older', last_message_at: '2026-03-01 09:00:00' });
    const newer = conv({ id: 'newer', last_message_at: '2026-03-01 18:00:00' });
    const input = [older, newer];
    expect(sortConversations(input).map((c) => c.id)).toEqual(['newer', 'older']);
    expect(input.map((c) => c.id)).toEqual(['older', 'newer']);
  });

  it('compares bare timestamps as UTC, so a zoned one does not jump the queue', () => {
    const bare = conv({ id: 'bare', last_message_at: '2026-03-01 12:00:00' });
    const zoned = conv({ id: 'zoned', last_message_at: '2026-03-01T13:00:00Z' });
    expect(sortConversations([bare, zoned]).map((c) => c.id)).toEqual(['zoned', 'bare']);
  });
});
