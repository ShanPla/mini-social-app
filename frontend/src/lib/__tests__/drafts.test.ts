import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readDraft, writeDraft, clearAllDrafts } from '../drafts';

/* A tiny Map-backed stand-in for localStorage (the tests run in node) */
function makeStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  };
}

let store: ReturnType<typeof makeStorage>;

beforeEach(() => {
  store = makeStorage();
  vi.stubGlobal('localStorage', store);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('drafts', () => {
  it('reads an empty string when nothing was saved', () => {
    expect(readDraft('post:u1')).toBe('');
  });

  it('gives back what was written', () => {
    writeDraft('post:u1', 'half a thought');
    expect(readDraft('post:u1')).toBe('half a thought');
  });

  it('removes the key when the text is blank or only whitespace', () => {
    writeDraft('post:u1', 'something');
    writeDraft('post:u1', '');
    expect(store.map.size).toBe(0);

    writeDraft('post:u1', 'something');
    writeDraft('post:u1', '  \n ');
    expect(store.map.size).toBe(0);
    expect(readDraft('post:u1')).toBe('');
  });

  it('keeps the drafts of two keys apart', () => {
    writeDraft('post:u1', 'mine');
    writeDraft('post:u2', 'theirs');
    expect(readDraft('post:u1')).toBe('mine');
    expect(readDraft('post:u2')).toBe('theirs');
  });

  it('clears every draft but leaves unrelated keys alone', () => {
    writeDraft('post:u1', 'mine');
    writeDraft('post:u2', 'theirs');
    store.setItem('chronicle-theme', 'dark');
    clearAllDrafts();
    expect(readDraft('post:u1')).toBe('');
    expect(readDraft('post:u2')).toBe('');
    expect(store.getItem('chronicle-theme')).toBe('dark');
  });

  it('does not throw when storage refuses, and reads as empty', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
      key: () => {
        throw new Error('blocked');
      },
      length: 1,
    };
    vi.stubGlobal('localStorage', broken);
    expect(readDraft('post:u1')).toBe('');
    expect(() => writeDraft('post:u1', 'text')).not.toThrow();
    expect(() => writeDraft('post:u1', '')).not.toThrow();
    expect(() => clearAllDrafts()).not.toThrow();
  });
});
