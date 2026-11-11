import type { ComponentType } from 'react';

/*
 * One import() thunk per page, shared by React.lazy in App.tsx and by the
 * places that warm a chunk early (the auth gate, navbar hover). The browser
 * dedupes the module fetch, so warming never costs a second download.
 */
export const pageLoaders = {
  landing: () => import('../pages/Landing/Landing'),
  login: () => import('../pages/Login/Login'),
  register: () => import('../pages/Register/Register'),
  forgotPassword: () => import('../pages/ForgotPassword/ForgotPassword'),
  resetPassword: () => import('../pages/ResetPassword/ResetPassword'),
  feed: () => import('../pages/Feed/Feed'),
  profile: () => import('../pages/Profile/Profile'),
  post: () => import('../pages/Post/Post'),
  search: () => import('../pages/Search/Search'),
  notifications: () => import('../pages/Notifications/Notifications'),
  messages: () => import('../pages/Messages/Messages'),
  notFound: () => import('../pages/NotFound/NotFound'),
  settings: () => import('../pages/Settings/Settings'),
  privacy: () => import('../pages/Privacy/Privacy'),
  terms: () => import('../pages/Terms/Terms'),
  adminReports: () => import('../pages/AdminReports/AdminReports'),
};

export type PageName = keyof typeof pageLoaders;

/* Which page a path will render, so it can be fetched before routing happens */
export function pageForPath(pathname: string): PageName {
  if (pathname === '/') return 'landing';
  if (pathname === '/login') return 'login';
  if (pathname === '/register') return 'register';
  if (pathname === '/forgot-password') return 'forgotPassword';
  if (pathname === '/reset-password') return 'resetPassword';
  if (pathname.startsWith('/profile/')) return 'profile';
  if (pathname.startsWith('/post/')) return 'post';
  if (pathname === '/search') return 'search';
  if (pathname === '/notifications') return 'notifications';
  if (pathname === '/settings') return 'settings';
  if (pathname === '/privacy') return 'privacy';
  if (pathname === '/terms') return 'terms';
  if (pathname === '/admin/reports') return 'adminReports';
  if (pathname.startsWith('/messages')) return 'messages';
  return 'feed';
}

/* Sign in, Create account and Forgot password give way to each other with an
   animation (lib/authSwap.ts). A page loaded through here can render at once,
   without suspending (lib/authPages.tsx). */
export type AuthPageName = 'login' | 'register' | 'forgotPassword';
const readyAuth: Partial<Record<AuthPageName, ComponentType>> = {};

export function loadAuthPage(name: AuthPageName): Promise<void> {
  return pageLoaders[name]().then((module) => { readyAuth[name] = module.default; });
}

export function readyAuthPage(name: AuthPageName): ComponentType | undefined {
  return readyAuth[name];
}

/* Fire and forget. Errors surface later through React.lazy, not here. */
export function prefetchPage(name: PageName): void {
  void pageLoaders[name]().catch(() => undefined);
}
