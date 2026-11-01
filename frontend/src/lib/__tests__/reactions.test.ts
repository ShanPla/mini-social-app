import { describe, it, expect } from 'vitest';
import type { Reaction } from '../reactions';
import {
  REACTION_EMOJI, NO_REACTIONS, summarizeReactions, upsertReaction, removeReaction, reactorLabel,
} from '../reactions';
import { replyPreview } from '../replies';

const heart = REACTION_EMOJI[1];
const thumb = REACTION_EMOJI[0];

describe('REACTION_EMOJI', () => {
  it('has the six allowed emoji, heart with U+FE0F', () => {
    expect(REACTION_EMOJI).toHaveLength(6);
    expect(heart).toBe('❤️');
  });
});

describe('summarizeReactions', () => {
  it('groups by emoji in picker order and marks mine', () => {
    const chips = summarizeReactions([
      { message_id: 'm', user_id: 'a', emoji: heart },
      { message_id: 'm', user_id: 'b', emoji: thumb },
      { message_id: 'm', user_id: 'me', emoji: heart },
    ], 'me');
    expect(chips.map((c) => [c.emoji, c.count, c.mine])).toEqual([[thumb, 1, false], [heart, 2, true]]);
  });
  it('returns nothing for no reactions', () => {
    expect(summarizeReactions([], 'me')).toEqual([]);
  });
});

describe('upsertReaction / removeReaction', () => {
  it('adds, switches and removes, leaving other messages alone', () => {
    const other: Reaction[] = [{ message_id: 'x', user_id: 'a', emoji: thumb }];
    let map: Record<string, Reaction[]> = { x: other };
    map = upsertReaction(map, { message_id: 'm', user_id: 'me', emoji: heart });
    expect(map.m).toHaveLength(1);
    expect(map.x).toBe(other);
    map = upsertReaction(map, { message_id: 'm', user_id: 'me', emoji: thumb });
    expect(map.m).toEqual([{ message_id: 'm', user_id: 'me', emoji: thumb }]);
    const same = upsertReaction(map, { message_id: 'm', user_id: 'me', emoji: thumb });
    expect(same).toBe(map);
    map = removeReaction(map, 'm', 'me');
    expect(map.m).toBe(NO_REACTIONS);
    expect(removeReaction(map, 'm', 'me')).toBe(map);
  });
});

describe('reactorLabel', () => {
  const nameOf = (id: string) => id.toUpperCase();
  it('puts You first and shortens long lists', () => {
    expect(reactorLabel(['a', 'me'], 'me', nameOf)).toBe('You, A');
    expect(reactorLabel(['a', 'b', 'c', 'd', 'e'], 'me', nameOf)).toBe('A, B, C and 2 more');
  });
});

describe('replyPreview', () => {
  it('uses the first non-empty line, else Photo, else empty', () => {
    expect(replyPreview('\n  hello\nworld', null)).toBe('hello');
    expect(replyPreview(null, 'a/b.jpg')).toBe('Photo');
    expect(replyPreview('  ', null)).toBe('');
  });
});
