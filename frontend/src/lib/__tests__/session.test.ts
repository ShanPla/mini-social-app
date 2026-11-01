import { describe, it, expect } from 'vitest';
import { markIntentionalSignOut, consumeIntentionalSignOut } from '../session';

describe('intentional sign-out flag', () => {
  it('is off until a logout marks it', () => {
    expect(consumeIntentionalSignOut()).toBe(false);
  });

  it('is on after marking, and reading it switches it off again', () => {
    markIntentionalSignOut();
    expect(consumeIntentionalSignOut()).toBe(true);
    expect(consumeIntentionalSignOut()).toBe(false);
  });

  it('marking twice still counts as one sign-out', () => {
    markIntentionalSignOut();
    markIntentionalSignOut();
    expect(consumeIntentionalSignOut()).toBe(true);
    expect(consumeIntentionalSignOut()).toBe(false);
  });
});
