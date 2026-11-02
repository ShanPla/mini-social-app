import { useState, useEffect, useRef, useCallback, Fragment } from 'react';
import { ChevronsDown } from 'lucide-react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabaseClient';
import type { ChatMember, ChatMessage } from '../../lib/supabaseClient';
import { useChat } from '../../context/ChatContext';
import { useToast } from '../../context/ToastContext';
import { describeError } from '../../lib/errors';
import { NO_REACTIONS, upsertReaction, removeReaction } from '../../lib/reactions';
import type { Reaction } from '../../lib/reactions';
import { displayName } from '../../lib/names';
import { parseDbDate } from '../../lib/timeAgo';
import {
  conversationTitle,
  dayLabel,
  isDifferentDay,
  seenBy,
  MESSAGE_PAGE_SIZE,
} from '../../lib/chat';
import MessageBubble from '../MessageBubble/MessageBubble';
import ChatComposer from '../ChatComposer/ChatComposer';
import ConfirmModal from '../ConfirmModal/ConfirmModal';
import Lightbox from '../Lightbox/Lightbox';
import './ChatThread.css';

type Props = {
  conversationId: string;
  /* Popup mode: tighter spacing */
  compact?: boolean;
  /* Focus the composer when the thread mounts */
  autoFocus?: boolean;
};

type TypingMap = Record<string, { username: string; until: number }>;

const DELETED_SENDER: ChatMember = { user_id: '', username: 'Deleted user', avatar_url: null, last_read_at: '' };
type SenderMap = Record<string, ChatMember>;

/* Merge two lists of messages by id, oldest first (created_at, then id as the tiebreak) */
function mergeMessages(a: ChatMessage[], b: ChatMessage[]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const m of a) byId.set(m.id, m);
  for (const m of b) byId.set(m.id, m);
  return [...byId.values()].sort((x, y) =>
    parseDbDate(x.created_at).getTime() - parseDbDate(y.created_at).getTime() || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}

/* Every message read: the quoted original comes along as [reply] */
const MESSAGE_SELECT = '*, reply:reply_to_id(id, sender_id, content, image_url)';

/* A live message has no [reply] embed: borrow the original from the list when it is loaded */
function withLocalReply(m: ChatMessage, loaded: ChatMessage[]): ChatMessage {
  if (!m.reply_to_id || m.reply !== undefined) return m;
  const orig = loaded.find((x) => x.id === m.reply_to_id);
  return orig ? { ...m, reply: { id: orig.id, sender_id: orig.sender_id, content: orig.content, image_url: orig.image_url } } : m;
}

const GROUP_WINDOW_MS = 5 * 60 * 1000;
const TYPING_TTL_MS = 3000;
const TYPING_THROTTLE_MS = 1500;
const SIGNED_URL_TTL_S = 60 * 60;
/* Re-sign when this close to expiry, checked on every message change and on a timer */
const SIGNED_URL_RENEW_MS = 5 * 60 * 1000;
const SIGNED_URL_CHECK_MS = 60 * 1000;

/*
 * Message list + composer for one conversation. Used inside both the
 * floating popups and the /messages page. Realtime message events arrive
 * through ChatProvider (one channel for everything); typing uses a
 * per-conversation broadcast channel.
 * Callers key this component by conversationId so switching threads remounts it.
 */
export default function ChatThread({ conversationId, compact = false, autoFocus = false }: Props) {
  const { userId, me, getConversation, onMessage, setActive, markRead } = useChat();
  const conv = getConversation(conversationId);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  /* The first page, or an older page, failed to load; Retry runs it again */
  const [loadFailed, setLoadFailed] = useState(false);
  const [olderFailed, setOlderFailed] = useState(false);
  const [loadVersion, setLoadVersion] = useState(0);
  /* Unsend that failed, kept so Retry can run it again */
  const [unsendFailed, setUnsendFailed] = useState<ChatMessage | null>(null);
  /* When I last read this thread, as of opening it (markRead moves the real value at once) */
  const [readAtOpen] = useState(() => conv?.members.find((m) => m.user_id === userId)?.last_read_at || null);
  /* First message that was unread on open: the [New messages] divider goes above it */
  const [unreadFromId, setUnreadFromId] = useState<string | null>(null);
  /* Scrolled up more than a screen, and messages from others that arrived meanwhile */
  const [showJump, setShowJump] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const [typing, setTyping] = useState<TypingMap>({});
  const [deleteTarget, setDeleteTarget] = useState<ChatMessage | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  /* storage path -> signed URL (bucket is private) */
  const [signedUrls, setSignedUrls] = useState<Record<string, { url: string; expiresAt: number }>>({});
  /* Ticks once a minute so an idle thread still renews its image links */
  const [signTick, setSignTick] = useState(0);
  /* senders who are no longer members (left the group / deleted) */
  const [extraSenders, setExtraSenders] = useState<SenderMap>({});
  /* message id -> reactions (an unchanged message keeps the same array, so its bubble stays memoised) */
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({});
  const [reactionVersion, setReactionVersion] = useState(0);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  /* People I blocked: their group messages are collapsed */
  const [blockedIds, setBlockedIds] = useState<Set<string>>(() => new Set());

  const listRef = useRef<HTMLDivElement>(null);
  /* Ids unsent while a fetch was in flight, so the fetched copy does not bring them back */
  const deletedIdsRef = useRef(new Set<string>());
  const dividerRef = useRef<HTMLDivElement>(null);
  const dividerShownRef = useRef(false);
  const typingChannelRef = useRef<RealtimeChannel | null>(null);
  const lastTypingSentRef = useRef(0);
  const stickToBottomRef = useRef(true);
  const hasMoreRef = useRef(false);
  const loadingOlderRef = useRef(false);
  const mountedRef = useRef(true);
  const toast = useToast();
  const toastRef = useRef(toast);
  const reactionsRef = useRef<Record<string, Reaction[]>>({});
  const messagesRef = useRef<ChatMessage[]>([]);
  const membersRef = useRef<ChatMember[]>([]);
  const extraSendersRef = useRef<SenderMap>({});
  /* Messages whose reactions are loaded (or that are new and have none) */
  const reactionsLoadedRef = useRef(new Set<string>());

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  /* A live reply whose original is not on screen: fetch the original once */
  const fetchReplyFor = useCallback(async (messageId: string, originalId: string) => {
    const { data, error } = await supabase
      .from('messages')
      .select('id, sender_id, content, image_url')
      .eq('id', originalId)
      .maybeSingle();
    if (!mountedRef.current || error) return;
    const reply = (data as ChatMessage['reply']) ?? null;
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reply } : m)));
  }, []);

  /* Latest values for the stable callbacks below */
  useEffect(() => {
    toastRef.current = toast;
    reactionsRef.current = reactions;
    messagesRef.current = messages;
    membersRef.current = conv?.members || [];
    extraSendersRef.current = extraSenders;
  });

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  /* ── Initial load ── */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data, error: fetchError } = await supabase
        .from('messages')
        .select(MESSAGE_SELECT)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(MESSAGE_PAGE_SIZE);
      if (cancelled) return;
      const rows = ((data as ChatMessage[]) || []).reverse();
      /* Merge, never replace: a message that arrived live while this was in
         flight is already in the list */
      setMessages((prev) => mergeMessages(rows.filter((m) => !deletedIdsRef.current.has(m.id)), prev));
      if (readAtOpen) {
        const readAt = parseDbDate(readAtOpen).getTime();
        const firstUnread = rows.find((m) => m.sender_id !== userId && parseDbDate(m.created_at).getTime() > readAt);
        if (firstUnread) setUnreadFromId((cur) => cur ?? firstUnread.id);
      }
      setLoadFailed(!!fetchError);
      hasMoreRef.current = rows.length === MESSAGE_PAGE_SIZE;
      setHasMore(hasMoreRef.current);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [conversationId, loadVersion, readAtOpen, userId]);

  /* ── Mark active + read while mounted ── */
  useEffect(() => {
    setActive(conversationId, true);
    markRead(conversationId);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') markRead(conversationId);
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      setActive(conversationId, false);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [conversationId, setActive, markRead]);

  /* ── Realtime message events from the provider ── */
  useEffect(() => {
    return onMessage(conversationId, (e) => {
      if (e.type === 'INSERT') {
        const incoming = withLocalReply(e.message, messagesRef.current);
        /* A new message has no reactions yet: nothing to fetch for it */
        reactionsLoadedRef.current.add(incoming.id);
        setMessages((prev) => (prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]));
        if (incoming.reply_to_id && incoming.reply === undefined) void fetchReplyFor(incoming.id, incoming.reply_to_id);
        const senderId = e.message.sender_id;
        setTyping((prev) => {
          if (!senderId || !prev[senderId]) return prev;
          const next = { ...prev };
          delete next[senderId];
          return next;
        });
        if (senderId !== userId && document.visibilityState === 'visible') {
          markRead(conversationId);
        }
        /* Arrived while reading older messages: count it for the Jump button */
        if (senderId !== userId && !stickToBottomRef.current) setNewCount((c) => c + 1);
      } else {
        deletedIdsRef.current.add(e.id);
        /* Replies to it keep their place and say the original is gone */
        setMessages((prev) => prev
          .filter((m) => m.id !== e.id)
          .map((m) => (m.reply_to_id === e.id && m.reply ? { ...m, reply: null } : m)));
      }
    });
  }, [conversationId, onMessage, userId, markRead, fetchReplyFor]);

  /* ── Reactions: one query for the messages not loaded yet, then realtime ── */
  useEffect(() => {
    const ids = messages.map((m) => m.id).filter((id) => !reactionsLoadedRef.current.has(id));
    if (ids.length === 0) return;
    ids.forEach((id) => reactionsLoadedRef.current.add(id));
    (async () => {
      const { data, error } = await supabase
        .from('message_reactions')
        .select('message_id, user_id, emoji')
        .in('message_id', ids);
      if (!mountedRef.current) return;
      if (error) {
        /* Not marked loaded: the next page or a reconnect tries again */
        ids.forEach((id) => reactionsLoadedRef.current.delete(id));
        return;
      }
      const byMessage = new Map<string, Reaction[]>();
      for (const r of (data || []) as Reaction[]) {
        const list = byMessage.get(r.message_id);
        if (list) list.push(r); else byMessage.set(r.message_id, [r]);
      }
      setReactions((prev) => {
        let next = prev;
        for (const id of ids) {
          const rows = byMessage.get(id);
          if (rows) next = { ...next, [id]: rows };
          else if (next[id] && next[id].length > 0) next = { ...next, [id]: NO_REACTIONS };
        }
        return next;
      });
    })();
  }, [messages, reactionVersion]);

  /* ── People I blocked (RLS returns only my own rows); only group chats collapse their messages ── */
  const isGroup = !!conv?.is_group;
  useEffect(() => {
    if (!isGroup) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('blocks').select('blocked_id');
      if (cancelled || !data) return;
      setBlockedIds(new Set((data as { blocked_id: string }[]).map((b) => b.blocked_id)));
    })();
    return () => { cancelled = true; };
  }, [isGroup]);

  /* ── Signed URLs for image messages (private bucket) ──
     A link lives an hour. Popups outlive that, so anything within five
     minutes of expiring counts as missing and is signed again. */
  useEffect(() => {
    const interval = setInterval(() => setSignTick((t) => t + 1), SIGNED_URL_CHECK_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const now = Date.now();
    const missing = messages
      .map((m) => m.image_url)
      .filter((p): p is string => !!p && (!signedUrls[p] || signedUrls[p].expiresAt - now < SIGNED_URL_RENEW_MS));
    if (missing.length === 0) return;
    let cancelled = false;
    supabase.storage.from('chat-images').createSignedUrls(missing, SIGNED_URL_TTL_S).then(({ data }) => {
      if (cancelled || !data) return;
      const expiresAt = Date.now() + SIGNED_URL_TTL_S * 1000;
      setSignedUrls((prev) => {
        const next = { ...prev };
        for (const item of data) {
          if (item.path && item.signedUrl) next[item.path] = { url: item.signedUrl, expiresAt };
        }
        return next;
      });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, signTick]);

  /* ── Resolve senders who are not (or no longer) in the member list ── */
  useEffect(() => {
    const known = new Set([
      ...(conv?.members || []).map((m) => m.user_id),
      ...Object.keys(extraSenders),
    ]);
    const missing = Array.from(new Set(messages.map((m) => m.sender_id).filter((id): id is string => !!id))).filter((id) => !known.has(id));
    if (missing.length === 0) return;
    let cancelled = false;
    supabase.from('profiles').select('id, username, display_name, avatar_url').in('id', missing).then(({ data }) => {
      if (cancelled) return;
      setExtraSenders((prev) => {
        const next = { ...prev };
        for (const p of (data || []) as { id: string; username: string; display_name: string | null; avatar_url: string | null }[]) {
          next[p.id] = { user_id: p.id, username: p.username, avatar_url: p.avatar_url, last_read_at: '' };
        }
        /* deleted accounts: no profile row — show a placeholder */
        for (const id of missing) {
          if (!next[id]) next[id] = { user_id: id, username: 'Deleted user', avatar_url: null, last_read_at: '' };
        }
        return next;
      });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, conv?.members]);

  /* ── Typing indicator and reaction notices (private broadcast channel
     only members can hear). A [reaction] notice names a message whose
     reactions changed; they are read again through RLS (schema 3l). ── */
  useEffect(() => {
    if (!userId) return;
    let subscribedOnce = false;
    const channel = supabase.channel(`typing:${conversationId}`, {
      config: { private: true, broadcast: { self: false } },
    });
    channel
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const p = payload as { user_id: string; username: string; typing: boolean };
        if (!p || p.user_id === userId) return;
        setTyping((prev) => {
          const next = { ...prev };
          if (p.typing) next[p.user_id] = { username: p.username, until: Date.now() + TYPING_TTL_MS };
          else delete next[p.user_id];
          return next;
        });
      })
      .on('broadcast', { event: 'reaction' }, ({ payload }) => {
        const id = (payload as { message_id?: string } | null)?.message_id;
        if (!id || !reactionsLoadedRef.current.has(id)) return;
        reactionsLoadedRef.current.delete(id);
        setReactionVersion((v) => v + 1);
      })
      .subscribe((status) => {
        /* Broadcasts are at-most-once: after a reconnect, read all reactions again */
        if (status === 'SUBSCRIBED' && subscribedOnce) {
          reactionsLoadedRef.current.clear();
          setReactionVersion((v) => v + 1);
        }
        if (status === 'SUBSCRIBED') subscribedOnce = true;
      });
    typingChannelRef.current = channel;

    return () => {
      typingChannelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [conversationId, userId]);

  /* Expire stale typing entries */
  useEffect(() => {
    if (Object.keys(typing).length === 0) return;
    const t = setInterval(() => {
      const now = Date.now();
      setTyping((prev) => {
        const next: TypingMap = {};
        let changed = false;
        for (const [id, v] of Object.entries(prev)) {
          if (v.until > now) next[id] = v; else changed = true;
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [typing]);

  const sendTyping = useCallback((isTyping: boolean) => {
    const channel = typingChannelRef.current;
    if (!channel || !userId) return;
    const now = Date.now();
    if (isTyping && now - lastTypingSentRef.current < TYPING_THROTTLE_MS) return;
    lastTypingSentRef.current = isTyping ? now : 0;
    channel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { user_id: userId, username: me ? displayName(me) : 'Someone', typing: isTyping },
    });
  }, [userId, me]);

  /* ── Scrolling ── */
  useEffect(() => {
    if (stickToBottomRef.current) scrollToBottom(loading ? 'auto' : 'smooth');
  }, [messages, typing, loading, scrollToBottom]);

  /* Opening with unread messages: land on the divider, not on the bottom */
  useEffect(() => {
    const list = listRef.current;
    const divider = dividerRef.current;
    if (loading || !list || !divider || dividerShownRef.current) return;
    dividerShownRef.current = true;
    list.scrollTop += divider.getBoundingClientRect().top - list.getBoundingClientRect().top - 8;
  }, [loading, unreadFromId]);

  const loadOlder = useCallback(async () => {
    if (loadingOlderRef.current || !hasMoreRef.current) return;
    const el = listRef.current;
    const first = messages[0];
    if (!el || !first) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    setOlderFailed(false);
    const prevHeight = el.scrollHeight;
    /* <= not <: messages sharing the oldest timestamp would otherwise be
       skipped. The ones already on screen are dropped by id below. */
    const { data, error: olderError } = await supabase
      .from('messages')
      .select(MESSAGE_SELECT)
      .eq('conversation_id', conversationId)
      .lte('created_at', first.created_at)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(MESSAGE_PAGE_SIZE);
    if (!mountedRef.current) return;
    if (olderError) {
      /* Keep hasMore: the history is still there, the user can retry */
      setOlderFailed(true);
      loadingOlderRef.current = false;
      setLoadingOlder(false);
      return;
    }
    const rows = ((data as ChatMessage[]) || []).reverse();
    stickToBottomRef.current = false;
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const fresh = rows.filter((m) => !seen.has(m.id) && !deletedIdsRef.current.has(m.id));
      return fresh.length === 0 ? prev : [...fresh, ...prev];
    });
    hasMoreRef.current = rows.length === MESSAGE_PAGE_SIZE;
    setHasMore(hasMoreRef.current);
    requestAnimationFrame(() => {
      if (!mountedRef.current) return;
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight - prevHeight;
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    });
  }, [conversationId, messages]);

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 80;
    setShowJump(distanceFromBottom > el.clientHeight);
    if (stickToBottomRef.current) setNewCount(0);
    if (el.scrollTop < 40 && hasMoreRef.current && !loadingOlderRef.current && !olderFailed) loadOlder();
  };

  /* ── Composer hand-offs (stable, so typing never touches the message list) ── */
  const handleSent = useCallback((sent: ChatMessage) => {
    reactionsLoadedRef.current.add(sent.id);
    setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
    stickToBottomRef.current = true;
    setNewCount(0);
  }, []);

  const clearReply = useCallback(() => setReplyTo(null), []);

  /* ── Reactions and replies (stable functions, so the bubbles stay memoised) ── */
  const nameOf = useCallback((id: string | null): string => {
    if (!id) return 'Deleted user';
    if (id === userId) return 'You';
    const member = membersRef.current.find((x) => x.user_id === id) || extraSendersRef.current[id];
    return member ? displayName(member) : 'Someone';
  }, [userId]);

  const handleReact = useCallback(async (message: ChatMessage, emoji: string) => {
    if (!userId) return;
    const id = message.id;
    const before = reactionsRef.current[id] ?? NO_REACTIONS;
    const mine = before.find((r) => r.user_id === userId);
    const rollback = (error: Parameters<typeof describeError>[0], fallback: string) => {
      setReactions((prev) => ({ ...prev, [id]: before }));
      toastRef.current.error(describeError(error, fallback));
    };
    if (mine?.emoji === emoji) {
      /* Tapping my own emoji again takes it back */
      setReactions((prev) => removeReaction(prev, id, userId));
      const { error } = await supabase.from('message_reactions').delete().eq('message_id', id).eq('user_id', userId);
      if (error) rollback(error, 'Could not remove your reaction.');
    } else if (mine) {
      setReactions((prev) => upsertReaction(prev, { message_id: id, user_id: userId, emoji }));
      const { error } = await supabase.from('message_reactions').update({ emoji }).eq('message_id', id).eq('user_id', userId);
      if (error) rollback(error, 'Could not change your reaction.');
    } else {
      setReactions((prev) => upsertReaction(prev, { message_id: id, user_id: userId, emoji }));
      const { error } = await supabase.from('message_reactions').insert({ message_id: id, emoji });
      if (error) rollback(error, 'Could not save your reaction.');
    }
  }, [userId]);

  const handleReply = useCallback((message: ChatMessage) => setReplyTo(message), []);

  /* Scroll to the quoted original and flash it; if it is not loaded, say where it is */
  const handleJumpTo = useCallback((messageId: string) => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-msg-id="${messageId}"]`);
    if (!el) {
      toastRef.current.info('That message is further up. Scroll up to load older messages.');
      return;
    }
    stickToBottomRef.current = false;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.remove('msg-row--flash');
    el.getBoundingClientRect();
    el.classList.add('msg-row--flash');
    setTimeout(() => el.classList.remove('msg-row--flash'), 1800);
  }, []);

  const jumpToLatest = () => {
    stickToBottomRef.current = true;
    setNewCount(0);
    setShowJump(false);
    scrollToBottom('smooth');
  };

  const unsend = async (target: ChatMessage) => {
    const { id, image_url } = target;
    setUnsendFailed(null);
    /* RLS refuses a delete with no error and no rows, so count the rows back */
    const { data: deleted, error: delError } = await supabase.from('messages').delete().eq('id', id).select('id');
    if (delError || !deleted || deleted.length === 0) {
      setUnsendFailed(target);
      return;
    }
    deletedIdsRef.current.add(id);
    setMessages((prev) => prev.filter((m) => m.id !== id));
    if (image_url) supabase.storage.from('chat-images').remove([image_url]);
  };

  const handleDeleteConfirmed = () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    void unsend(target);
  };

  /* null sender: the account was deleted but the message was kept */
  const senderFor = (senderId: string | null): ChatMember | undefined =>
    senderId ? (conv?.members.find((x) => x.user_id === senderId) || extraSenders[senderId]) : DELETED_SENDER;

  /* ── Derived render data ── */
  const lastOwnIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].sender_id === userId) return i;
    }
    return -1;
  })();

  const seenLabelFor = (msg: ChatMessage): string | null => {
    if (!conv || !userId) return null;
    const readers = seenBy(conv, userId, msg.created_at);
    if (readers.length === 0) return null;
    if (!conv.is_group) return 'Seen';
    const names = readers.map((r) => displayName(r));
    if (names.length === conv.members.length - 1) return 'Seen by everyone';
    return `Seen by ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` +${names.length - 3}` : ''}`;
  };

  const typingNames = Object.values(typing).map((t) => t.username);
  const typingLabel = typingNames.length === 0
    ? null
    : typingNames.length === 1
      ? `${typingNames[0]} is typing`
      : typingNames.length === 2
        ? `${typingNames[0]} and ${typingNames[1]} are typing`
        : 'Several people are typing';

  const title = conv ? conversationTitle(conv, userId) : '';

  return (
    <div className={`chat-thread ${compact ? 'chat-thread--compact' : ''}`}>
      {/* Messages (the wrapper anchors the Jump button over the list) */}
      <div className="chat-list-wrap">
      <div className="chat-list" ref={listRef} onScroll={handleScroll}>
        {loading ? (
          <div className="chat-loading">
            <div className="chat-skeleton chat-skeleton--left" />
            <div className="chat-skeleton chat-skeleton--right" />
            <div className="chat-skeleton chat-skeleton--left chat-skeleton--short" />
          </div>
        ) : (
          <>
            {loadingOlder && <div className="chat-older">Loading older messages…</div>}
            {olderFailed && !loadingOlder && (
              <div className="chat-older" role="alert">
                Could not load older messages.{' '}
                <button type="button" className="chat-retry" onClick={() => loadOlder()}>Retry</button>
              </div>
            )}
            {!hasMore && messages.length > 0 && conv && (
              <div className="chat-beginning">
                {conv.is_group ? 'The beginning of the group' : `This is the beginning of your conversation with ${title}`}
              </div>
            )}
            {loadFailed && messages.length === 0 && (
              <div className="chat-empty" role="alert">
                <p>Could not load messages.</p>
                <button
                  type="button"
                  className="chat-retry"
                  onClick={() => { setLoading(true); setLoadFailed(false); setLoadVersion((v) => v + 1); }}
                >Retry</button>
              </div>
            )}
            {!loadFailed && messages.length === 0 && (
              <div className="chat-empty">
                <p>{conv?.is_group ? 'No messages yet. Say something.' : `Say hello to ${title}.`}</p>
              </div>
            )}

            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const next = messages[i + 1];
              const isOwn = m.sender_id === userId;
              const showDay = !prev || isDifferentDay(prev.created_at, m.created_at);
              const grouped = !!prev && !showDay && prev.sender_id === m.sender_id
                && parseDbDate(m.created_at).getTime() - parseDbDate(prev.created_at).getTime() < GROUP_WINDOW_MS;
              const nextGrouped = !!next && next.sender_id === m.sender_id
                && !isDifferentDay(m.created_at, next.created_at)
                && parseDbDate(next.created_at).getTime() - parseDbDate(m.created_at).getTime() < GROUP_WINDOW_MS;
              const sender = senderFor(m.sender_id);
              const seenLabel = i === lastOwnIndex ? seenLabelFor(m) : null;

              return (
                <Fragment key={m.id}>
                  {showDay && <div className="chat-day"><span>{dayLabel(m.created_at)}</span></div>}
                  {m.id === unreadFromId && (
                    <div className="chat-unread" role="separator" aria-label="New messages" ref={dividerRef}>
                      <span>New messages</span>
                    </div>
                  )}
                  <MessageBubble
                    message={m}
                    imageSrc={m.image_url ? signedUrls[m.image_url]?.url : undefined}
                    isOwn={isOwn}
                    sender={isOwn ? undefined : sender}
                    showSender={!!conv?.is_group && !isOwn && !grouped}
                    showAvatar={!isOwn && !nextGrouped}
                    grouped={grouped}
                    seenLabel={seenLabel}
                    blockedSender={isGroup && !isOwn && !!m.sender_id && blockedIds.has(m.sender_id)}
                    reactions={reactions[m.id] ?? NO_REACTIONS}
                    myId={userId}
                    nameOf={nameOf}
                    onDelete={isOwn ? setDeleteTarget : undefined}
                    onImageClick={setLightboxUrl}
                    onReact={handleReact}
                    onReply={handleReply}
                    onJumpTo={handleJumpTo}
                  />
                </Fragment>
              );
            })}

            {/* Typing indicator */}
            {typingLabel && (
              <div className="chat-typing">
                <span className="chat-typing-dots"><i /><i /><i /></span>
                <span>{typingLabel}…</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Jump to the newest message when scrolled up, with a count of what arrived meanwhile */}
      {(showJump || newCount > 0) && (
        <button type="button" className="chat-jump" onClick={jumpToLatest}>
          <ChevronsDown size={14} />
          <span>{newCount > 0 ? `${newCount} new ${newCount === 1 ? 'message' : 'messages'}` : 'Jump to latest'}</span>
        </button>
      )}
      </div>

      {/* An unsend that failed: say so, with a way to try again */}
      {unsendFailed && (
        <div className="chat-error chat-error--thread" role="alert">
          <span>Could not unsend that message.</span>
          <button type="button" className="chat-retry" onClick={() => void unsend(unsendFailed)}>Retry</button>
          <button type="button" className="chat-retry chat-retry--quiet" onClick={() => setUnsendFailed(null)}>Dismiss</button>
        </div>
      )}

      {/* Composer */}
      <ChatComposer
        conversationId={conversationId}
        userId={userId}
        ready={!loading}
        autoFocus={autoFocus}
        onSent={handleSent}
        sendTyping={sendTyping}
        replyTo={replyTo}
        replyToName={replyTo ? (replyTo.sender_id === userId ? 'yourself' : (senderFor(replyTo.sender_id) ? displayName(senderFor(replyTo.sender_id)!) : 'Someone')) : ''}
        onClearReply={clearReply}
      />

      {/* Unsend confirmation */}
      {deleteTarget && (
        <ConfirmModal
          title="Unsend message?"
          message="This message will be removed for everyone in the conversation."
          confirmLabel="Unsend"
          danger
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Image lightbox */}
      {lightboxUrl && <Lightbox images={[lightboxUrl]} onClose={() => setLightboxUrl(null)} />}
    </div>
  );
}
