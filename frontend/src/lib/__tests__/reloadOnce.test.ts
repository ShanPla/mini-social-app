import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isChunkLoadError, canReloadForStaleChunk, reloadForStaleChunk } from '../reloadOnce';

function makeSession() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
  };
}

describe('isChunkLoadError', () => {
  it('recognises what browsers and Vite say about a missing chunk', () => {
    expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module: /assets/Feed-abc.js'))).toBe(true);
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('Unable to preload CSS for /assets/Feed.css'))).toBe(true);
    expect(isChunkLoadError(new Error('Loading chunk 7 failed'))).toBe(true);
  });

  it('accepts a plain string and ignores the case', () => {
    expect(isChunkLoadError('LOADING CHUNK 3 FAILED')).toBe(true);
  });

  it('ignores unrelated errors and empty values', () => {
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
});

describe('stale chunk reload', () => {
  let reload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    reload = vi.fn();
    vi.stubGlobal('sessionStorage', makeSession());
    vi.stubGlobal('window', { location: { reload } });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('allows the first reload and performs it', () => {
    expect(canReloadForStaleChunk()).toBe(true);
    expect(reloadForStaleChunk()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('refuses a second reload inside the window so a broken build cannot loop', () => {
    reloadForStaleChunk();
    vi.advanceTimersByTime(5000);
    expect(canReloadForStaleChunk()).toBe(false);
    expect(reloadForStaleChunk()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('allows another reload once the window has passed', () => {
    reloadForStaleChunk();
    vi.advanceTimersByTime(15001);
    expect(reloadForStaleChunk()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('does not reload when storage is blocked, because nothing could stop a loop', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    });
    expect(canReloadForStaleChunk()).toBe(false);
    expect(reloadForStaleChunk()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('does not reload when the reload cannot be remembered', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => null,
      setItem: () => { throw new Error('quota'); },
    });
    expect(reloadForStaleChunk()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
