import { useEffect } from 'react';

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} — The Chronicle` : 'The Chronicle';
    return () => { document.title = 'The Chronicle'; };
  }, [title]);
}