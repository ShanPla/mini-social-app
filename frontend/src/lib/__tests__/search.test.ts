import { describe, it, expect } from 'vitest';
import { escapeLike } from '../search';

describe('escapeLike', () => {
  it('leaves ordinary text alone', () => {
    expect(escapeLike('shan')).toBe('shan');
    expect(escapeLike('')).toBe('');
  });

  it('escapes the wildcards, so they match themselves', () => {
    expect(escapeLike('%')).toBe('\\%');
    expect(escapeLike('_')).toBe('\\_');
    /* underscores are common in handles: a search for shan_p must not match shanXp */
    expect(escapeLike('shan_p')).toBe('shan\\_p');
    expect(escapeLike('100%_sure')).toBe('100\\%\\_sure');
  });

  it('escapes the escape character itself', () => {
    expect(escapeLike('a\\b')).toBe('a\\\\b');
    expect(escapeLike('\\%')).toBe('\\\\\\%');
  });
});
