import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import type { ChatMessage, Conversation } from '../lib/supabaseClient';
import { isMobile, sortConversations, MAX_OPEN_POPUPS } from '../lib/chat';
import { ChatContext } from './ChatContext';
import type { ChatContextValue, MeProfile, MessageEvent } from './ChatContext';

type Props = {
  userId: string | null;
  children: React.ReactNode;
};

type MessageHandler = (e: MessageEvent) => void;

/*
 * Global chat state: the conversation list, one realtime channel for all
 * chat tables (RLS scopes events to conversations the user belongs to),
 * floating popup state, and the actions shared by popups and /messages.
 * App keys this provider by userId, so a login/logout remounts it fresh.
 */
export default function ChatProvider({ userId, children }: Props) {
  const navigate = useNavigate();
  const location = useLocation();

  const [me, setMe] = useState<MeProfile | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(!!userId);
  const [openChats, setOpenChats] = useState<string[]>([]);
  const [minimized, setMinimized] = useState<string[]>([]);

  /* Refs so realtime handlers never read stale state */
  const conversationsRef = useRef<Conversation[]>([]);
  const activeRef = useRef<Set<string>>(new Set());
  const listenersRef = useRef<Map<string, Set<MessageHandler>>>(new Map());
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMessagesPageRef = useRef(false);
  const openChatsRef = useRef<string[]>([]);
  const subscribedOnceRef = useRef(false);

  useEffect(() => {
    onMessagesPageRef.current = location.pathname.startsWith('/messages');
  }, [location.pathname]);

  useEffect(() => {
    openChatsRef.current = openChats;
  }, [openChats]);

  const commit = useCallback((next: Conversation[]) => {
    conversationsRef.current = next;
    setConversations(next);
  }, []);

  /* ── Fetch list ── */
  const refreshConversations = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase.rpc('get_conversations');
    if (!error && data) {
      const list = (data as Conversation[]).map((c) => ({
        ...c,
        members: c.members || [],
        unread_count: Number(c.unread_count) || 0,
      }));
      commit(sortConversations(list));
    }
    setLoadingConversations(false);
  }, [userId, commit]);

  /* Coalesce bursts of realtime events (e.g. group creation) into one refetch */
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => { refreshConversations(); }, 250);
  }, [refreshConversations]);

  /* ── Own profile (typing indicator needs the username) ── */
  useEffect(() => {
    if (!userId) return;
    supabase.from('profiles').select('id, username, display_name, avatar_url').eq('id', userId).single()
      .then(({ data }) => { if (data) setMe(data as MeProfile); });
  }, [userId]);

  /* ── Popups ── */
  const openChat = useCallback((conversationId: string) => {
    if (isMobile() || onMessagesPageRef.current) {
      navigate(`/messages/${conversationId}`);
      return;
    }
    setMinimized((prev) => prev.filter((id) => id !== conversationId));
    setOpenChats((prev) => {
      if (prev.includes(conversationId)) return prev;
      const next = [...prev, conversationId];
      return next.length > MAX_OPEN_POPUPS ? next.slice(next.length - MAX_OPEN_POPUPS) : next;
    });
  }, [navigate]);

  const closeChat = useCallback((conversationId: string) => {
    setOpenChats((prev) => prev.filter((id) => id !== conversationId));
    setMinimized((prev) => prev.filter((id) => id !== conversationId));
  }, []);

  const toggleMinimize = useCallback((conversationId: string) => {
    setMinimized((prev) =>
      prev.includes(conversationId) ? prev.filter((id) => id !== conversationId) : [...prev, conversationId]
    );
  }, []);

  /* ── Actions ── */
  const markRead = useCallback(async (conversationId: string) => {
    if (!userId) return;
    const now = new Date().toISOString();
    commit(conversationsRef.current.map((c) => c.id !== conversationId ? c : {
      ...c,
      unread_count: 0,
      members: c.members.map((m) => m.user_id === userId ? { ...m, last_read_at: now } : m),
    }));
    /* Also clears the conversation's bell entry (see mark_conversation_read in schema.sql).
       The list above was zeroed optimistically; on failure pull the truth back. */
    const { error } = await supabase.rpc('mark_conversation_read', { conv_id: conversationId });
    if (error) refreshConversations();
  }, [userId, commit, refreshConversations]);

  const startDm = useCallback(async (otherUserId: string) => {
    if (!userId) return null;
    const { data, error } = await supabase.rpc('create_conversation', { member_ids: [otherUserId] });
    if (error || !data) return null;
    const id = data as string;
    await refreshConversations();
    openChat(id);
    return id;
  }, [userId, refreshConversations, openChat]);

  const createGroup = useCallback(async (memberIds: string[], name: string | null) => {
    if (!userId) return null;
    const { data, error } = await supabase.rpc('create_conversation', {
      member_ids: memberIds,
      group_name: name && name.trim() ? name.trim() : null,
    });
    if (error || !data) return null;
    await refreshConversations();
    return data as string;
  }, [userId, refreshConversations]);

  const leaveConversation = useCallback(async (conversationId: string) => {
    if (!userId) return false;
    const { error } = await supabase
      .from('conversation_members')
      .delete()
      .eq('conversation_id', conversationId)
      .eq('user_id', userId);
    if (error) return false;

    /* The bell entry would otherwise link to a conversation we can no longer read */
    await supabase
      .from('notifications')
      .delete()
      .eq('user_id', userId)
      .eq('conversation_id', conversationId)
      .eq('type', 'message');

    commit(conversationsRef.current.filter((c) => c.id !== conversationId));
    closeChat(conversationId);
    return true;
  }, [userId, commit, closeChat]);

  /* ── Thread wiring ── */
  const setActive = useCallback((conversationId: string, active: boolean) => {
    if (active) activeRef.current.add(conversationId);
    else activeRef.current.delete(conversationId);
  }, []);

  const onMessage = useCallback((conversationId: string, handler: MessageHandler) => {
    const set = listenersRef.current.get(conversationId) || new Set<MessageHandler>();
    set.add(handler);
    listenersRef.current.set(conversationId, set);
    return () => {
      const s = listenersRef.current.get(conversationId);
      if (!s) return;
      s.delete(handler);
      if (s.size === 0) listenersRef.current.delete(conversationId);
    };
  }, []);

  const emit = (conversationId: string | null, event: MessageEvent) => {
    if (conversationId) {
      listenersRef.current.get(conversationId)?.forEach((h) => h(event));
    } else {
      /* DELETE payloads only carry the id — let every open thread check */
      listenersRef.current.forEach((set) => set.forEach((h) => h(event)));
    }
  };

  /* ── Initial load + realtime ── */
  useEffect(() => {
    if (!userId) return;

    subscribedOnceRef.current = false;
    /* async fetch — state is only set after the await resolves */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshConversations();

    const handleMessageInsert = (msg: ChatMessage) => {
      emit(msg.conversation_id, { type: 'INSERT', message: msg });

      const list = conversationsRef.current;
      const conv = list.find((c) => c.id === msg.conversation_id);
      if (!conv) { scheduleRefresh(); return; }

      const isMine = msg.sender_id === userId;
      const isActive = activeRef.current.has(conv.id);
      const updated: Conversation = {
        ...conv,
        last_message_at: msg.created_at,
        last_message: {
          id: msg.id,
          sender_id: msg.sender_id,
          content: msg.content,
          image_url: msg.image_url,
          created_at: msg.created_at,
        },
        unread_count: isMine || isActive ? conv.unread_count : conv.unread_count + 1,
        /* the sender has read their own message (mirrors the DB trigger) */
        members: conv.members.map((m) => m.user_id === msg.sender_id ? { ...m, last_read_at: msg.created_at } : m),
      };
      commit(sortConversations(list.map((c) => (c.id === conv.id ? updated : c))));

      /* Messenger behaviour: an incoming message pops the chat open on desktop */
      if (!isMine && !isMobile() && !onMessagesPageRef.current && !openChatsRef.current.includes(conv.id)) {
        openChat(conv.id);
      }
    };

    const handleMessageDelete = (old: Partial<ChatMessage>) => {
      if (!old.id) return;
      emit(null, { type: 'DELETE', id: old.id });
      if (conversationsRef.current.some((c) => c.last_message?.id === old.id)) scheduleRefresh();
    };

    const handleMemberChange = (
      eventType: string,
      row: { conversation_id?: string; user_id?: string; last_read_at?: string },
    ) => {
      if (!row.conversation_id || !row.user_id) return;
      const list = conversationsRef.current;
      const conv = list.find((c) => c.id === row.conversation_id);

      if (eventType === 'UPDATE') {
        if (!conv || !row.last_read_at) return;
        const isMe = row.user_id === userId;
        commit(list.map((c) => c.id !== conv.id ? c : {
          ...c,
          unread_count: isMe ? 0 : c.unread_count,
          members: c.members.map((m) => m.user_id === row.user_id ? { ...m, last_read_at: row.last_read_at! } : m),
        }));
        return;
      }

      if (eventType === 'DELETE') {
        if (row.user_id === userId) {
          commit(list.filter((c) => c.id !== row.conversation_id));
          closeChat(row.conversation_id);
        } else if (conv) {
          scheduleRefresh();
        }
        return;
      }

      /* INSERT: added to a conversation, or someone joined one of mine */
      scheduleRefresh();
    };

    const handleConversationUpdate = (row: Partial<Conversation>) => {
      if (!row.id) return;
      commit(conversationsRef.current.map((c) => c.id !== row.id ? c : {
        ...c,
        name: row.name ?? c.name,
        is_group: row.is_group ?? c.is_group,
      }));
    };

    const channel = supabase
      .channel(`chat:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => handleMessageInsert(payload.new as ChatMessage))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' },
        (payload) => handleMessageDelete(payload.old as Partial<ChatMessage>))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_members' },
        (payload) => handleMemberChange(
          payload.eventType,
          (payload.eventType === 'DELETE' ? payload.old : payload.new) as { conversation_id?: string; user_id?: string; last_read_at?: string },
        ))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' },
        (payload) => handleConversationUpdate(payload.new as Partial<Conversation>))
      .subscribe((status) => {
        /* postgres_changes is at-most-once: after a reconnect, refetch what we missed */
        if (status === 'SUBSCRIBED' && subscribedOnceRef.current) refreshConversations();
        if (status === 'SUBSCRIBED') subscribedOnceRef.current = true;
      });

    /* Refetch when the tab comes back — realtime may have dropped while hidden */
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshConversations();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const unreadConversations = useMemo(
    () => conversations.filter((c) => c.unread_count > 0).length,
    [conversations],
  );

  const getConversation = useCallback(
    (id: string) => conversations.find((c) => c.id === id),
    [conversations],
  );

  const value: ChatContextValue = {
    userId,
    me,
    conversations,
    loadingConversations,
    unreadConversations,
    refreshConversations,
    getConversation,
    openChats,
    minimized,
    openChat,
    closeChat,
    toggleMinimize,
    startDm,
    createGroup,
    markRead,
    leaveConversation,
    setActive,
    onMessage,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
