// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT Analytics Hooks V2 — Server-verified, real-time dashboard data
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from 'react';
import { supabase } from './supabase';
import { useRealtimeAnalytics } from '../hooks/useRealtimeAnalytics';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SellerAnalyticsV2 {
  live_views: number;
  total_views: number;
  today_views: number;
  unique_visitors: number;
  returning_visitors: number;
  favorites: number;
  shares: number;
  chat_requests: number;
  phone_clicks: number;
  website_clicks: number;
  product_saves: number;
  cart_adds: number;
  checkout_starts: number;
  purchases: number;
  avg_session_time: number;
  bounce_rate: number;
  orders_total: number;
  orders_pending: number;
  orders_completed: number;
  orders_cancelled: number;
  revenue: number;
  conversion_rate: number;
  traffic_sources: { source: string; count: number }[];
  top_countries: { country: string; count: number }[];
  top_states: { state: string; count: number }[];
  top_cities: { city: string; count: number }[];
  device_breakdown: { device: string; count: number }[];
  os_breakdown: { os: string; count: number }[];
  browser_breakdown: { browser: string; count: number }[];
  daily_views: { date: string; count: number }[];
  daily_sales: { date: string; count: number }[];
  daily_revenue: { date: string; revenue: number }[];
  hourly_activity: { hour: number; count: number }[];
  languages: { language: string; count: number }[];
  timezones: { timezone: string; count: number }[];
}

export interface AdminAnalyticsV2 {
  total_users: number;
  new_users_today: number;
  live_active_users: number;
  online_sellers: number;
  online_buyers: number;
  visitors_today: number;
  visitors_this_month: number;
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
  refunds: number;
  disputes: number;
  open_chats: number;
  ai_requests: number;
  push_notifications_sent: number;
  emails_sent: number;
  affiliate_payouts: number;
  wallet_deposits: number;
  wallet_withdrawals: number;
  total_views: number;
  total_searches: number;
  unique_visitors_30d: number;
  conversion_rate: number;
  top_products: { id: string; name: string; views: number; sales: number }[];
  top_sellers: { id: string; name: string; views: number; revenue: number }[];
  top_buyers: { id: string; name: string; orders: number; spent: number }[];
  top_categories: { category: string; count: number }[];
  top_search_keywords: { keyword: string; count: number }[];
  top_countries: { country: string; count: number }[];
  daily_visitors: { date: string; visitors: number }[];
  daily_views: { date: string; views: number }[];
  daily_signups: { date: string; signups: number }[];
  daily_revenue: { date: string; revenue: number }[];
  hourly_activity: { hour: number; count: number }[];
  pending_verifications: number;
  pending_withdrawals: number;
}

export interface BuyerAnalyticsV2 {
  orders: number;
  purchases: number;
  downloads: number;
  wishlist_count: number;
  saved_products: number;
  saved_services: number;
  saved_courses: number;
  total_spent: number;
  monthly_spending: { month: string; spent: number }[];
  recently_viewed: { entity_id: string; name: string; image_url: string | null; viewed_at: string }[];
  recently_purchased: { order_id: string; product_name: string; price: number; date: string }[];
  favorite_categories: { category: string; count: number }[];
  reward_history: { id: string; amount: number; type: string; created_at: string }[];
  referral_earnings: number;
  wallet_balance: number;
}

export interface FunnelData {
  steps: { step: string; count: number }[];
}

export interface SearchAnalyticsData {
  total_searches: number;
  no_result_searches: number;
  trending_searches: { query: string; count: number }[];
  popular_searches: { query: string; count: number }[];
  search_ctr: number;
  daily_searches: { date: string; count: number }[];
}

export interface ProductAnalyticsDetail {
  views: number;
  unique_visitors: number;
  ctr: number;
  wishlist: number;
  shares: number;
  chats: number;
  purchases: number;
  revenue: number;
  conversion: number;
  avg_viewing_time: number;
  top_source: string | null;
  top_country: string | null;
  top_city: string | null;
  top_keywords: { keyword: string; count: number }[];
  recent_visitors: { viewer_id: string | null; source: string | null; country: string | null; city: string | null; device: string | null; created_at: string }[];
  daily_views: { date: string; count: number }[];
}

export interface AffiliateAnalytics {
  clicks: number;
  unique_clicks: number;
  sales: number;
  conversion: number;
  commission: number;
  pending_commission: number;
  paid_commission: number;
  top_products: { product_id: string; count: number }[];
  top_countries: { country: string; count: number }[];
  top_traffic_sources: { source: string; count: number }[];
  daily_earnings: { date: string; earnings: number }[];
  lifetime_earnings: number;
}

// ─── Seller Analytics Hook ────────────────────────────────────────────────────

export function useSellerAnalyticsV2(days = 30) {
  return useRealtimeAnalytics<SellerAnalyticsV2>(
    useCallback(async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await supabase.rpc('get_seller_analytics_v2', {
        p_seller_id: user.id, p_days: days,
      });
      if (error) throw error;
      return data as SellerAnalyticsV2;
    }, [days]),
    { channel: `seller-analytics-${days}` }
  );
}

// ─── Admin Analytics Hook ─────────────────────────────────────────────────────

export function useAdminAnalyticsV2(days = 30) {
  return useRealtimeAnalytics<AdminAnalyticsV2>(
    useCallback(async () => {
      const { data, error } = await supabase.rpc('get_admin_analytics_v2', { p_days: days });
      if (error) throw error;
      return data as AdminAnalyticsV2;
    }, [days]),
    { channel: `admin-analytics-${days}` }
  );
}

// ─── Buyer Analytics Hook ─────────────────────────────────────────────────────

export function useBuyerAnalyticsV2() {
  return useRealtimeAnalytics<BuyerAnalyticsV2>(
    useCallback(async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await supabase.rpc('get_buyer_analytics_v2', { p_buyer_id: user.id });
      if (error) throw error;
      return data as BuyerAnalyticsV2;
    }, []),
    { channel: 'buyer-analytics' }
  );
}

// ─── Funnel Analytics Hook ────────────────────────────────────────────────────

export function useFunnelAnalytics(sellerId?: string | null, days = 30) {
  return useRealtimeAnalytics<FunnelData>(
    useCallback(async () => {
      const { data, error } = await supabase.rpc('get_funnel_analytics', {
        p_seller_id: sellerId || null, p_days: days,
      });
      if (error) throw error;
      return data as FunnelData;
    }, [sellerId, days]),
    { channel: `funnel-${days}` }
  );
}

// ─── Search Analytics Hook ─────────────────────────────────────────────────────

export function useSearchAnalytics(days = 30) {
  return useRealtimeAnalytics<SearchAnalyticsData>(
    useCallback(async () => {
      const { data, error } = await supabase.rpc('get_search_analytics', { p_days: days });
      if (error) throw error;
      return data as SearchAnalyticsData;
    }, [days]),
    { channel: `search-analytics-${days}` }
  );
}

// ─── Product Analytics Detail Hook ────────────────────────────────────────────

export function useProductAnalyticsDetail(productId: string, days = 30) {
  const [data, setData] = useState<ProductAnalyticsDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('get_product_analytics_detail', {
        p_product_id: productId, p_days: days,
      });
      if (rpcError) throw rpcError;
      setData(data as ProductAnalyticsDetail);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [productId, days]);

  return { data, loading, error, refetch };
}

// ─── Affiliate Analytics Hook ──────────────────────────────────────────────────

export function useAffiliateAnalytics(affiliateId: string, days = 30) {
  return useRealtimeAnalytics<AffiliateAnalytics>(
    useCallback(async () => {
      const { data, error } = await supabase.rpc('get_affiliate_analytics', {
        p_affiliate_id: affiliateId, p_days: days,
      });
      if (error) throw error;
      return data as AffiliateAnalytics;
    }, [affiliateId, days]),
    { channel: `affiliate-analytics-${days}` }
  );
}

// ─── Entity Analytics Hook (products, services, jobs, courses) ─────────────────

export function useEntityAnalytics(entityType: string, entityId: string, days = 30) {
  const [data, setData] = useState<ProductAnalyticsDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('get_entity_analytics', {
        p_entity_type: entityType, p_entity_id: entityId, p_days: days,
      });
      if (rpcError) throw rpcError;
      setData(data as ProductAnalyticsDetail);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId, days]);

  return { data, loading, error, refetch };
}
