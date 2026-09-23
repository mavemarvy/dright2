import { supabase } from './supabase';

export type MonthlyChallengeSection = 'referral' | 'affiliate';
export type MonthlyChallengePeriod = 'current' | 'previous' | `month:${string}`;

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

export interface MonthlyHistoryPeriod {
  period: MonthlyChallengePeriod;
  period_start: string;
  label: string;
}

export interface MonthlyLeaderboardEntry {
  rank: number;
  reward_rank: number;
  user_id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  primary_metric: number;
  secondary_metric: number;
  tertiary_metric: number;
  detail: Record<string, number | string | boolean | null>;
  is_simulated: boolean;
  is_ranked: boolean;
  source_label: string;
}

export interface MonthlyChallengeCatalog {
  period: MonthlyChallengePeriod;
  period_start: string;
  period_end: string;
  history: boolean;
  history_periods: MonthlyHistoryPeriod[];
  simulation_enabled: boolean;
  simulation_label: string;
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
    reward_rank: Number(row.reward_rank ?? row.rank ?? 0),
    user_id: String(row.user_id ?? ''),
    full_name: row.full_name ? String(row.full_name) : null,
    username: row.username ? String(row.username) : null,
    avatar_url: row.avatar_url ? String(row.avatar_url) : null,
    primary_metric: n(row.primary_metric),
    secondary_metric: n(row.secondary_metric),
    tertiary_metric: n(row.tertiary_metric),
    detail: (row.detail && typeof row.detail === 'object') ? row.detail : {},
    is_simulated: Boolean(row.is_simulated),
    is_ranked: row.is_ranked === undefined ? Number(row.rank ?? 0) > 0 : Boolean(row.is_ranked),
    source_label: String(row.source_label ?? (row.is_simulated ? 'AI challenger' : 'DRIGHT user')),
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
    history_periods: Array.isArray(row.history_periods)
      ? row.history_periods.map((item: any) => ({
          period: String(item.period ?? 'previous') as MonthlyChallengePeriod,
          period_start: String(item.period_start ?? ''),
          label: String(item.label ?? item.period_start ?? 'History'),
        }))
      : [],
    simulation_enabled: Boolean(row.simulation_enabled),
    simulation_label: String(row.simulation_label ?? 'AI challenger'),
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

export interface CompetitionPayoutSettings {
  auto_payout_enabled: boolean;
  auto_payout_max_risk_score: number;
  payout_destination: 'wallet';
  updated_at?: string | null;
  updated_by?: string | null;
}

export interface CompetitionHistorySettings {
  visible_months: number;
  updated_at?: string | null;
  updated_by?: string | null;
}

export interface CompetitionSimulationSettings {
  enabled: boolean;
  public_label: string;
  updated_at?: string | null;
  updated_by?: string | null;
}

export interface CompetitionDashboardStats {
  active_competitions: number;
  active_users: number;
  ranked_users: number;
  pending_review: number;
  flagged_awards: number;
  paid_awards: number;
  paid_total: number;
}

export interface CompetitionAward {
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
  review_status: 'pending' | 'flagged' | 'approved' | 'auto_approved' | 'rejected' | 'paid';
  review_notes: string | null;
  risk_score: number;
  fraud_flags: string[];
  payout_reference: string | null;
  payout_mode: 'manual' | 'auto' | null;
  paid_at: string | null;
  reviewed_at: string | null;
}

export interface CompetitionHistorySnapshot {
  period_start: string;
  challenge_key: string;
  entries: MonthlyLeaderboardEntry[];
  rewards: {
    currency?: string;
    first?: number;
    second?: number;
    third?: number;
  };
  finalized_at: string | null;
}

export interface CompetitionRecentActivity {
  event_at: string;
  event_type: string;
  actor_id: string;
  actor_name: string | null;
  actor_username: string | null;
  target_user_id: string | null;
  target_name: string | null;
  value: number;
  order_id: string | null;
}

export interface SimulatedCompetitor {
  id: string;
  display_name: string;
  avatar_url: string | null;
  active: boolean;
  base_score: number;
  target_score: number | null;
  increment_amount: number;
  increment_interval_seconds: number;
  enabled: boolean;
  effective_score: number;
}

export interface SimulatedCompetitorPage {
  challenge_key: string;
  period_start: string;
  total: number;
  offset: number;
  limit: number;
  entries: SimulatedCompetitor[];
}

export interface CompetitionDashboardData {
  current_period_start: string;
  current_period_end: string;
  stats: CompetitionDashboardStats;
  payout_settings: CompetitionPayoutSettings;
  history_settings: CompetitionHistorySettings;
  simulation_settings: CompetitionSimulationSettings;
  settings: MonthlyChallengeDefinition[];
  awards: CompetitionAward[];
  history: CompetitionHistorySnapshot[];
  recent_activity: CompetitionRecentActivity[];
}

function normalizeCompetitionAward(row: any): CompetitionAward {
  return {
    id: String(row.id),
    period_start: String(row.period_start ?? ''),
    challenge_key: String(row.challenge_key ?? ''),
    rank: Number(row.rank ?? 0),
    user_id: String(row.user_id ?? ''),
    full_name: row.full_name ? String(row.full_name) : null,
    username: row.username ? String(row.username) : null,
    avatar_url: row.avatar_url ? String(row.avatar_url) : null,
    primary_metric: n(row.primary_metric),
    secondary_metric: n(row.secondary_metric),
    reward_amount: n(row.reward_amount),
    reward_currency: String(row.reward_currency ?? 'NGN').toUpperCase(),
    status: (row.status ?? 'pending') as CompetitionAward['status'],
    review_status: (row.review_status ?? 'pending') as CompetitionAward['review_status'],
    review_notes: row.review_notes ? String(row.review_notes) : null,
    risk_score: Number(row.risk_score ?? 0),
    fraud_flags: Array.isArray(row.fraud_flags) ? row.fraud_flags.map(String) : [],
    payout_reference: row.payout_reference ? String(row.payout_reference) : null,
    payout_mode: row.payout_mode === 'auto' || row.payout_mode === 'manual' ? row.payout_mode : null,
    paid_at: row.paid_at ? String(row.paid_at) : null,
    reviewed_at: row.reviewed_at ? String(row.reviewed_at) : null,
  };
}

export async function fetchAdminCompetitionDashboard(): Promise<CompetitionDashboardData> {
  const { data, error } = await supabase.rpc('admin_get_monthly_growth_competition_dashboard');
  if (error) throw error;
  const row = data ?? {};
  const payout = row.payout_settings ?? {};
  const historySettings = row.history_settings ?? {};
  const simulation = row.simulation_settings ?? {};
  const stats = row.stats ?? {};
  return {
    current_period_start: String(row.current_period_start ?? ''),
    current_period_end: String(row.current_period_end ?? ''),
    stats: {
      active_competitions: Number(stats.active_competitions ?? 0),
      active_users: Number(stats.active_users ?? 0),
      ranked_users: Number(stats.ranked_users ?? 0),
      pending_review: Number(stats.pending_review ?? 0),
      flagged_awards: Number(stats.flagged_awards ?? 0),
      paid_awards: Number(stats.paid_awards ?? 0),
      paid_total: n(stats.paid_total),
    },
    payout_settings: {
      auto_payout_enabled: Boolean(payout.auto_payout_enabled),
      auto_payout_max_risk_score: Number(payout.auto_payout_max_risk_score ?? 0),
      payout_destination: 'wallet',
      updated_at: payout.updated_at ? String(payout.updated_at) : null,
      updated_by: payout.updated_by ? String(payout.updated_by) : null,
    },
    history_settings: {
      visible_months: Number(historySettings.visible_months ?? 1),
      updated_at: historySettings.updated_at ? String(historySettings.updated_at) : null,
      updated_by: historySettings.updated_by ? String(historySettings.updated_by) : null,
    },
    simulation_settings: {
      enabled: Boolean(simulation.enabled),
      public_label: String(simulation.public_label ?? 'AI challenger'),
      updated_at: simulation.updated_at ? String(simulation.updated_at) : null,
      updated_by: simulation.updated_by ? String(simulation.updated_by) : null,
    },
    settings: Array.isArray(row.settings) ? row.settings.map(normalizeDefinition) : [],
    awards: Array.isArray(row.awards) ? row.awards.map(normalizeCompetitionAward) : [],
    history: Array.isArray(row.history)
      ? row.history.map((item: any) => ({
          period_start: String(item.period_start ?? ''),
          challenge_key: String(item.challenge_key ?? ''),
          entries: Array.isArray(item.entries)
            ? item.entries.map((entry: any) => normalizeEntry({
                ...entry,
                is_simulated: false,
                is_ranked: Number(entry?.rank ?? 0) > 0,
                reward_rank: Number(entry?.rank ?? 0),
                source_label: 'DRIGHT user',
              }))
            : [],
          rewards: (item.rewards && typeof item.rewards === 'object') ? item.rewards : {},
          finalized_at: item.finalized_at ? String(item.finalized_at) : null,
        }))
      : [],
    recent_activity: Array.isArray(row.recent_activity)
      ? row.recent_activity.map((item: any) => ({
          event_at: String(item.event_at ?? ''),
          event_type: String(item.event_type ?? ''),
          actor_id: String(item.actor_id ?? ''),
          actor_name: item.actor_name ? String(item.actor_name) : null,
          actor_username: item.actor_username ? String(item.actor_username) : null,
          target_user_id: item.target_user_id ? String(item.target_user_id) : null,
          target_name: item.target_name ? String(item.target_name) : null,
          value: n(item.value),
          order_id: item.order_id ? String(item.order_id) : null,
        }))
      : [],
  };
}

export async function updateAdminCompetitionAutoPayout(enabled: boolean): Promise<CompetitionPayoutSettings> {
  const { data, error } = await supabase.rpc('admin_update_monthly_growth_payout_settings', {
    p_auto_payout_enabled: enabled,
  });
  if (error) throw error;
  const row = data ?? {};
  return {
    auto_payout_enabled: Boolean(row.auto_payout_enabled),
    auto_payout_max_risk_score: Number(row.auto_payout_max_risk_score ?? 0),
    payout_destination: 'wallet',
  };
}

export async function updateAdminCompetitionHistoryVisibility(visibleMonths: number): Promise<CompetitionHistorySettings> {
  const { data, error } = await supabase.rpc('admin_update_monthly_growth_history_settings', {
    p_visible_months: Math.min(12, Math.max(0, Math.trunc(visibleMonths))),
  });
  if (error) throw error;
  return { visible_months: Number(data?.visible_months ?? visibleMonths) };
}

export async function updateAdminCompetitionSimulation(enabled: boolean): Promise<CompetitionSimulationSettings> {
  const { data, error } = await supabase.rpc('admin_update_monthly_growth_simulation_settings', {
    p_enabled: enabled,
  });
  if (error) throw error;
  return {
    enabled: Boolean(data?.enabled),
    public_label: String(data?.public_label ?? 'AI challenger'),
  };
}

export async function importAdminSimulatedCompetitors(names: string[]): Promise<{ inserted: number; total: number }> {
  const cleaned = names.map(name => name.trim()).filter(Boolean);
  const { data, error } = await supabase.rpc('admin_import_monthly_growth_simulated_competitors', {
    p_names: cleaned,
  });
  if (error) throw error;
  return {
    inserted: Number(data?.inserted ?? 0),
    total: Number(data?.total ?? 0),
  };
}

export async function fetchAdminSimulatedCompetitors(
  challengeKey: string,
  limit = 50,
  offset = 0,
  search = '',
): Promise<SimulatedCompetitorPage> {
  const { data, error } = await supabase.rpc('admin_get_monthly_growth_simulated_competitors', {
    p_challenge_key: challengeKey,
    p_limit: limit,
    p_offset: offset,
    p_search: search.trim() || null,
  });
  if (error) throw error;
  const row = data ?? {};
  return {
    challenge_key: String(row.challenge_key ?? challengeKey),
    period_start: String(row.period_start ?? ''),
    total: Number(row.total ?? 0),
    offset: Number(row.offset ?? offset),
    limit: Number(row.limit ?? limit),
    entries: Array.isArray(row.entries)
      ? row.entries.map((entry: any) => ({
          id: String(entry.id ?? ''),
          display_name: String(entry.display_name ?? 'AI challenger'),
          avatar_url: entry.avatar_url ? String(entry.avatar_url) : null,
          active: Boolean(entry.active),
          base_score: n(entry.base_score),
          target_score: entry.target_score === null || entry.target_score === undefined ? null : n(entry.target_score),
          increment_amount: n(entry.increment_amount),
          increment_interval_seconds: Number(entry.increment_interval_seconds ?? 3600),
          enabled: Boolean(entry.enabled),
          effective_score: n(entry.effective_score),
        }))
      : [],
  };
}

export async function uploadAdminSimulatedCompetitorAvatar(
  competitorId: string,
  file: File,
): Promise<string> {
  const allowedTypes: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  const extension = allowedTypes[file.type];
  if (!extension) throw new Error('Profile picture must be a JPG, PNG, or WebP image.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Profile picture must be 5 MB or smaller.');

  const objectPath = `challengers/${competitorId}/profile.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from('competition-avatars')
    .upload(objectPath, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: true,
    });
  if (uploadError) throw uploadError;

  const { data: publicData } = supabase.storage
    .from('competition-avatars')
    .getPublicUrl(objectPath);
  const avatarUrl = publicData.publicUrl;
  if (!avatarUrl) throw new Error('Could not create the public profile-picture URL.');

  const { data, error } = await supabase.rpc('admin_update_monthly_growth_simulated_competitor_avatar', {
    p_competitor_id: competitorId,
    p_avatar_url: avatarUrl,
  });
  if (error) throw error;
  return String(data?.avatar_url ?? avatarUrl);
}

export async function updateAdminSimulatedScore(
  competitorId: string,
  challengeKey: string,
  values: {
    base_score: number;
    target_score: number | null;
    increment_amount: number;
    increment_interval_seconds: number;
    enabled: boolean;
  },
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.rpc('admin_update_monthly_growth_simulated_score', {
    p_competitor_id: competitorId,
    p_challenge_key: challengeKey,
    p_base_score: Math.max(0, values.base_score),
    p_target_score: values.target_score === null ? null : Math.max(0, values.target_score),
    p_increment_amount: Math.max(0, values.increment_amount),
    p_increment_interval_seconds: Math.max(60, Math.trunc(values.increment_interval_seconds)),
    p_enabled: values.enabled,
  });
  if (error) throw error;
  return (data ?? {}) as Record<string, unknown>;
}

export async function reviewCompetitionAward(
  awardId: string,
  action: 'recheck' | 'approve_pay' | 'reject',
  notes?: string,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.rpc('admin_review_monthly_growth_award', {
    p_award_id: awardId,
    p_action: action,
    p_notes: notes?.trim() || null,
  });
  if (error) throw error;
  return (data ?? {}) as Record<string, unknown>;
}

export function subscribeToCompetitionActivity(onChange: () => void) {
  const channel = supabase
    .channel('monthly-growth-competition-live')
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'monthly_growth_realtime_signal', filter: 'singleton=eq.true' },
      () => onChange(),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
