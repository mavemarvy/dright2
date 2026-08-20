import { supabase } from './supabase';

export const REFERRAL_LEVELS = {
  1: { level: 1, rate: 0.10, label: 'Direct' },
  2: { level: 2, rate: 0.05, label: 'Network' },
  3: { level: 3, rate: 0.01, label: 'Extended' },
} as const;

export const BUYER_WINDOW_DAYS = 14;
export const VENDOR_WINDOW_DAYS = 30;
export const MIN_WITHDRAWAL_USD = 5;

export type RewardStatus = 'pending' | 'confirmed' | 'expired' | 'paid';
export type RewardType = 'first_purchase' | 'first_sale';

export interface ReferralStats {
  total_referrals: number;
  active_referrals: number;
  total_earned: number;
  pending_earnings: number;
  withdrawable_earnings: number;
}

export interface ReferralReward {
  id: string;
  referrer_id: string;
  referred_user_id: string;
  level: number;
  transaction_id: string | null;
  reward_amount: number;
  reward_type: RewardType;
  status: RewardStatus;
  expires_at: string | null;
  created_at: string;
  paid_at: string | null;
  referred_name?: string;
  referred_email?: string;
}

export interface ReferralRelationship {
  id: string;
  referrer_id: string;
  referred_id: string;
  level: number;
  created_at: string;
  referred_name?: string;
  referred_email?: string;
  referred_avatar?: string | null;
}

export interface LeaderboardEntry {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  total_earned: number;
  total_referrals: number;
}

export interface WithdrawalRequest {
  id: string;
  user_id: string;
  amount: number;
  method: string;
  status: string;
  created_at: string;
}

export const EMPTY_STATS: ReferralStats = {
  total_referrals: 0,
  active_referrals: 0,
  total_earned: 0,
  pending_earnings: 0,
  withdrawable_earnings: 0,
};

export function buildReferralLink(referralCode: string | null | undefined): string {
  const base = typeof window !== 'undefined' ? window.location.origin : 'https://dright.store';
  const code = referralCode || 'DRIGHT';
  return `${base}/ref?ref=${encodeURIComponent(code)}`;
}

export function calculateRewardFromFee(platformFee: number, level: 1 | 2 | 3): number {
  const rate = REFERRAL_LEVELS[level].rate;
  return Math.round(platformFee * rate * 100) / 100;
}

export async function fetchReferralStats(userId: string): Promise<ReferralStats> {
  const { data } = await supabase
    .from('referral_stats')
    .select('total_referrals, active_referrals, total_earned, pending_earnings, withdrawable_earnings')
    .eq('user_id', userId)
    .maybeSingle();
  if (!data) return EMPTY_STATS;
  return {
    total_referrals: data.total_referrals ?? 0,
    active_referrals: data.active_referrals ?? 0,
    total_earned: Number(data.total_earned ?? 0),
    pending_earnings: Number(data.pending_earnings ?? 0),
    withdrawable_earnings: Number(data.withdrawable_earnings ?? 0),
  };
}

export async function refreshStats(userId: string): Promise<void> {
  await supabase.rpc('refresh_referral_stats', { p_user_id: userId });
}

export async function expireRewards(): Promise<void> {
  await supabase.rpc('expire_referral_rewards');
}

export async function fetchReferralRewards(
  userId: string,
  page = 1,
  pageSize = 10
): Promise<{ rewards: ReferralReward[]; total: number }> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const [rewardsRes, countRes] = await Promise.all([
    supabase
      .from('referral_rewards')
      .select('id, referrer_id, referred_user_id, level, transaction_id, reward_amount, reward_type, status, expires_at, created_at, paid_at')
      .eq('referrer_id', userId)
      .order('created_at', { ascending: false })
      .range(from, to),
    supabase
      .from('referral_rewards')
      .select('id', { count: 'exact', head: true })
      .eq('referrer_id', userId),
  ]);

  const rewards = (rewardsRes.data ?? []) as ReferralReward[];
  const total = countRes.count ?? 0;

  if (rewards.length > 0) {
    const ids = rewards.map((r) => r.referred_user_id);
    const { data: users } = await supabase
      .from('users')
      .select('id, full_name, email')
      .in('id', ids);
    const map = new Map((users ?? []).map((u) => [u.id, u]));
    for (const r of rewards) {
      const u = map.get(r.referred_user_id);
      r.referred_name = u?.full_name ?? undefined;
      r.referred_email = u?.email ?? undefined;
    }
  }

  return { rewards, total };
}

export async function fetchReferralTree(userId: string): Promise<ReferralRelationship[]> {
  const { data } = await supabase
    .from('referral_relationships')
    .select('id, referrer_id, referred_id, level, created_at')
    .eq('referrer_id', userId)
    .order('level', { ascending: true })
    .limit(50);

  const rels = (data ?? []) as ReferralRelationship[];
  if (rels.length === 0) return rels;

  const ids = rels.map((r) => r.referred_id);
  const { data: users } = await supabase
    .from('users')
    .select('id, full_name, email, avatar_url')
    .in('id', ids);
  const map = new Map((users ?? []).map((u) => [u.id, u]));
  for (const r of rels) {
    const u = map.get(r.referred_id);
    r.referred_name = u?.full_name ?? undefined;
    r.referred_email = u?.email ?? undefined;
    r.referred_avatar = u?.avatar_url ?? null;
  }
  return rels;
}

export async function fetchLeaderboard(limit = 10): Promise<LeaderboardEntry[]> {
  const { data } = await supabase
    .from('referral_stats')
    .select('user_id, total_earned, total_referrals')
    .order('total_earned', { ascending: false })
    .limit(limit);

  const entries = (data ?? []) as Array<{ user_id: string; total_earned: number; total_referrals: number }>;
  if (entries.length === 0) return [];

  const { data: users } = await supabase
    .from('users')
    .select('id, full_name, avatar_url')
    .in('id', entries.map((e) => e.user_id));
  const map = new Map((users ?? []).map((u) => [u.id, u]));

  return entries.map((e) => ({
    user_id: e.user_id,
    full_name: map.get(e.user_id)?.full_name ?? null,
    avatar_url: map.get(e.user_id)?.avatar_url ?? null,
    total_earned: Number(e.total_earned ?? 0),
    total_referrals: e.total_referrals ?? 0,
  }));
}

export async function requestWithdrawal(
  userId: string,
  amount: number,
  method: string
): Promise<{ error: string | null }> {
  if (amount < MIN_WITHDRAWAL_USD) {
    return { error: `Minimum withdrawal is $${MIN_WITHDRAWAL_USD}` };
  }
  const { data: stats } = await supabase
    .from('referral_stats')
    .select('withdrawable_earnings')
    .eq('user_id', userId)
    .maybeSingle();
  const available = Number(stats?.withdrawable_earnings ?? 0);
  if (amount > available) {
    return { error: 'Amount exceeds withdrawable earnings' };
  }
  const { error } = await supabase.from('referral_withdrawals').insert({
    user_id: userId,
    amount,
    method,
    status: 'pending',
  });
  return { error: error ? error.message : null };
}

export async function fetchWithdrawals(userId: string): Promise<WithdrawalRequest[]> {
  const { data } = await supabase
    .from('referral_withdrawals')
    .select('id, user_id, amount, method, status, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);
  return (data ?? []) as WithdrawalRequest[];
}

export async function logFraudAttempt(params: {
  referrerId?: string | null;
  referredUserId?: string | null;
  reason: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  await supabase.from('referral_fraud_logs').insert({
    referrer_id: params.referrerId ?? null,
    referred_user_id: params.referredUserId ?? null,
    reason: params.reason,
    details: params.details ?? null,
  });
}

export interface ConversionFunnel {
  signups: number;
  first_purchases: number;
  first_sales: number;
}

export async function fetchAdminReferralAnalytics(): Promise<{
  totalReferrals: number;
  activeReferrals: number;
  expiredReferrals: number;
  payoutVolume: number;
  topReferrers: LeaderboardEntry[];
  fraudAlerts: number;
  funnel: ConversionFunnel;
}> {
  const [totalRes, activeRes, expiredRes, paidRes, fraudRes, topRes] = await Promise.all([
    supabase.from('referral_relationships').select('id', { count: 'exact', head: true }),
    supabase.from('referral_rewards').select('id', { count: 'exact', head: true }).in('status', ['pending', 'confirmed', 'paid']),
    supabase.from('referral_rewards').select('id', { count: 'exact', head: true }).eq('status', 'expired'),
    supabase.from('referral_rewards').select('reward_amount').eq('status', 'paid'),
    supabase.from('referral_fraud_logs').select('id', { count: 'exact', head: true }),
    supabase.from('referral_stats').select('user_id, total_earned, total_referrals').order('total_earned', { ascending: false }).limit(5),
  ]);

  const totalReferrals = totalRes.count ?? 0;
  const activeReferrals = activeRes.count ?? 0;
  const expiredReferrals = expiredRes.count ?? 0;
  const payoutVolume = (paidRes.data ?? []).reduce((sum, r) => sum + Number((r as { reward_amount: number }).reward_amount ?? 0), 0);
  const fraudAlerts = fraudRes.count ?? 0;

  const topEntries = (topRes.data ?? []) as Array<{ user_id: string; total_earned: number; total_referrals: number }>;
  let topReferrers: LeaderboardEntry[] = [];
  if (topEntries.length > 0) {
    const { data: users } = await supabase
      .from('users')
      .select('id, full_name, avatar_url')
      .in('id', topEntries.map((e) => e.user_id));
    const map = new Map((users ?? []).map((u) => [u.id, u]));
    topReferrers = topEntries.map((e) => ({
      user_id: e.user_id,
      full_name: map.get(e.user_id)?.full_name ?? null,
      avatar_url: map.get(e.user_id)?.avatar_url ?? null,
      total_earned: Number(e.total_earned ?? 0),
      total_referrals: e.total_referrals ?? 0,
    }));
  }

  const funnel: ConversionFunnel = {
    signups: totalReferrals,
    first_purchases: activeReferrals,
    first_sales: expiredReferrals,
  };

  return {
    totalReferrals,
    activeReferrals,
    expiredReferrals,
    payoutVolume,
    topReferrers,
    fraudAlerts,
    funnel,
  };
}
