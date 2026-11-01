import { useSyncExternalStore } from 'react';

/* Live result of a CSS media query, e.g. useMediaQuery('(max-width: 680px)') */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', notify);
      return () => mq.removeEventListener('change', notify);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}
