import { describe, it, expect } from 'vitest';
import { describeError } from '../errors';
import { friendlyAuthError, isUnconfirmedEmail } from '../authErrors';

describe('describeError', () => {
  it('uses the fallback when there is no error', () => {
    expect(describeError(null, 'Could not save.')).toBe('Could not save.');
    expect(describeError(undefined, 'Could not save.')).toBe('Could not save.');
  });

  it('passes through a message raised by the database, such as a rate limit', () => {
    const tooFast = { code: 'P0001', message: 'Too many posts in a short time. Please slow down.', hint: 'rate_limit' };
    expect(describeError(tooFast, 'Could not publish your post.')).toBe(tooFast.message);
  });

  it('explains a duplicate', () => {
    expect(describeError({ code: '23505', message: 'duplicate key value violates unique constraint' }, 'Could not follow.'))
      .toBe('That already exists.');
  });

  it('hides raw database text behind the fallback', () => {
    expect(describeError({ code: '42501', message: 'new row violates row-level security policy' }, 'Could not save.'))
      .toBe('Could not save.');
    /* P0001 with no message of its own still falls back */
    expect(describeError({ code: 'P0001' }, 'Could not save.')).toBe('Could not save.');
  });
});

describe('friendlyAuthError', () => {
  it.each([
    ['Invalid login credentials', 'Wrong email or password.'],
    ['Email not confirmed', 'Your email address has not been confirmed yet.'],
    ['Unable to validate email address: invalid format', 'Please enter a valid email address (e.g. yourname@gmail.com).'],
    ['User already registered', 'An account with this email already exists. Try logging in instead.'],
    ['email rate limit exceeded', 'Too many attempts. Please wait a minute and try again.'],
    ['For security purposes, you can only request this after 51 seconds.', 'Too many attempts. Please wait a minute and try again.'],
    ['New password should be different from the old password.', 'Your new password must be different from the old one.'],
    ['Password should be at least 6 characters.', 'Password must be at least 6 characters.'],
    ['Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz, 0123456789.', 'Password must contain uppercase, lowercase letters and numbers.'],
    ['Weak password', 'Password must contain uppercase, lowercase letters and numbers.'],
    ['Auth session missing!', 'This link has expired. Please request a new one.'],
  ])('turns %j into a line a person can act on', (raw, expected) => {
    expect(friendlyAuthError(raw)).toBe(expected);
  });

  it('matches whatever case the server used', () => {
    expect(friendlyAuthError('INVALID LOGIN CREDENTIALS')).toBe('Wrong email or password.');
  });

  it('passes an unrecognised message through unchanged', () => {
    expect(friendlyAuthError('Something unusual happened')).toBe('Something unusual happened');
  });
});

describe('isUnconfirmedEmail', () => {
  it('is true only for the unconfirmed-email error', () => {
    expect(isUnconfirmedEmail('Email not confirmed')).toBe(true);
    expect(isUnconfirmedEmail('email not confirmed')).toBe(true);
    expect(isUnconfirmedEmail('Invalid login credentials')).toBe(false);
  });
});
