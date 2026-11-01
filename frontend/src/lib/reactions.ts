/*
 * Message reactions: one per person per message (primary key message_id +
 * user_id). The emoji list must match the CHECK constraint in schema.sql
 * exactly; the heart carries U+FE0F.
 */
export const REACTION_EMOJI = ['\u{1F44D}', '❤️', '\u{1F602}', '\u{1F62E}', '\u{1F622}', '\u{1F64F}'] as const;

export type Reaction = { message_id: string; user_id: string; emoji: string };

/* Shared empty list: a message without reactions always gets the same array, so its bubble stays memoised */
export const NO_REACTIONS: Reaction[] = [];

export type ReactionChip = { emoji: string; count: number; mine: boolean; userIds: string[] };

/* Group a message's reactions into chips, in the order of the picker */
export function summarizeReactions(reactions: Reaction[], myId: string | null): ReactionChip[] {
  const byEmoji = new Map<string, string[]>();
  for (const r of reactions) {
    const list = byEmoji.get(r.emoji);
    if (list) list.push(r.user_id); else byEmoji.set(r.emoji, [r.user_id]);
  }
  const order = (e: string) => {
    const i = (REACTION_EMOJI as readonly string[]).indexOf(e);
    return i < 0 ? REACTION_EMOJI.length : i;
  };
  return [...byEmoji.entries()]
    .sort((a, b) => order(a[0]) - order(b[0]))
    .map(([emoji, userIds]) => ({ emoji, count: userIds.length, mine: !!myId && userIds.includes(myId), userIds }));
}

/* Insert or switch someone's reaction. Returns a new map; untouched messages keep their array. */
export function upsertReaction(map: Record<string, Reaction[]>, row: Reaction): Record<string, Reaction[]> {
  const list = map[row.message_id] ?? NO_REACTIONS;
  const existing = list.find((r) => r.user_id === row.user_id);
  if (existing?.emoji === row.emoji) return map;
  const next = existing
    ? list.map((r) => (r.user_id === row.user_id ? { ...r, emoji: row.emoji } : r))
    : [...list, row];
  return { ...map, [row.message_id]: next };
}

export function removeReaction(map: Record<string, Reaction[]>, messageId: string, userId: string): Record<string, Reaction[]> {
  const list = map[messageId];
  if (!list || !list.some((r) => r.user_id === userId)) return map;
  const next = list.filter((r) => r.user_id !== userId);
  return { ...map, [messageId]: next.length === 0 ? NO_REACTIONS : next };
}

/* Title for a chip: "You, Alice and 2 others" (names come from the caller) */
export function reactorLabel(userIds: string[], myId: string | null, nameOf: (id: string) => string): string {
  const names = userIds.map((id) => (id === myId ? 'You' : nameOf(id)));
  names.sort((a, b) => (a === 'You' ? -1 : b === 'You' ? 1 : 0));
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;
}
