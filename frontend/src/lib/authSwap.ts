import { flushSync } from 'react-dom';
import type { MouseEvent } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { loadAuthPage } from './pages';
import type { AuthPageName } from './pages';

/*
 * Sign in <-> Create account, and Sign in <-> Forgot password. All three keep
 * the form on the same side, so the fields stay where the reader is already
 * looking. Leaving Sign in, the other form drops in from the top over it;
 * going back, it lifts away and Sign in is underneath.
 *
 * It uses the browser's View Transitions: the panels carry the same
 * view-transition-name on both pages, and the keyframes and the two
 * directions are in styles/animations.css. Without that feature, or when the
 * reader asked for reduced motion, the link works as a plain link.
 */
type Target = AuthPageName;

/* Each page marks its root, so the new one can be told from the old one:
   Sign in and Forgot password share the same layout and class names */
const ARRIVED: Record<Target, string> = {
  login: '[data-auth-page="login"]',
  register: '[data-auth-page="register"]',
  forgotPassword: '[data-auth-page="forgotPassword"]',
};
const PATH: Record<Target, string> = { login: '/login', register: '/register', forgotPassword: '/forgot-password' };

type TransitionDocument = Document & {
  startViewTransition?: (update: () => Promise<void> | void) => { finished: Promise<void> };
};

/* Resolves once the new page is in the document: it is lazy, so it can land a moment after the navigation */
function appears(selector: string, timeoutMs = 1500): Promise<void> {
  return new Promise((resolve) => {
    if (document.querySelector(selector)) { resolve(); return; }
    const observer = new MutationObserver(() => {
      if (!document.querySelector(selector)) return;
      observer.disconnect();
      clearTimeout(timer);
      resolve();
    });
    const timer = setTimeout(() => { observer.disconnect(); resolve(); }, timeoutMs);
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

export function canSwapAuthPages(): boolean {
  const doc = document as TransitionDocument;
  return typeof doc.startViewTransition === 'function'
    && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* onClick for the link between the two pages. Leaves the event alone when the
   slide can not run, so the link then navigates the ordinary way. */
export function swapAuthPage(e: MouseEvent<HTMLAnchorElement>, navigate: NavigateFunction, target: Target, state: unknown): void {
  /* New tab, new window and the like stay the browser's business */
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  if (!canSwapAuthPages()) return;
  e.preventDefault();

  const doc = document as TransitionDocument;
  const root = document.documentElement;
  const go = () => navigate(PATH[target], { state });

  /* The page's code first, so the slide never waits on a download */
  loadAuthPage(target).then(() => {
    /* Which way it goes picks the animation; the page's own fade-in is held
       back meanwhile (styles/animations.css) */
    const classes = ['auth-swap', target === 'login' ? 'auth-swap--out' : 'auth-swap--in'];
    /* The words on the dark panel differ only on Create account. Between Sign
       in and Forgot password they are the same and must stay still. */
    if (target === 'register' || window.location.pathname === PATH.register) classes.push('auth-swap--words');
    root.classList.add(...classes);
    const transition = doc.startViewTransition!(async () => {
      flushSync(go);
      await appears(ARRIVED[target]);
    });
    const done = () => {
      /* Letting go of the class would start the page's fade-in now, as a
         blink. Switch it off on this page for good first. */
      document.querySelectorAll<HTMLElement>('.page-enter').forEach((el) => { el.style.animation = 'none'; });
      root.classList.remove(...classes);
    };
    transition.finished.then(done, done);
  }, go);
}
