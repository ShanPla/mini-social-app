import { describe, it, expect } from 'vitest';
import { isSubmitShortcut } from '../submitShortcut';

const key = (over: Partial<Parameters<typeof isSubmitShortcut>[0]>) => ({
  key: 'Enter', ctrlKey: false, metaKey: false, isComposing: false, ...over,
});

describe('isSubmitShortcut', () => {
  it('is Ctrl+Enter or Cmd+Enter', () => {
    expect(isSubmitShortcut(key({ ctrlKey: true }))).toBe(true);
    expect(isSubmitShortcut(key({ metaKey: true }))).toBe(true);
  });

  it('leaves plain Enter alone, so it still makes a new line', () => {
    expect(isSubmitShortcut(key({}))).toBe(false);
  });

  it('ignores Ctrl with any other key', () => {
    expect(isSubmitShortcut(key({ key: 'a', ctrlKey: true }))).toBe(false);
  });

  it('ignores Enter that confirms an IME word', () => {
    expect(isSubmitShortcut(key({ ctrlKey: true, isComposing: true }))).toBe(false);
  });
});
