import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getThemePreference, getTheme, setThemePreference } from '../theme';

function makeStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
  };
}

let store: ReturnType<typeof makeStorage>;
let root: {
  dataset: Record<string, string>;
  style: Record<string, string>;
  classList: { add: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
};
let metaTag: { setAttribute: ReturnType<typeof vi.fn> };
let deviceIsDark: boolean;

beforeEach(() => {
  store = makeStorage();
  deviceIsDark = false;
  root = { dataset: {}, style: {}, classList: { add: vi.fn(), remove: vi.fn() } };
  metaTag = { setAttribute: vi.fn() };
  vi.stubGlobal('localStorage', store);
  vi.stubGlobal('window', { matchMedia: () => ({ matches: deviceIsDark }) });
  vi.stubGlobal('document', { documentElement: root, querySelector: () => metaTag });
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => cb());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getThemePreference', () => {
  it('is system when nothing is stored', () => {
    expect(getThemePreference()).toBe('system');
  });

  it('returns a stored light or dark choice', () => {
    store.map.set('chronicle-theme', 'dark');
    expect(getThemePreference()).toBe('dark');
    store.map.set('chronicle-theme', 'light');
    expect(getThemePreference()).toBe('light');
  });

  it('treats an unknown stored value as system', () => {
    store.map.set('chronicle-theme', 'purple');
    expect(getThemePreference()).toBe('system');
  });

  it('falls back to system when storage is blocked', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); } });
    expect(getThemePreference()).toBe('system');
  });
});

describe('getTheme', () => {
  it('follows the device when the preference is system', () => {
    deviceIsDark = true;
    expect(getTheme()).toBe('dark');
    deviceIsDark = false;
    expect(getTheme()).toBe('light');
  });

  it('a pinned choice wins over the device setting', () => {
    deviceIsDark = true;
    store.map.set('chronicle-theme', 'light');
    expect(getTheme()).toBe('light');
  });
});

describe('setThemePreference', () => {
  it('stores a pinned choice and applies it to the page', () => {
    setThemePreference('dark');
    expect(store.map.get('chronicle-theme')).toBe('dark');
    expect(root.dataset.theme).toBe('dark');
    expect(root.style.colorScheme).toBe('dark');
    expect(metaTag.setAttribute).toHaveBeenCalledWith('content', '#15110e');
  });

  it('switching back to light restores the light browser bar colour', () => {
    setThemePreference('dark');
    setThemePreference('light');
    expect(root.dataset.theme).toBe('light');
    expect(metaTag.setAttribute).toHaveBeenLastCalledWith('content', '#faf8f4');
  });

  it('choosing system clears the stored value and uses the device setting', () => {
    setThemePreference('light');
    deviceIsDark = true;
    setThemePreference('system');
    expect(store.map.has('chronicle-theme')).toBe(false);
    expect(root.dataset.theme).toBe('dark');
  });

  it('does not throw when storage is blocked', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); },
    });
    expect(() => setThemePreference('dark')).not.toThrow();
  });

  it('still applies the choice to this page when storage is blocked', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); },
    });
    deviceIsDark = false;
    setThemePreference('dark');
    expect(getThemePreference()).toBe('dark');
    expect(root.dataset.theme).toBe('dark');
    setThemePreference('light');
    expect(root.dataset.theme).toBe('light');
  });

  it('does not touch the page when the theme is unchanged', () => {
    setThemePreference('light');
    root.dataset.theme = 'light';
    root.classList.add.mockClear();
    setThemePreference('light');
    expect(root.classList.add).not.toHaveBeenCalled();
  });
});
