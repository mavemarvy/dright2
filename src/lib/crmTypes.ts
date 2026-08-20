// ─── CRM Enterprise Types ─────────────────────────────────────────────

export interface CrmCustomer {
  id: string;
  user_id: string;
  customer_status: string;
  lifetime_value: number;
  total_purchases: number;
  total_sales: number;
  total_earnings: number;
  total_withdrawals: number;
  pending_withdrawals: number;
  wallet_balance: number;
  reviews_received: number;
  avg_rating: number;
  referral_count: number;
  affiliate_performance: Record<string, unknown>;
  seller_performance: Record<string, unknown>;
  assigned_admin_id: string | null;
  tags: string[];
  notes: string | null;
  last_contacted_at: string | null;
  status: string;
  is_deleted: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined user fields
  user?: {
    id: string;
    email: string;
    full_name?: string | null;
    username?: string | null;
    phone?: string | null;
    is_admin?: boolean;
    verification_status?: string | null;
    created_at?: string;
    last_sign_in_at?: string | null;
  };
}

export interface CustomerTimelineEvent {
  id: string;
  user_id: string;
  event_type: string;
  event_category: string;
  event_title: string;
  event_description: string | null;
  event_data: Record<string, unknown>;
  related_entity_type: string | null;
  related_entity_id: string | null;
  performed_by: string | null;
  status: string;
  is_deleted: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionReminder {
  id: string;
  user_id: string;
  subscription_type: string;
  subscription_id: string | null;
  expiry_date: string;
  reminder_stage: string;
  reminder_offset_days: number;
  channel: string;
  sent_at: string | null;
  status: string;
  is_deleted: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  user?: {
    id: string;
    email: string;
    full_name?: string | null;
    username?: string | null;
  };
}

export interface RecoveryQueueItem {
  id: string;
  user_id: string;
  recovery_reason: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
  related_data: Record<string, unknown>;
  assigned_admin_id: string | null;
  admin_notes: string | null;
  follow_up_date: string | null;
  last_reminder_at: string | null;
  reminder_count: number;
  outcome: string;
  resolved_at: string | null;
  status: string;
  is_deleted: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  user?: {
    id: string;
    email: string;
    full_name?: string | null;
    username?: string | null;
  };
  assigned_admin?: {
    id: string;
    email: string;
    full_name?: string | null;
  } | null;
}

export interface CustomerContact {
  id: string;
  user_id: string;
  staff_id: string;
  channel: string;
  subject: string | null;
  summary: string;
  follow_up_reminder: string | null;
  outcome: string;
  contact_method_used: string | null;
  status: string;
  is_deleted: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  user?: {
    id: string;
    email: string;
    full_name?: string | null;
    username?: string | null;
  };
  staff?: {
    id: string;
    email: string;
    full_name?: string | null;
  };
  logs?: CustomerContactLog[];
}

export interface CustomerContactLog {
  id: string;
  contact_id: string;
  user_id: string;
  staff_id: string;
  log_type: string;
  content: string;
  channel: string;
  metadata: Record<string, unknown>;
  status: string;
  is_deleted: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MarketingCampaign {
  id: string;
  campaign_name: string;
  campaign_type: string;
  entity_type: string;
  entity_id: string | null;
  owner_id: string | null;
  budget: number;
  spent: number;
  start_date: string | null;
  end_date: string | null;
  targeting: Record<string, unknown>;
  is_paid: boolean;
  status: string;
  is_deleted: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  owner?: {
    id: string;
    email: string;
    full_name?: string | null;
    username?: string | null;
  };
  statistics?: PromotionStatistic;
}

export interface PromotionStatistic {
  id: string;
  promotion_id: string | null;
  campaign_id: string | null;
  entity_type: string;
  entity_id: string | null;
  impressions: number;
  clicks: number;
  reach: number;
  engagement: number;
  conversions: number;
  revenue_generated: number;
  budget: number;
  remaining_budget: number;
  recording_date: string;
  status: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdminPerformance {
  id: string;
  admin_id: string;
  period_type: string;
  period_start: string;
  period_end: string;
  tickets_resolved: number;
  avg_response_time_minutes: number;
  customer_satisfaction_score: number;
  listings_approved: number;
  listings_rejected: number;
  marketing_recoveries: number;
  subscription_renewals_recovered: number;
  revenue_influenced: number;
  promotions_managed: number;
  compliance_reviews_completed: number;
  total_score: number;
  status: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  admin?: {
    id: string;
    email: string;
    full_name?: string | null;
    username?: string | null;
  };
}

export interface PayoutMethod {
  id: string;
  user_id: string;
  method_type: 'bank' | 'paypal' | 'payoneer' | 'crypto';
  is_primary: boolean;
  account_holder_name: string | null;
  bank_name: string | null;
  account_number: string | null;
  bank_code: string | null;
  account_nickname: string | null;
  paypal_email: string | null;
  payoneer_email: string | null;
  crypto_currency: string | null;
  crypto_network: string | null;
  crypto_wallet_address: string | null;
  crypto_wallet_nickname: string | null;
  is_verified: boolean;
  metadata: Record<string, unknown>;
  status: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface AiCustomerInsight {
  id: string;
  insight_type: string;
  insight_category: string;
  title: string;
  description: string | null;
  affected_user_ids: string[];
  severity: string;
  confidence_score: number;
  recommended_action: string | null;
  ai_provider: string;
  ai_model: string | null;
  insight_data: Record<string, unknown>;
  is_dismissed: boolean;
  dismissed_by: string | null;
  dismissed_at: string | null;
  status: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Labels & Constants ───────────────────────────────────────────────

export const RECOVERY_REASONS: { value: string; label: string }[] = [
  { value: 'subscription_expired', label: 'Subscription Expired' },
  { value: 'abandoned_purchase', label: 'Abandoned Purchase' },
  { value: 'abandoned_sponsorship', label: 'Abandoned Sponsorship' },
  { value: 'abandoned_verification', label: 'Abandoned Verification' },
  { value: 'incomplete_onboarding', label: 'Incomplete Onboarding' },
  { value: 'failed_payment', label: 'Failed Payment' },
];

export const RECOVERY_OUTCOMES: { value: string; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'recovered', label: 'Recovered' },
  { value: 'lost', label: 'Lost' },
  { value: 'escalated', label: 'Escalated' },
];

export const CONTACT_CHANNELS: { value: string; label: string }[] = [
  { value: 'in_app', label: 'In-App Message' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'sms', label: 'SMS' },
  { value: 'whatsapp', label: 'WhatsApp' },
];

export const CONTACT_OUTCOMES: { value: string; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'follow_up_needed', label: 'Follow-up Needed' },
  { value: 'escalated', label: 'Escalated' },
  { value: 'no_response', label: 'No Response' },
];

export const CAMPAIGN_TYPES: { value: string; label: string }[] = [
  { value: 'sponsored_product', label: 'Sponsored Product' },
  { value: 'sponsored_service', label: 'Sponsored Service' },
  { value: 'sponsored_job', label: 'Sponsored Job' },
  { value: 'sponsored_campaign', label: 'Sponsored Campaign' },
  { value: 'coupon_campaign', label: 'Coupon Campaign' },
  { value: 'free_promotion', label: 'Free Promotion' },
  { value: 'paid_promotion', label: 'Paid Promotion' },
];

export const CAMPAIGN_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  active: 'Active',
  paused: 'Paused',
  completed: 'Completed',
  expired: 'Expired',
  cancelled: 'Cancelled',
};

export const PAYOUT_METHOD_TYPES: { value: string; label: string }[] = [
  { value: 'bank', label: 'Bank Account' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'payoneer', label: 'Payoneer' },
  { value: 'crypto', label: 'Cryptocurrency' },
];

export const CRYPTO_CURRENCIES: { value: string; label: string }[] = [
  { value: 'BTC', label: 'Bitcoin (BTC)' },
  { value: 'USDT', label: 'Tether (USDT)' },
  { value: 'TON', label: 'Toncoin (TON)' },
];

export const CRYPTO_NETWORKS: { value: string; label: string }[] = [
  { value: 'bitcoin', label: 'Bitcoin Network' },
  { value: 'erc20', label: 'Ethereum (ERC-20)' },
  { value: 'trc20', label: 'Tron (TRC-20)' },
  { value: 'ton', label: 'TON Network' },
  { value: 'bep20', label: 'BNB Smart Chain (BEP-20)' },
];

export const INSIGHT_TYPES: { value: string; label: string }[] = [
  { value: 'repeated_complaints', label: 'Repeated Complaints' },
  { value: 'high_value_follow_up', label: 'High-Value Follow-up Needed' },
  { value: 'frequent_abandonment', label: 'Frequent Abandonment' },
  { value: 'trending_support_topics', label: 'Trending Support Topics' },
  { value: 'slow_response_times', label: 'Slow Response Times' },
  { value: 'churn_risk', label: 'Churn Risk' },
  { value: 'underperforming_campaigns', label: 'Underperforming Campaigns' },
];

export const SEVERITY_LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

export const PERIOD_TYPES: { value: string; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

export const REMINDER_OFFSETS = [-30, -14, -7, -3, -1, 0, 3, 7, 14];

export const REMINDER_STAGE_LABELS: Record<string, string> = {
  pending: 'Pending',
  sent: 'Sent',
  failed: 'Failed',
  snoozed: 'Snoozed',
};
