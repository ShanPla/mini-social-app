import { useSyncExternalStore } from 'react';

/*
 * Light and dark theme. The choice is kept on this device only (localStorage):
 * 'system' follows the device setting, 'light' and 'dark' pin it.
 * index.html applies the stored theme before the first paint, so a dark page
 * never flashes white; this module keeps it in step afterwards (the switch in
 * Settings and the navbar, the device setting changing, other open tabs).
 * The colours themselves are CSS variables in styles/global.css.
 * A change fades in: one cross-fade of the whole page (a View Transition,
 * styled in styles/animations.css), not hundreds of colours moving one by one.
 */

export type ThemePreference = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

/* Keep these three in sync with the inline script in index.html */
const STORAGE_KEY = 'chronicle-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';
const BROWSER_BAR = { light: '#faf8f4', dark: '#15110e' };

const listeners = new Set<() => void>();

/* The choice made this session when storage refused it, so the page still follows it */
let unsavedPreference: ThemePreference | null = null;

export function getThemePreference(): ThemePreference {
  if (unsavedPreference) return unsavedPreference;
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

type TransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> };
};

/* The fade needs the browser feature, a page someone is looking at, and a
   reader who has not asked for less motion. Without them the change is instant. */
function canFade(): boolean {
  if (typeof (document as TransitionDocument).startViewTransition !== 'function') return false;
  if (document.visibilityState !== 'visible') return false;
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* Counts fades, so a quick second switch does not have its class taken away by the first */
let fades = 0;

function applyTheme() {
  const theme = getTheme();
  const root = document.documentElement;
  if (root.dataset.theme === theme) {
    listeners.forEach((notify) => notify());
    return;
  }
  const change = () => {
    /* The colours themselves change in one step; the fade is done on pictures of the page */
    root.classList.add('theme-switching');
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BROWSER_BAR[theme]);
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-switching')));
    /* Inside the change, so the sun or moon in the new picture is already the right one */
    listeners.forEach((notify) => notify());
  };
  if (!canFade()) { change(); return; }
  const mine = ++fades;
  /* Set before the old picture is taken: see .theme-fade in animations.css */
  root.classList.add('theme-fade');
  const done = () => { if (mine === fades) root.classList.remove('theme-fade'); };
  try {
    (document as TransitionDocument).startViewTransition!(change).finished.then(done, done);
  } catch {
    done();
    change();
  }
}

export function setThemePreference(preference: ThemePreference) {
  try {
    if (preference === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, preference);
    unsavedPreference = null;
  } catch {
    /* storage blocked: keep the choice in memory so it still applies to this page */
    unsavedPreference = preference;
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
