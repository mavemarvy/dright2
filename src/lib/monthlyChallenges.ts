import { supabase } from './supabase';

export type MonthlyChallengeSection = 'referral' | 'affiliate';
export type MonthlyChallengePeriod = 'current' | 'previous';

export interface MonthlyChallengeDefinition {
  challenge_key: string;
  section: MonthlyChallengeSection;
  title: string;
  description: string | null;
  metric_label: string;
  enabled: boolean;
  reward_currency: string;
  reward_first: number;
  reward_second: number;
  reward_third: number;
  display_limit: number;
  sort_order?: number;
}

export interface MonthlyLeaderboardEntry {
  rank: number;
  user_id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  primary_metric: number;
  secondary_metric: number;
  tertiary_metric: number;
  detail: Record<string, number | string | boolean | null>;
}

export interface MonthlyChallengeCatalog {
  period: MonthlyChallengePeriod;
  period_start: string;
  period_end: string;
  history: boolean;
  challenges: MonthlyChallengeDefinition[];
}

export interface MonthlyLeaderboardResponse {
  challenge_key: string;
  period: MonthlyChallengePeriod;
  period_start: string;
  total: number;
  offset: number;
  limit: number;
  entries: MonthlyLeaderboardEntry[];
}

export interface MonthlyChallengeAward {
  id: string;
  period_start: string;
  challenge_key: string;
  rank: number;
  user_id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  primary_metric: number;
  secondary_metric: number;
  reward_amount: number;
  reward_currency: string;
  status: 'pending' | 'paid' | 'cancelled';
  paid_at: string | null;
}

export interface AdminMonthlyChallengeData {
  settings: MonthlyChallengeDefinition[];
  previous_awards: MonthlyChallengeAward[];
}

function n(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeDefinition(row: any): MonthlyChallengeDefinition {
  return {
    challenge_key: String(row.challenge_key),
    section: row.section === 'affiliate' ? 'affiliate' : 'referral',
    title: String(row.title ?? ''),
    description: row.description ? String(row.description) : null,
    metric_label: String(row.metric_label ?? 'points'),
    enabled: Boolean(row.enabled),
    reward_currency: String(row.reward_currency ?? 'NGN').toUpperCase(),
    reward_first: n(row.reward_first),
    reward_second: n(row.reward_second),
    reward_third: n(row.reward_third),
    display_limit: Math.max(3, Number(row.display_limit ?? 25)),
    sort_order: Number(row.sort_order ?? 0),
  };
}

function normalizeEntry(row: any): MonthlyLeaderboardEntry {
  return {
    rank: Number(row.rank ?? 0),
    user_id: String(row.user_id),
    full_name: row.full_name ? String(row.full_name) : null,
    username: row.username ? String(row.username) : null,
    avatar_url: row.avatar_url ? String(row.avatar_url) : null,
    primary_metric: n(row.primary_metric),
    secondary_metric: n(row.secondary_metric),
    tertiary_metric: n(row.tertiary_metric),
    detail: (row.detail && typeof row.detail === 'object') ? row.detail : {},
  };
}

export async function fetchMonthlyChallengeCatalog(
  period: MonthlyChallengePeriod = 'current',
): Promise<MonthlyChallengeCatalog> {
  const { data, error } = await supabase.rpc('get_public_monthly_growth_challenges', {
    p_period: period,
  });
  if (error) throw error;
  const row = data ?? {};
  return {
    period,
    period_start: String(row.period_start ?? ''),
    period_end: String(row.period_end ?? ''),
    history: Boolean(row.history),
    challenges: Array.isArray(row.challenges) ? row.challenges.map(normalizeDefinition) : [],
  };
}

export async function fetchMonthlyLeaderboard(
  challengeKey: string,
  period: MonthlyChallengePeriod = 'current',
  limit = 25,
  offset = 0,
): Promise<MonthlyLeaderboardResponse> {
  const { data, error } = await supabase.rpc('get_public_monthly_growth_leaderboard', {
    p_challenge_key: challengeKey,
    p_period: period,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  const row = data ?? {};
  return {
    challenge_key: String(row.challenge_key ?? challengeKey),
    period,
    period_start: String(row.period_start ?? ''),
    total: Number(row.total ?? 0),
    offset: Number(row.offset ?? offset),
    limit: Number(row.limit ?? limit),
    entries: Array.isArray(row.entries) ? row.entries.map(normalizeEntry) : [],
  };
}

export async function fetchAdminMonthlyChallengeSettings(): Promise<AdminMonthlyChallengeData> {
  const { data, error } = await supabase.rpc('admin_get_monthly_growth_challenge_settings');
  if (error) throw error;
  const row = data ?? {};
  return {
    settings: Array.isArray(row.settings) ? row.settings.map(normalizeDefinition) : [],
    previous_awards: Array.isArray(row.previous_awards)
      ? row.previous_awards.map((a: any) => ({
          id: String(a.id),
          period_start: String(a.period_start),
          challenge_key: String(a.challenge_key),
          rank: Number(a.rank ?? 0),
          user_id: String(a.user_id),
          full_name: a.full_name ? String(a.full_name) : null,
          username: a.username ? String(a.username) : null,
          avatar_url: a.avatar_url ? String(a.avatar_url) : null,
          primary_metric: n(a.primary_metric),
          secondary_metric: n(a.secondary_metric),
          reward_amount: n(a.reward_amount),
          reward_currency: String(a.reward_currency ?? 'NGN'),
          status: (a.status ?? 'pending') as MonthlyChallengeAward['status'],
          paid_at: a.paid_at ? String(a.paid_at) : null,
        }))
      : [],
  };
}

export async function updateAdminMonthlyChallenge(
  setting: MonthlyChallengeDefinition,
): Promise<MonthlyChallengeDefinition> {
  const { data, error } = await supabase.rpc('admin_update_monthly_growth_challenge', {
    p_challenge_key: setting.challenge_key,
    p_enabled: setting.enabled,
    p_title: setting.title,
    p_description: setting.description,
    p_reward_currency: setting.reward_currency,
    p_reward_first: setting.reward_first,
    p_reward_second: setting.reward_second,
    p_reward_third: setting.reward_third,
    p_display_limit: setting.display_limit,
  });
  if (error) throw error;
  return normalizeDefinition(data);
}

export function challengeRewardForRank(
  challenge: MonthlyChallengeDefinition,
  rank: number,
): number {
  if (rank === 1) return challenge.reward_first;
  if (rank === 2) return challenge.reward_second;
  if (rank === 3) return challenge.reward_third;
  return 0;
}

export function formatChallengeReward(amount: number, currency: string): string {
  if (!amount) return 'Reward not set';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}
