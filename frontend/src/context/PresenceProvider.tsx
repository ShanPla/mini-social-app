import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { PresenceContext } from './PresenceContext';

type Props = {
  userId: string | null;
  children: React.ReactNode;
};

const EMPTY = new Set<string>();

/*
 * One Supabase Presence channel for the whole app. Every signed-in tab
 * tracks its user id; the synced state's keys are the online user ids.
 * App keys this provider by userId, so login/logout remounts it.
 */
export default function PresenceProvider({ userId, children }: Props) {
  const [onlineIds, setOnlineIds] = useState<Set<string>>(EMPTY);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase.channel('online-users', {
      config: { presence: { key: userId } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        setOnlineIds(new Set(Object.keys(channel.presenceState())));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channel.track({ user_id: userId, online_at: new Date().toISOString() });
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  const isOnline = useCallback((id: string) => onlineIds.has(id), [onlineIds]);
  const value = useMemo(() => ({ onlineIds, isOnline }), [onlineIds, isOnline]);

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}
