// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT Analytics Hooks — Server-verified dashboard data
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';

export interface SellerAnalytics {
  total_product_views: number;
  total_service_views: number;
  total_job_views: number;
  total_course_views: number;
  total_profile_views: number;
  today_views: number;
  '7d_views': number;
  '30d_views': number;
  unique_visitors: number;
  returning_visitors: number;
  favorites: number;
  shares: number;
  contact_clicks: number;
  chat_starts: number;
  checkout_starts: number;
  purchases: number;
  conversion_rate: number;
  revenue: number;
  orders: { total: number; pending: number; completed: number; cancelled: number };
  top_countries: { country: string; count: number }[];
  top_cities: { city: string; count: number }[];
  top_sources: { source: string; count: number }[];
  daily_views: { date: string; count: number }[];
}

export interface BuyerAnalytics {
  orders: number;
  pending_orders: number;
  completed_orders: number;
  total_spent: number;
  wishlist_count: number;
  viewed_products: { entity_id: string; name: string; image_url: string | null; viewed_at: string }[];
  recently_contacted: { seller_id: string; last_contact: string }[];
}

export interface AdminAnalytics {
  total_users: number;
  new_users_today: number;
  active_users_today: number;
  total_sellers: number;
  total_buyers: number;
  total_listings: number;
  active_listings: number;
  pending_listings: number;
  total_orders: number;
  completed_orders: number;
  pending_orders: number;
  cancelled_orders: number;
  total_revenue: number;
  total_views: number;
  total_searches: number;
  unique_visitors_30d: number;
  pending_verifications: number;
  pending_withdrawals: number;
  conversion_rate: number;
  daily_visitors: { date: string; visitors: number }[];
  daily_views: { date: string; views: number }[];
  daily_signups: { date: string; signups: number }[];
  top_categories: { category: string; count: number }[];
}

export function useSellerAnalytics(days = 30) {
  const [analytics, setAnalytics] = useState<SellerAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data, error: rpcError } = await supabase.rpc('get_seller_analytics', {
        p_seller_id: user.id,
        p_days: days,
      });

      if (rpcError) throw rpcError;
      setAnalytics(data as SellerAnalytics);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { refetch(); }, [refetch]);

  return { analytics, loading, error, refetch };
}

export function useBuyerAnalytics() {
  const [analytics, setAnalytics] = useState<BuyerAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoading(false); return; }

        const { data, error: rpcError } = await supabase.rpc('get_buyer_analytics', {
          p_buyer_id: user.id,
        });

        if (rpcError) throw rpcError;
        setAnalytics(data as BuyerAnalytics);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load analytics');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { analytics, loading, error };
}

export function useAdminAnalytics(days = 30) {
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('get_admin_analytics', {
        p_days: days,
      });

      if (rpcError) throw rpcError;
      setAnalytics(data as AdminAnalytics);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { refetch(); }, [refetch]);

  return { analytics, loading, error, refetch };
}

export function useAdminDailyActivity(days = 14) {
  const [activity, setActivity] = useState<{ date: string; views: number; purchases: number; signups: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.rpc('get_daily_activity_v2', { p_days: days });
        if (error) throw error;
        setActivity((data || []) as { date: string; views: number; purchases: number; signups: number }[]);
      } catch {
        setActivity([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [days]);

  return { activity, loading };
}
