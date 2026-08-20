// ─────────────────────────────────────────────────────────────────────────────
// Creator Campaign Types
// ─────────────────────────────────────────────────────────────────────────────

export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed' | 'cancelled';
export type SubmissionStatus = 'pending' | 'approved' | 'rejected' | 'revision_requested' | 'disputed';
export type VerificationType = 'manual' | 'automatic' | 'hybrid';
export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';
export type WorkerLevel = 'bronze' | 'silver' | 'gold' | 'diamond' | 'elite' | 'legend';

export interface CampaignCategory {
  id: string;
  name: string;
  slug: string;
  icon?: string;
  sort_order: number;
  is_active: boolean;
}

export interface Campaign {
  id: string;
  creator_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  instructions: string | null;
  task_type: string;
  difficulty: Difficulty;
  estimated_completion_time: string | null;
  language: string;
  countries_allowed: string[];
  minimum_user_level: string;
  age_requirement: number | null;
  tags: string[];
  reward_per_completion: number;
  max_workers: number | null;
  workers_count: number;
  completed_count: number;
  pending_count: number;
  rejected_count: number;
  total_budget: number;
  platform_fee_percent: number;
  escrow_amount: number;
  verification_type: VerificationType;
  evidence_types: string[];
  requirements: CampaignRequirement[];
  status: CampaignStatus;
  is_featured: boolean;
  is_promoted: boolean;
  featured_until: string | null;
  ends_at: string | null;
  launched_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  category?: CampaignCategory;
  creator?: { id: string; full_name: string; avatar_url: string | null };
}

export interface CampaignRequirement {
  id: string;
  label: string;
  type: 'text' | 'url' | 'file' | 'screenshot' | 'video' | 'choice';
  required: boolean;
  placeholder?: string;
  options?: string[];
}

export interface CampaignMedia {
  id: string;
  campaign_id: string;
  file_url: string;
  file_type: string;
  file_name: string | null;
  file_size: number | null;
  position: number;
}

export interface CampaignSubmission {
  id: string;
  campaign_id: string;
  worker_id: string;
  status: SubmissionStatus;
  evidence_urls: string[];
  evidence_text: string | null;
  evidence_links: string[];
  notes: string | null;
  creator_notes: string | null;
  country: string | null;
  browser: string | null;
  ai_score: number | null;
  fraud_score: number;
  ai_verdict: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  paid_at: string | null;
  reward_amount: number | null;
  created_at: string;
  updated_at: string;
  campaign?: Campaign;
  worker?: { id: string; full_name: string; avatar_url: string | null };
}

export interface CampaignWallet {
  id: string;
  user_id: string;
  balance: number;
  escrow_balance: number;
  total_deposited: number;
  total_withdrawn: number;
  total_paid_out: number;
}

export interface CampaignTransaction {
  id: string;
  wallet_id: string;
  user_id: string;
  type: string;
  amount: number;
  balance_after: number | null;
  campaign_id: string | null;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface WorkerProfile {
  id: string;
  user_id: string;
  total_earnings: number;
  completed_tasks: number;
  rejected_tasks: number;
  success_rate: number;
  approval_rate: number;
  avg_completion_time_hours: number | null;
  level: WorkerLevel;
  xp: number;
  country: string | null;
  skills: string[];
  languages: string[];
  badges: string[];
}

export interface CreatorProfile {
  id: string;
  user_id: string;
  total_campaigns: number;
  active_campaigns: number;
  total_spent: number;
  approval_speed_hours: number | null;
  worker_rating: number;
  refund_rate: number;
  avg_reward: number;
  response_time_hours: number | null;
  trust_badge: string;
  is_premium: boolean;
}

export interface WorkerLevelDef {
  id: string;
  level_name: string;
  min_xp: number;
  max_xp: number | null;
  perks: string[];
  sort_order: number;
}

export interface CampaignBookmark {
  id: string;
  campaign_id: string;
  user_id: string;
  created_at: string;
}

export interface LeaderboardEntry {
  id: string;
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  total_earnings: number;
  completed_tasks: number;
  level: string;
  country: string | null;
  rank: number | null;
}

export const TASK_TYPES = [
  'watch_video', 'watch_livestream', 'clip_video', 'create_shorts',
  'review_app', 'review_website', 'follow_account', 'like_post',
  'comment', 'share', 'join_discord', 'join_telegram', 'sign_up',
  'affiliate_referral', 'purchase_product', 'submit_screenshot',
  'upload_file', 'answer_questions', 'custom_campaign',
] as const;

export const EVIDENCE_TYPES = [
  'screenshot', 'video', 'screen_recording', 'text_answer',
  'review_url', 'username', 'profile_link', 'transaction_hash',
  'receipt', 'pdf', 'zip', 'audio', 'multiple_files',
] as const;

export const REWARD_PRESETS = [0.25, 0.50, 1, 5, 10];
export const MAX_WORKER_PRESETS = [10, 100, 500, 1000];

export const LEVEL_COLORS: Record<WorkerLevel, string> = {
  bronze: 'from-amber-600 to-amber-800',
  silver: 'from-gray-400 to-gray-600',
  gold: 'from-yellow-400 to-yellow-600',
  diamond: 'from-cyan-400 to-blue-600',
  elite: 'from-purple-500 to-indigo-600',
  legend: 'from-red-500 to-pink-600',
};

export const LEVEL_ICONS: Record<WorkerLevel, string> = {
  bronze: '🥉',
  silver: '🥈',
  gold: '🥇',
  diamond: '💎',
  elite: '⭐',
  legend: '👑',
};
