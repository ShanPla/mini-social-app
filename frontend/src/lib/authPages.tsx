import { lazy, useState } from 'react';
import type { ComponentType } from 'react';
import { pageLoaders, readyAuthPage } from './pages';
import type { AuthPageName } from './pages';

/*
 * Sign in, Create account and Forgot password as pages that can appear
 * without a pause.
 *
 * A React.lazy page suspends the first time it renders, even when its code is
 * already downloaded, and React then holds the new screen back for about
 * 300ms. That pause sat between the click and the slide (lib/authSwap.ts).
 * Each page warms the other one (loadAuthPage), and a page warmed that way
 * renders here directly, with no suspending. Anything else still goes through
 * lazy, so nothing is imported up front.
 *
 * The choice is made once per mount: switching component type while the page
 * is on screen would remount it and empty the form.
 */
function authPage(name: AuthPageName) {
  const Lazy = lazy(pageLoaders[name]);
  return function AuthPage() {
    const [Page] = useState<ComponentType>(() => readyAuthPage(name) ?? Lazy);
    return <Page />;
  };
}

export const LoginPage = authPage('login');
export const RegisterPage = authPage('register');
export const ForgotPasswordPage = authPage('forgotPassword');
