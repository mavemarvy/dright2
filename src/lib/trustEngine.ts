import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';

export interface TrustScoreData {
  score: number;
  level: string;
  components: Record<string, number>;
  last_calculated: string | null;
}

export interface Badge {
  id: string;
  badge_type: string;
  badge_name: string;
  description: string | null;
  icon: string | null;
  is_active: boolean;
  earned_at: string;
  expires_at: string | null;
}

export interface Achievement {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string;
  category: string;
  xp: number;
  points: number;
  reward: string | null;
  tier: string;
  requirement: Record<string, any>;
}

export interface AchievementProgress {
  id: string;
  achievement_id: string;
  user_id: string;
  progress: number;
  target: number;
  is_completed: boolean;
  completed_at: string | null;
  achievement?: Achievement;
}

export interface Dispute {
  id: string;
  dispute_number: string;
  buyer_id: string;
  seller_id: string;
  product_id: string | null;
  reason: string;
  description: string | null;
  status: string;
  buyer_claim_amount: number | null;
  resolution_amount: number | null;
  admin_decision: string | null;
  ai_summary: string | null;
  escrow_released: boolean;
  created_at: string;
  resolved_at: string | null;
}

export interface UserReport {
  id: string;
  reporter_id: string;
  target_type: string;
  target_id: string;
  reason: string;
  description: string | null;
  evidence_urls: string[];
  status: string;
  priority: string;
  admin_notes: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface VerificationRequest {
  id: string;
  user_id: string;
  type: string;
  status: string;
  admin_notes: string | null;
  reviewed_by: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

export interface RiskProfile {
  user_id: string;
  risk_score: number;
  risk_level: string;
  flags: string[];
  factors: Record<string, any>;
  recommended_action: string | null;
  last_assessed: string;
}

export function useTrustScore(userId: string | undefined) {
  const [data, setData] = useState<TrustScoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    const { data: result, error: err } = await supabase.rpc('get_trust_score', { p_user_id: userId });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setData(result as TrustScoreData);
  }, [userId]);

  useEffect(() => { load(); }, [load]);
  return { data, loading, error, recalculate: load };
}

export function useBadges(userId: string | undefined) {
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase.rpc('get_user_badges', { p_user_id: userId });
    setLoading(false);
    if (!error && data) setBadges(data as Badge[]);
  }, [userId]);

  useEffect(() => { load(); }, [load]);
  return { badges, loading, reload: load };
}

export function useAchievements(userId: string | undefined) {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [progress, setProgress] = useState<AchievementProgress[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [achvRes, progRes] = await Promise.all([
      supabase.from('achievements').select('*').eq('is_active', true).order('category, xp'),
      userId
        ? supabase.from('achievement_progress').select('*, achievement:achievements(*)').eq('user_id', userId)
        : Promise.resolve({ data: null, error: null }),
    ]);
    setLoading(false);
    if (achvRes.data) setAchievements(achvRes.data as Achievement[]);
    if (progRes.data) setProgress(progRes.data as AchievementProgress[]);
  }, [userId]);

  useEffect(() => { load(); }, [load]);
  return { achievements, progress, loading, reload: load };
}

export function useDisputes(userId: string | undefined) {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('disputes')
      .select('*')
      .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
      .order('created_at', { ascending: false });
    setLoading(false);
    if (!error && data) setDisputes(data as Dispute[]);
  }, [userId]);

  useEffect(() => { load(); }, [load]);
  return { disputes, loading, reload: load };
}

export function useUserReports(userId: string | undefined) {
  const [reports, setReports] = useState<UserReport[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('user_reports')
      .select('*')
      .eq('reporter_id', userId)
      .order('created_at', { ascending: false });
    setLoading(false);
    if (!error && data) setReports(data as UserReport[]);
  }, [userId]);

  useEffect(() => { load(); }, [load]);
  return { reports, loading, reload: load };
}

export function useVerificationRequests(userId: string | undefined) {
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('verification_requests')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    setLoading(false);
    if (!error && data) setRequests(data as VerificationRequest[]);
  }, [userId]);

  useEffect(() => { load(); }, [load]);
  return { requests, loading, reload: load };
}

export function useRiskProfile(userId: string | undefined) {
  const [profile, setProfile] = useState<RiskProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('risk_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    setLoading(false);
    if (!error && data) setProfile(data as RiskProfile);
  }, [userId]);

  useEffect(() => { load(); }, [load]);
  return { profile, loading, reload: load };
}

export function useLeaderboard(category: string = 'sellers', period: string = 'monthly', limit: number = 50) {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_leaderboard', {
      p_category: category, p_period: period, p_limit: limit,
    });
    setLoading(false);
    if (!error && data) setEntries(data as any[]);
  }, [category, period, limit]);

  useEffect(() => { load(); }, [load]);
  return { entries, loading, reload: load };
}

export function useAdminTrustSummary() {
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_admin_trust_center_summary');
    setLoading(false);
    if (!error && data) setSummary(data as Record<string, number>);
  }, []);

  useEffect(() => { load(); }, [load]);
  return { summary, loading, reload: load };
}

export const BADGE_ICONS: Record<string, string> = {
  verified_seller: 'badge',
  verified_business: 'domain',
  verified_buyer: 'person_check',
  verified_affiliate: 'group_add',
  verified_advertiser: 'campaign',
  verified_portfolio: 'photo_library',
  top_rated: 'star',
  top_seller: 'emoji_events',
  top_affiliate: 'campaign',
  top_advertiser: 'ads_click',
  trusted_creator: 'verified',
  fast_responder: 'bolt',
  premium_member: 'diamond',
  early_adopter: 'rocket_launch',
  founding_member: 'foundation',
};

export const BADGE_COLORS: Record<string, string> = {
  verified_seller: 'text-emerald-600 bg-emerald-50',
  verified_business: 'text-blue-600 bg-blue-50',
  verified_buyer: 'text-purple-600 bg-purple-50',
  top_rated: 'text-amber-600 bg-amber-50',
  top_seller: 'text-orange-600 bg-orange-50',
  trusted_creator: 'text-indigo-600 bg-indigo-50',
  fast_responder: 'text-cyan-600 bg-cyan-50',
  premium_member: 'text-violet-600 bg-violet-50',
};

export const ACHIEVEMENT_TIER_COLORS: Record<string, string> = {
  bronze: 'from-amber-700 to-amber-500',
  silver: 'from-gray-400 to-gray-300',
  gold: 'from-yellow-500 to-yellow-400',
  platinum: 'from-cyan-400 to-cyan-300',
  diamond: 'from-purple-500 to-pink-400',
};

export const TRUST_LEVELS: Record<string, { label: string; color: string; min: number }> = {
  trusted: { label: 'Trusted', color: 'text-emerald-600 bg-emerald-50', min: 80 },
  established: { label: 'Established', color: 'text-blue-600 bg-blue-50', min: 60 },
  building: { label: 'Building', color: 'text-amber-600 bg-amber-50', min: 40 },
  new: { label: 'New', color: 'text-gray-500 bg-gray-50', min: 0 },
};

export function getTrustLevel(score: number): { label: string; color: string } {
  if (score >= 80) return TRUST_LEVELS.trusted;
  if (score >= 60) return TRUST_LEVELS.established;
  if (score >= 40) return TRUST_LEVELS.building;
  return TRUST_LEVELS.new;
}
