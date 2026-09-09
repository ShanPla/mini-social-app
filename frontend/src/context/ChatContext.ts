import { createContext, useContext } from 'react';
import type { ChatMessage, Conversation } from '../lib/supabaseClient';

export type MeProfile = { id: string; username: string; display_name?: string | null; avatar_url: string | null };

/* Realtime message events fanned out to open threads */
export type MessageEvent =
  | { type: 'INSERT'; message: ChatMessage }
  | { type: 'DELETE'; id: string };

export type ChatContextValue = {
  userId: string | null;
  me: MeProfile | null;

  /* Conversation list (source of truth for popups and the /messages page) */
  conversations: Conversation[];
  loadingConversations: boolean;
  unreadConversations: number;
  refreshConversations: () => Promise<void>;
  getConversation: (id: string) => Conversation | undefined;

  /* Floating popups */
  openChats: string[];
  minimized: string[];
  openChat: (conversationId: string) => void;
  closeChat: (conversationId: string) => void;
  toggleMinimize: (conversationId: string) => void;

  /* Actions */
  startDm: (otherUserId: string) => Promise<string | null>;
  createGroup: (memberIds: string[], name: string | null) => Promise<string | null>;
  markRead: (conversationId: string) => Promise<void>;
  leaveConversation: (conversationId: string) => Promise<boolean>;

  /* Thread wiring */
  setActive: (conversationId: string, active: boolean) => void;
  onMessage: (conversationId: string, handler: (e: MessageEvent) => void) => () => void;
};

const noop = () => {};
const noopAsync = async () => {};

export const ChatContext = createContext<ChatContextValue>({
  userId: null,
  me: null,
  conversations: [],
  loadingConversations: false,
  unreadConversations: 0,
  refreshConversations: noopAsync,
  getConversation: () => undefined,
  openChats: [],
  minimized: [],
  openChat: noop,
  closeChat: noop,
  toggleMinimize: noop,
  startDm: async () => null,
  createGroup: async () => null,
  markRead: noopAsync,
  leaveConversation: async () => false,
  setActive: noop,
  onMessage: () => noop,
});

export function useChat(): ChatContextValue {
  return useContext(ChatContext);
}
