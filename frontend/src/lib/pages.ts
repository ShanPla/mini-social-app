/*
 * One import() thunk per page, shared by React.lazy in App.tsx and by the
 * places that warm a chunk early (the auth gate, navbar hover). The browser
 * dedupes the module fetch, so warming never costs a second download.
 */
export const pageLoaders = {
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
};

export type PageName = keyof typeof pageLoaders;

/* Which page a path will render, so it can be fetched before routing happens */
export function pageForPath(pathname: string): PageName {
  if (pathname === '/login') return 'login';
  if (pathname === '/register') return 'register';
  if (pathname === '/forgot-password') return 'forgotPassword';
  if (pathname === '/reset-password') return 'resetPassword';
  if (pathname.startsWith('/profile/')) return 'profile';
  if (pathname.startsWith('/post/')) return 'post';
  if (pathname === '/search') return 'search';
  if (pathname === '/notifications') return 'notifications';
  if (pathname.startsWith('/messages')) return 'messages';
  return 'feed';
}

/* Fire and forget. Errors surface later through React.lazy, not here. */
export function prefetchPage(name: PageName): void {
  void pageLoaders[name]().catch(() => undefined);
}
