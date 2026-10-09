import { describe, it, expect } from 'vitest';
import { displayName } from '../names';

describe('displayName', () => {
  it('uses the display name when there is one', () => {
    expect(displayName({ username: 'shan_p', display_name: 'Shan Platon' })).toBe('Shan Platon');
  });

  it('falls back to the handle when the display name is missing, null or blank', () => {
    expect(displayName({ username: 'shan_p' })).toBe('shan_p');
    expect(displayName({ username: 'shan_p', display_name: null })).toBe('shan_p');
    expect(displayName({ username: 'shan_p', display_name: '' })).toBe('shan_p');
    expect(displayName({ username: 'shan_p', display_name: '   ' })).toBe('shan_p');
  });

  it('trims a padded display name', () => {
    expect(displayName({ username: 'shan_p', display_name: '  Shan  ' })).toBe('Shan');
  });
});
