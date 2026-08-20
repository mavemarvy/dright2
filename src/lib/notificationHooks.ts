import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabase';
import type {
  NotificationItem,
  NotificationCategory,
  NotificationPriority,
  NotificationType,
} from './types';

// ─── Category → Type mapping ──────────────────────────────────────────────────

const CATEGORY_TYPE_MAP: Record<NotificationCategory, NotificationType[]> = {
  all: [],
  unread: [],
  messages: ['chat_message', 'new_message', 'attachment_received', 'conversation_started'],
  marketplace: ['new_order', 'order_status', 'edit_approved', 'edit_rejected', 'low_stock'],
  services: ['service_booking'],
  jobs: ['job_application'],
  orders: ['new_order', 'order_status'],
  wallet: ['wallet_withdrawal', 'wallet_deposit'],
  affiliate: ['affiliate_commission'],
  referrals: ['referral_signup', 'referral_commission'],
  store: ['store_update'],
  followers: ['new_follower'],
  reviews: ['new_review'],
  security: ['security_alert', 'report_created'],
  promotions: ['promotion'],
  admin: ['admin_notice', 'announcement'],
  system: ['system_alert'],
  ai: ['ai_summary'],
};

export function getTypesForCategory(cat: NotificationCategory): NotificationType[] | null {
  return CATEGORY_TYPE_MAP[cat] ?? null;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type SortOption = 'newest' | 'oldest' | 'priority' | 'unread_first' | 'category' | 'alphabetical';
export type DateFilter = 'today' | 'yesterday' | 'last_7' | 'last_30' | 'this_year' | 'all';

export interface NotificationFilters {
  category: NotificationCategory;
  dateRange: DateFilter;
  showArchived: boolean;
  showRead: boolean;
  showUnread: boolean;
  priorityFilter: NotificationPriority | 'all';
  sort: SortOption;
  search: string;
}

export const DEFAULT_FILTERS: NotificationFilters = {
  category: 'all',
  dateRange: 'all',
  showArchived: false,
  showRead: true,
  showUnread: true,
  priorityFilter: 'all',
  sort: 'newest',
  search: '',
};

const PAGE_SIZE = 30;

// ─── Relative time ────────────────────────────────────────────────────────────

export function notificationRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// ─── Date group label ──────────────────────────────────────────────────────────

export function getDateGroupLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const oneWeekAgo = new Date(today.getTime() - 7 * 86400000);
  const twoWeeksAgo = new Date(today.getTime() - 14 * 86400000);

  if (date >= today) return 'Today';
  if (date >= yesterday) return 'Yesterday';
  if (date >= oneWeekAgo) return 'This Week';
  if (date >= twoWeeksAgo) return 'Last Week';
  return 'Earlier';
}

// ─── Main hook ────────────────────────────────────────────────────────────────

export function useNotifications(userId: string | null, filters: NotificationFilters) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const cursorRef = useRef<string | null>(null);

  const buildQuery = useCallback((page: number) => {
    let query = supabase.from('notifications').select('*').eq('user_id', userId!);

    // Exclude soft-deleted
    query = query.eq('is_deleted', false);

    // Archive filter
    query = query.eq('is_archived', filters.showArchived);

    // Category filter
    if (filters.category === 'unread') {
      query = query.eq('is_read', false);
    } else if (filters.category !== 'all') {
      const types = getTypesForCategory(filters.category);
      if (types && types.length > 0) {
        query = query.in('notification_type', types);
      }
    }

    // Read/unread filter
    if (!filters.showRead && filters.showUnread) {
      query = query.eq('is_read', false);
    } else if (filters.showRead && !filters.showUnread) {
      query = query.eq('is_read', true);
    }

    // Priority filter
    if (filters.priorityFilter !== 'all') {
      query = query.eq('priority', filters.priorityFilter);
    }

    // Date range filter
    if (filters.dateRange !== 'all') {
      const now = new Date();
      let startDate: Date;
      switch (filters.dateRange) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'yesterday':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
          break;
        case 'last_7':
          startDate = new Date(now.getTime() - 7 * 86400000);
          break;
        case 'last_30':
          startDate = new Date(now.getTime() - 30 * 86400000);
          break;
        case 'this_year':
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
        default:
          startDate = new Date(0);
      }
      query = query.gte('created_at', startDate.toISOString());
    }

    // Search
    if (filters.search.trim()) {
      query = query.or(`title.ilike.%${filters.search.trim()}%,message.ilike.%${filters.search.trim()}%`);
    }

    // Sort
    switch (filters.sort) {
      case 'oldest':
        query = query.order('created_at', { ascending: true });
        break;
      case 'priority':
        query = query.order('priority', { ascending: false }).order('created_at', { ascending: false });
        break;
      case 'unread_first':
        query = query.order('is_read', { ascending: true }).order('created_at', { ascending: false });
        break;
      case 'category':
        query = query.order('category', { ascending: true }).order('created_at', { ascending: false });
        break;
      case 'alphabetical':
        query = query.order('title', { ascending: true });
        break;
      default:
        query = query.order('created_at', { ascending: false });
    }

    // Pagination
    if (page > 0 && cursorRef.current) {
      query = query.lt('created_at', cursorRef.current);
    }

    return query.limit(PAGE_SIZE);
  }, [userId, filters]);

  const fetch = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setHasMore(true);
    cursorRef.current = null;
    try {
      const { data, error } = await buildQuery(0);
      if (error) throw error;
      const items = (data || []) as NotificationItem[];
      setNotifications(items);
      if (items.length < PAGE_SIZE) setHasMore(false);
      if (items.length > 0) cursorRef.current = items[items.length - 1].created_at;
    } catch (err) {
      console.error('useNotifications fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  const loadMore = useCallback(async () => {
    if (!userId || !hasMore || loadingMore || !cursorRef.current) return;
    setLoadingMore(true);
    try {
      const { data, error } = await buildQuery(1);
      if (error) throw error;
      const items = (data || []) as NotificationItem[];
      if (items.length === 0) {
        setHasMore(false);
      } else {
        setNotifications(prev => [...prev, ...items]);
        if (items.length < PAGE_SIZE) setHasMore(false);
        cursorRef.current = items[items.length - 1].created_at;
      }
    } catch (err) {
      console.error('useNotifications loadMore error:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [buildQuery, userId, hasMore, loadingMore]);

  // Fetch unread count + category counts
  const fetchCounts = useCallback(async () => {
    if (!userId) return;
    try {
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false)
        .eq('is_deleted', false)
        .eq('is_archived', false);
      setUnreadCount(count || 0);

      // Category unread counts
      const counts: Record<string, number> = {};
      const categories: NotificationCategory[] = [
        'messages', 'marketplace', 'services', 'jobs', 'orders',
        'wallet', 'affiliate', 'referrals', 'store', 'followers',
        'reviews', 'security', 'promotions', 'admin', 'system', 'ai',
      ];
      for (const cat of categories) {
        const types = getTypesForCategory(cat);
        if (types && types.length > 0) {
          const { count: catCount } = await supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('is_read', false)
            .eq('is_deleted', false)
            .eq('is_archived', false)
            .in('notification_type', types);
          counts[cat] = catCount || 0;
        }
      }
      setCategoryCounts(counts);
    } catch (err) {
      console.error('fetchCounts error:', err);
    }
  }, [userId]);

  // Realtime subscription
  useEffect(() => {
    if (!userId) return;
    fetch();
    fetchCounts();

    const channelName = `notif-center-${userId}`;
    const existing = supabase.getChannels().find(c => c.topic === `realtime:${channelName}`);
    if (existing) supabase.removeChannel(existing);

    const ch = supabase.channel(channelName);
    ch.on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'notifications',
      filter: `user_id=eq.${userId}`,
    }, () => {
      fetch();
      fetchCounts();
    });
    ch.on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'notifications',
      filter: `user_id=eq.${userId}`,
    }, () => {
      fetch();
      fetchCounts();
    });
    ch.on('postgres_changes', {
      event: 'DELETE',
      schema: 'public',
      table: 'notifications',
      filter: `user_id=eq.${userId}`,
    }, () => {
      fetch();
      fetchCounts();
    });
    ch.subscribe();
    channelRef.current = ch;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [userId, fetch, fetchCounts]);

  // Refetch when filters change
  useEffect(() => {
    if (userId) fetch();
  }, [filters, userId, fetch]);

  // ─── Actions ───────────────────────────────────────────────────────────────

  const markAsRead = useCallback(async (id: string) => {
    await supabase.from('notifications').update({ is_read: true, read_at: new Date().toISOString() }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  const markAsUnread = useCallback(async (id: string) => {
    await supabase.from('notifications').update({ is_read: false, read_at: null }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: false } : n));
    setUnreadCount(prev => prev + 1);
  }, []);

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    if (unreadIds.length === 0) return;
    await supabase.from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .in('id', unreadIds);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }, [userId, notifications]);

  const markSelectedRead = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    await supabase.from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .in('id', ids);
    setNotifications(prev => prev.map(n => selectedIds.has(n.id) ? { ...n, is_read: true } : n));
    setSelectedIds(new Set());
    fetchCounts();
  }, [selectedIds, fetchCounts]);

  const markSelectedUnread = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    await supabase.from('notifications').update({ is_read: false, read_at: null }).in('id', ids);
    setNotifications(prev => prev.map(n => selectedIds.has(n.id) ? { ...n, is_read: false } : n));
    setSelectedIds(new Set());
    fetchCounts();
  }, [selectedIds, fetchCounts]);

  const archive = useCallback(async (id: string) => {
    await supabase.from('notifications').update({ is_archived: true }).eq('id', id);
    setNotifications(prev => prev.filter(n => n.id !== id));
    fetchCounts();
  }, [fetchCounts]);

  const unarchive = useCallback(async (id: string) => {
    await supabase.from('notifications').update({ is_archived: false }).eq('id', id);
    setNotifications(prev => prev.filter(n => n.id !== id));
    fetchCounts();
  }, [fetchCounts]);

  const bulkArchive = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    await supabase.from('notifications').update({ is_archived: true }).in('id', ids);
    setNotifications(prev => prev.filter(n => !selectedIds.has(n.id)));
    setSelectedIds(new Set());
    fetchCounts();
  }, [selectedIds, fetchCounts]);

  const bulkRestore = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    await supabase.from('notifications').update({ is_archived: false, is_deleted: false }).in('id', ids);
    setNotifications(prev => prev.filter(n => !selectedIds.has(n.id)));
    setSelectedIds(new Set());
    fetchCounts();
  }, [selectedIds, fetchCounts]);

  const softDelete = useCallback(async (id: string) => {
    await supabase.from('notifications').update({ is_deleted: true }).eq('id', id);
    setNotifications(prev => prev.filter(n => n.id !== id));
    fetchCounts();
  }, [fetchCounts]);

  const bulkDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    await supabase.from('notifications').update({ is_deleted: true }).in('id', ids);
    setNotifications(prev => prev.filter(n => !selectedIds.has(n.id)));
    setSelectedIds(new Set());
    fetchCounts();
  }, [selectedIds, fetchCounts]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(notifications.map(n => n.id)));
  }, [notifications]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  return {
    notifications,
    loading,
    hasMore,
    loadingMore,
    loadMore,
    unreadCount,
    categoryCounts,
    selectedIds,
    markAsRead,
    markAsUnread,
    markAllRead,
    markSelectedRead,
    markSelectedUnread,
    archive,
    unarchive,
    bulkArchive,
    bulkRestore,
    softDelete,
    bulkDelete,
    toggleSelect,
    selectAll,
    clearSelection,
    refetch: fetch,
    refetchCounts: fetchCounts,
  };
}
