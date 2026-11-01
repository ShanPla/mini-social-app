import { useEffect, useRef } from 'react';

/* Frees a preview made with URL.createObjectURL; other URLs are left alone */
export function revokePreview(url: string | null | undefined) {
  if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
}

/*
 * Safety net for picture previews: whatever blob previews are still held
 * when the component goes away get revoked. Handlers revoke the ones they
 * drop (removed, cleared, replaced) with revokePreview; this only covers
 * the unmount, so a preview still on screen is never revoked early.
 */
export function useRevokeOnUnmount(urls: readonly string[]) {
  const latest = useRef(urls);
  useEffect(() => {
    latest.current = urls;
  }, [urls]);
  useEffect(() => {
    const ref = latest;
    return () => { ref.current.forEach(revokePreview); };
  }, []);
}
