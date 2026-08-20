// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT Notification Insights & Analytics
// User-facing analytics: unread counts, most common types, active days/hours,
// response time, acted-upon vs ignored, archived counts.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';

export interface NotificationInsights {
  totalNotifications: number;
  unreadCount: number;
  readCount: number;
  archivedCount: number;
  deletedCount: number;
  actedUponCount: number;
  ignoredCount: number;
  mostCommonTypes: { type: string; count: number }[];
  mostActiveDays: { day: string; count: number }[];
  mostActiveHours: { hour: number; count: number }[];
  averageResponseTimeHours: number | null;
  responseRate: number;
  archiveRate: number;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function useNotificationInsights(userId: string | null, days = 30) {
  const [insights, setInsights] = useState<NotificationInsights | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data, error } = await supabase
        .from('notifications')
        .select('notification_type, is_read, is_archived, is_deleted, created_at, read_at, metadata')
        .eq('user_id', userId)
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;
      const notifs = (data || []) as Record<string, unknown>[];

      // Basic counts
      const unreadCount = notifs.filter(n => !n.is_read && !n.is_archived && !n.is_deleted).length;
      const readCount = notifs.filter(n => n.is_read === true).length;
      const archivedCount = notifs.filter(n => n.is_archived === true).length;
      const deletedCount = notifs.filter(n => n.is_deleted === true).length;

      // Acted upon: has read_at and metadata.action_taken
      const actedUponCount = notifs.filter(n => n.is_read && (n.metadata as Record<string, unknown>)?.action_taken).length;
      const ignoredCount = notifs.filter(n => n.is_read && !(n.metadata as Record<string, unknown>)?.action_taken).length;

      // Most common types
      const typeCounts: Record<string, number> = {};
      for (const n of notifs) {
        const t = n.notification_type as string;
        typeCounts[t] = (typeCounts[t] || 0) + 1;
      }
      const mostCommonTypes = Object.entries(typeCounts)
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Most active days
      const dayCounts: Record<string, number> = {};
      for (const n of notifs) {
        const day = DAY_NAMES[new Date(n.created_at as string).getDay()];
        dayCounts[day] = (dayCounts[day] || 0) + 1;
      }
      const mostActiveDays = DAY_NAMES.map(day => ({ day, count: dayCounts[day] || 0 }))
        .sort((a, b) => b.count - a.count);

      // Most active hours
      const hourCounts: Record<number, number> = {};
      for (const n of notifs) {
        const hour = new Date(n.created_at as string).getHours();
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      }
      const mostActiveHours = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: hourCounts[h] || 0 }))
        .sort((a, b) => b.count - a.count);

      // Average response time (created_at → read_at)
      const readNotifs = notifs.filter(n => n.is_read && n.read_at);
      let totalResponseMs = 0;
      for (const n of readNotifs) {
        const created = new Date(n.created_at as string).getTime();
        const read = new Date(n.read_at as string).getTime();
        totalResponseMs += (read - created);
      }
      const avgResponseMs = readNotifs.length > 0 ? totalResponseMs / readNotifs.length : null;
      const averageResponseTimeHours = avgResponseMs != null ? avgResponseMs / 3600000 : null;

      // Rates
      const totalNonDeleted = notifs.filter(n => !n.is_deleted).length;
      const responseRate = totalNonDeleted > 0 ? Math.round((readCount / totalNonDeleted) * 100) : 0;
      const archiveRate = totalNonDeleted > 0 ? Math.round((archivedCount / totalNonDeleted) * 100) : 0;

      setInsights({
        totalNotifications: notifs.length,
        unreadCount,
        readCount,
        archivedCount,
        deletedCount,
        actedUponCount,
        ignoredCount,
        mostCommonTypes,
        mostActiveDays,
        mostActiveHours,
        averageResponseTimeHours,
        responseRate,
        archiveRate,
      });
    } catch (err) {
      console.error('useNotificationInsights error:', err);
    } finally {
      setLoading(false);
    }
  }, [userId, days]);

  useEffect(() => { fetch(); }, [fetch]);

  return { insights, loading, refetch: fetch };
}
