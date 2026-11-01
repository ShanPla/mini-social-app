import { describe, it, expect } from 'vitest';
import { tokenizeMentions, mentionedUsernames, findMentionQuery, insertMention } from '../mentions';

describe('tokenizeMentions', () => {
  it('leaves text without mentions as one run', () => {
    expect(tokenizeMentions('hello world')).toEqual([{ type: 'text', text: 'hello world' }]);
    expect(tokenizeMentions('')).toEqual([]);
  });

  it('splits around a mention and lowercases the username', () => {
    expect(tokenizeMentions('hi @Shan_P, welcome')).toEqual([
      { type: 'text', text: 'hi ' },
      { type: 'mention', text: '@Shan_P', username: 'shan_p' },
      { type: 'text', text: ', welcome' },
    ]);
  });

  it('finds a mention at the very start and end', () => {
    const parts = tokenizeMentions('@abc and @xyz');
    expect(parts.filter((p) => p.type === 'mention').map((p) => p.type === 'mention' && p.username)).toEqual(['abc', 'xyz']);
  });

  it('handles back-to-back mentions', () => {
    expect(mentionedUsernames('@abc @def')).toEqual(['abc', 'def']);
  });

  it('ignores e-mail addresses and too-short or too-long names', () => {
    expect(mentionedUsernames('mail me at me@example.com')).toEqual([]);
    expect(mentionedUsernames('@ab')).toEqual([]);
    expect(mentionedUsernames(`@${'a'.repeat(31)}`)).toEqual([]);
    expect(mentionedUsernames(`@${'a'.repeat(30)}`)).toEqual(['a'.repeat(30)]);
  });

  it('lists each person once, in order of first appearance', () => {
    expect(mentionedUsernames('@bob hi @amy and @BOB again')).toEqual(['bob', 'amy']);
  });

  it('puts the original text back when the parts are joined', () => {
    const text = 'x @abc, (@def) and @ghi_1.';
    expect(tokenizeMentions(text).map((p) => p.text).join('')).toBe(text);
  });
});

describe('findMentionQuery', () => {
  it('finds the name being typed at the caret', () => {
    expect(findMentionQuery('hello @sh', 9)).toEqual({ start: 6, query: 'sh' });
    expect(findMentionQuery('@a', 2)).toEqual({ start: 0, query: 'a' });
  });

  it('needs at least one character after the @', () => {
    expect(findMentionQuery('hello @', 7)).toBeNull();
  });

  it('does not trigger inside a word or an e-mail address', () => {
    expect(findMentionQuery('me@exa', 6)).toBeNull();
    expect(findMentionQuery('no mention here', 5)).toBeNull();
  });

  it('ends at the caret, and stops after a space', () => {
    expect(findMentionQuery('@shan rest', 3)).toEqual({ start: 0, query: 'sh' });
    expect(findMentionQuery('@shan rest', 10)).toBeNull();
  });

  it('rejects names over 30 characters', () => {
    const long = `@${'a'.repeat(31)}`;
    expect(findMentionQuery(long, long.length)).toBeNull();
  });
});

describe('insertMention', () => {
  it('replaces the typed part with the full handle and a space', () => {
    expect(insertMention('hi @sh', 6, 3, 'shan_p')).toEqual({ text: 'hi @shan_p ', caret: 11 });
  });

  it('keeps the text after the caret', () => {
    expect(insertMention('@sh there', 3, 0, 'shan')).toEqual({ text: '@shan  there', caret: 6 });
  });
});
