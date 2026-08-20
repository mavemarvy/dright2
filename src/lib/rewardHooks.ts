// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT Reward Hooks
// React hooks for coupons, wallets, giveaways, and featured rewards.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import {
  type Coupon, type RewardWallet, type RewardTransaction, type CouponRedemption,
  type GiveawayCampaign, type FeaturedListingReward, type RewardAnalytics,
  type ValidationResult, type RedemptionResult,
  fetchCoupons, fetchPublishedCoupons, fetchWallet, fetchRewardTransactions,
  fetchUserRedemptions, fetchGiveaways, fetchFeaturedRewards, fetchRewardAnalytics,
  validateCoupon, redeemCoupon,
} from './rewardEngine';

export function useCoupons(filter?: { active?: boolean; archived?: boolean; published?: boolean }) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    setLoading(true);
    fetchCoupons(filter).then(c => { setCoupons(c); setLoading(false); });
  }, [JSON.stringify(filter)]);

  useEffect(() => { refetch(); }, [refetch]);
  return { coupons, loading, refetch };
}

export function usePublishedCoupons() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPublishedCoupons().then(c => { setCoupons(c); setLoading(false); });
  }, []);

  return { coupons, loading };
}

export function useWallet(userId: string | null | undefined) {
  const [wallet, setWallet] = useState<RewardWallet | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    fetchWallet(userId).then(w => { setWallet(w); setLoading(false); });
  }, [userId]);

  useEffect(() => { refetch(); }, [refetch]);
  return { wallet, loading, refetch };
}

export function useRewardTransactions(userId: string | null | undefined, limit = 50) {
  const [transactions, setTransactions] = useState<RewardTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    fetchRewardTransactions(userId, limit).then(t => { setTransactions(t); setLoading(false); });
  }, [userId, limit]);

  return { transactions, loading };
}

export function useUserRedemptions(userId: string | null | undefined, limit = 50) {
  const [redemptions, setRedemptions] = useState<CouponRedemption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    fetchUserRedemptions(userId, limit).then(r => { setRedemptions(r); setLoading(false); });
  }, [userId, limit]);

  return { redemptions, loading };
}

export function useGiveaways(status?: string) {
  const [giveaways, setGiveaways] = useState<GiveawayCampaign[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    setLoading(true);
    fetchGiveaways(status).then(g => { setGiveaways(g); setLoading(false); });
  }, [status]);

  useEffect(() => { refetch(); }, [refetch]);
  return { giveaways, loading, refetch };
}

export function useFeaturedRewards(listingId?: string) {
  const [rewards, setRewards] = useState<FeaturedListingReward[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchFeaturedRewards(listingId).then(r => { setRewards(r); setLoading(false); });
  }, [listingId]);

  return { rewards, loading };
}

export function useRewardAnalytics() {
  const [analytics, setAnalytics] = useState<RewardAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    setLoading(true);
    fetchRewardAnalytics().then(a => { setAnalytics(a); setLoading(false); });
  }, []);

  useEffect(() => { refetch(); }, [refetch]);
  return { analytics, loading, refetch };
}

export function useCouponValidation() {
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState<ValidationResult | null>(null);

  const validate = useCallback(async (code: string, userId: string, amount: number, listingId?: string) => {
    setValidating(true);
    const r = await validateCoupon(code, userId, amount, listingId);
    setResult(r);
    setValidating(false);
    return r;
  }, []);

  return { validate, validating, result };
}

export function useCouponRedemption() {
  const [redeeming, setRedeeming] = useState(false);

  const redeem = useCallback(async (code: string, userId: string, amount: number, listingId?: string): Promise<RedemptionResult> => {
    setRedeeming(true);
    const r = await redeemCoupon(code, userId, amount, listingId);
    setRedeeming(false);
    return r;
  }, []);

  return { redeem, redeeming };
}
