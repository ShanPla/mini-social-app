import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseDbDate, timeAgo } from '../timeAgo';

/* Postgres `timestamp` columns come back with no zone and are UTC */
describe('parseDbDate', () => {
  it('reads a bare Postgres timestamp as UTC, not local time', () => {
    expect(parseDbDate('2026-03-01 12:00:00').toISOString()).toBe('2026-03-01T12:00:00.000Z');
    expect(parseDbDate('2026-03-01T12:00:00').toISOString()).toBe('2026-03-01T12:00:00.000Z');
    expect(parseDbDate('2026-03-01T12:00:00.123').toISOString()).toBe('2026-03-01T12:00:00.123Z');
  });

  it('leaves a timestamp that already states its zone alone', () => {
    expect(parseDbDate('2026-03-01T12:00:00Z').toISOString()).toBe('2026-03-01T12:00:00.000Z');
    expect(parseDbDate('2026-03-01T12:00:00+00:00').toISOString()).toBe('2026-03-01T12:00:00.000Z');
    expect(parseDbDate('2026-03-01T20:00:00+08:00').toISOString()).toBe('2026-03-01T12:00:00.000Z');
    expect(parseDbDate('2026-03-01T07:00:00-0500').toISOString()).toBe('2026-03-01T12:00:00.000Z');
  });
});

describe('timeAgo', () => {
  const now = new Date('2026-03-01T12:00:00Z');
  /* Minutes before `now`, as a bare Postgres timestamp */
  const ago = (minutes: number) => new Date(now.getTime() - minutes * 60000).toISOString().replace('Z', '');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });
  afterEach(() => vi.useRealTimers());

  it.each([
    [0, 'just now'],
    [0.5, 'just now'],
    [1, '1m ago'],
    [59, '59m ago'],
    [60, '1h ago'],
    [60 * 23, '23h ago'],
    [60 * 24, '1d ago'],
    [60 * 24 * 6, '6d ago'],
    [60 * 24 * 7, '1w ago'],
    [60 * 24 * 34, '4w ago'],
    [60 * 24 * 35, '1mo ago'],
    /* 360 days is 12 thirty-day months but not yet a year: it used to read 0y ago */
    [60 * 24 * 360, '11mo ago'],
    [60 * 24 * 364, '11mo ago'],
    [60 * 24 * 365, '1y ago'],
    [60 * 24 * 365 * 3, '3y ago'],
  ])('%i minutes ago reads as %s', (minutes, expected) => {
    expect(timeAgo(ago(minutes))).toBe(expected);
  });

  it('says just now for a timestamp a moment in the future, as clock drift can produce', () => {
    expect(timeAgo(new Date(now.getTime() + 2000).toISOString().replace('Z', ''))).toBe('just now');
  });
});
