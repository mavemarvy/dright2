// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT Admin Intelligence Engine
// Executive KPIs, marketplace analytics, seller/buyer intelligence,
// financial summary, moderation, fraud monitoring, audit logs.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ExecutiveKPIs {
  total_users: number;
  active_users_today: number;
  new_users_today: number;
  total_sellers: number;
  total_buyers: number;
  total_listings: number;
  active_listings: number;
  pending_listings: number;
  total_orders: number;
  total_revenue: number;
  promotion_revenue: number;
  referral_revenue: number;
  pending_withdrawals: number;
  completed_withdrawals: number;
  pending_verifications: number;
  total_wishlist: number;
  total_reviews: number;
  avg_rating: number;
  total_page_views: number;
  total_searches: number;
}

export interface MarketplaceAnalytics {
  total_listings: number;
  active_listings: number;
  hidden_listings: number;
  pending_listings: number;
  total_sales: number;
  total_revenue: number;
  total_views: number;
  total_wishlist: number;
  conversion_rate: number;
  top_category: string;
  top_category_count: number;
}

export interface FinancialSummary {
  marketplace_revenue: number;
  promotion_revenue: number;
  referral_payouts: number;
  seller_payouts: number;
  pending_withdrawals: number;
  completed_withdrawals: number;
  total_refunds: number;
  total_coupons_discount: number;
}

export interface AdminActivityLog {
  id: string;
  admin_id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface ModerationItem {
  id: string;
  item_type: string;
  item_id: string;
  reason: string | null;
  reported_by: string | null;
  status: string;
  assigned_to: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface FraudCase {
  id: string;
  case_type: string;
  user_id: string | null;
  listing_id: string | null;
  risk_score: number;
  status: string;
  details: Record<string, unknown> | null;
  assigned_to: string | null;
  resolution: string | null;
  created_at: string;
  updated_at: string;
}

export interface SellerIntelligence {
  user_id: string;
  username: string | null;
  email: string;
  is_verified: boolean;
  total_listings: number;
  total_sales: number;
  total_revenue: number;
  avg_rating: number;
  total_reviews: number;
  response_rate: number;
  is_suspended: boolean;
  trust_score: number;
}

export interface CategoryAnalytics {
  category: string;
  listing_count: number;
  total_sales: number;
  revenue: number;
  avg_rating: number;
}

// ─── Executive KPIs ───────────────────────────────────────────────────────────

export async function fetchExecutiveKPIs(): Promise<ExecutiveKPIs | null> {
  try {
    const { data, error } = await supabase.rpc('get_executive_kpis');
    if (error) throw error;
    const row = (data || [])[0];
    if (!row) return null;
    return {
      total_users: Number(row.total_users) || 0,
      active_users_today: Number(row.active_users_today) || 0,
      new_users_today: Number(row.new_users_today) || 0,
      total_sellers: Number(row.total_sellers) || 0,
      total_buyers: Number(row.total_buyers) || 0,
      total_listings: Number(row.total_listings) || 0,
      active_listings: Number(row.active_listings) || 0,
      pending_listings: Number(row.pending_listings) || 0,
      total_orders: Number(row.total_orders) || 0,
      total_revenue: Number(row.total_revenue) || 0,
      promotion_revenue: Number(row.promotion_revenue) || 0,
      referral_revenue: Number(row.referral_revenue) || 0,
      pending_withdrawals: Number(row.pending_withdrawals) || 0,
      completed_withdrawals: Number(row.completed_withdrawals) || 0,
      pending_verifications: Number(row.pending_verifications) || 0,
      total_wishlist: Number(row.total_wishlist) || 0,
      total_reviews: Number(row.total_reviews) || 0,
      avg_rating: Number(row.avg_rating) || 0,
      total_page_views: Number(row.total_page_views) || 0,
      total_searches: Number(row.total_searches) || 0,
    };
  } catch (err) {
    console.error('fetchExecutiveKPIs error:', err);
    return null;
  }
}

// ─── Marketplace Analytics ───────────────────────────────────────────────────

export async function fetchMarketplaceAnalytics(): Promise<MarketplaceAnalytics | null> {
  try {
    const { data, error } = await supabase.rpc('get_marketplace_analytics');
    if (error) throw error;
    const row = (data || [])[0];
    if (!row) return null;
    return {
      total_listings: Number(row.total_listings) || 0,
      active_listings: Number(row.active_listings) || 0,
      hidden_listings: Number(row.hidden_listings) || 0,
      pending_listings: Number(row.pending_listings) || 0,
      total_sales: Number(row.total_sales) || 0,
      total_revenue: Number(row.total_revenue) || 0,
      total_views: Number(row.total_views) || 0,
      total_wishlist: Number(row.total_wishlist) || 0,
      conversion_rate: Number(row.conversion_rate) || 0,
      top_category: row.top_category || '',
      top_category_count: Number(row.top_category_count) || 0,
    };
  } catch (err) {
    console.error('fetchMarketplaceAnalytics error:', err);
    return null;
  }
}

export async function fetchCategoryAnalytics(): Promise<CategoryAnalytics[]> {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('category, total_sales, average_rating, total_reviews')
      .eq('approval_status', 'approved');
    if (error) throw error;

    const categoryMap = new Map<string, CategoryAnalytics>();
    for (const p of (data || []) as { category: string; total_sales: number | null; average_rating: number | null; total_reviews: number | null }[]) {
      const cat = p.category || 'Uncategorized';
      const existing = categoryMap.get(cat) || { category: cat, listing_count: 0, total_sales: 0, revenue: 0, avg_rating: 0 };
      existing.listing_count++;
      existing.total_sales += Number(p.total_sales) || 0;
      existing.avg_rating += Number(p.average_rating) || 0;
      categoryMap.set(cat, existing);
    }

    return Array.from(categoryMap.values())
      .map(c => ({ ...c, avg_rating: c.listing_count > 0 ? c.avg_rating / c.listing_count : 0 }))
      .sort((a, b) => b.listing_count - a.listing_count);
  } catch {
    return [];
  }
}

// ─── Financial Summary ───────────────────────────────────────────────────────

export async function fetchFinancialSummary(): Promise<FinancialSummary | null> {
  try {
    const { data, error } = await supabase.rpc('get_financial_summary');
    if (error) throw error;
    const row = (data || [])[0];
    if (!row) return null;
    return {
      marketplace_revenue: Number(row.marketplace_revenue) || 0,
      promotion_revenue: Number(row.promotion_revenue) || 0,
      referral_payouts: Number(row.referral_payouts) || 0,
      seller_payouts: Number(row.seller_payouts) || 0,
      pending_withdrawals: Number(row.pending_withdrawals) || 0,
      completed_withdrawals: Number(row.completed_withdrawals) || 0,
      total_refunds: Number(row.total_refunds) || 0,
      total_coupons_discount: Number(row.total_coupons_discount) || 0,
    };
  } catch (err) {
    console.error('fetchFinancialSummary error:', err);
    return null;
  }
}

// ─── Seller Intelligence ──────────────────────────────────────────────────────

export async function fetchSellerIntelligence(limit = 50): Promise<SellerIntelligence[]> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, username, email, is_verified, is_seller, is_banned, uploaded_products_count, total_sales, total_revenue, average_rating, total_reviews')
      .order('total_revenue', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []).map((u: Record<string, unknown>) => ({
      user_id: u.id as string,
      username: u.username as string | null,
      email: u.email as string,
      is_verified: u.is_verified as boolean,
      total_listings: Number(u.uploaded_products_count) || 0,
      total_sales: Number(u.total_sales) || 0,
      total_revenue: Number(u.total_revenue) || 0,
      avg_rating: Number(u.average_rating) || 0,
      total_reviews: Number(u.total_reviews) || 0,
      response_rate: 0,
      is_suspended: u.is_banned as boolean,
      trust_score: ((Number(u.average_rating) || 0) * 20) + Math.min(Number(u.total_sales) || 0, 50),
    }));
  } catch {
    return [];
  }
}

// ─── Buyer Intelligence ───────────────────────────────────────────────────────

export async function fetchBuyerIntelligence(limit = 50): Promise<{ user_id: string; username: string | null; email: string; total_purchases: number; total_spent: number; is_suspended: boolean }[]> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, username, email, is_banned, total_purchases, total_spent')
      .order('total_spent', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []).map((u: Record<string, unknown>) => ({
      user_id: u.id as string,
      username: u.username as string | null,
      email: u.email as string,
      total_purchases: Number(u.total_purchases) || 0,
      total_spent: Number(u.total_spent) || 0,
      is_suspended: u.is_banned as boolean,
    }));
  } catch {
    return [];
  }
}

// ─── Moderation Queue ──────────────────────────────────────────────────────────

export async function fetchModerationQueue(status?: string): Promise<ModerationItem[]> {
  try {
    let query = supabase.from('moderation_queue').select('*').order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as ModerationItem[];
  } catch {
    return [];
  }
}

export async function updateModerationItem(id: string, updates: Partial<ModerationItem>): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('moderation_queue')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id);
    return !error;
  } catch {
    return false;
  }
}

export async function createModerationItem(input: { item_type: string; item_id: string; reason?: string; reported_by?: string }): Promise<boolean> {
  try {
    const { error } = await supabase.from('moderation_queue').insert({
      item_type: input.item_type,
      item_id: input.item_id,
      reason: input.reason || null,
      reported_by: input.reported_by || null,
    });
    return !error;
  } catch {
    return false;
  }
}

// ─── Fraud Cases ───────────────────────────────────────────────────────────────

export async function fetchFraudCases(status?: string): Promise<FraudCase[]> {
  try {
    let query = supabase.from('fraud_cases').select('*').order('risk_score', { ascending: false });
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as FraudCase[];
  } catch {
    return [];
  }
}

export async function updateFraudCase(id: string, updates: Partial<FraudCase>): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('fraud_cases')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id);
    return !error;
  } catch {
    return false;
  }
}

// ─── Admin Activity Logs ──────────────────────────────────────────────────────

export async function fetchAdminLogs(limit = 100, adminId?: string): Promise<AdminActivityLog[]> {
  try {
    let query = supabase.from('admin_activity_logs').select('*').order('created_at', { ascending: false }).limit(limit);
    if (adminId) query = query.eq('admin_id', adminId);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as AdminActivityLog[];
  } catch {
    return [];
  }
}

export async function logAdminAction(action: string, targetType?: string, targetId?: string, details?: Record<string, unknown>): Promise<void> {
  try {
    await supabase.rpc('log_admin_activity', {
      p_action: action,
      p_target_type: targetType || null,
      p_target_id: targetId || null,
      p_details: details || null,
    });
  } catch (err) {
    console.error('logAdminAction error:', err);
  }
}

// ─── Daily Activity Chart Data ──────────────────────────────────────────────────

export async function fetchDailyActivity(days = 30): Promise<{ date: string; views: number; purchases: number; signups: number }[]> {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const [viewsRes, purchasesRes, signupsRes] = await Promise.all([
      supabase.from('listing_events').select('created_at').eq('event_type', 'view').gte('created_at', startDate.toISOString()),
      supabase.from('listing_events').select('created_at').eq('event_type', 'purchase').gte('created_at', startDate.toISOString()),
      supabase.from('users').select('created_at').gte('created_at', startDate.toISOString()),
    ]);

    const dayMap = new Map<string, { date: string; views: number; purchases: number; signups: number }>();
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      dayMap.set(key, { date: key, views: 0, purchases: 0, signups: 0 });
    }

    for (const e of (viewsRes.data || []) as { created_at: string }[]) {
      const key = e.created_at.slice(0, 10);
      const entry = dayMap.get(key);
      if (entry) entry.views++;
    }
    for (const e of (purchasesRes.data || []) as { created_at: string }[]) {
      const key = e.created_at.slice(0, 10);
      const entry = dayMap.get(key);
      if (entry) entry.purchases++;
    }
    for (const e of (signupsRes.data || []) as { created_at: string }[]) {
      const key = e.created_at.slice(0, 10);
      const entry = dayMap.get(key);
      if (entry) entry.signups++;
    }

    return Array.from(dayMap.values()).reverse();
  } catch {
    return [];
  }
}
