import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Simple cooldown hook to rate-limit rapid submissions.
 * Returns [isOnCooldown, triggerCooldown]
 */
export function useCooldown(durationMs: number = 3000) {
  const [isOnCooldown, setIsOnCooldown] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* A pending timer must not fire setState on an unmounted form */
  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  const triggerCooldown = useCallback(() => {
    setIsOnCooldown(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setIsOnCooldown(false), durationMs);
  }, [durationMs]);

  return [isOnCooldown, triggerCooldown] as const;
}