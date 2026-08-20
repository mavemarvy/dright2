// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT Promotion Engine
// Pricing, packages, campaign management, reach calculator, fraud detection.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PromotionPricing {
  cost_per_impression: number;
  cost_per_100_impressions: number;
  cost_per_1000_impressions: number;
  cost_per_click: number;
  cost_per_reach: number;
  daily_minimum_budget: number;
  maximum_campaign_budget: number;
  currency: string;
  default_ctr: number;
  default_conversion_rate: number;
}

export interface PromotionPackage {
  id: string;
  name: string;
  description: string | null;
  price: number;
  estimated_reach: number;
  estimated_impressions: number;
  estimated_clicks: number;
  duration_days: number;
  bonus_impressions: number;
  bonus_recommendation_exposure: boolean;
  is_active: boolean;
  sort_order: number;
}

export type CampaignGoal =
  | 'more_views' | 'more_clicks' | 'more_sales' | 'more_messages'
  | 'more_job_applications' | 'more_course_enrollments';

export type AudienceType =
  | 'everyone' | 'country' | 'state' | 'city' | 'category'
  | 'interests' | 'followers';

export type CampaignStatus =
  | 'pending' | 'active' | 'paused' | 'expired' | 'cancelled' | 'rejected';

export type PaymentStatus =
  | 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled';

export interface PromotionCampaign {
  id: string;
  seller_id: string;
  listing_id: string;
  listing_type: string;
  goal: CampaignGoal;
  audience_type: AudienceType;
  audience_country: string | null;
  audience_state: string | null;
  audience_city: string | null;
  audience_category: string | null;
  audience_interests: string[];
  audience_followers_only: boolean;
  budget: number;
  duration_days: number;
  start_date: string;
  end_date: string;
  status: CampaignStatus;
  payment_id: string | null;
  payment_status: PaymentStatus;
  package_id: string | null;
  estimated_reach: number;
  estimated_impressions: number;
  estimated_clicks: number;
  estimated_conversions: number;
  actual_impressions: number;
  actual_clicks: number;
  actual_conversions: number;
  actual_reach: number;
  actual_spend: number;
  is_featured: boolean;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignStatistics {
  campaign_id: string;
  stat_date: string;
  impressions: number;
  clicks: number;
  conversions: number;
  reach: number;
  spend: number;
  ctr: number;
  cpc: number;
  cpa: number;
  sales_revenue: number;
  messages: number;
  applications: number;
  enrollments: number;
}

export interface ReachEstimate {
  estimated_impressions: number;
  estimated_clicks: number;
  estimated_reach: number;
  estimated_conversions: number;
  total_cost: number;
}

const DEFAULT_PRICING: PromotionPricing = {
  cost_per_impression: 0.01,
  cost_per_100_impressions: 0.80,
  cost_per_1000_impressions: 6.00,
  cost_per_click: 0.15,
  cost_per_reach: 0.02,
  daily_minimum_budget: 1.00,
  maximum_campaign_budget: 5000.00,
  currency: 'USD',
  default_ctr: 0.02,
  default_conversion_rate: 0.05,
};

// ─── Pricing ──────────────────────────────────────────────────────────────────

export async function fetchPricing(): Promise<PromotionPricing> {
  try {
    const { data, error } = await supabase
      .from('promotion_pricing')
      .select('*')
      .maybeSingle();
    if (error || !data) return DEFAULT_PRICING;
    return {
      cost_per_impression: Number(data.cost_per_impression),
      cost_per_100_impressions: Number(data.cost_per_100_impressions),
      cost_per_1000_impressions: Number(data.cost_per_1000_impressions),
      cost_per_click: Number(data.cost_per_click),
      cost_per_reach: Number(data.cost_per_reach),
      daily_minimum_budget: Number(data.daily_minimum_budget),
      maximum_campaign_budget: Number(data.maximum_campaign_budget),
      currency: data.currency,
      default_ctr: Number(data.default_ctr),
      default_conversion_rate: Number(data.default_conversion_rate),
    };
  } catch {
    return DEFAULT_PRICING;
  }
}

export async function updatePricing(pricing: Partial<PromotionPricing>): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('promotion_pricing')
      .update({ ...pricing, updated_at: new Date().toISOString() })
      .eq('is_singleton', true);
    return !error;
  } catch {
    return false;
  }
}

// ─── Packages ─────────────────────────────────────────────────────────────────

export async function fetchPackages(): Promise<PromotionPackage[]> {
  try {
    const { data, error } = await supabase
      .from('promotion_packages')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data || []) as PromotionPackage[];
  } catch {
    return [];
  }
}

export async function fetchAllPackages(): Promise<PromotionPackage[]> {
  try {
    const { data, error } = await supabase
      .from('promotion_packages')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data || []) as PromotionPackage[];
  } catch {
    return [];
  }
}

export async function createPackage(pkg: Omit<PromotionPackage, 'id'>): Promise<boolean> {
  try {
    const { error } = await supabase.from('promotion_packages').insert(pkg);
    return !error;
  } catch {
    return false;
  }
}

export async function updatePackage(id: string, pkg: Partial<PromotionPackage>): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('promotion_packages')
      .update({ ...pkg, updated_at: new Date().toISOString() })
      .eq('id', id);
    return !error;
  } catch {
    return false;
  }
}

export async function deletePackage(id: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('promotion_packages').delete().eq('id', id);
    return !error;
  } catch {
    return false;
  }
}

// ─── Reach Calculator ─────────────────────────────────────────────────────────

export function calculateReach(
  budget: number,
  pricing: PromotionPricing,
): ReachEstimate {
  // Use CPM (cost per 1000 impressions) as the base pricing model
  const cpm = pricing.cost_per_1000_impressions;
  const totalImpressions = Math.floor((budget / cpm) * 1000);
  const estimatedClicks = Math.floor(totalImpressions * pricing.default_ctr);
  const estimatedReach = Math.floor(totalImpressions * 0.7); // ~70% of impressions are unique
  const estimatedConversions = Math.floor(estimatedClicks * pricing.default_conversion_rate);

  return {
    estimated_impressions: totalImpressions,
    estimated_clicks: estimatedClicks,
    estimated_reach: estimatedReach,
    estimated_conversions: estimatedConversions,
    total_cost: budget,
  };
}

export function calculateFromAudienceSize(
  audienceSize: number,
  pricing: PromotionPricing,
): ReachEstimate & { budget_needed: number } {
  const impressions = Math.ceil(audienceSize / 0.7); // 70% unique rate
  const clicks = Math.floor(impressions * pricing.default_ctr);
  const conversions = Math.floor(clicks * pricing.default_conversion_rate);
  const budgetNeeded = Math.ceil((impressions / 1000) * pricing.cost_per_1000_impressions * 100) / 100;

  return {
    estimated_impressions: impressions,
    estimated_clicks: clicks,
    estimated_reach: audienceSize,
    estimated_conversions: conversions,
    total_cost: budgetNeeded,
    budget_needed: budgetNeeded,
  };
}

// ─── Campaign Management ──────────────────────────────────────────────────────

export interface CreateCampaignInput {
  listing_id: string;
  listing_type: string;
  goal: CampaignGoal;
  audience_type: AudienceType;
  audience_country?: string;
  audience_state?: string;
  audience_city?: string;
  audience_category?: string;
  audience_interests?: string[];
  audience_followers_only?: boolean;
  budget: number;
  duration_days: number;
  package_id?: string;
}

export async function createCampaign(
  sellerId: string,
  input: CreateCampaignInput,
  pricing: PromotionPricing,
): Promise<PromotionCampaign | null> {
  try {
    const estimate = calculateReach(input.budget, pricing);
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + input.duration_days);

    const { data, error } = await supabase
      .from('promotion_campaigns')
      .insert({
        seller_id: sellerId,
        listing_id: input.listing_id,
        listing_type: input.listing_type,
        goal: input.goal,
        audience_type: input.audience_type,
        audience_country: input.audience_country || null,
        audience_state: input.audience_state || null,
        audience_city: input.audience_city || null,
        audience_category: input.audience_category || null,
        audience_interests: input.audience_interests || [],
        audience_followers_only: input.audience_followers_only || false,
        budget: input.budget,
        duration_days: input.duration_days,
        end_date: endDate.toISOString(),
        status: 'pending',
        payment_status: 'pending',
        package_id: input.package_id || null,
        estimated_reach: estimate.estimated_reach,
        estimated_impressions: estimate.estimated_impressions,
        estimated_clicks: estimate.estimated_clicks,
        estimated_conversions: estimate.estimated_conversions,
      })
      .select()
      .single();

    if (error) throw error;
    return data as PromotionCampaign;
  } catch (err) {
    console.error('createCampaign error:', err);
    return null;
  }
}

export async function activateCampaign(campaignId: string, paymentId: string): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('activate_campaign', {
      p_campaign_id: campaignId,
      p_payment_id: paymentId,
    });
    return !error;
  } catch {
    return false;
  }
}

export async function fetchSellerCampaigns(sellerId: string): Promise<PromotionCampaign[]> {
  try {
    const { data, error } = await supabase
      .from('promotion_campaigns')
      .select('*')
      .eq('seller_id', sellerId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as PromotionCampaign[];
  } catch {
    return [];
  }
}

export async function fetchAllCampaigns(limit = 100): Promise<PromotionCampaign[]> {
  try {
    const { data, error } = await supabase
      .from('promotion_campaigns')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []) as PromotionCampaign[];
  } catch {
    return [];
  }
}

export async function updateCampaignStatus(
  campaignId: string,
  status: CampaignStatus,
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('promotion_campaigns')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', campaignId);
    return !error;
  } catch {
    return false;
  }
}

export async function duplicateCampaign(campaignId: string, sellerId: string): Promise<PromotionCampaign | null> {
  try {
    const { data: original, error: fetchError } = await supabase
      .from('promotion_campaigns')
      .select('*')
      .eq('id', campaignId)
      .maybeSingle();
    if (fetchError || !original) return null;

    const endDate = new Date();
    endDate.setDate(endDate.getDate() + original.duration_days);

    const { data, error } = await supabase
      .from('promotion_campaigns')
      .insert({
        seller_id: sellerId,
        listing_id: original.listing_id,
        listing_type: original.listing_type,
        goal: original.goal,
        audience_type: original.audience_type,
        audience_country: original.audience_country,
        audience_state: original.audience_state,
        audience_city: original.audience_city,
        audience_category: original.audience_category,
        audience_interests: original.audience_interests || [],
        audience_followers_only: original.audience_followers_only,
        budget: original.budget,
        duration_days: original.duration_days,
        end_date: endDate.toISOString(),
        status: 'pending',
        payment_status: 'pending',
        package_id: original.package_id,
        estimated_reach: original.estimated_reach,
        estimated_impressions: original.estimated_impressions,
        estimated_clicks: original.estimated_clicks,
        estimated_conversions: original.estimated_conversions,
      })
      .select()
      .single();

    if (error) throw error;
    return data as PromotionCampaign;
  } catch (err) {
    console.error('duplicateCampaign error:', err);
    return null;
  }
}

export async function extendCampaign(campaignId: string, extraDays: number): Promise<boolean> {
  try {
    const { data: campaign, error: fetchError } = await supabase
      .from('promotion_campaigns')
      .select('end_date')
      .eq('id', campaignId)
      .maybeSingle();
    if (fetchError || !campaign) return false;

    const newEndDate = new Date(campaign.end_date);
    newEndDate.setDate(newEndDate.getDate() + extraDays);

    const { error } = await supabase
      .from('promotion_campaigns')
      .update({ end_date: newEndDate.toISOString(), updated_at: new Date().toISOString() })
      .eq('id', campaignId);
    return !error;
  } catch {
    return false;
  }
}

export async function increaseBudget(campaignId: string, additionalBudget: number): Promise<boolean> {
  try {
    const { data: campaign, error: fetchError } = await supabase
      .from('promotion_campaigns')
      .select('budget')
      .eq('id', campaignId)
      .maybeSingle();
    if (fetchError || !campaign) return false;

    const newBudget = Number(campaign.budget) + additionalBudget;
    const { error } = await supabase
      .from('promotion_campaigns')
      .update({ budget: newBudget, updated_at: new Date().toISOString() })
      .eq('id', campaignId);
    return !error;
  } catch {
    return false;
  }
}

export async function fetchCampaignStatistics(campaignId: string): Promise<CampaignStatistics[]> {
  try {
    const { data, error } = await supabase
      .from('campaign_statistics')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('stat_date', { ascending: true });
    if (error) throw error;
    return (data || []) as CampaignStatistics[];
  } catch {
    return [];
  }
}

// ─── Sponsored Listings ────────────────────────────────────────────────────────

export async function fetchSponsoredListings(placement: string, limit = 5): Promise<{ listing_id: string; campaign_id: string; listing_type: string; goal: string }[]> {
  try {
    const { data, error } = await supabase.rpc('get_sponsored_listings', {
      p_placement: placement,
      p_limit: limit,
    });
    if (error) throw error;
    return (data || []).map((d: { listing_id: string; campaign_id: string; listing_type: string; goal: string }) => ({
      listing_id: d.listing_id,
      campaign_id: d.campaign_id,
      listing_type: d.listing_type,
      goal: d.goal,
    }));
  } catch {
    return [];
  }
}

export async function logSponsoredImpression(campaignId: string, listingId: string, placement: string, userId?: string | null): Promise<void> {
  try {
    await supabase.from('sponsored_listing_logs').insert({
      campaign_id: campaignId,
      listing_id: listingId,
      placement,
      user_id: userId || null,
    });
  } catch (err) {
    console.error('logSponsoredImpression error:', err);
  }
}

// ─── Fraud Detection ──────────────────────────────────────────────────────────

const recentClicks = new Map<string, number[]>();
const RAPID_CLICK_THRESHOLD = 10;
const RAPID_CLICK_WINDOW_MS = 60000;

export function detectClickFraud(campaignId: string, identifier: string): { is_fraudulent: boolean; reason: string } {
  const key = `${campaignId}:${identifier}`;
  const now = Date.now();
  const timestamps = recentClicks.get(key) || [];
  const recent = timestamps.filter(t => now - t < RAPID_CLICK_WINDOW_MS);
  recent.push(now);
  recentClicks.set(key, recent);

  if (recent.length > RAPID_CLICK_THRESHOLD) {
    return { is_fraudulent: true, reason: `Rapid clicks: ${recent.length} in 60s from same identifier` };
  }
  return { is_fraudulent: false, reason: '' };
}

export async function logCampaignEvent(
  campaignId: string,
  listingId: string,
  eventType: string,
  userId?: string | null,
  ipHash?: string,
  deviceFingerprint?: string,
  isFraudulent = false,
  fraudReason?: string,
): Promise<void> {
  try {
    await supabase.from('campaign_events').insert({
      campaign_id: campaignId,
      listing_id: listingId,
      user_id: userId || null,
      event_type: eventType,
      ip_hash: ipHash || null,
      device_fingerprint: deviceFingerprint || null,
      is_fraudulent: isFraudulent,
      fraud_reason: fraudReason || null,
    });
  } catch (err) {
    console.error('logCampaignEvent error:', err);
  }
}

// ─── Campaign Analytics Summary ───────────────────────────────────────────────

export interface CampaignAnalyticsSummary {
  total_campaigns: number;
  active_campaigns: number;
  total_spend: number;
  total_impressions: number;
  total_clicks: number;
  total_conversions: number;
  avg_ctr: number;
  avg_cpc: number;
  avg_cpa: number;
  total_revenue: number;
}

export async function fetchSellerAnalytics(sellerId: string): Promise<CampaignAnalyticsSummary> {
  try {
    const { data, error } = await supabase
      .from('promotion_campaigns')
      .select('status, actual_spend, actual_impressions, actual_clicks, actual_conversions')
      .eq('seller_id', sellerId);
    if (error) throw error;

    const campaigns = data || [];
    const totalSpend = campaigns.reduce((sum, c) => sum + Number(c.actual_spend), 0);
    const totalImpressions = campaigns.reduce((sum, c) => sum + (c.actual_impressions || 0), 0);
    const totalClicks = campaigns.reduce((sum, c) => sum + (c.actual_clicks || 0), 0);
    const totalConversions = campaigns.reduce((sum, c) => sum + (c.actual_conversions || 0), 0);
    const activeCount = campaigns.filter(c => c.status === 'active').length;

    return {
      total_campaigns: campaigns.length,
      active_campaigns: activeCount,
      total_spend: totalSpend,
      total_impressions: totalImpressions,
      total_clicks: totalClicks,
      total_conversions: totalConversions,
      avg_ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
      avg_cpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
      avg_cpa: totalConversions > 0 ? totalSpend / totalConversions : 0,
      total_revenue: 0, // Would need sales data join
    };
  } catch {
    return {
      total_campaigns: 0, active_campaigns: 0, total_spend: 0,
      total_impressions: 0, total_clicks: 0, total_conversions: 0,
      avg_ctr: 0, avg_cpc: 0, avg_cpa: 0, total_revenue: 0,
    };
  }
}

export async function fetchAdminAnalytics(): Promise<CampaignAnalyticsSummary & { total_revenue: number }> {
  try {
    const { data, error } = await supabase
      .from('promotion_campaigns')
      .select('status, budget, actual_spend, actual_impressions, actual_clicks, actual_conversions, payment_status');
    if (error) throw error;

    const campaigns = data || [];
    const paidCampaigns = campaigns.filter(c => c.payment_status === 'paid');
    const totalRevenue = paidCampaigns.reduce((sum, c) => sum + Number(c.budget), 0);
    const totalSpend = campaigns.reduce((sum, c) => sum + Number(c.actual_spend), 0);
    const totalImpressions = campaigns.reduce((sum, c) => sum + (c.actual_impressions || 0), 0);
    const totalClicks = campaigns.reduce((sum, c) => sum + (c.actual_clicks || 0), 0);
    const totalConversions = campaigns.reduce((sum, c) => sum + (c.actual_conversions || 0), 0);
    const activeCount = campaigns.filter(c => c.status === 'active').length;

    return {
      total_campaigns: campaigns.length,
      active_campaigns: activeCount,
      total_spend: totalSpend,
      total_impressions: totalImpressions,
      total_clicks: totalClicks,
      total_conversions: totalConversions,
      avg_ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
      avg_cpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
      avg_cpa: totalConversions > 0 ? totalSpend / totalConversions : 0,
      total_revenue: totalRevenue,
    };
  } catch {
    return {
      total_campaigns: 0, active_campaigns: 0, total_spend: 0,
      total_impressions: 0, total_clicks: 0, total_conversions: 0,
      avg_ctr: 0, avg_cpc: 0, avg_cpa: 0, total_revenue: 0,
    };
  }
}
