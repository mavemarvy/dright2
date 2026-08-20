import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabase';
import type {
  ChatConversation,
  ChatContextType,
  ChatContextData,
} from './types';
import type { ChatMessage } from './chatMessageType';
import type { ChatAttachment, ChatReaction } from './chatTypes';

// ─── Notification Event Emission ─────────────────────────────────────────────

import { emitEvent as emitCentralEvent } from './notificationEvents';

export async function emitNotificationEvent(params: {
  userId: string;
  eventType: string;
  conversationId?: string | null;
  messageId?: string | null;
  productId?: string | null;
  actorId?: string | null;
  payload?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    // Log to the legacy notification_events table (backward compat)
    await supabase.from('notification_events').insert({
      user_id: params.userId,
      event_type: params.eventType,
      conversation_id: params.conversationId || null,
      message_id: params.messageId || null,
      product_id: params.productId || null,
      actor_id: params.actorId || null,
      payload: params.payload || null,
    });

    // Also route through the centralized event engine
    if (params.eventType === 'conversation_started') {
      const actorName = (params.payload?.actorName as string) || 'Someone';
      await emitCentralEvent({
        module: 'chat',
        eventType: 'new_message',
        recipientIds: params.userId,
        actorId: params.actorId,
        metadata: {
          senderName: actorName,
          messagePreview: 'Started a new conversation',
          conversationId: params.conversationId,
        },
      });
    }
  } catch (err) {
    console.error('emitNotificationEvent error:', err);
  }
}

// ─── helpers ────────────────────────────────────────────────────────────────

export function chatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(dateStr).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function chatFormatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function chatGroupDate(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  const diffDays = Math.floor((today.getTime() - d.getTime()) / 86400000);
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'long' });
  if (diffDays < 30) return 'Last Week';
  return d.toLocaleDateString([], { month: 'long', year: 'numeric' });
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getFileCategory(mimeType: string): ChatMessage['message_type'] {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'document';
}

// Auto-detect links, emails, phone numbers in text
export function parseMessageLinks(text: string): { type: 'text' | 'url' | 'email' | 'phone'; value: string }[] {
  const urlRegex = /https?:\/\/[^\s]+/g;
  const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const phoneRegex = /\+?[\d\s\-().]{7,}/g;

  const parts: { type: 'text' | 'url' | 'email' | 'phone'; value: string; index: number }[] = [];
  let lastIndex = 0;
  const combined = /https?:\/\/[^\s]+|[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

  let match: RegExpExecArray | null;
  while ((match = combined.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: text.slice(lastIndex, match.index), index: lastIndex });
    }
    const isEmail = emailRegex.test(match[0]);
    emailRegex.lastIndex = 0;
    const isUrl = urlRegex.test(match[0]);
    urlRegex.lastIndex = 0;
    parts.push({ type: isUrl ? 'url' : isEmail ? 'email' : 'text', value: match[0], index: match.index });
    lastIndex = match.index + match[0].length;
  }
  void phoneRegex; // reserved for future use
  if (lastIndex < text.length) {
    parts.push({ type: 'text', value: text.slice(lastIndex), index: lastIndex });
  }
  return parts.map(({ type, value }) => ({ type, value }));
}

// ─── enrichConversations ─────────────────────────────────────────────────────

async function enrichConversations(
  convs: ChatConversation[],
  currentUserId: string
): Promise<ChatConversation[]> {
  if (convs.length === 0) return [];
  const userIds = [
    ...new Set(convs.flatMap(c => [c.customer_id, c.seller_id].filter(Boolean) as string[])),
  ];
  const productIds = [
    ...new Set(convs.map(c => c.product_id).filter(Boolean) as string[]),
  ];

  const [{ data: usersData }, { data: productsData }, { data: presenceData }] = await Promise.all([
    supabase.from('users').select('id, email, full_name, avatar_url').in('id', userIds),
    productIds.length > 0
      ? supabase.from('products').select('id, name').in('id', productIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    supabase.from('chat_presence').select('user_id, is_online, last_seen_at').in('user_id', userIds),
  ]);

  const userMap = new Map((usersData || []).map(u => [u.id, u]));
  const productMap = new Map((productsData || []).map(p => [p.id, p.name]));
  const presenceMap = new Map((presenceData || []).map(p => [p.user_id, p]));

  return convs.map(c => {
    const otherId = c.seller_id === currentUserId ? c.customer_id : (c.seller_id || c.customer_id);
    const other = userMap.get(otherId);
    const presence = presenceMap.get(otherId);
    return {
      ...c,
      customer_name:
        userMap.get(c.customer_id)?.full_name || userMap.get(c.customer_id)?.email || 'Unknown',
      customer_avatar: userMap.get(c.customer_id)?.avatar_url || null,
      seller_name: c.seller_id
        ? userMap.get(c.seller_id)?.full_name || userMap.get(c.seller_id)?.email || 'Unknown'
        : undefined,
      seller_avatar: c.seller_id ? userMap.get(c.seller_id)?.avatar_url || null : null,
      product_name: c.product_id ? productMap.get(c.product_id) || 'Unknown Product' : undefined,
      other_user_id: otherId,
      other_user_name: other?.full_name || other?.email || 'Unknown',
      other_user_avatar: other?.avatar_url || null,
      other_user_is_online: presence?.is_online || false,
      other_user_last_seen: presence?.last_seen_at || null,
    };
  });
}

// ─── enrichMessages ───────────────────────────────────────────────────────────

async function enrichMessages(
  msgs: ChatMessage[],
  conversationId: string,
  userId: string
): Promise<ChatMessage[]> {
  if (msgs.length === 0) return [];

  const senderIds = [...new Set(msgs.map(m => m.sender_id))];
  const msgIds = msgs.map(m => m.id);
  const replyToIds = msgs.map(m => m.reply_to_id).filter(Boolean) as string[];

  const [usersRes, attachmentsRes, reactionsRes, starsRes, replyMsgsRes] = await Promise.all([
    supabase.from('users').select('id, full_name, email, avatar_url').in('id', senderIds),
    supabase.from('chat_message_attachments').select('*').in('message_id', msgIds),
    supabase.from('chat_message_reactions').select('*').in('message_id', msgIds),
    supabase.from('chat_starred_messages').select('message_id').eq('user_id', userId).in('message_id', msgIds),
    replyToIds.length > 0
      ? supabase.from('chat_messages').select('id, sender_id, body, message_type').in('id', replyToIds)
      : Promise.resolve({ data: [] }),
  ]);

  const userMap = new Map((usersRes.data || []).map(u => [u.id, u]));
  const attachMap = new Map<string, ChatAttachment[]>();
  for (const a of (attachmentsRes.data || []) as ChatAttachment[]) {
    const arr = attachMap.get(a.message_id) || [];
    arr.push(a);
    attachMap.set(a.message_id, arr);
  }
  const reactionMap = new Map<string, ChatReaction[]>();
  for (const r of (reactionsRes.data || []) as ChatReaction[]) {
    const arr = reactionMap.get(r.message_id) || [];
    const user = userMap.get(r.user_id);
    arr.push({ ...r, user_name: user?.full_name || user?.email || 'Unknown' });
    reactionMap.set(r.message_id, arr);
  }
  const starSet = new Set((starsRes.data || []).map(s => s.message_id));
  const replyMsgMap = new Map(
    ((replyMsgsRes.data || []) as { id: string; sender_id: string; body: string; message_type: string }[]).map(m => [m.id, m])
  );

  void conversationId; // used in caller context
  return msgs.map(m => {
    const replyRaw = m.reply_to_id ? replyMsgMap.get(m.reply_to_id) : null;
    const replyUser = replyRaw ? userMap.get(replyRaw.sender_id) : null;
    return {
      ...m,
      sender_name: userMap.get(m.sender_id)?.full_name || userMap.get(m.sender_id)?.email || 'Unknown',
      sender_avatar: userMap.get(m.sender_id)?.avatar_url || null,
      attachments: attachMap.get(m.id) || [],
      reactions: reactionMap.get(m.id) || [],
      is_starred: starSet.has(m.id),
      reply_to: replyRaw ? {
        id: replyRaw.id,
        sender_name: replyUser?.full_name || replyUser?.email || 'Unknown',
        body: replyRaw.body,
        message_type: replyRaw.message_type as ChatMessage['message_type'],
      } : null,
    };
  });
}

// ─── useConversations ────────────────────────────────────────────────────────

export function useConversations(userId: string | null, isAdmin: boolean) {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [, setArchivedIds] = useState<Set<string>>(new Set());
  const [, setFavoriteIds] = useState<Set<string>>(new Set());
  const [, setPinnedByUserIds] = useState<Set<string>>(new Set());

  const fetch = useCallback(async () => {
    if (!userId) return;
    try {
      let q = supabase
        .from('chat_conversations')
        .select('*')
        .order('is_pinned', { ascending: false })
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(100);

      if (!isAdmin) {
        q = q.or(`customer_id.eq.${userId},seller_id.eq.${userId}`);
      }

      const { data, error } = await q;
      if (error) throw error;

      // Fetch per-user archive/favorite/pinned state in parallel
      const [archivedRes, favRes, pinnedRes] = await Promise.all([
        supabase.from('chat_archived_conversations').select('conversation_id').eq('user_id', userId),
        supabase.from('chat_favorite_conversations').select('conversation_id').eq('user_id', userId),
        supabase.from('chat_pinned_conversations').select('conversation_id').eq('user_id', userId),
      ]);

      const archSet = new Set((archivedRes.data || []).map(r => r.conversation_id));
      const favSet = new Set((favRes.data || []).map(r => r.conversation_id));
      const pinSet = new Set((pinnedRes.data || []).map(r => r.conversation_id));
      setArchivedIds(archSet);
      setFavoriteIds(favSet);
      setPinnedByUserIds(pinSet);

      const enriched = await enrichConversations((data || []) as ChatConversation[], userId);
      const withFlags = enriched.map(c => ({
        ...c,
        is_archived: archSet.has(c.id),
        is_favorite: favSet.has(c.id),
        is_pinned_by_user: pinSet.has(c.id),
      }));
      void setArchivedIds; void setFavoriteIds; void setPinnedByUserIds;
      setConversations(withFlags);
    } catch (err) {
      console.error('useConversations fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [userId, isAdmin]);

  useEffect(() => {
    fetch();
    if (!userId) return;
    const channel = supabase
      .channel('conversations_realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'chat_conversations',
      }, () => fetch())
      .subscribe();
    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [fetch, userId]);

  return { conversations, loading, refetch: fetch };
}

// ─── useMessages ─────────────────────────────────────────────────────────────

const MESSAGE_PAGE_SIZE = 50;

export function useMessages(conversationId: string | null, userId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const oldestRef = useRef<string | null>(null);

  const fetch = useCallback(async () => {
    if (!conversationId || !userId) return;
    setLoading(true);
    setHasMore(true);
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(MESSAGE_PAGE_SIZE);

      if (error) throw error;
      const msgs = ((data || []) as ChatMessage[]).reverse();
      const enriched = await enrichMessages(msgs, conversationId, userId);
      setMessages(enriched);
      if (msgs.length < MESSAGE_PAGE_SIZE) setHasMore(false);
      if (msgs.length > 0) oldestRef.current = msgs[0].created_at;
      else oldestRef.current = null;
    } catch (err) {
      console.error('useMessages fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [conversationId, userId]);

  const loadMore = useCallback(async () => {
    if (!conversationId || !userId || !hasMore || loadingMore || !oldestRef.current) return;
    setLoadingMore(true);
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .lt('created_at', oldestRef.current)
        .order('created_at', { ascending: false })
        .limit(MESSAGE_PAGE_SIZE);

      if (error) throw error;
      const msgs = ((data || []) as ChatMessage[]).reverse();
      if (msgs.length === 0) { setHasMore(false); return; }
      if (msgs.length < MESSAGE_PAGE_SIZE) setHasMore(false);
      const enriched = await enrichMessages(msgs, conversationId, userId);
      setMessages(prev => [...enriched, ...prev]);
      oldestRef.current = msgs[0].created_at;
    } catch (err) {
      console.error('useMessages loadMore error:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [conversationId, userId, hasMore, loadingMore]);

  useEffect(() => {
    if (!conversationId || !userId) return;
    fetch();

    const name = `chat-msgs-${conversationId}`;
    const existing = supabase.getChannels().find(c => c.topic === `realtime:${name}`);
    if (existing) supabase.removeChannel(existing);

    const ch = supabase
      .channel(name)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${conversationId}` }, async (payload) => {
        const msg = payload.new as ChatMessage;
        if (msg.sender_id === userId) return;
        const enriched = await enrichMessages([msg], conversationId, userId);
        const enrichedMsg = enriched[0];
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, enrichedMsg]);
        supabase.from('chat_messages').update({ status: 'delivered' }).eq('id', msg.id).then(() => {});
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${conversationId}` }, (payload) => {
        const updated = payload.new as ChatMessage;
        setMessages(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_message_reactions', filter: `conversation_id=eq.${conversationId}` }, async (payload) => {
        const reaction = payload.new as ChatReaction;
        const { data: user } = await supabase.from('users').select('full_name, email').eq('id', reaction.user_id).maybeSingle();
        setMessages(prev => prev.map(m => m.id === reaction.message_id ? {
          ...m,
          reactions: [...(m.reactions || []), { ...reaction, user_name: user?.full_name || user?.email || 'Unknown' }],
        } : m));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_message_reactions', filter: `conversation_id=eq.${conversationId}` }, (payload) => {
        const deleted = payload.old as ChatReaction;
        setMessages(prev => prev.map(m => m.id === deleted.message_id ? {
          ...m,
          reactions: (m.reactions || []).filter(r => r.id !== deleted.id),
        } : m));
      })
      .subscribe();

    channelRef.current = ch;
    return () => {
      if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }
    };
  }, [conversationId, userId, fetch]);

  return { messages, loading, setMessages, refetch: fetch, loadMore, hasMore, loadingMore };
}

// ─── useTypingIndicator ───────────────────────────────────────────────────────

export function useTypingIndicator(conversationId: string | null, userId: string | null) {
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const setTyping = useCallback(async (isTyping: boolean) => {
    if (!conversationId || !userId) return;
    if (isTyping) {
      await supabase.from('chat_typing_indicators').upsert({ conversation_id: conversationId, user_id: userId, updated_at: new Date().toISOString() });
    } else {
      await supabase.from('chat_typing_indicators').delete().eq('conversation_id', conversationId).eq('user_id', userId);
    }
  }, [conversationId, userId]);

  const handleTypingInput = useCallback(() => {
    setTyping(true);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => setTyping(false), 3000);
  }, [setTyping]);

  useEffect(() => {
    if (!conversationId) return;
    const name = `typing-${conversationId}`;
    const existing = supabase.getChannels().find(c => c.topic === `realtime:${name}`);
    if (existing) supabase.removeChannel(existing);

    const ch = supabase.channel(name)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_typing_indicators', filter: `conversation_id=eq.${conversationId}` }, async () => {
        const { data } = await supabase.from('chat_typing_indicators').select('user_id, updated_at').eq('conversation_id', conversationId);
        const tenSecondsAgo = Date.now() - 10000;
        const active = (data || []).filter(t => new Date(t.updated_at).getTime() > tenSecondsAgo && t.user_id !== userId);
        setTypingUserIds(active.map(t => t.user_id));
      })
      .subscribe();

    channelRef.current = ch;
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }
      if (conversationId && userId) {
        supabase.from('chat_typing_indicators').delete().eq('conversation_id', conversationId).eq('user_id', userId).then(() => {});
      }
    };
  }, [conversationId, userId]);

  return { typingUserIds, handleTypingInput };
}

// ─── usePresence ─────────────────────────────────────────────────────────────

export function usePresence(userId: string | null) {
  useEffect(() => {
    if (!userId) return;

    const setOnline = async () => {
      await supabase.from('chat_presence').upsert({ user_id: userId, is_online: true, last_seen_at: new Date().toISOString() });
    };
    const setOffline = async () => {
      await supabase.from('chat_presence').upsert({ user_id: userId, is_online: false, last_seen_at: new Date().toISOString() });
    };

    // Use sendBeacon for beforeunload so the request completes before the page closes
    const handleBeforeUnload = () => {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/chat_presence?user_id=eq.${userId}`;
      const body = JSON.stringify({ user_id: userId, is_online: false, last_seen_at: new Date().toISOString() });
      try {
        navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      } catch {
        // Fallback to async upsert if sendBeacon is unavailable
        setOffline();
      }
    };

    setOnline();
    const interval = setInterval(setOnline, 30000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') setOnline(); else setOffline();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibility);
      setOffline();
    };
  }, [userId]);
}

// ─── useDraft ─────────────────────────────────────────────────────────────────

export function useDraft(conversationId: string | null, userId: string | null) {
  const [draft, setDraft] = useState('');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!conversationId || !userId) return;
    supabase.from('chat_message_drafts').select('body').eq('conversation_id', conversationId).eq('user_id', userId).maybeSingle().then(({ data }) => {
      if (data?.body) setDraft(data.body);
    });
  }, [conversationId, userId]);

  const saveDraft = useCallback((text: string) => {
    setDraft(text);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (!conversationId || !userId) return;
      if (text.trim()) {
        await supabase.from('chat_message_drafts').upsert({ conversation_id: conversationId, user_id: userId, body: text, updated_at: new Date().toISOString() });
      } else {
        await supabase.from('chat_message_drafts').delete().eq('conversation_id', conversationId).eq('user_id', userId);
      }
    }, 1000);
  }, [conversationId, userId]);

  const clearDraft = useCallback(async () => {
    setDraft('');
    if (!conversationId || !userId) return;
    await supabase.from('chat_message_drafts').delete().eq('conversation_id', conversationId).eq('user_id', userId);
  }, [conversationId, userId]);

  return { draft, saveDraft, clearDraft };
}

// ─── useQuickReplies ──────────────────────────────────────────────────────────

export function useQuickReplies(userId: string | null) {
  const [quickReplies, setQuickReplies] = useState<import('./chatTypes').ChatQuickReply[]>([]);

  const fetch = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.from('chat_quick_replies').select('*').eq('user_id', userId).order('sort_order', { ascending: true });
    setQuickReplies((data || []) as import('./chatTypes').ChatQuickReply[]);
  }, [userId]);

  useEffect(() => { fetch(); }, [fetch]);

  const create = async (title: string, body: string) => {
    if (!userId) return;
    await supabase.from('chat_quick_replies').insert({ user_id: userId, title, body, sort_order: quickReplies.length });
    fetch();
  };

  const remove = async (id: string) => {
    await supabase.from('chat_quick_replies').delete().eq('id', id);
    fetch();
  };

  return { quickReplies, create, remove, refetch: fetch };
}

// ─── startOrFindConversation ─────────────────────────────────────────────────

export async function startOrFindConversation(params: {
  currentUserId: string;
  otherUserId: string;
  contextType: ChatContextType;
  contextId?: string | null;
  contextData?: ChatContextData | null;
  productId?: string | null;
  orderId?: string | null;
}): Promise<string | null> {
  const { currentUserId, otherUserId, contextType, contextId, contextData, productId, orderId } = params;
  try {
    // Find existing conversation between these two users with the same context
    // Use a single .or() with AND conditions encoded via commas (PostgREST filter syntax)
    // Pattern: (user1 is customer AND user2 is seller) OR (user1 is seller AND user2 is customer)
    let existingQ = supabase
      .from('chat_conversations')
      .select('id')
      .eq('context_type', contextType)
      .in('status', ['open'])
      .or(`and(customer_id.eq.${currentUserId},seller_id.eq.${otherUserId}),and(customer_id.eq.${otherUserId},seller_id.eq.${currentUserId})`);

    if (contextId) existingQ = existingQ.eq('context_id', contextId);

    const { data: existing } = await existingQ.maybeSingle();
    if (existing) return existing.id;

    const { data: newConv, error } = await supabase
      .from('chat_conversations')
      .insert({
        customer_id: currentUserId,
        seller_id: otherUserId,
        initiator_id: currentUserId,
        channel_type: productId ? 'product_question' : orderId ? 'order_issue' : 'general',
        context_type: contextType,
        context_id: contextId || null,
        context_data: contextData || null,
        product_id: productId || null,
        order_id: orderId || null,
        status: 'open',
      })
      .select('id')
      .single();

    if (error) throw error;

    // Insert timeline event
    if (newConv?.id) {
      await supabase.from('chat_conversation_timeline').insert({
        conversation_id: newConv.id,
        event_type: 'conversation_started',
        event_label: 'Conversation started',
        event_data: { context_type: contextType, context_id: contextId },
      });

      // Emit notification event for the other participant
      emitNotificationEvent({
        userId: otherUserId,
        eventType: 'conversation_started',
        conversationId: newConv.id,
        actorId: currentUserId,
        payload: { context_type: contextType, context_id: contextId },
      });
    }

    return newConv?.id || null;
  } catch (err) {
    console.error('startOrFindConversation error:', err);
    return null;
  }
}

// ─── uploadChatAttachment ─────────────────────────────────────────────────────

export async function uploadChatAttachment(
  file: File,
  conversationId: string,
  userId: string,
  onProgress?: (pct: number) => void
): Promise<{ path: string; url: string } | null> {
  const ext = file.name.split('.').pop() || 'bin';
  const path = `chat/${conversationId}/${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  onProgress?.(10);

  const { error } = await supabase.storage
    .from('chat-attachments')
    .upload(path, file, { cacheControl: '3600', upsert: false });

  if (error) { console.error('Upload error:', error); return null; }

  onProgress?.(90);

  const { data: urlData } = supabase.storage.from('chat-attachments').getPublicUrl(path);
  onProgress?.(100);

  return { path, url: urlData.publicUrl };
}

// ─── message actions ──────────────────────────────────────────────────────────

export async function toggleReaction(messageId: string, userId: string, emoji: string): Promise<void> {
  const { data: existing } = await supabase
    .from('chat_message_reactions')
    .select('id')
    .eq('message_id', messageId)
    .eq('user_id', userId)
    .eq('emoji', emoji)
    .maybeSingle();

  if (existing) {
    await supabase.from('chat_message_reactions').delete().eq('id', existing.id);
  } else {
    await supabase.from('chat_message_reactions').insert({ message_id: messageId, user_id: userId, emoji });
  }
}

export async function toggleStar(messageId: string, userId: string, conversationId: string): Promise<boolean> {
  const { data: existing } = await supabase
    .from('chat_starred_messages')
    .select('id')
    .eq('message_id', messageId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    await supabase.from('chat_starred_messages').delete().eq('id', existing.id);
    return false;
  } else {
    await supabase.from('chat_starred_messages').insert({ message_id: messageId, user_id: userId, conversation_id: conversationId });
    return true;
  }
}

export async function pinMessage(messageId: string, conversationId: string, userId: string): Promise<void> {
  await supabase.from('chat_pinned_messages').upsert({ message_id: messageId, conversation_id: conversationId, pinned_by: userId, pinned_at: new Date().toISOString() });
}

export async function unpinMessage(messageId: string, conversationId: string): Promise<void> {
  await supabase.from('chat_pinned_messages').delete().eq('message_id', messageId).eq('conversation_id', conversationId);
}

export async function editMessage(messageId: string, newBody: string, previousBody: string, userId: string): Promise<void> {
  await supabase.from('chat_message_edits').insert({ message_id: messageId, editor_id: userId, previous_body: previousBody });
  await supabase.from('chat_messages').update({ body: newBody, is_edited: true }).eq('id', messageId);
}

export async function deleteMessage(messageId: string, forEveryone: boolean): Promise<void> {
  await supabase.from('chat_messages').update({
    is_deleted: true,
    deleted_for_everyone: forEveryone,
    body: '',
  }).eq('id', messageId);
}

// ─── useChatNavigation ───────────────────────────────────────────────────────

export function useChatNavigation() {
  const navigate = useNavigate();

  const openChat = useCallback((conversationId: string) => {
    navigate(`/chat?conv=${conversationId}`);
  }, [navigate]);

  const startChat = useCallback(async (params: Parameters<typeof startOrFindConversation>[0]) => {
    const convId = await startOrFindConversation(params);
    if (convId) navigate(`/chat?conv=${convId}`);
    return convId;
  }, [navigate]);

  return { openChat, startChat };
}
