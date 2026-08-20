import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import { emitNotificationEvent } from './chatHooks';
import type { ChatConversation } from './types';
import type {
  ChatLabel,
  ChatConversationLabel,
  ChatUserBlock,
  ChatReport,
  ReportReason,
  ChatFollowUpReminder,
  ChatCustomerTag,
  ChatSpamFlag,
  ChatConversationSummary,
  SpamFlagType,
  ReminderType,
  ChatCustomerHistory,
  TrustIndicator,
} from './chatTypes';
import type { ChatMessage } from './chatMessageType';

// ─── Archive ────────────────────────────────────────────────────────────────

export function useArchivedConversations(userId: string | null) {
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set());

  const fetch = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from('chat_archived_conversations')
      .select('conversation_id')
      .eq('user_id', userId);
    setArchivedIds(new Set((data || []).map(r => r.conversation_id)));
  }, [userId]);

  useEffect(() => { fetch(); }, [fetch]);

  const archive = useCallback(async (conversationId: string) => {
    if (!userId) return;
    await supabase.from('chat_archived_conversations')
      .insert({ conversation_id: conversationId, user_id: userId });
    setArchivedIds(prev => new Set(prev).add(conversationId));
  }, [userId]);

  const unarchive = useCallback(async (conversationId: string) => {
    if (!userId) return;
    await supabase.from('chat_archived_conversations')
      .delete().eq('conversation_id', conversationId).eq('user_id', userId);
    setArchivedIds(prev => {
      const next = new Set(prev);
      next.delete(conversationId);
      return next;
    });
  }, [userId]);

  const bulkArchive = useCallback(async (conversationIds: string[]) => {
    if (!userId || conversationIds.length === 0) return;
    const rows = conversationIds.map(cid => ({ conversation_id: cid, user_id: userId }));
    await supabase.from('chat_archived_conversations').insert(rows);
    setArchivedIds(prev => {
      const next = new Set(prev);
      conversationIds.forEach(id => next.add(id));
      return next;
    });
  }, [userId]);

  const bulkUnarchive = useCallback(async (conversationIds: string[]) => {
    if (!userId || conversationIds.length === 0) return;
    await supabase.from('chat_archived_conversations')
      .delete().in('conversation_id', conversationIds).eq('user_id', userId);
    setArchivedIds(prev => {
      const next = new Set(prev);
      conversationIds.forEach(id => next.delete(id));
      return next;
    });
  }, [userId]);

  return { archivedIds, archive, unarchive, bulkArchive, bulkUnarchive, refetch: fetch };
}

// ─── Favorites ──────────────────────────────────────────────────────────────

export function useFavorites(userId: string | null) {
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  const fetch = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from('chat_favorite_conversations')
      .select('conversation_id')
      .eq('user_id', userId);
    setFavoriteIds(new Set((data || []).map(r => r.conversation_id)));
  }, [userId]);

  useEffect(() => { fetch(); }, [fetch]);

  const toggleFavorite = useCallback(async (conversationId: string) => {
    if (!userId) return;
    const isFav = favoriteIds.has(conversationId);
    if (isFav) {
      await supabase.from('chat_favorite_conversations')
        .delete().eq('conversation_id', conversationId).eq('user_id', userId);
      setFavoriteIds(prev => {
        const next = new Set(prev);
        next.delete(conversationId);
        return next;
      });
    } else {
      await supabase.from('chat_favorite_conversations')
        .insert({ conversation_id: conversationId, user_id: userId });
      setFavoriteIds(prev => new Set(prev).add(conversationId));
    }
  }, [userId, favoriteIds]);

  const bulkFavorite = useCallback(async (conversationIds: string[]) => {
    if (!userId || conversationIds.length === 0) return;
    const rows = conversationIds.map(cid => ({ conversation_id: cid, user_id: userId }));
    await supabase.from('chat_favorite_conversations').insert(rows);
    setFavoriteIds(prev => {
      const next = new Set(prev);
      conversationIds.forEach(id => next.add(id));
      return next;
    });
  }, [userId]);

  const bulkUnfavorite = useCallback(async (conversationIds: string[]) => {
    if (!userId || conversationIds.length === 0) return;
    await supabase.from('chat_favorite_conversations')
      .delete().in('conversation_id', conversationIds).eq('user_id', userId);
    setFavoriteIds(prev => {
      const next = new Set(prev);
      conversationIds.forEach(id => next.delete(id));
      return next;
    });
  }, [userId]);

  return { favoriteIds, toggleFavorite, bulkFavorite, bulkUnfavorite, refetch: fetch };
}

// ─── Pinned Conversations ────────────────────────────────────────────────────

const PIN_LIMIT = 5;

export function usePinnedConversations(userId: string | null) {
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [pinnedOrder, setPinnedOrder] = useState<{ conversation_id: string; sort_order: number }[]>([]);

  const fetch = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from('chat_pinned_conversations')
      .select('conversation_id, sort_order')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true });
    setPinnedIds(new Set((data || []).map(r => r.conversation_id)));
    setPinnedOrder((data || []).map(r => ({ conversation_id: r.conversation_id, sort_order: r.sort_order })));
  }, [userId]);

  useEffect(() => { fetch(); }, [fetch]);

  const pin = useCallback(async (conversationId: string) => {
    if (!userId) return;
    if (pinnedIds.size >= PIN_LIMIT) return false;
    await supabase.from('chat_pinned_conversations')
      .insert({ conversation_id: conversationId, user_id: userId, sort_order: pinnedIds.size });
    setPinnedIds(prev => new Set(prev).add(conversationId));
    setPinnedOrder(prev => [...prev, { conversation_id: conversationId, sort_order: prev.length }]);
    return true;
  }, [userId, pinnedIds]);

  const unpin = useCallback(async (conversationId: string) => {
    if (!userId) return;
    await supabase.from('chat_pinned_conversations')
      .delete().eq('conversation_id', conversationId).eq('user_id', userId);
    setPinnedIds(prev => {
      const next = new Set(prev);
      next.delete(conversationId);
      return next;
    });
    setPinnedOrder(prev => prev.filter(p => p.conversation_id !== conversationId));
  }, [userId]);

  const reorder = useCallback(async (newOrder: string[]) => {
    if (!userId) return;
    const updates = newOrder.map((cid, idx) =>
      supabase.from('chat_pinned_conversations')
        .update({ sort_order: idx })
        .eq('conversation_id', cid).eq('user_id', userId)
    );
    await Promise.all(updates);
    setPinnedOrder(newOrder.map((cid, idx) => ({ conversation_id: cid, sort_order: idx })));
  }, [userId]);

  return { pinnedIds, pinnedOrder, pin, unpin, reorder, pinLimit: PIN_LIMIT, refetch: fetch };
}

// ─── Labels ──────────────────────────────────────────────────────────────────

export function useLabels() {
  const [labels, setLabels] = useState<ChatLabel[]>([]);

  const fetch = useCallback(async () => {
    const { data } = await supabase.from('chat_labels').select('*').order('name');
    setLabels((data || []) as ChatLabel[]);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const createLabel = useCallback(async (name: string, color: string) => {
    await supabase.from('chat_labels').insert({ name, color, is_system: false });
    fetch();
  }, [fetch]);

  return { labels, createLabel, refetch: fetch };
}

export function useConversationLabels(conversationId: string | null) {
  const [convLabels, setConvLabels] = useState<ChatConversationLabel[]>([]);

  const fetch = useCallback(async () => {
    if (!conversationId) return;
    const { data } = await supabase
      .from('chat_conversation_labels')
      .select('*, label:chat_labels(*)')
      .eq('conversation_id', conversationId);
    setConvLabels((data || []) as ChatConversationLabel[]);
  }, [conversationId]);

  useEffect(() => { fetch(); }, [fetch]);

  const applyLabel = useCallback(async (labelId: string, userId: string) => {
    if (!conversationId) return;
    await supabase.from('chat_conversation_labels')
      .insert({ conversation_id: conversationId, label_id: labelId, applied_by: userId });
    fetch();
  }, [conversationId, fetch]);

  const removeLabel = useCallback(async (labelId: string) => {
    if (!conversationId) return;
    await supabase.from('chat_conversation_labels')
      .delete().eq('conversation_id', conversationId).eq('label_id', labelId);
    fetch();
  }, [conversationId, fetch]);

  return { convLabels, applyLabel, removeLabel, refetch: fetch };
}

// ─── User Blocking ───────────────────────────────────────────────────────────

export function useUserBlocks(userId: string | null) {
  const [blocks, setBlocks] = useState<ChatUserBlock[]>([]);

  const fetch = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from('chat_user_blocks')
      .select('*, blocked:users!blocked_id(full_name, email, avatar_url)')
      .eq('blocker_id', userId)
      .order('created_at', { ascending: false });
    setBlocks((data || []).map(b => ({
      ...b,
      blocked_name: b.blocked?.full_name || b.blocked?.email || 'Unknown',
      blocked_avatar: b.blocked?.avatar_url || null,
    })) as ChatUserBlock[]);
  }, [userId]);

  useEffect(() => { fetch(); }, [fetch]);

  const blockUser = useCallback(async (blockedId: string) => {
    if (!userId) return;
    await supabase.from('chat_user_blocks')
      .insert({ blocker_id: userId, blocked_id: blockedId });
    fetch();
  }, [userId, fetch]);

  const unblockUser = useCallback(async (blockedId: string) => {
    if (!userId) return;
    await supabase.from('chat_user_blocks')
      .delete().eq('blocker_id', userId).eq('blocked_id', blockedId);
    fetch();
  }, [userId, fetch]);

  const isBlocked = useCallback((otherUserId: string) => {
    return blocks.some(b => b.blocked_id === otherUserId);
  }, [blocks]);

  return { blocks, blockUser, unblockUser, isBlocked, refetch: fetch };
}

export async function checkBlocked(blockerId: string, blockedId: string): Promise<boolean> {
  const { data } = await supabase.from('chat_user_blocks')
    .select('id').eq('blocker_id', blockerId).eq('blocked_id', blockedId).maybeSingle();
  return !!data;
}

// ─── Reporting ───────────────────────────────────────────────────────────────

export async function reportUser(params: {
  reporterId: string;
  reportedUserId: string;
  conversationId?: string | null;
  messageId?: string | null;
  reason: ReportReason | string;
  description?: string;
}): Promise<boolean> {
  try {
    const { error } = await supabase.from('chat_reports').insert({
      reporter_id: params.reporterId,
      reported_user_id: params.reportedUserId,
      conversation_id: params.conversationId || null,
      message_id: params.messageId || null,
      reason: params.reason,
      description: params.description || null,
      status: 'open',
    });
    if (error) throw error;

    // Emit notification event for admins about the report
    emitNotificationEvent({
      userId: params.reporterId,
      eventType: 'report_created',
      conversationId: params.conversationId || null,
      messageId: params.messageId || null,
      actorId: params.reporterId,
      payload: { reason: params.reason, reported_user_id: params.reportedUserId },
    });

    return true;
  } catch (err) {
    console.error('reportUser error:', err);
    return false;
  }
}

export function useReports(userId: string | null, isAdmin: boolean) {
  const [reports, setReports] = useState<ChatReport[]>([]);

  const fetch = useCallback(async () => {
    if (!userId) return;
    let q = supabase.from('chat_reports').select('*').order('created_at', { ascending: false });
    if (!isAdmin) q = q.eq('reporter_id', userId);
    const { data } = await q;
    setReports((data || []) as ChatReport[]);
  }, [userId, isAdmin]);

  useEffect(() => { fetch(); }, [fetch]);

  return { reports, refetch: fetch };
}

// ─── Follow-up Reminders ──────────────────────────────────────────────────────

export function useFollowUpReminders(conversationId: string | null, sellerId: string | null) {
  const [reminders, setReminders] = useState<ChatFollowUpReminder[]>([]);

  const fetch = useCallback(async () => {
    if (!conversationId || !sellerId) return;
    const { data } = await supabase
      .from('chat_follow_up_reminders')
      .select('*')
      .eq('conversation_id', conversationId)
      .eq('seller_id', sellerId)
      .order('due_at', { ascending: true });
    setReminders((data || []) as ChatFollowUpReminder[]);
  }, [conversationId, sellerId]);

  useEffect(() => { fetch(); }, [fetch]);

  const createReminder = useCallback(async (params: {
    reminderType: ReminderType;
    title?: string;
    dueAt: string;
  }) => {
    if (!conversationId || !sellerId) return;
    const { data } = await supabase.from('chat_follow_up_reminders').insert({
      conversation_id: conversationId,
      seller_id: sellerId,
      reminder_type: params.reminderType,
      title: params.title || null,
      due_at: params.dueAt,
    }).select().single();
    if (data) setReminders(prev => [...prev, data as ChatFollowUpReminder]);
  }, [conversationId, sellerId]);

  const completeReminder = useCallback(async (id: string) => {
    await supabase.from('chat_follow_up_reminders')
      .update({ is_completed: true, completed_at: new Date().toISOString() })
      .eq('id', id);
    setReminders(prev => prev.map(r => r.id === id ? { ...r, is_completed: true, completed_at: new Date().toISOString() } : r));
  }, []);

  const deleteReminder = useCallback(async (id: string) => {
    await supabase.from('chat_follow_up_reminders').delete().eq('id', id);
    setReminders(prev => prev.filter(r => r.id !== id));
  }, []);

  return { reminders, createReminder, completeReminder, deleteReminder, refetch: fetch };
}

// ─── Customer Tags ────────────────────────────────────────────────────────────

export function useCustomerTags(sellerId: string | null, customerId: string | null) {
  const [tags, setTags] = useState<ChatCustomerTag[]>([]);

  const fetch = useCallback(async () => {
    if (!sellerId || !customerId) return;
    const { data } = await supabase
      .from('chat_customer_tags')
      .select('*')
      .eq('seller_id', sellerId)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });
    setTags((data || []) as ChatCustomerTag[]);
  }, [sellerId, customerId]);

  useEffect(() => { fetch(); }, [fetch]);

  const addTag = useCallback(async (tag: string) => {
    if (!sellerId || !customerId) return;
    const { data } = await supabase.from('chat_customer_tags')
      .insert({ seller_id: sellerId, customer_id: customerId, tag })
      .select().single();
    if (data) setTags(prev => [...prev, data as ChatCustomerTag]);
  }, [sellerId, customerId]);

  const removeTag = useCallback(async (id: string) => {
    await supabase.from('chat_customer_tags').delete().eq('id', id);
    setTags(prev => prev.filter(t => t.id !== id));
  }, []);

  return { tags, addTag, removeTag, refetch: fetch };
}

// ─── Spam Detection ───────────────────────────────────────────────────────────

export function detectSpam(params: {
  messages: ChatMessage[];
  newMessageBody: string;
  senderId: string;
  conversationId: string;
}): { isSpam: boolean; flagType?: SpamFlagType; reason?: string } {
  const { messages, newMessageBody, senderId, conversationId } = params;
  const senderMsgs = messages.filter(m => m.sender_id === senderId && !m.is_deleted);
  const body = newMessageBody.toLowerCase().trim();

  // Duplicate message check (last 10 messages from same sender)
  const recentMsgs = senderMsgs.slice(-10);
  if (recentMsgs.some(m => m.body.toLowerCase().trim() === body && body.length > 0)) {
    return { isSpam: true, flagType: 'duplicate_message', reason: 'Duplicate message detected' };
  }

  // Excessive rate: more than 10 messages in 60 seconds
  const now = Date.now();
  const last60s = senderMsgs.filter(m => now - new Date(m.created_at).getTime() < 60000);
  if (last60s.length >= 10) {
    return { isSpam: true, flagType: 'excessive_rate', reason: 'Excessive messaging rate' };
  }

  // Suspicious links: known shortener domains with additional tracking params
  const suspiciousLinkRegex = /(bit\.ly|tinyurl|t\.co|shorte\.st|adf\.ly)\/[^\s]+/gi;
  if (suspiciousLinkRegex.test(newMessageBody)) {
    return { isSpam: true, flagType: 'suspicious_link', reason: 'Suspicious shortened link detected' };
  }

  // Repeated promotional content (3+ similar messages in last 20)
  const promoKeywords = ['buy now', 'click here', 'free money', 'guaranteed income', 'work from home', 'earn $'];
  const hasPromo = promoKeywords.some(kw => body.includes(kw));
  if (hasPromo) {
    const recentPromo = senderMsgs.slice(-20).filter(m =>
      promoKeywords.some(kw => m.body.toLowerCase().includes(kw))
    );
    if (recentPromo.length >= 3) {
      return { isSpam: true, flagType: 'promotional_repeat', reason: 'Repeated promotional content' };
    }
  }

  void conversationId;
  return { isSpam: false };
}

export async function flagConversation(params: {
  conversationId: string;
  userId: string;
  flagType: SpamFlagType;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    await supabase.from('chat_spam_flags').insert({
      conversation_id: params.conversationId,
      user_id: params.userId,
      flag_type: params.flagType,
      details: params.details || null,
    });
    await supabase.from('chat_conversations')
      .update({ is_flagged: true })
      .eq('id', params.conversationId);
  } catch (err) {
    console.error('flagConversation error:', err);
  }
}

export function useSpamFlags(conversationId: string | null, isAdmin: boolean) {
  const [flags, setFlags] = useState<ChatSpamFlag[]>([]);

  const fetch = useCallback(async () => {
    if (!conversationId) return;
    const { data } = await supabase
      .from('chat_spam_flags')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false });
    setFlags((data || []) as ChatSpamFlag[]);
  }, [conversationId]);

  useEffect(() => { fetch(); }, [fetch]);

  const resolveFlag = useCallback(async (id: string) => {
    if (!isAdmin) return;
    await supabase.from('chat_spam_flags')
      .update({ is_resolved: true, resolved_at: new Date().toISOString() })
      .eq('id', id);
    fetch();
  }, [isAdmin, fetch]);

  return { flags, resolveFlag, refetch: fetch };
}

// ─── AI Conversation Summary ──────────────────────────────────────────────────

export function useConversationSummary(conversationId: string | null) {
  const [summary, setSummary] = useState<ChatConversationSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!conversationId) return;
    const { data } = await supabase
      .from('chat_conversation_summaries')
      .select('*')
      .eq('conversation_id', conversationId)
      .maybeSingle();
    setSummary(data as ChatConversationSummary | null);
  }, [conversationId]);

  useEffect(() => { fetch(); }, [fetch]);

  const generate = useCallback(async (messages: ChatMessage[], currentUserId: string) => {
    if (!conversationId || messages.length === 0) return;
    setLoading(true);
    try {
      const { text, bullets } = generateSummaryText(messages, currentUserId);
      const { data } = await supabase.from('chat_conversation_summaries')
        .upsert({
          conversation_id: conversationId,
          summary_text: text,
          bullet_points: bullets,
          message_count: messages.length,
          generated_at: new Date().toISOString(),
        }, { onConflict: 'conversation_id' })
        .select().single();
      setSummary(data as ChatConversationSummary);
    } catch (err) {
      console.error('Summary generation error:', err);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  return { summary, loading, generate, refetch: fetch };
}

function generateSummaryText(messages: ChatMessage[], currentUserId: string): { text: string; bullets: string[] } {
  const visibleMsgs = messages.filter(m => !m.is_deleted && !m.deleted_for_everyone);
  if (visibleMsgs.length === 0) return { text: 'No messages in this conversation.', bullets: [] };

  const bullets: string[] = [];
  const userMsgs = visibleMsgs.filter(m => m.sender_id === currentUserId);
  const otherMsgs = visibleMsgs.filter(m => m.sender_id !== currentUserId);

  // Detect question patterns
  const questions = visibleMsgs.filter(m => m.body.includes('?'));
  if (questions.length > 0) {
    bullets.push(`${questions.length} question${questions.length > 1 ? 's' : ''} asked in this conversation`);
  }

  // Detect pricing discussions
  const pricingMsgs = visibleMsgs.filter(m =>
    /price|cost|how much|payment|pay|discount|negotiate|budget/i.test(m.body)
  );
  if (pricingMsgs.length > 0) {
    bullets.push(`Pricing and payment discussed`);
  }

  // Detect availability queries
  const availMsgs = visibleMsgs.filter(m =>
    /available|in stock|ready|delivery|ship/i.test(m.body)
  );
  if (availMsgs.length > 0) {
    bullets.push(`Product availability and delivery discussed`);
  }

  // Detect meeting/call arrangements
  const meetMsgs = visibleMsgs.filter(m =>
    /meet|call|schedule|appointment|tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday/i.test(m.body)
  );
  if (meetMsgs.length > 0) {
    bullets.push(`Meeting or call arrangements discussed`);
  }

  // Last message status
  const lastMsg = visibleMsgs[visibleMsgs.length - 1];
  const lastIsUser = lastMsg.sender_id === currentUserId;
  if (lastIsUser) {
    bullets.push(`You sent the last message — awaiting their response`);
  } else {
    bullets.push(`They sent the last message — awaiting your reply`);
  }

  // Message counts
  bullets.push(`${userMsgs.length} messages sent by you, ${otherMsgs.length} received`);

  const text = bullets.join('. ');
  return { text, bullets };
}

// ─── AI Suggested Replies ──────────────────────────────────────────────────────

export function generateSuggestedReplies(params: {
  conversation: ChatConversation;
  recentMessages: ChatMessage[];
  isSeller: boolean;
}): string[] {
  const { conversation, recentMessages, isSeller } = params;
  const suggestions: string[] = [];
  const ctx = conversation.context_data;
  const lastIncoming = [...recentMessages].reverse().find(m => m.sender_id !== conversation.seller_id);

  // Base suggestions on context type
  if (isSeller) {
    if (ctx?.availability) {
      suggestions.push(`Yes, this item is available. ${ctx.availability}`);
    } else {
      suggestions.push('Yes, this item is available.');
    }
    if (ctx?.delivery_time) {
      suggestions.push(`Delivery takes ${ctx.delivery_time}.`);
    }
    if (ctx?.price != null && ctx.price > 0) {
      suggestions.push(`The price is ${ctx.currency || ''}${ctx.price.toLocaleString()}. Would you like to proceed?`);
    }
    if (conversation.context_type === 'product_inquiry' || conversation.context_type === 'service_inquiry') {
      suggestions.push('You can download it immediately after payment.');
      suggestions.push('Please check the product description for compatibility.');
    }
    if (conversation.context_type === 'job_application') {
      suggestions.push('Thank you for your interest. We will review your application and get back to you.');
    }
    if (conversation.context_type === 'order_support') {
      suggestions.push('Let me check your order status and get back to you shortly.');
    }
  } else {
    // Buyer suggestions
    if (ctx?.price != null) {
      suggestions.push(`Is the price negotiable?`);
    }
    suggestions.push('Is this item still available?');
    if (ctx?.delivery_time) {
      suggestions.push(`How long does delivery take?`);
    }
    if (conversation.context_type === 'product_inquiry') {
      suggestions.push('Can you share more details about the condition?');
    }
    if (conversation.context_type === 'job_application') {
      suggestions.push(`What are the next steps in the application process?`);
    }
  }

  // Context-aware based on last incoming message
  if (lastIncoming?.body) {
    const incoming = lastIncoming.body.toLowerCase();
    if (/available/.test(incoming) && isSeller) {
      suggestions.unshift('Yes, it is available. Would you like to proceed?');
    }
    if (/delivery|ship/.test(incoming) && isSeller) {
      suggestions.unshift(ctx?.delivery_time
        ? `Delivery typically takes ${ctx.delivery_time}.`
        : 'Delivery takes 2-3 business days.');
    }
    if (/payment|pay|how much/.test(incoming) && isSeller) {
      suggestions.unshift('You can pay through the DRIGHT platform after we agree on the details.');
    }
    if (/discount|negotiate|lower price/.test(incoming) && isSeller) {
      suggestions.unshift('I can offer a small discount if you are ready to purchase today.');
    }
  }

  // Deduplicate, limit to 6
  return [...new Set(suggestions)].slice(0, 6);
}

// ─── AI FAQ Assistant ──────────────────────────────────────────────────────────

export function answerFaqQuestion(params: {
  question: string;
  conversation: ChatConversation;
}): { answer: string | null; confidence: 'high' | 'medium' | 'low' } {
  const { question, conversation } = params;
  const q = question.toLowerCase().trim();
  const ctx = conversation.context_data;

  // Is this available?
  if (/is this available|still available|in stock/.test(q)) {
    if (ctx?.availability) {
      return { answer: `Yes, ${ctx.availability.toLowerCase()}.`, confidence: 'high' };
    }
    return { answer: 'Please contact the seller directly to confirm availability.', confidence: 'medium' };
  }

  // Delivery
  if (/delivery|shipping|how long|when.*arrive/.test(q)) {
    if (ctx?.delivery_time) {
      return { answer: `Delivery takes ${ctx.delivery_time}.`, confidence: 'high' };
    }
    return { answer: null, confidence: 'low' };
  }

  // Price
  if (/how much|price|cost/.test(q)) {
    if (ctx?.price != null) {
      const priceText = ctx.price === 0 ? 'This item is free.' : `The price is ${ctx.currency || ''}${ctx.price.toLocaleString()}.`;
      return { answer: priceText, confidence: 'high' };
    }
    return { answer: null, confidence: 'low' };
  }

  // Pay later
  if (/pay later|installment|payment plan/.test(q)) {
    return { answer: 'Please check with the seller about payment plan options.', confidence: 'medium' };
  }

  // Compatibility (Windows, Mac, etc.)
  if (/windows|mac|linux|android|iphone|compatible/.test(q)) {
    return { answer: 'Please check the product description for compatibility information, or contact the seller directly.', confidence: 'medium' };
  }

  // Download
  if (/download|access|get.*file/.test(q)) {
    if (conversation.context_type === 'product_inquiry' || conversation.context_type === 'service_inquiry') {
      return { answer: 'You can download it immediately after payment is confirmed.', confidence: 'high' };
    }
    return { answer: null, confidence: 'low' };
  }

  return { answer: null, confidence: 'low' };
}

// ─── Customer History ──────────────────────────────────────────────────────────

export function useCustomerHistory(sellerId: string | null, customerId: string | null) {
  const [history, setHistory] = useState<ChatCustomerHistory | null>(null);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!sellerId || !customerId) return;
    setLoading(true);
    try {
      // Fetch user profile
      const { data: user } = await supabase
        .from('users')
        .select('created_at, location')
        .eq('id', customerId)
        .maybeSingle();

      // Count conversations between these two users
      const { count: totalConversations } = await supabase
        .from('chat_conversations')
        .select('*', { count: 'exact', head: true })
        .or(`customer_id.eq.${customerId},seller_id.eq.${sellerId}`);

      // Previous conversations
      const { data: prevConvs } = await supabase
        .from('chat_conversations')
        .select('id, context_type, context_data, last_message_at')
        .or(`customer_id.eq.${customerId},seller_id.eq.${sellerId}`)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(10);

      // Orders by this customer
      const { data: orders } = await supabase
        .from('sales_records')
        .select('id, product_id, amount, status, created_at')
        .eq('buyer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(10);

      // Product names for orders
      const productIds = (orders || []).map(o => o.product_id).filter(Boolean) as string[];
      let productMap = new Map<string, string>();
      if (productIds.length > 0) {
        const { data: products } = await supabase
          .from('products').select('id, name').in('id', productIds);
        productMap = new Map((products || []).map(p => [p.id, p.name]));
      }

      // Wishlist count (aggregate)
      const { count: wishlistCount } = await supabase
        .from('wishlist')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', customerId);

      const recentOrders = (orders || []).map(o => ({
        id: o.id,
        product_name: productMap.get(o.product_id) || 'Unknown',
        amount: o.amount,
        status: o.status,
        created_at: o.created_at,
      }));

      const previousConversations = (prevConvs || []).map(c => ({
        id: c.id,
        context_type: c.context_type || 'general',
        title: (c.context_data as { title?: string } | null)?.title || 'Conversation',
        last_message_at: c.last_message_at,
      }));

      setHistory({
        joined_date: user?.created_at || new Date().toISOString(),
        total_conversations: totalConversations || 0,
        total_purchases: recentOrders.length,
        total_orders: recentOrders.length,
        wishlist_count: wishlistCount || 0,
        previous_conversations: previousConversations,
        recent_orders: recentOrders,
        location: user?.location || null,
        response_rate: null,
      });
    } catch (err) {
      console.error('useCustomerHistory error:', err);
    } finally {
      setLoading(false);
    }
  }, [sellerId, customerId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { history, loading, refetch: fetch };
}

// ─── Trust Indicators ──────────────────────────────────────────────────────────

export async function getTrustIndicators(userId: string): Promise<TrustIndicator[]> {
  try {
    const { data: user } = await supabase
      .from('users')
      .select('is_admin, is_seller, is_verified, created_at')
      .eq('id', userId)
      .maybeSingle();

    if (!user) return [];

    const indicators: TrustIndicator[] = [];
    if (user.is_admin) indicators.push('admin');

    if (user.is_seller) {
      if (user.is_verified) indicators.push('verified_seller');

      // New seller: joined within 30 days
      const joinedDate = new Date(user.created_at);
      const daysSinceJoin = (Date.now() - joinedDate.getTime()) / 86400000;
      if (daysSinceJoin < 30) indicators.push('new_seller');
    }

    if (!user.is_seller && user.is_verified) {
      indicators.push('verified_buyer');
    }

    return indicators;
  } catch {
    return [];
  }
}

// ─── Chat Analytics ────────────────────────────────────────────────────────────

export function useChatAnalytics(userId: string | null) {
  const [analytics, setAnalytics] = useState<{
    newConversations: number;
    avgResponseTime: number | null;
    messagesSent: number;
    messagesReceived: number;
    unreadCount: number;
    topInquiryProducts: { product_id: string; product_name: string; count: number }[];
    peakHours: { hour: number; count: number }[];
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString();

      // New conversations in last 7 days
      const { count: newConvs } = await supabase
        .from('chat_conversations')
        .select('*', { count: 'exact', head: true })
        .or(`customer_id.eq.${userId},seller_id.eq.${userId}`)
        .gte('created_at', sevenDaysAgo);

      // Messages sent/received
      const { count: sent } = await supabase
        .from('chat_messages')
        .select('*', { count: 'exact', head: true })
        .eq('sender_id', userId)
        .gte('created_at', sevenDaysAgo);

      // Messages received: only count messages in conversations where this user is a participant
      // and the sender is someone else
      const { data: userConvIds } = await supabase
        .from('chat_conversations')
        .select('id')
        .or(`customer_id.eq.${userId},seller_id.eq.${userId}`);

      let received = 0;
      if (userConvIds && userConvIds.length > 0) {
        const convIdList = userConvIds.map(c => c.id);
        const { count: receivedCount } = await supabase
          .from('chat_messages')
          .select('*', { count: 'exact', head: true })
          .neq('sender_id', userId)
          .in('conversation_id', convIdList)
          .gte('created_at', sevenDaysAgo);
        received = receivedCount || 0;
      }

      // Unread count
      const { data: convs } = await supabase
        .from('chat_conversations')
        .select('customer_id, seller_id, customer_unread_count, seller_unread_count')
        .or(`customer_id.eq.${userId},seller_id.eq.${userId}`);

      const unreadCount = (convs || []).reduce((sum, c) => {
        return sum + (c.customer_id === userId ? c.customer_unread_count : c.seller_unread_count);
      }, 0);

      // Top inquiry products
      const { data: topProducts } = await supabase
        .from('chat_conversations')
        .select('product_id, context_data')
        .not('product_id', 'is', null)
        .or(`customer_id.eq.${userId},seller_id.eq.${userId}`)
        .limit(200);

      const productCountMap = new Map<string, { name: string; count: number }>();
      for (const c of (topProducts || [])) {
        if (!c.product_id) continue;
        const existing = productCountMap.get(c.product_id);
        const name = (c.context_data as { title?: string } | null)?.title || 'Unknown';
        if (existing) existing.count++;
        else productCountMap.set(c.product_id, { name, count: 1 });
      }
      const topInquiryProducts = [...productCountMap.entries()]
        .map(([pid, v]) => ({ product_id: pid, product_name: v.name, count: v.count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Peak hours from messages
      const { data: recentMsgs } = await supabase
        .from('chat_messages')
        .select('created_at')
        .or(`sender_id.eq.${userId}`)
        .gte('created_at', sevenDaysAgo)
        .limit(500);

      const hourCounts = new Map<number, number>();
      for (const m of (recentMsgs || [])) {
        const h = new Date(m.created_at).getHours();
        hourCounts.set(h, (hourCounts.get(h) || 0) + 1);
      }
      const peakHours = [...hourCounts.entries()]
        .map(([hour, count]) => ({ hour, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      setAnalytics({
        newConversations: newConvs || 0,
        avgResponseTime: null,
        messagesSent: sent || 0,
        messagesReceived: received || 0,
        unreadCount,
        topInquiryProducts,
        peakHours,
      });
    } catch (err) {
      console.error('useChatAnalytics error:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { analytics, loading, refetch: fetch };
}

// ─── Bulk Actions ──────────────────────────────────────────────────────────────

export async function bulkMarkRead(conversationIds: string[], userId: string): Promise<void> {
  if (conversationIds.length === 0) return;
  for (const id of conversationIds) {
    const { data: conv } = await supabase
      .from('chat_conversations')
      .select('customer_id, seller_id')
      .eq('id', id)
      .maybeSingle();
    if (!conv) continue;
    const isCustomer = conv.customer_id === userId;
    await supabase.from('chat_conversations')
      .update({ [isCustomer ? 'customer_unread_count' : 'seller_unread_count']: 0 })
      .eq('id', id);
  }
}

export async function bulkMarkUnread(conversationIds: string[], userId: string): Promise<void> {
  if (conversationIds.length === 0) return;
  for (const id of conversationIds) {
    const { data: conv } = await supabase
      .from('chat_conversations')
      .select('customer_id, seller_id')
      .eq('id', id)
      .maybeSingle();
    if (!conv) continue;
    const isCustomer = conv.customer_id === userId;
    await supabase.from('chat_conversations')
      .update({ [isCustomer ? 'customer_unread_count' : 'seller_unread_count']: 1 })
      .eq('id', id);
  }
}

export async function bulkApplyLabels(conversationIds: string[], labelId: string, userId: string): Promise<void> {
  if (conversationIds.length === 0) return;
  const rows = conversationIds.map(cid => ({
    conversation_id: cid,
    label_id: labelId,
    applied_by: userId,
  }));
  await supabase.from('chat_conversation_labels').upsert(rows, { onConflict: 'conversation_id,label_id' });
}

// ─── Audit Logging (admin) ────────────────────────────────────────────────────

export async function logAuditAction(params: {
  adminId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  conversationId?: string | null;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    await supabase.from('chat_audit_logs').insert({
      admin_id: params.adminId,
      action: params.action,
      target_type: params.targetType,
      target_id: params.targetId || null,
      conversation_id: params.conversationId || null,
      details: params.details || null,
    });
  } catch (err) {
    console.error('logAuditAction error:', err);
  }
}

// ─── Advanced Search ───────────────────────────────────────────────────────────

export async function advancedChatSearch(params: {
  userId: string;
  query: string;
  isAdmin: boolean;
}): Promise<{ conversationId: string; messageId: string; snippet: string; sender: string; createdAt: string }[]> {
  const { userId, query, isAdmin } = params;
  if (!query.trim()) return [];

  try {
    // Search messages
    let convFilter = isAdmin
      ? supabase.from('chat_messages')
      : supabase.from('chat_messages');

    const { data: msgResults } = await convFilter
      .select('id, conversation_id, body, sender_id, created_at')
      .ilike('body', `%${query}%`)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!msgResults || msgResults.length === 0) return [];

    // Filter to conversations user can see
    const convIds = [...new Set(msgResults.map(m => m.conversation_id))];
    let convQ = supabase.from('chat_conversations').select('id').in('id', convIds);
    if (!isAdmin) {
      convQ = convQ.or(`customer_id.eq.${userId},seller_id.eq.${userId}`);
    }
    const { data: visibleConvs } = await convQ;
    const visibleConvIds = new Set((visibleConvs || []).map(c => c.id));

    // Get sender names
    const senderIds = [...new Set(msgResults.map(m => m.sender_id))];
    const { data: users } = await supabase
      .from('users').select('id, full_name, email').in('id', senderIds);
    const userMap = new Map((users || []).map(u => [u.id, u.full_name || u.email || 'Unknown']));

    return msgResults
      .filter(m => visibleConvIds.has(m.conversation_id))
      .map(m => ({
        conversationId: m.conversation_id,
        messageId: m.id,
        snippet: m.body.slice(0, 100),
        sender: userMap.get(m.sender_id) || 'Unknown',
        createdAt: m.created_at,
      }));
  } catch (err) {
    console.error('advancedChatSearch error:', err);
    return [];
  }
}
