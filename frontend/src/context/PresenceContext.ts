import { createContext, useContext } from 'react';

export type PresenceContextValue = {
  /* ids of users currently connected (including yourself) */
  onlineIds: Set<string>;
  isOnline: (userId: string) => boolean;
};

export const PresenceContext = createContext<PresenceContextValue>({
  onlineIds: new Set(),
  isOnline: () => false,
});

export function usePresence(): PresenceContextValue {
  return useContext(PresenceContext);
}
