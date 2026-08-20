// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT Notification Production Backend Hooks (Part 4)
// Reminder engine, delivery tracking, audit logging, activity feed persistence,
// and user notification statistics. All hooks use Supabase realtime for
// instant synchronization.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabase';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ReminderStatus = 'pending' | 'sent' | 'completed' | 'cancelled' | 'expired';
export type DeliveryStatus =
  | 'created' | 'queued' | 'delivered' | 'read'
  | 'archived' | 'deleted' | 'expired' | 'dismissed';

export interface ReminderItem {
  id: string;
  reminder_type: string;
  title: string;
  message: string;
  related_id: string | null;
  related_type: string | null;
  status: ReminderStatus;
  scheduled_for: string;
  sent_at: string | null;
  completed_at: string | null;
  priority: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface DeliveryLogEntry {
  id: string;
  notification_id: string;
  status: DeliveryStatus;
  channel: string;
  created_at: string;
  queued_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  archived_at: string | null;
  dismissed_at: string | null;
  expired_at: string | null;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  notification_id: string | null;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface ActivityFeedItem {
  id: string;
  event_type: string;
  category: string;
  title: string;
  description: string | null;
  related_id: string | null;
  related_type: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// ─── Audit Logging (fire-and-forget) ───────────────────────────────────────────

export async function logAuditAction(
  actorId: string | null,
  action: string,
  notificationId?: string | null,
  targetType?: string | null,
  targetId?: string | null,
  details?: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase.from('notification_audit_log').insert({
      actor_id: actorId,
      action,
      notification_id: notificationId || null,
      target_type: targetType || null,
      target_id: targetId || null,
      details: details || null,
    });
  } catch (err) {
    console.error('logAuditAction error:', err);
  }
}

// ─── Delivery Tracking ──────────────────────────────────────────────────────────

export async function createDeliveryLog(
  notificationId: string,
  userId: string,
  channel: string = 'in_app',
): Promise<void> {
  try {
    await supabase.from('notification_delivery_logs').insert({
      notification_id: notificationId,
      user_id: userId,
      status: 'created',
      channel,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('createDeliveryLog error:', err);
  }
}

export async function updateDeliveryStatus(
  notificationId: string,
  status: DeliveryStatus,
): Promise<void> {
  const now = new Date().toISOString();
  const patch: Record<string, string> = { status };
  if (status === 'queued') patch.queued_at = now;
  if (status === 'delivered') patch.delivered_at = now;
  if (status === 'read') patch.read_at = now;
  if (status === 'archived') patch.archived_at = now;
  if (status === 'dismissed') patch.dismissed_at = now;
  if (status === 'expired') patch.expired_at = now;

  try {
    await supabase
      .from('notification_delivery_logs')
      .update(patch)
      .eq('notification_id', notificationId);
  } catch (err) {
    console.error('updateDeliveryStatus error:', err);
  }
}

// ─── Reminder Engine Hook ───────────────────────────────────────────────────────

export function useReminders(userId: string | null) {
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetch = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    try {
      const { data, error } = await supabase
        .from('notification_reminders')
        .select('*')
        .eq('user_id', userId)
        .in('status', ['pending', 'sent'])
        .order('scheduled_for', { ascending: true })
        .limit(50);
      if (error) throw error;
      setReminders((data || []) as ReminderItem[]);
      const pending = (data || []).filter((r: ReminderItem) => r.status === 'pending').length;
      setPendingCount(pending);
    } catch (err) {
      console.error('useReminders fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetch();

    if (!userId) return;
    const channelName = `reminders-${userId}`;
    const existing = supabase.getChannels().find(c => c.topic === `realtime:${channelName}`);
    if (existing) supabase.removeChannel(existing);

    const ch = supabase.channel(channelName);
    ch.on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'notification_reminders',
      filter: `user_id=eq.${userId}`,
    }, () => fetch());
    ch.subscribe();
    channelRef.current = ch;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [userId, fetch]);

  const createReminder = useCallback(async (
    reminderType: string,
    title: string,
    message: string,
    scheduledFor: Date,
    relatedId?: string,
    relatedType?: string,
    priority?: string,
    metadata?: Record<string, unknown>,
  ) => {
    if (!userId) return;
    try {
      const { data, error } = await supabase.from('notification_reminders').insert({
        user_id: userId,
        reminder_type: reminderType,
        title,
        message,
        related_id: relatedId || null,
        related_type: relatedType || null,
        status: 'pending',
        scheduled_for: scheduledFor.toISOString(),
        priority: priority || 'normal',
        metadata: metadata || null,
      }).select().single();
      if (error) throw error;
      logAuditAction(userId, 'reminder_created', null, 'reminder', data.id);
      fetch();
      return data;
    } catch (err) {
      console.error('createReminder error:', err);
    }
  }, [userId, fetch]);

  const completeReminder = useCallback(async (id: string) => {
    try {
      await supabase.from('notification_reminders')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', id);
      logAuditAction(userId, 'reminder_completed', null, 'reminder', id);
      fetch();
    } catch (err) {
      console.error('completeReminder error:', err);
    }
  }, [userId, fetch]);

  const cancelReminder = useCallback(async (id: string) => {
    try {
      await supabase.from('notification_reminders')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('id', id);
      logAuditAction(userId, 'reminder_cancelled', null, 'reminder', id);
      fetch();
    } catch (err) {
      console.error('cancelReminder error:', err);
    }
  }, [userId, fetch]);

  return {
    reminders,
    pendingCount,
    loading,
    createReminder,
    completeReminder,
    cancelReminder,
    refetch: fetch,
  };
}

// ─── Activity Feed Hook (persisted, search, filter, pagination) ────────────────

export function useActivityFeed(userId: string | null, options?: {
  category?: string;
  search?: string;
  pageSize?: number;
}) {
  const [items, setItems] = useState<ActivityFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const cursorRef = useRef<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pageSize = options?.pageSize || 30;

  const buildQuery = useCallback((page: number) => {
    let query = supabase.from('activity_feed').select('*', { count: 'exact' }).eq('user_id', userId!);

    if (options?.category && options.category !== 'all') {
      query = query.eq('category', options.category);
    }

    if (options?.search?.trim()) {
      query = query.or(`title.ilike.%${options.search.trim()}%,description.ilike.%${options.search.trim()}%`);
    }

    query = query.order('created_at', { ascending: false });

    if (page > 0 && cursorRef.current) {
      query = query.lt('created_at', cursorRef.current);
    }

    return query.limit(pageSize);
  }, [userId, options?.category, options?.search, pageSize]);

  const fetch = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    setHasMore(true);
    cursorRef.current = null;
    try {
      const { data, error, count } = await buildQuery(0);
      if (error) throw error;
      setItems((data || []) as ActivityFeedItem[]);
      setTotalCount(count || 0);
      if ((data || []).length < pageSize) setHasMore(false);
      if ((data || []).length > 0) cursorRef.current = (data as ActivityFeedItem[])[0].created_at;
    } catch (err) {
      console.error('useActivityFeed fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [buildQuery, userId, pageSize]);

  const loadMore = useCallback(async () => {
    if (!userId || !hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const { data, error } = await buildQuery(1);
      if (error) throw error;
      const newItems = (data || []) as ActivityFeedItem[];
      if (newItems.length === 0) {
        setHasMore(false);
      } else {
        setItems(prev => [...prev, ...newItems]);
        if (newItems.length < pageSize) setHasMore(false);
        cursorRef.current = newItems[newItems.length - 1].created_at;
      }
    } catch (err) {
      console.error('useActivityFeed loadMore error:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [buildQuery, userId, hasMore, loadingMore, pageSize]);

  useEffect(() => {
    fetch();

    if (!userId) return;
    const channelName = `activity-feed-${userId}`;
    const existing = supabase.getChannels().find(c => c.topic === `realtime:${channelName}`);
    if (existing) supabase.removeChannel(existing);

    const ch = supabase.channel(channelName);
    ch.on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'activity_feed',
      filter: `user_id=eq.${userId}`,
    }, () => fetch());
    ch.subscribe();
    channelRef.current = ch;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [userId, fetch]);

  return { items, loading, hasMore, loadingMore, loadMore, totalCount, refetch: fetch };
}

// ─── Persist Activity Event (fire-and-forget) ──────────────────────────────────

export async function persistActivityEvent(
  userId: string,
  eventType: string,
  category: string,
  title: string,
  description?: string,
  relatedId?: string,
  relatedType?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase.from('activity_feed').insert({
      user_id: userId,
      event_type: eventType,
      category,
      title,
      description: description || null,
      related_id: relatedId || null,
      related_type: relatedType || null,
      metadata: metadata || null,
    });
  } catch (err) {
    console.error('persistActivityEvent error:', err);
  }
}

// ─── User Notification Statistics Hook ──────────────────────────────────────────

export function useNotificationStatistics(userId: string | null) {
  const [stats, setStats] = useState<Record<string, unknown>[] | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    try {
      const { data, error } = await supabase
        .from('user_notification_statistics')
        .select('*')
        .eq('user_id', userId)
        .order('period_start', { ascending: false })
        .limit(30);
      if (error) throw error;
      setStats(data || []);
    } catch (err) {
      console.error('useNotificationStatistics error:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { stats, loading, refetch: fetch };
}

// ─── Delivery Analytics Hook ────────────────────────────────────────────────────

export function useDeliveryAnalytics(userId: string | null, days = 30) {
  const [analytics, setAnalytics] = useState<{
    deliveryRate: number;
    readRate: number;
    dismissRate: number;
    archiveRate: number;
    totalTracked: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data, error } = await supabase
        .from('notification_delivery_logs')
        .select('status')
        .eq('user_id', userId)
        .gte('created_at', startDate.toISOString());
      if (error) throw error;

      const logs = (data || []) as { status: string }[];
      const total = logs.length;
      const delivered = logs.filter(l => ['delivered', 'read', 'archived', 'dismissed'].includes(l.status)).length;
      const read = logs.filter(l => ['read', 'archived', 'dismissed'].includes(l.status)).length;
      const dismissed = logs.filter(l => l.status === 'dismissed').length;
      const archived = logs.filter(l => l.status === 'archived').length;

      setAnalytics({
        deliveryRate: total > 0 ? Math.round((delivered / total) * 100) : 0,
        readRate: total > 0 ? Math.round((read / total) * 100) : 0,
        dismissRate: total > 0 ? Math.round((dismissed / total) * 100) : 0,
        archiveRate: total > 0 ? Math.round((archived / total) * 100) : 0,
        totalTracked: total,
      });
    } catch (err) {
      console.error('useDeliveryAnalytics error:', err);
    } finally {
      setLoading(false);
    }
  }, [userId, days]);

  useEffect(() => { fetch(); }, [fetch]);

  return { analytics, loading, refetch: fetch };
}

// ─── Dashboard Counter Sync Hook ────────────────────────────────────────────────
// Single shared realtime channel for dashboard notification badge counters.
// Deduplicates subscriptions across multiple dashboard widgets.

const counterChannelRef: { current: ReturnType<typeof supabase.channel> | null } = { current: null };
const counterCallbacks = new Set<(count: number) => void>();
let counterUserId: string | null = null;

export function useNotificationCounter(userId: string | null) {
  const [count, setCount] = useState(0);

  const fetchCount = useCallback(async () => {
    if (!userId) return;
    try {
      const { count: c } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false)
        .eq('is_deleted', false)
        .eq('is_archived', false);
      setCount(c || 0);
      counterCallbacks.forEach(cb => cb(c || 0));
    } catch (err) {
      console.error('useNotificationCounter error:', err);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    fetchCount();

    // Use shared channel to avoid duplicate subscriptions
    if (counterUserId !== userId) {
      if (counterChannelRef.current) {
        supabase.removeChannel(counterChannelRef.current);
      }
      counterUserId = userId;
      const channelName = `notif-counter-${userId}`;
      const existing = supabase.getChannels().find(c => c.topic === `realtime:${channelName}`);
      if (existing) supabase.removeChannel(existing);

      const ch = supabase.channel(channelName);
      ch.on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      }, () => {
        counterCallbacks.forEach(() => {
          // Trigger refetch for all subscribers
        });
        // Refetch the actual count
        supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('is_read', false)
          .eq('is_deleted', false)
          .eq('is_archived', false)
          .then(({ count: c }) => {
            counterCallbacks.forEach(cb => cb(c || 0));
          });
      });
      ch.subscribe();
      counterChannelRef.current = ch;
    }

    const callback = (c: number) => setCount(c);
    counterCallbacks.add(callback);

    return () => {
      counterCallbacks.delete(callback);
    };
  }, [userId, fetchCount]);

  return { count, refetch: fetchCount };
}
