import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

/*
 * How many notifications are unread, kept live. A head-only count plus a
 * realtime listener, so it stays cheap. `enabled` lets a component that only
 * shows the count on some screens skip the query and the channel elsewhere.
 */
export function useUnreadNotifications(userId: string, enabled = true): number {
  const [count, setCount] = useState(0);
  /* Bumped by realtime events; the effect below owns the fetch */
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      const { count: n } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false);
      if (!cancelled && n !== null) setCount(n);
    })();
    return () => { cancelled = true; };
  }, [userId, enabled, version]);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel(`notif-count:${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      }, () => {
        /* Several rows can change at once; coalesce the refetch */
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => setVersion((v) => v + 1), 250);
      })
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [userId, enabled]);

  return enabled ? count : 0;
}
