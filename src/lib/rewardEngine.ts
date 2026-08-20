// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT Reward Engine
// Coupons, tokens, vouchers, gift codes, promotion credits, giveaways,
// featured listing rewards, wallet management, redemption validation.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase';

// ─── Types ───────────────────────────────────────────────────────────────────

export type RewardType =
  | 'percentage_discount' | 'fixed_amount' | 'promotion_credits'
  | 'promotion_token' | 'voucher' | 'gift_code';

export type GiveawayType =
  | 'holiday' | 'referral' | 'seller_challenge' | 'affiliate_competition'
  | 'first_n_users' | 'random_winners';

export type FeaturedRewardType =
  | 'featured_placement' | 'homepage_feature' | 'category_spotlight'
  | 'trending_highlight' | 'recommendation_boost';

export interface Coupon {
  id: string;
  code: string;
  name: string;
  description: string | null;
  reward_type: RewardType;
  value: number;
  currency: string;
  start_date: string;
  end_date: string | null;
  max_uses: number | null;
  uses_per_user: number;
  min_purchase_amount: number;
  max_discount_amount: number | null;
  applicable_categories: string[];
  applicable_sellers: string[];
  applicable_listing_types: string[];
  excluded_listings: string[];
  excluded_categories: string[];
  excluded_sellers: string[];
  is_active: boolean;
  is_published: boolean;
  is_archived: boolean;
  current_uses: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CouponRedemption {
  id: string;
  coupon_id: string;
  user_id: string;
  listing_id: string | null;
  order_id: string | null;
  original_amount: number;
  discount_amount: number;
  final_amount: number;
  redeemed_at: string;
}

export interface RewardWallet {
  id: string;
  user_id: string;
  promotion_credits: number;
  promotion_tokens: number;
  voucher_count: number;
  gift_code_count: number;
  total_saved: number;
  created_at: string;
  updated_at: string;
}

export interface RewardTransaction {
  id: string;
  user_id: string;
  transaction_type: string;
  reward_type: string | null;
  amount: number;
  coupon_id: string | null;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface GiveawayCampaign {
  id: string;
  name: string;
  description: string | null;
  giveaway_type: GiveawayType;
  reward_type: RewardType;
  reward_value: number;
  reward_coupon_id: string | null;
  max_winners: number;
  max_entries: number | null;
  start_date: string;
  end_date: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface GiveawayEntry {
  id: string;
  giveaway_id: string;
  user_id: string;
  is_winner: boolean;
  entry_data: Record<string, unknown> | null;
  created_at: string;
}

export interface FeaturedListingReward {
  id: string;
  listing_id: string;
  listing_type: string;
  reward_type: FeaturedRewardType;
  duration_days: number;
  start_date: string;
  end_date: string;
  status: string;
  granted_by: string | null;
  reason: string | null;
  created_at: string;
}

export interface ValidationResult {
  valid: boolean;
  discount_amount: number;
  message: string;
  coupon_id: string | null;
}

export interface RedemptionResult {
  success: boolean;
  discount_amount: number;
  final_amount: number;
  message: string;
}

// ─── Coupon Management ──────────────────────────────────────────────────────

export async function fetchCoupons(filter?: { active?: boolean; archived?: boolean; published?: boolean }): Promise<Coupon[]> {
  try {
    let query = supabase.from('coupons').select('*').order('created_at', { ascending: false });
    if (filter?.active !== undefined) query = query.eq('is_active', filter.active);
    if (filter?.archived !== undefined) query = query.eq('is_archived', filter.archived);
    if (filter?.published !== undefined) query = query.eq('is_published', filter.published);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as Coupon[];
  } catch {
    return [];
  }
}

export async function fetchPublishedCoupons(): Promise<Coupon[]> {
  try {
    const { data, error } = await supabase
      .from('coupons')
      .select('*')
      .eq('is_active', true)
      .eq('is_published', true)
      .eq('is_archived', false)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as Coupon[];
  } catch {
    return [];
  }
}

export interface CreateCouponInput {
  code: string;
  name: string;
  description?: string;
  reward_type: RewardType;
  value: number;
  currency?: string;
  start_date?: string;
  end_date?: string | null;
  max_uses?: number | null;
  uses_per_user?: number;
  min_purchase_amount?: number;
  max_discount_amount?: number | null;
  applicable_categories?: string[];
  applicable_sellers?: string[];
  applicable_listing_types?: string[];
  excluded_listings?: string[];
  excluded_categories?: string[];
  excluded_sellers?: string[];
  is_active?: boolean;
  is_published?: boolean;
}

export async function createCoupon(input: CreateCouponInput): Promise<Coupon | null> {
  try {
    const { data, error } = await supabase
      .from('coupons')
      .insert({
        code: input.code.toUpperCase(),
        name: input.name,
        description: input.description || null,
        reward_type: input.reward_type,
        value: input.value,
        currency: input.currency || 'USD',
        start_date: input.start_date || new Date().toISOString(),
        end_date: input.end_date || null,
        max_uses: input.max_uses ?? null,
        uses_per_user: input.uses_per_user ?? 1,
        min_purchase_amount: input.min_purchase_amount ?? 0,
        max_discount_amount: input.max_discount_amount ?? null,
        applicable_categories: input.applicable_categories || [],
        applicable_sellers: input.applicable_sellers || [],
        applicable_listing_types: input.applicable_listing_types || [],
        excluded_listings: input.excluded_listings || [],
        excluded_categories: input.excluded_categories || [],
        excluded_sellers: input.excluded_sellers || [],
        is_active: input.is_active ?? true,
        is_published: input.is_published ?? false,
      })
      .select()
      .single();
    if (error) throw error;
    return data as Coupon;
  } catch (err) {
    console.error('createCoupon error:', err);
    return null;
  }
}

export async function updateCoupon(id: string, updates: Partial<Coupon>): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('coupons')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id);
    return !error;
  } catch {
    return false;
  }
}

export async function duplicateCoupon(id: string): Promise<Coupon | null> {
  try {
    const { data: original, error: fetchErr } = await supabase
      .from('coupons')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (fetchErr || !original) return null;

    const { data: newCode } = await supabase.rpc('generate_coupon_code', {
      p_prefix: original.code.slice(0, 4),
      p_length: 8,
    });

    const { data, error } = await supabase
      .from('coupons')
      .insert({
        ...original,
        id: undefined,
        code: newCode || `COPY${Date.now().toString(36).toUpperCase()}`,
        name: `${original.name} (Copy)`,
        current_uses: 0,
        is_published: false,
        created_at: undefined,
        updated_at: undefined,
      })
      .select()
      .single();
    if (error) throw error;
    return data as Coupon;
  } catch {
    return null;
  }
}

export async function deleteCoupon(id: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('coupons').delete().eq('id', id);
    return !error;
  } catch {
    return false;
  }
}

export async function generateCouponCode(prefix?: string, length?: number): Promise<string> {
  try {
    const { data, error } = await supabase.rpc('generate_coupon_code', {
      p_prefix: prefix || '',
      p_length: length || 8,
    });
    if (error) throw error;
    return data as string;
  } catch {
    return `CODE${Date.now().toString(36).toUpperCase()}`;
  }
}

// ─── Coupon Validation & Redemption ──────────────────────────────────────────

export async function validateCoupon(
  code: string,
  userId: string,
  amount: number,
  listingId?: string,
): Promise<ValidationResult> {
  try {
    const { data, error } = await supabase.rpc('validate_coupon', {
      p_code: code.toUpperCase(),
      p_user_id: userId,
      p_amount: amount,
      p_listing_id: listingId || null,
    });
    if (error) throw error;
    const row = (data || [])[0];
    return {
      valid: row?.valid ?? false,
      discount_amount: row?.discount_amount ?? 0,
      message: row?.message ?? 'Validation failed',
      coupon_id: row?.coupon_id ?? null,
    };
  } catch (err) {
    console.error('validateCoupon error:', err);
    return { valid: false, discount_amount: 0, message: 'Validation failed', coupon_id: null };
  }
}

export async function redeemCoupon(
  code: string,
  userId: string,
  amount: number,
  listingId?: string,
): Promise<RedemptionResult> {
  try {
    const { data, error } = await supabase.rpc('redeem_coupon', {
      p_code: code.toUpperCase(),
      p_user_id: userId,
      p_amount: amount,
      p_listing_id: listingId || null,
    });
    if (error) throw error;
    const row = (data || [])[0];
    return {
      success: row?.success ?? false,
      discount_amount: row?.discount_amount ?? 0,
      final_amount: row?.final_amount ?? amount,
      message: row?.message ?? 'Redemption failed',
    };
  } catch (err) {
    console.error('redeemCoupon error:', err);
    return { success: false, discount_amount: 0, final_amount: amount, message: 'Redemption failed' };
  }
}

// ─── Reward Wallet ───────────────────────────────────────────────────────────

export async function fetchWallet(userId: string): Promise<RewardWallet | null> {
  try {
    const { data, error } = await supabase
      .from('reward_wallets')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data as RewardWallet | null;
  } catch {
    return null;
  }
}

export async function fetchRewardTransactions(userId: string, limit = 50): Promise<RewardTransaction[]> {
  try {
    const { data, error } = await supabase
      .from('reward_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []) as RewardTransaction[];
  } catch {
    return [];
  }
}

export async function fetchUserRedemptions(userId: string, limit = 50): Promise<CouponRedemption[]> {
  try {
    const { data, error } = await supabase
      .from('coupon_redemptions')
      .select('*')
      .eq('user_id', userId)
      .order('redeemed_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []) as CouponRedemption[];
  } catch {
    return [];
  }
}

export async function addRewardToWallet(
  userId: string,
  rewardType: string,
  amount: number,
  description?: string,
): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('add_reward_to_wallet', {
      p_user_id: userId,
      p_reward_type: rewardType,
      p_amount: amount,
      p_description: description || null,
    });
    return !error;
  } catch {
    return false;
  }
}

// ─── Giveaway Campaigns ───────────────────────────────────────────────────────

export async function fetchGiveaways(status?: string): Promise<GiveawayCampaign[]> {
  try {
    let query = supabase.from('giveaway_campaigns').select('*').order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as GiveawayCampaign[];
  } catch {
    return [];
  }
}

export interface CreateGiveawayInput {
  name: string;
  description?: string;
  giveaway_type: GiveawayType;
  reward_type: RewardType;
  reward_value: number;
  reward_coupon_id?: string;
  max_winners: number;
  max_entries?: number;
  end_date?: string | null;
}

export async function createGiveaway(input: CreateGiveawayInput): Promise<GiveawayCampaign | null> {
  try {
    const { data, error } = await supabase
      .from('giveaway_campaigns')
      .insert({
        name: input.name,
        description: input.description || null,
        giveaway_type: input.giveaway_type,
        reward_type: input.reward_type,
        reward_value: input.reward_value,
        reward_coupon_id: input.reward_coupon_id || null,
        max_winners: input.max_winners,
        max_entries: input.max_entries ?? null,
        end_date: input.end_date || null,
      })
      .select()
      .single();
    if (error) throw error;
    return data as GiveawayCampaign;
  } catch {
    return null;
  }
}

export async function updateGiveaway(id: string, updates: Partial<GiveawayCampaign>): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('giveaway_campaigns')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id);
    return !error;
  } catch {
    return false;
  }
}

export async function deleteGiveaway(id: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('giveaway_campaigns').delete().eq('id', id);
    return !error;
  } catch {
    return false;
  }
}

export async function enterGiveaway(giveawayId: string, userId: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('giveaway_entries').insert({
      giveaway_id: giveawayId,
      user_id: userId,
    });
    return !error;
  } catch {
    return false;
  }
}

export async function fetchGiveawayEntries(giveawayId: string): Promise<GiveawayEntry[]> {
  try {
    const { data, error } = await supabase
      .from('giveaway_entries')
      .select('*')
      .eq('giveaway_id', giveawayId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as GiveawayEntry[];
  } catch {
    return [];
  }
}

export async function selectWinners(giveawayId: string, count: number): Promise<GiveawayEntry[]> {
  try {
    const entries = await fetchGiveawayEntries(giveawayId);
    const nonWinners = entries.filter(e => !e.is_winner);
    const shuffled = [...nonWinners].sort(() => Math.random() - 0.5);
    const winners = shuffled.slice(0, count);
    for (const w of winners) {
      await supabase.from('giveaway_entries').update({ is_winner: true }).eq('id', w.id);
    }
    return winners;
  } catch {
    return [];
  }
}

// ─── Featured Listing Rewards ──────────────────────────────────────────────────

export async function fetchFeaturedRewards(listingId?: string): Promise<FeaturedListingReward[]> {
  try {
    let query = supabase.from('featured_listing_rewards').select('*').order('created_at', { ascending: false });
    if (listingId) query = query.eq('listing_id', listingId);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as FeaturedListingReward[];
  } catch {
    return [];
  }
}

export async function fetchActiveFeaturedRewards(listingId: string): Promise<FeaturedListingReward[]> {
  try {
    const { data, error } = await supabase
      .from('featured_listing_rewards')
      .select('*')
      .eq('listing_id', listingId)
      .eq('status', 'active')
      .order('end_date', { ascending: true });
    if (error) throw error;
    return (data || []) as FeaturedListingReward[];
  } catch {
    return [];
  }
}

export interface CreateFeaturedRewardInput {
  listing_id: string;
  listing_type: string;
  reward_type: FeaturedRewardType;
  duration_days: number;
  reason?: string;
}

export async function createFeaturedReward(input: CreateFeaturedRewardInput): Promise<FeaturedListingReward | null> {
  try {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + input.duration_days);
    const { data, error } = await supabase
      .from('featured_listing_rewards')
      .insert({
        listing_id: input.listing_id,
        listing_type: input.listing_type,
        reward_type: input.reward_type,
        duration_days: input.duration_days,
        end_date: endDate.toISOString(),
        reason: input.reason || null,
      })
      .select()
      .single();
    if (error) throw error;
    return data as FeaturedListingReward;
  } catch {
    return null;
  }
}

export async function revokeFeaturedReward(id: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('featured_listing_rewards')
      .update({ status: 'revoked' })
      .eq('id', id);
    return !error;
  } catch {
    return false;
  }
}

// ─── Reward Analytics ──────────────────────────────────────────────────────────

export interface RewardAnalytics {
  total_coupons: number;
  active_coupons: number;
  total_redemptions: number;
  total_discount_given: number;
  total_revenue_generated: number;
  avg_redemption_rate: number;
  top_coupons: { code: string; name: string; redemptions: number; discount: number }[];
}

export async function fetchRewardAnalytics(): Promise<RewardAnalytics> {
  try {
    const [couponsRes, redemptionsRes] = await Promise.all([
      supabase.from('coupons').select('id, code, name, current_uses, is_active'),
      supabase.from('coupon_redemptions').select('coupon_id, discount_amount, original_amount'),
    ]);

    const coupons = (couponsRes.data || []) as { id: string; code: string; name: string; current_uses: number; is_active: boolean }[];
    const redemptions = (redemptionsRes.data || []) as { coupon_id: string; discount_amount: number; original_amount: number }[];

    const totalDiscount = redemptions.reduce((s, r) => s + Number(r.discount_amount), 0);
    const totalRevenue = redemptions.reduce((s, r) => s + (Number(r.original_amount) - Number(r.discount_amount)), 0);

    const couponStats = new Map<string, { code: string; name: string; redemptions: number; discount: number }>();
    for (const r of redemptions) {
      const coupon = coupons.find(c => c.id === r.coupon_id);
      if (!coupon) continue;
      const existing = couponStats.get(coupon.id) || { code: coupon.code, name: coupon.name, redemptions: 0, discount: 0 };
      existing.redemptions++;
      existing.discount += Number(r.discount_amount);
      couponStats.set(coupon.id, existing);
    }

    return {
      total_coupons: coupons.length,
      active_coupons: coupons.filter(c => c.is_active).length,
      total_redemptions: redemptions.length,
      total_discount_given: totalDiscount,
      total_revenue_generated: totalRevenue,
      avg_redemption_rate: coupons.length > 0 ? (redemptions.length / coupons.length) * 100 : 0,
      top_coupons: Array.from(couponStats.values()).sort((a, b) => b.redemptions - a.redemptions).slice(0, 10),
    };
  } catch {
    return {
      total_coupons: 0, active_coupons: 0, total_redemptions: 0,
      total_discount_given: 0, total_revenue_generated: 0, avg_redemption_rate: 0, top_coupons: [],
    };
  }
}
