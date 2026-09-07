import type { ChatMember, Conversation } from './supabaseClient';
import { parseDbDate } from './timeAgo';

/* Members of a conversation other than the current user */
export function otherMembers(conv: Conversation, meId: string | null): ChatMember[] {
  return (conv.members || []).filter((m) => m.user_id !== meId);
}

/* Display title: group name, or the other people's usernames */
export function conversationTitle(conv: Conversation, meId: string | null): string {
  if (conv.is_group && conv.name) return conv.name;
  const others = otherMembers(conv, meId);
  if (others.length === 0) return conv.is_group ? 'Just you' : 'Deleted user';
  if (!conv.is_group) return `@${others[0].username}`;
  return others.map((m) => m.username).join(', ');
}

/* Avatar for a conversation: the other person's avatar in a DM, null for groups */
export function conversationAvatar(conv: Conversation, meId: string | null): ChatMember | null {
  if (conv.is_group) return null;
  return otherMembers(conv, meId)[0] || null;
}

/* One-line preview of the last message for the conversation list */
export function lastMessagePreview(conv: Conversation, meId: string | null): string {
  const lm = conv.last_message;
  if (!lm) return conv.is_group ? 'Group created' : 'Say hello';
  const sender = lm.sender_id === meId
    ? 'You'
    : (conv.members || []).find((m) => m.user_id === lm.sender_id)?.username || 'Someone';
  const body = lm.content?.trim()
    ? lm.content.trim()
    : lm.image_url ? 'Sent a photo' : '';
  return conv.is_group || lm.sender_id === meId ? `${sender}: ${body}` : body;
}

/* Short relative time for the list: "now", "5m", "3h", "2d", or a date */
export function shortTime(dateStr: string): string {
  const date = parseDbDate(dateStr);
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  if (hrs < 24) return `${hrs}h`;
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/* Clock time for a message bubble */
export function messageTime(dateStr: string): string {
  return parseDbDate(dateStr).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/* "Today", "Yesterday", or a date — used for separators between days */
export function dayLabel(dateStr: string): string {
  const date = parseDbDate(dateStr);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfThat = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDiff = Math.round((startOfToday - startOfThat) / 86400000);
  if (dayDiff === 0) return 'Today';
  if (dayDiff === 1) return 'Yesterday';
  const opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' };
  if (date.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  return date.toLocaleDateString(undefined, opts);
}

/* True when two timestamps fall on different calendar days (local time) */
export function isDifferentDay(a: string, b: string): boolean {
  const da = parseDbDate(a);
  const db = parseDbDate(b);
  return da.getFullYear() !== db.getFullYear()
    || da.getMonth() !== db.getMonth()
    || da.getDate() !== db.getDate();
}

/* Members (other than the sender) who have read a message sent at `createdAt` */
export function seenBy(conv: Conversation, senderId: string, createdAt: string): ChatMember[] {
  const t = parseDbDate(createdAt).getTime();
  return (conv.members || []).filter(
    (m) => m.user_id !== senderId && parseDbDate(m.last_read_at).getTime() >= t
  );
}

/* Sort newest activity first */
export function sortConversations(list: Conversation[]): Conversation[] {
  return [...list].sort(
    (a, b) => parseDbDate(b.last_message_at).getTime() - parseDbDate(a.last_message_at).getTime()
  );
}

export const MOBILE_QUERY = '(max-width: 700px)';
export function isMobile(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches;
}

export const MAX_OPEN_POPUPS = 3;
export const MESSAGE_PAGE_SIZE = 40;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
