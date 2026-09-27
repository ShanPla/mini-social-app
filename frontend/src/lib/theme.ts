import { useSyncExternalStore } from 'react';

/*
 * Light and dark theme. The choice is kept on this device only (localStorage):
 * 'system' follows the device setting, 'light' and 'dark' pin it.
 * index.html applies the stored theme before the first paint, so a dark page
 * never flashes white; this module keeps it in step afterwards (the switch in
 * Settings and the navbar, the device setting changing, other open tabs).
 * The colours themselves are CSS variables in styles/global.css.
 */

export type ThemePreference = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

/* Keep these three in sync with the inline script in index.html */
const STORAGE_KEY = 'chronicle-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';
const BROWSER_BAR = { light: '#faf8f4', dark: '#15110e' };

const listeners = new Set<() => void>();

export function getThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* storage blocked: fall back to the device setting */
  }
  return 'system';
}

export function getTheme(): Theme {
  const preference = getThemePreference();
  if (preference !== 'system') return preference;
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

function applyTheme() {
  const theme = getTheme();
  const root = document.documentElement;
  if (root.dataset.theme !== theme) {
    /* Switching should not animate every colour on the page at once */
    root.classList.add('theme-switching');
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BROWSER_BAR[theme]);
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-switching')));
  }
  listeners.forEach((notify) => notify());
}

export function setThemePreference(preference: ThemePreference) {
  try {
    if (preference === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    /* storage blocked: the change still applies to this page */
  }
  applyTheme();
}

/* Called once from main.tsx: follow the device setting and other tabs */
export function initTheme() {
  applyTheme();
  window.matchMedia(DARK_QUERY).addEventListener('change', applyTheme);
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) applyTheme();
  });
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  return () => { listeners.delete(notify); };
}

/* Current preference and the theme it resolves to, kept live */
export function useTheme() {
  const preference = useSyncExternalStore(subscribe, getThemePreference, () => 'system' as const);
  const theme = useSyncExternalStore(subscribe, getTheme, () => 'light' as const);
  return { preference, theme, setPreference: setThemePreference };
}
