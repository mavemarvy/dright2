// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT Notification AI Summary Engine
// Provider-agnostic AI summaries: daily, weekly, monthly.
// Generates smart summaries from notification data without requiring an external
// AI API — uses statistical aggregation and templated natural language.
// Designed so a real AI provider (OpenAI, Anthropic, etc.) can be plugged in
// later by replacing the `generateSummaryText` function.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import type { NotificationCategory } from './types';

export type SummaryPeriod = 'daily' | 'weekly' | 'monthly';

export interface SummaryLine {
  icon: string;
  text: string;
  category: NotificationCategory;
  count: number;
}

export interface SummaryData {
  period: SummaryPeriod;
  dateRange: { start: string; end: string };
  lines: SummaryLine[];
  highlights: string[];
  totalNotifications: number;
  unreadCount: number;
  topCategory: NotificationCategory | null;
  generatedAt: string;
}

export interface MonthlyInsight {
  label: string;
  value: string;
  trend: 'up' | 'down' | 'stable';
  trendPercent: number;
}

// ─── AI Provider Interface (for future integration) ────────────────────────────

export interface AIProvider {
  generateSummary(data: Record<string, unknown>, period: SummaryPeriod): Promise<string>;
  generateInsights(data: Record<string, unknown>): Promise<MonthlyInsight[]>;
}

export function setAIProvider(_provider: AIProvider | null) {
  // AI provider integration point for Part 4
}

// ─── Summary Generation ────────────────────────────────────────────────────────

export function useNotificationSummary(userId: string | null, period: SummaryPeriod = 'daily') {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  const generate = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    try {
      const now = new Date();
      const start = new Date(now);
      if (period === 'daily') start.setHours(0, 0, 0, 0);
      else if (period === 'weekly') start.setDate(start.getDate() - 7);
      else start.setDate(start.getDate() - 30);

      const { data: notifications, error } = await supabase
        .from('notifications')
        .select('notification_type, category, is_read, created_at, metadata, priority')
        .eq('user_id', userId)
        .eq('is_deleted', false)
        .gte('created_at', start.toISOString())
        .lte('created_at', now.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;
      const notifs = notifications || [];

      // Aggregate by category
      const categoryCounts: Record<string, number> = {};
      const typeCounts: Record<string, number> = {};
      let unreadCount = 0;

      for (const n of notifs) {
        const cat = n.category || 'system';
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
        typeCounts[n.notification_type] = (typeCounts[n.notification_type] || 0) + 1;
        if (!n.is_read) unreadCount++;
      }

      // Build summary lines
      const lines: SummaryLine[] = [];
      const categoryLabels: Record<string, string> = {
        messages: 'customer messages',
        orders: 'marketplace sales',
        services: 'service bookings',
        jobs: 'job applications',
        referrals: 'referral rewards',
        wallet: 'wallet transactions',
        store: 'store updates',
        followers: 'new followers',
        reviews: 'new reviews',
        affiliate: 'affiliate commissions',
        security: 'security alerts',
        promotions: 'promotions',
        admin: 'admin notices',
        system: 'system notifications',
        ai: 'AI recommendations',
        marketplace: 'marketplace updates',
      };

      for (const [cat, count] of Object.entries(categoryCounts)) {
        const label = categoryLabels[cat] || cat;
        lines.push({
          icon: cat,
          text: `${count} ${label}`,
          category: cat as NotificationCategory,
          count,
        });
      }

      lines.sort((a, b) => b.count - a.count);

      // Top category
      const topCategory = lines.length > 0 ? lines[0].category : null;

      // Highlights
      const highlights: string[] = [];
      if (categoryCounts['orders']) highlights.push(`${categoryCounts['orders']} sales completed`);
      if (categoryCounts['wallet']) {
        // Sum wallet amounts from metadata
        const walletNotifs = notifs.filter((n: Record<string, unknown>) => n.category === 'wallet');
        const totalAmount = walletNotifs.reduce((sum: number, n: Record<string, unknown>) => {
          const meta = (n.metadata || {}) as Record<string, unknown>;
          return sum + (typeof meta.amount === 'number' ? meta.amount : 0);
        }, 0);
        if (totalAmount > 0) highlights.push(`Wallet credited ${totalAmount.toLocaleString()}`);
      }
      if (categoryCounts['followers']) highlights.push(`Store gained ${categoryCounts['followers']} new followers`);
      if (categoryCounts['reviews']) highlights.push(`${categoryCounts['reviews']} new reviews received`);
      if (categoryCounts['affiliate']) highlights.push(`${categoryCounts['affiliate']} affiliate commissions earned`);

      setSummary({
        period,
        dateRange: { start: start.toISOString(), end: now.toISOString() },
        lines,
        highlights,
        totalNotifications: notifs.length,
        unreadCount,
        topCategory,
        generatedAt: now.toISOString(),
      });
    } catch (err) {
      console.error('useNotificationSummary error:', err);
    } finally {
      setLoading(false);
    }
  }, [userId, period]);

  useEffect(() => { generate(); }, [generate]);

  return { summary, loading, regenerate: generate };
}

// ─── Monthly Insights ────────────────────────────────────────────────────────────

export function useMonthlyInsights(userId: string | null) {
  const [insights, setInsights] = useState<MonthlyInsight[]>([]);
  const [loading, setLoading] = useState(true);

  const generate = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    try {
      const now = new Date();
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

      // This month's notifications
      const { data: thisMonth } = await supabase
        .from('notifications')
        .select('category, metadata, created_at')
        .eq('user_id', userId)
        .eq('is_deleted', false)
        .gte('created_at', thisMonthStart.toISOString())
        .lte('created_at', now.toISOString());

      // Last month's notifications
      const { data: lastMonth } = await supabase
        .from('notifications')
        .select('category, metadata, created_at')
        .eq('user_id', userId)
        .eq('is_deleted', false)
        .gte('created_at', lastMonthStart.toISOString())
        .lte('created_at', lastMonthEnd.toISOString());

      const thisData = thisMonth || [];
      const lastData = lastMonth || [];

      const calcPercentChange = (current: number, previous: number): number => {
        if (previous === 0) return current > 0 ? 100 : 0;
        return Math.round(((current - previous) / previous) * 100);
      };

      const thisSales = thisData.filter((n: Record<string, unknown>) => n.category === 'orders').length;
      const lastSales = lastData.filter((n: Record<string, unknown>) => n.category === 'orders').length;
      const thisReviews = thisData.filter((n: Record<string, unknown>) => n.category === 'reviews').length;
      const lastReviews = lastData.filter((n: Record<string, unknown>) => n.category === 'reviews').length;
      const thisFollowers = thisData.filter((n: Record<string, unknown>) => n.category === 'followers').length;
      const lastFollowers = lastData.filter((n: Record<string, unknown>) => n.category === 'followers').length;
      const thisCommissions = thisData.filter((n: Record<string, unknown>) => n.category === 'affiliate').length;
      const lastCommissions = lastData.filter((n: Record<string, unknown>) => n.category === 'affiliate').length;

      // Top category this month
      const catCounts: Record<string, number> = {};
      for (const n of thisData) {
        const cat = (n as Record<string, unknown>).category as string || 'system';
        catCounts[cat] = (catCounts[cat] || 0) + 1;
      }
      const topCat = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0];

      const result: MonthlyInsight[] = [
        {
          label: 'Sales Activity',
          value: `${thisSales} sales`,
          trend: thisSales > lastSales ? 'up' : thisSales < lastSales ? 'down' : 'stable',
          trendPercent: calcPercentChange(thisSales, lastSales),
        },
        {
          label: 'Reviews Received',
          value: `${thisReviews} reviews`,
          trend: thisReviews > lastReviews ? 'up' : thisReviews < lastReviews ? 'down' : 'stable',
          trendPercent: calcPercentChange(thisReviews, lastReviews),
        },
        {
          label: 'New Followers',
          value: `${thisFollowers} followers`,
          trend: thisFollowers > lastFollowers ? 'up' : thisFollowers < lastFollowers ? 'down' : 'stable',
          trendPercent: calcPercentChange(thisFollowers, lastFollowers),
        },
        {
          label: 'Affiliate Commissions',
          value: `${thisCommissions} commissions`,
          trend: thisCommissions > lastCommissions ? 'up' : thisCommissions < lastCommissions ? 'down' : 'stable',
          trendPercent: calcPercentChange(thisCommissions, lastCommissions),
        },
        {
          label: 'Most Active Category',
          value: topCat ? topCat[0] : 'N/A',
          trend: 'stable',
          trendPercent: 0,
        },
        {
          label: 'Total Notifications',
          value: `${thisData.length} total`,
          trend: thisData.length > lastData.length ? 'up' : thisData.length < lastData.length ? 'down' : 'stable',
          trendPercent: calcPercentChange(thisData.length, lastData.length),
        },
      ];

      setInsights(result);
    } catch (err) {
      console.error('useMonthlyInsights error:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { generate(); }, [generate]);

  return { insights, loading, regenerate: generate };
}

// ─── Smart Grouping ──────────────────────────────────────────────────────────────

export interface GroupedNotification {
  groupKey: string;
  category: NotificationCategory;
  count: number;
  preview: string;
  items: Record<string, unknown>[];
}

export function groupSimilarNotifications(notifications: Record<string, unknown>[]): GroupedNotification[] {
  const groups = new Map<string, GroupedNotification>();
  for (const n of notifications) {
    const groupKey = (n.group_key as string) || (n.notification_type as string);
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        groupKey,
        category: (n.category as NotificationCategory) || 'system',
        count: 0,
        preview: (n.message as string) || '',
        items: [],
      });
    }
    const group = groups.get(groupKey)!;
    group.count++;
    group.items.push(n);
  }
  // Only return groups with more than 1 item (actually grouped)
  return Array.from(groups.values()).filter(g => g.count > 1)
    .sort((a, b) => b.count - a.count);
}
