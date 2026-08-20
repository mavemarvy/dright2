// ─── Enterprise Integration Hub Types ───────────────────────────────────

export type ProviderCategory =
  | 'ai'
  | 'payment'
  | 'email'
  | 'sms'
  | 'voice'
  | 'whatsapp'
  | 'kyc'
  | 'push'
  | 'storage'
  | 'analytics'
  | 'design'
  | 'general';

export type ProviderHealthStatus = 'healthy' | 'degraded' | 'down' | 'unknown';
export type ProviderConnectionState = 'connected' | 'needs_config' | 'failed' | 'disabled';
export type ProviderEnvironment = 'sandbox' | 'production';

export interface IntegrationProvider {
  id: string;
  provider_key: string;
  provider_name: string;
  category: ProviderCategory;
  description: string | null;
  icon: string | null;
  documentation_url: string | null;
  supported_features: string[];
  config_schema: Record<string, ConfigFieldSchema>;
  is_enabled: boolean;
  is_connected: boolean;
  environment: ProviderEnvironment;
  is_default: boolean;
  display_order: number;
  status: string;
  is_deleted: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  settings?: IntegrationProviderSetting[];
  latest_health_check?: IntegrationHealthCheck | null;
  health_status?: ProviderHealthStatus;
}

export interface ConfigFieldSchema {
  type: 'text' | 'secret' | 'email' | 'number' | 'select' | 'boolean';
  required?: boolean;
  default?: string | number;
  options?: string[];
  min?: number;
  max?: number;
}

export interface IntegrationProviderSetting {
  id: string;
  provider_id: string;
  setting_key: string;
  setting_value: string | null;
  is_secret: boolean;
  is_required: boolean;
  description: string | null;
  category: string;
  status: string;
  is_deleted: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface IntegrationProviderLog {
  id: string;
  provider_id: string | null;
  provider_key: string | null;
  admin_id: string | null;
  action: string;
  result: string;
  error_message: string | null;
  ip_address: string | null;
  metadata: Record<string, unknown>;
  status: string;
  is_deleted: boolean;
  created_at: string;
  admin?: {
    id: string;
    email: string;
    full_name?: string | null;
    username?: string | null;
  } | null;
  provider?: {
    id: string;
    provider_name: string;
    provider_key: string;
  } | null;
}

export interface IntegrationHealthCheck {
  id: string;
  provider_id: string;
  health_status: ProviderHealthStatus;
  response_time_ms: number | null;
  error_message: string | null;
  checked_by: string | null;
  checked_at: string;
  status: string;
  is_deleted: boolean;
  created_at: string;
}

export interface IntegrationWebhook {
  id: string;
  provider_id: string;
  webhook_url: string | null;
  callback_url: string | null;
  webhook_secret: string | null;
  expected_events: string[];
  last_received_at: string | null;
  last_event_type: string | null;
  status: string;
  is_deleted: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface IntegrationApiKey {
  id: string;
  provider_id: string;
  key_name: string;
  key_value: string | null;
  environment: ProviderEnvironment;
  is_active: boolean;
  last_rotated_at: string | null;
  expires_at: string | null;
  status: string;
  is_deleted: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface IntegrationUsageStat {
  id: string;
  provider_id: string;
  requests_count: number;
  success_count: number;
  error_count: number;
  avg_response_time_ms: number;
  total_cost: number;
  period_date: string;
  metadata: Record<string, unknown>;
  status: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Labels & Constants ─────────────────────────────────────────────────

export const CATEGORY_LABELS: Record<ProviderCategory, string> = {
  ai: 'AI Providers',
  payment: 'Payment Providers',
  email: 'Email Providers',
  sms: 'SMS Providers',
  voice: 'Voice Providers',
  whatsapp: 'WhatsApp Providers',
  kyc: 'Identity Verification',
  push: 'Push Notifications',
  storage: 'Storage Providers',
  analytics: 'Analytics Providers',
  design: 'Design & Content',
  general: 'General',
};

export const CATEGORY_ORDER: ProviderCategory[] = [
  'ai', 'payment', 'email', 'sms', 'voice', 'whatsapp',
  'kyc', 'push', 'storage', 'analytics', 'design',
];

export const CATEGORY_ICONS: Record<ProviderCategory, string> = {
  ai: 'Brain',
  payment: 'CreditCard',
  email: 'Mail',
  sms: 'MessageSquare',
  voice: 'Phone',
  whatsapp: 'MessageCircle',
  kyc: 'ShieldCheck',
  push: 'Bell',
  storage: 'Database',
  analytics: 'BarChart3',
  design: 'Palette',
  general: 'Settings',
};

export const HEALTH_LABELS: Record<ProviderHealthStatus, string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  down: 'Down',
  unknown: 'Unknown',
};

export const HEALTH_COLORS: Record<ProviderHealthStatus, string> = {
  healthy: 'bg-green-500',
  degraded: 'bg-amber-500',
  down: 'bg-red-500',
  unknown: 'bg-gray-400',
};

export const CONNECTION_INDICATORS: Record<ProviderConnectionState, { label: string; color: string; dot: string }> = {
  connected: { label: 'Connected', color: 'text-green-700 bg-green-50 border-green-200', dot: 'bg-green-500' },
  needs_config: { label: 'Needs Configuration', color: 'text-amber-700 bg-amber-50 border-amber-200', dot: 'bg-amber-500' },
  failed: { label: 'Connection Failed', color: 'text-red-700 bg-red-50 border-red-200', dot: 'bg-red-500' },
  disabled: { label: 'Disabled', color: 'text-gray-500 bg-gray-50 border-gray-200', dot: 'bg-gray-400' },
};

export const LOG_ACTION_LABELS: Record<string, string> = {
  provider_enabled: 'Provider Enabled',
  provider_disabled: 'Provider Disabled',
  api_key_updated: 'API Key Updated',
  connection_tested: 'Connection Tested',
  connection_failed: 'Connection Failed',
  webhook_updated: 'Webhook Updated',
  settings_updated: 'Settings Updated',
  provider_configured: 'Provider Configured',
  default_changed: 'Default Provider Changed',
  api_key_rotated: 'API Key Rotated',
};

export const ENVIRONMENT_LABELS: Record<ProviderEnvironment, string> = {
  sandbox: 'Sandbox',
  production: 'Production',
};

export const AI_USE_CASES = [
  { value: 'ai_assistant', label: 'AI Assistant' },
  { value: 'customer_support', label: 'Customer Support AI' },
  { value: 'marketplace_intelligence', label: 'Marketplace Intelligence' },
  { value: 'analytics_summaries', label: 'Analytics Summaries' },
  { value: 'content_generation', label: 'Content Generation' },
] as const;
