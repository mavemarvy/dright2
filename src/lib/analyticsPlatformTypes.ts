// Enterprise Analytics & BI Platform Types

export type ReportCategory =
  | 'marketplace' | 'revenue' | 'crm' | 'promotions'
  | 'affiliate' | 'verification' | 'moderation'
  | 'finance' | 'support' | 'custom';

export type ReportFormat = 'csv' | 'pdf' | 'xlsx';

export type ScheduleFrequency = 'once' | 'daily' | 'weekly' | 'monthly' | 'quarterly';

export type KPICategory = 'marketplace' | 'revenue' | 'operations';

export type KPIUnit = 'count' | 'currency' | 'percent';

export type ComparisonOperator = 'greater_than' | 'less_than';

export type AIProvider = 'openai' | 'grok' | 'gemini' | 'openrouter' | 'custom';

export type RecommendationPriority = 'low' | 'medium' | 'high' | 'critical';

export type RecommendationStatus = 'pending' | 'acted_on' | 'dismissed';

export type RecommendationCategory =
  | 'marketplace' | 'revenue' | 'customer' | 'affiliate'
  | 'marketing' | 'operations' | 'security' | 'general';

export type DashboardCategory =
  | 'executive' | 'marketplace' | 'financial' | 'customer'
  | 'affiliate' | 'marketing' | 'operations' | 'custom';

export interface DashboardWidget {
  id: string;
  type: 'stat' | 'line' | 'bar' | 'donut' | 'funnel' | 'table' | 'ai_summary';
  title: string;
  dataKey?: string;
  dataSource: string;
  config?: Record<string, unknown>;
  position: { x: number; y: number; w: number; h: number };
}

export interface AnalyticsDashboard {
  id: string;
  name: string;
  description: string | null;
  owner_id: string | null;
  widget_config: DashboardWidget[];
  filters: Record<string, unknown>;
  is_default: boolean;
  is_shared: boolean;
  category: DashboardCategory;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface AnalyticsReport {
  id: string;
  name: string;
  description: string | null;
  category: ReportCategory;
  format: ReportFormat;
  date_range: { period?: string; start?: string; end?: string };
  filters: Record<string, unknown>;
  schedule_frequency: ScheduleFrequency;
  schedule_day_of_week: number | null;
  schedule_day_of_month: number | null;
  schedule_time: string | null;
  next_run_at: string | null;
  last_run_at: string | null;
  last_run_status: string | null;
  email_recipients: string[];
  email_subject: string | null;
  email_body: string | null;
  file_url: string | null;
  file_size_bytes: number | null;
  row_count: number | null;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AIBusinessReport {
  id: string;
  title: string;
  summary: string;
  detailed_analysis: string | null;
  key_findings: Array<{ finding: string; metric?: string; change?: string }>;
  metrics_snapshot: Record<string, number | string>;
  period_start: string;
  period_end: string;
  ai_provider: string;
  ai_model: string | null;
  prompt_used: string | null;
  tokens_used: number | null;
  generated_by: string | null;
  status: string;
  created_at: string;
}

export interface AIRecommendation {
  id: string;
  title: string;
  description: string;
  category: RecommendationCategory;
  priority: RecommendationPriority;
  action_type: string;
  target_entity: string | null;
  target_entity_id: string | null;
  expected_impact: string | null;
  confidence_score: number;
  ai_provider: string;
  ai_model: string | null;
  metrics_context: Record<string, number | string>;
  status: RecommendationStatus;
  acted_on_by: string | null;
  acted_on_at: string | null;
  action_notes: string | null;
  dismissed_by: string | null;
  dismissed_at: string | null;
  created_at: string;
}

export interface AnalyticsExport {
  id: string;
  report_id: string | null;
  export_type: ReportFormat;
  data_category: string;
  date_range_start: string | null;
  date_range_end: string | null;
  filters: Record<string, unknown>;
  file_url: string | null;
  file_size_bytes: number | null;
  row_count: number | null;
  download_count: number;
  status: string;
  error_message: string | null;
  exported_by: string | null;
  created_at: string;
}

export interface AnalyticsKPI {
  id: string;
  name: string;
  display_name: string;
  category: KPICategory;
  metric_key: string;
  unit: KPIUnit;
  target_value: number | null;
  warning_threshold: number | null;
  critical_threshold: number | null;
  comparison_operator: ComparisonOperator;
  icon: string | null;
  color: string;
  sort_order: number;
  is_visible: boolean;
  status: string;
}

export interface KPIWithValue extends AnalyticsKPI {
  current_value: number;
  status_level: 'healthy' | 'warning' | 'critical' | 'unknown';
  trend?: 'up' | 'down' | 'flat';
  trend_percentage?: number;
}

export interface AnalyticsSession {
  id: string;
  session_id: string;
  user_id: string | null;
  device_type: string | null;
  os: string | null;
  browser: string | null;
  country: string | null;
  entry_page: string | null;
  exit_page: string | null;
  page_views: number;
  events_count: number;
  duration_seconds: number | null;
  is_bounce: boolean;
  started_at: string;
  ended_at: string | null;
}

export interface ExecutiveKPIs {
  total_users: number;
  active_users: number;
  new_registrations: number;
  verified_users: number;
  total_sellers: number;
  total_affiliates: number;
  total_buyers: number;
  total_employers: number;
  revenue_today: number;
  revenue_weekly: number;
  revenue_monthly: number;
  revenue_annual: number;
  gross_revenue: number;
  net_revenue: number;
  total_products: number;
  total_services: number;
  total_jobs: number;
  active_campaigns: number;
  active_promotions: number;
  pending_reviews: number;
  pending_withdrawals: number;
  open_tickets: number;
  pending_kyc: number;
}

export interface MarketplaceAnalytics {
  product_views: number;
  product_clicks: number;
  wishlist_saves: number;
  shares: number;
  purchases: number;
  search_frequency: number;
  top_products: Array<{ id: string; name: string; views: number; purchases: number; revenue: number }>;
  fastest_growing_sellers: Array<{ id: string; name: string; growth_rate: number; revenue: number }>;
  highest_converting_listings: Array<{ id: string; name: string; conversion_rate: number }>;
  top_categories: Array<{ category: string; views: number; revenue: number }>;
}

export interface CustomerAnalytics {
  new_customers: number;
  returning_customers: number;
  active_customers: number;
  retention_rate: number;
  customer_lifetime_value: number;
  repeat_purchase_rate: number;
  churn_rate: number;
  verification_completion: number;
}

export interface AffiliateAnalytics {
  new_affiliates: number;
  active_affiliates: number;
  commission_earned: number;
  commission_paid: number;
  referral_growth: number;
  conversion_rate: number;
  top_affiliates: Array<{ id: string; name: string; referrals: number; commission: number }>;
  referral_revenue: number;
}

export interface MarketingAnalytics {
  active_campaigns: number;
  scheduled_campaigns: number;
  promotion_roi: number;
  impressions: number;
  clicks: number;
  ctr: number;
  conversion_rate: number;
  revenue_generated: number;
  budget_utilization: number;
}

export interface FinancialAnalytics {
  deposits: number;
  withdrawals: number;
  pending_withdrawals: number;
  failed_payments: number;
  refunds: number;
  wallet_balances: number;
  transaction_volume: number;
  revenue_trend: Array<{ period: string; revenue: number }>;
}

export interface SupportCrmAnalytics {
  tickets_created: number;
  tickets_resolved: number;
  avg_response_time: number;
  customer_satisfaction: number;
  escalated_tickets: number;
  repeated_complaints: number;
  resolution_time: number;
}

export interface AdminPerformanceAnalytics {
  listings_reviewed: number;
  tickets_resolved: number;
  marketing_recoveries: number;
  customer_contacts: number;
  verification_approvals: number;
  moderation_actions: number;
  revenue_influenced: number;
  avg_review_time: number;
  leaderboard: Array<{
    admin_id: string;
    admin_name: string;
    score: number;
    rank: number;
    actions: number;
  }>;
}

export interface RecommendationEngineAnalytics {
  search_frequency_weight: number;
  ctr_weight: number;
  engagement_time_weight: number;
  saves_weight: number;
  shares_weight: number;
  purchases_weight: number;
  reviews_weight: number;
  seller_reputation_weight: number;
  promotion_score_weight: number;
  freshness_weight: number;
  personalization_weight: number;
  top_search_terms: Array<{ term: string; count: number }>;
  avg_ctr: number;
  avg_engagement_time: number;
}
