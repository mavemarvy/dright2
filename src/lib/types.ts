export interface User {
  id: string;
  email: string;
  phone?: string;
  full_name?: string;
  account_number?: string;
  role?: string;
  created_at?: string;
  is_admin?: boolean;
  admin_status?: string;
  balance?: number;
  locked_balance?: number;
  available_balance?: number;
  marketer_level?: number;
  advertiser_grade?: string;
  weekly_sales_count?: number;
  total_sales_count?: number;
  total_reviews?: number;
  average_rating?: number;
  one_star_count?: number;
  account_locks_count?: number;
  consecutive_weeks_streak?: number;
  social_media_links?: Record<string, string>;
  marketer_status?: string;
  advertiser_status?: string;
  downgraded_at?: string | null;
  last_weekly_reset_at?: string | null;
  referral_code?: string | null;
  referred_by?: string | null;
  affiliate_earnings?: number;
  admin_role?: string | null;
  account_status?: string;
  avatar_url?: string | null;
  location?: string | null;
  preferred_currency?: string | null;
  location_verified?: boolean;
  store_title?: string | null;
  store_banner_url?: string | null;
  store_description?: string | null;
  store_theme?: Record<string, unknown> | null;
  store_location?: string | null;
  username?: string | null;
  is_verified?: boolean;
  response_rate?: number;
  avg_response_time_hours?: number;
  languages?: string[];
  joined_at?: string;
  last_active_at?: string;
  followers_count?: number;
}

export interface Product {
  id: string;
  uploaded_by: string;
  name: string;
  description: string;
  price: number;
  commission_rate: number;
  image_url?: string | null;
  category: string;
  is_active: boolean;
  created_at: string;
  approval_status?: string;
  rejection_reason?: string | null;
  admin_task_percent?: number;
  sales_team_task_percent?: number;
  affiliate_commission_percent?: number;
  sales_team_tier?: string;
  total_reviews?: number;
  average_rating?: number;
  one_star_count?: number;
  is_hidden?: boolean;
  is_free?: boolean;
  stock_quantity?: number | null;
  initial_stock?: number | null;
  product_type?: string;
  demo_video_url?: string | null;
  has_dright_sales_team?: boolean;
  total_sales?: number;
  view_count?: number;
  tags?: string[];
  sku?: string | null;
  brand?: string | null;
  condition?: string | null;
  specifications?: Record<string, string> | null;
  faqs?: Array<{ q: string; a: string }> | null;
  old_price?: number | null;
  discount_percent?: number | null;
  flash_sale_ends_at?: string | null;
  location?: string | null;
  updated_at?: string;
  is_featured?: boolean;
  is_sponsored?: boolean;
}

export interface SaleRecord {
  id: string;
  product_id: string;
  product_name: string;
  amount: number;
  commission_earned: number;
  admin_share: number;
  sales_team_share: number;
  marketer_id: string;
  seller_id: string;
  buyer_email?: string;
  created_at: string;
  payment_status?: string;
  tracking_code?: string;
  download_token?: string | null;
  expires_at?: string | null;
  guest_email?: string | null;
}

export interface Verification {
  id: string;
  user_id: string;
  document_type: string;
  document_url: string;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason?: string | null;
  created_at: string;
  updated_at: string;
  user_email?: string;
}

export type NotificationType =
  | 'edit_approved'
  | 'edit_rejected'
  | 'new_order'
  | 'order_status'
  | 'chat_message'
  | 'announcement'
  | 'system_alert'
  | 'referral_signup'
  | 'new_message'
  | 'attachment_received'
  | 'conversation_started'
  | 'report_created'
  | 'service_booking'
  | 'job_application'
  | 'wallet_withdrawal'
  | 'wallet_deposit'
  | 'affiliate_commission'
  | 'referral_commission'
  | 'new_follower'
  | 'new_review'
  | 'security_alert'
  | 'promotion'
  | 'admin_notice'
  | 'ai_summary'
  | 'store_update'
  | 'low_stock';

export type NotificationCategory =
  | 'all'
  | 'unread'
  | 'messages'
  | 'marketplace'
  | 'services'
  | 'jobs'
  | 'orders'
  | 'wallet'
  | 'affiliate'
  | 'referrals'
  | 'store'
  | 'followers'
  | 'reviews'
  | 'security'
  | 'promotions'
  | 'admin'
  | 'system'
  | 'ai';

export type NotificationPriority = 'critical' | 'high' | 'normal' | 'low';

export interface NotificationMetadata {
  product_image?: string | null;
  product_title?: string | null;
  product_price?: number | null;
  product_currency?: string | null;
  service_image?: string | null;
  service_title?: string | null;
  service_price?: number | null;
  booking_date?: string | null;
  job_logo?: string | null;
  job_title?: string | null;
  applicant_name?: string | null;
  company_name?: string | null;
  amount?: number | null;
  currency?: string | null;
  reference?: string | null;
  referral_name?: string | null;
  commission_amount?: number | null;
  rating?: number | null;
  review_preview?: string | null;
  follower_avatar?: string | null;
  follower_name?: string | null;
  store_logo?: string | null;
  store_name?: string | null;
  actor_avatar?: string | null;
  actor_name?: string | null;
  action_url?: string | null;
  [key: string]: unknown;
}

export interface NotificationItem {
  id: string;
  user_id: string;
  type: NotificationType;
  notification_type?: NotificationType;
  title: string;
  body: string;
  message?: string;
  is_read: boolean;
  link?: string | null;
  created_at: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  is_archived: boolean;
  is_deleted: boolean;
  metadata?: NotificationMetadata | null;
  group_key?: string | null;
  actor_id?: string | null;
  read_at?: string | null;
}

export interface NotificationPreference {
  id?: string;
  user_id: string;
  notification_type?: NotificationType;
  email_notifications: boolean;
  push_notifications: boolean;
  in_app_enabled?: boolean;
  email_enabled?: boolean;
  types: Partial<Record<NotificationType, boolean>>;
}

export interface ProductEdit {
  id: string;
  product_id: string;
  proposed_by: string;
  proposed_changes: ProductEditChanges;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  updated_at: string;
  product_name?: string;
  submitter_email?: string;
  original_snapshot?: Record<string, unknown> | null;
}

export interface ProductEditChanges {
  name?: string;
  description?: string;
  price?: number;
  category?: string;
  image_url?: string;
  tags?: string[];
  stock_quantity?: number | null;
}

export interface ProductEditLog {
  id: string;
  product_id: string;
  edit_id: string;
  action: string;
  performed_by: string;
  changes_summary?: Record<string, unknown> | null;
  created_at: string;
}

export interface Job {
  id: string;
  employer_id: string;
  title: string;
  company_name: string;
  description: string;
  benefits?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string;
  job_type?: string;
  region?: string | null;
  is_remote?: boolean;
  status?: string;
  expires_at?: string | null;
  created_at: string;
  updated_at?: string;
  total_applications?: number;
  employer_name?: string;
  employer_avatar?: string | null;
  category?: string | null;
  work_setup?: string;
  career_level?: string;
  application_deadline?: string | null;
  employer_store_title?: string | null;
  responsibilities?: string[] | null;
  requirements?: string | string[] | null;
  min_experience?: string | null;
  min_qualification?: string | null;
  application_instructions?: string | null;
  company_description?: string | null;
}

export interface JobApplication {
  id: string;
  job_id: string;
  applicant_id: string;
  cover_letter?: string | null;
  phone?: string | null;
  email?: string | null;
  status: 'pending' | 'reviewed' | 'shortlisted' | 'rejected' | 'hired';
  created_at: string;
  updated_at?: string;
  job_title?: string;
  company_name?: string;
}

// ─── Chat Types ───────────────────────────────────────────────────────────────

export type ChatContextType =
  | 'product_inquiry'
  | 'service_inquiry'
  | 'job_application'
  | 'store_inquiry'
  | 'order_support'
  | 'admin_support'
  | 'affiliate_support'
  | 'general';

export interface ChatContextData {
  title?: string;
  image_url?: string | null;
  price?: number | null;
  currency?: string;
  seller_name?: string;
  company_name?: string;
  location?: string;
  salary?: string;
  delivery_time?: string;
  rating?: number;
  store_name?: string;
  availability?: string;
  url?: string;
}

export interface ChatConversation {
  id: string;
  channel_type: 'product_question' | 'order_issue' | 'general';
  context_type: ChatContextType;
  context_id: string | null;
  context_data: ChatContextData | null;
  customer_id: string;
  seller_id: string | null;
  initiator_id: string | null;
  product_id: string | null;
  order_id: string | null;
  status: 'open' | 'resolved' | 'closed';
  last_message: string | null;
  last_message_at: string | null;
  customer_unread_count: number;
  seller_unread_count: number;
  is_pinned: boolean;
  is_archived: boolean;
  is_favorite: boolean;
  is_pinned_by_user: boolean;
  spam_score: number;
  is_flagged: boolean;
  created_at: string;
  updated_at: string;
  // enriched client-side
  customer_name?: string;
  customer_avatar?: string | null;
  seller_name?: string;
  seller_avatar?: string | null;
  product_name?: string;
  other_user_id?: string;
  other_user_name?: string;
  other_user_avatar?: string | null;
  other_user_is_online?: boolean;
  other_user_last_seen?: string | null;
}

// ChatMessage is defined in chatMessageType.ts — re-exported here for convenience
export type { ChatMessage } from './chatMessageType';

export interface ChatTypingIndicator {
  conversation_id: string;
  user_id: string;
  updated_at: string;
}

export interface ChatPresence {
  user_id: string;
  is_online: boolean;
  last_seen_at: string;
}

export const NOTIFICATION_TYPE_META: Record<NotificationType, { label: string; icon: string }> = {
  edit_approved: { label: 'Edit Approved', icon: 'check' },
  edit_rejected: { label: 'Edit Rejected', icon: 'x' },
  new_order: { label: 'New Order', icon: 'shopping' },
  order_status: { label: 'Order Status', icon: 'package' },
  chat_message: { label: 'Chat Message', icon: 'message' },
  announcement: { label: 'Announcement', icon: 'megaphone' },
  system_alert: { label: 'System Alert', icon: 'alert' },
  referral_signup: { label: 'Referral Signup', icon: 'users' },
  new_message: { label: 'New Message', icon: 'message' },
  attachment_received: { label: 'Attachment', icon: 'paperclip' },
  conversation_started: { label: 'New Conversation', icon: 'message' },
  report_created: { label: 'Report Filed', icon: 'flag' },
  service_booking: { label: 'Service Booking', icon: 'calendar' },
  job_application: { label: 'Job Application', icon: 'briefcase' },
  wallet_withdrawal: { label: 'Withdrawal', icon: 'wallet' },
  wallet_deposit: { label: 'Deposit', icon: 'wallet' },
  affiliate_commission: { label: 'Commission', icon: 'trending-up' },
  referral_commission: { label: 'Referral Commission', icon: 'users' },
  new_follower: { label: 'New Follower', icon: 'user-plus' },
  new_review: { label: 'New Review', icon: 'star' },
  security_alert: { label: 'Security Alert', icon: 'shield' },
  promotion: { label: 'Promotion', icon: 'gift' },
  admin_notice: { label: 'Admin Notice', icon: 'info' },
  ai_summary: { label: 'AI Summary', icon: 'sparkles' },
  store_update: { label: 'Store Update', icon: 'store' },
  low_stock: { label: 'Low Stock', icon: 'alert' },
};

export const CHANNEL_TYPE_META: Record<ChatConversation['channel_type'], { label: string; emoji: string }> = {
  product_question: { label: 'Product Question', emoji: '🛍️' },
  order_issue: { label: 'Order Issue', emoji: '📦' },
  general: { label: 'General Inquiry', emoji: '💬' },
};

export const CONTEXT_TYPE_META: Record<ChatContextType, { label: string; color: string; bg: string }> = {
  product_inquiry: { label: 'Product Inquiry', color: 'text-blue-700', bg: 'bg-blue-50' },
  service_inquiry: { label: 'Service Inquiry', color: 'text-purple-700', bg: 'bg-purple-50' },
  job_application: { label: 'Job Application', color: 'text-green-700', bg: 'bg-green-50' },
  store_inquiry: { label: 'Store Inquiry', color: 'text-orange-700', bg: 'bg-orange-50' },
  order_support: { label: 'Order Support', color: 'text-yellow-700', bg: 'bg-yellow-50' },
  admin_support: { label: 'Admin Support', color: 'text-red-700', bg: 'bg-red-50' },
  affiliate_support: { label: 'Affiliate Support', color: 'text-indigo-700', bg: 'bg-indigo-50' },
  general: { label: 'General Inquiry', color: 'text-gray-700', bg: 'bg-gray-100' },
};

export interface ProductMessage {
  id: string;
  product_id: string;
  sender_id: string;
  message: string;
  is_read: boolean;
  created_at: string;
  sender_name?: string;
}

export interface GuestOrder {
  id: string;
  product_id: string;
  guest_email: string;
  buyer_email?: string;
  user_id?: string | null;
  amount: number;
  status: string;
  tracking_code: string;
  created_at: string;
}

export interface Referral {
  id: string;
  referrer_id: string;
  referred_user_id: string;
  commission_earned: number;
  status: string;
  created_at: string;
  referred_name?: string;
  referred_email?: string;
}

export interface ReferralLink {
  id: string;
  user_id: string;
  code: string;
  clicks: number;
  conversions: number;
  created_at: string;
}

export interface WithdrawalRequest {
  id: string;
  user_id: string;
  amount: number;
  method: string;
  account_details: Record<string, string>;
  status: 'pending' | 'approved' | 'rejected' | 'paid';
  created_at: string;
  updated_at: string;
  user_email?: string;
}

export interface TicketReply {
  id: string;
  ticket_id: string;
  sender_id: string;
  body: string;
  is_admin_reply: boolean;
  created_at: string;
  sender_name?: string;
}

export interface PortfolioItem {
  id: string;
  user_id: string;
  title: string;
  description?: string | null;
  image_url?: string | null;
  link?: string | null;
  sort_order: number;
  created_at: string;
}

export interface SalesTeamMember {
  id: string;
  user_id: string;
  product_id: string;
  role: string;
  joined_at: string;
  user_name?: string;
  user_avatar?: string | null;
}

export interface ProductDraft {
  id: string;
  user_id: string;
  draft_data: Partial<Product>;
  created_at: string;
  updated_at: string;
}

// ─── Missing Types (restored) ─────────────────────────────────────────────────

export type JobType = string;
export type WorkSetup = string;
export type CareerLevel = string;

export type ReferralTier = 'none' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';

export interface ReferralTierInfo {
  tier: ReferralTier;
  label: string;
  minReferrals: number;
  maxReferrals?: number | null;
  nextTierMin?: number | null;
  commissionBonus?: number;
  color?: string;
  badge?: string;
  icon?: string;
  progress?: number;
  reward?: string;
}

export interface BusinessSettings {
  id: string;
  is_singleton: boolean;
  business_name: string;
  tagline?: string | null;
  description?: string | null;
  street_address?: string | null;
  address_line_2?: string | null;
  city?: string | null;
  region?: string | null;
  postal_code?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  phone?: string | null;
  email?: string | null;
  website_url?: string | null;
  logo_url?: string | null;
  hours_json?: Record<string, { open: string; close: string; closed?: boolean }> | null;
  service_area?: string[] | null;
  social_profiles?: Record<string, string> | null;
  google_business_profile_url?: string | null;
  google_place_id?: string | null;
  google_maps_embed_url?: string | null;
  price_range?: string | null;
  service_categories?: string[] | null;
  created_at: string;
  updated_at: string;
}
