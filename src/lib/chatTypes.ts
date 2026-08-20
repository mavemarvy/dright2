export type MessageType = 'text' | 'image' | 'video' | 'document' | 'audio' | 'voice_note' | 'marketplace_card';

export interface ChatAttachment {
  id: string;
  message_id: string;
  conversation_id: string;
  uploader_id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  public_url: string;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  created_at: string;
}

export interface ChatReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
  user_name?: string;
}

export interface ChatMessageEdit {
  id: string;
  message_id: string;
  editor_id: string;
  previous_body: string;
  edited_at: string;
}

export interface ChatStarredMessage {
  id: string;
  user_id: string;
  message_id: string;
  conversation_id: string;
  created_at: string;
}

export interface ChatPinnedMessage {
  id: string;
  conversation_id: string;
  message_id: string;
  pinned_by: string;
  pinned_at: string;
}

export interface ChatQuickReply {
  id: string;
  user_id: string;
  title: string;
  body: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ChatSellerNote {
  id: string;
  conversation_id: string;
  seller_id: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface ChatDraft {
  id: string;
  conversation_id: string;
  user_id: string;
  body: string;
  updated_at: string;
}

export interface ChatTimelineEvent {
  id: string;
  conversation_id: string;
  event_type: string;
  event_label: string;
  event_data: Record<string, unknown> | null;
  created_at: string;
}

export interface MarketplaceCardData {
  type: 'product' | 'service' | 'job' | 'store';
  id: string;
  title: string;
  image_url?: string | null;
  price?: number | null;
  price_label?: string;
  subtitle?: string;
  rating?: number | null;
  url: string;
}

// ─── Part 3: Organization, Moderation, AI ──────────────────────────────────────

export interface ChatArchivedConversation {
  id: string;
  conversation_id: string;
  user_id: string;
  archived_at: string;
}

export interface ChatFavoriteConversation {
  id: string;
  conversation_id: string;
  user_id: string;
  favorited_at: string;
  sort_order: number;
}

export interface ChatPinnedConversation {
  id: string;
  conversation_id: string;
  user_id: string;
  pinned_at: string;
  sort_order: number;
}

export interface ChatLabel {
  id: string;
  name: string;
  color: string;
  is_system: boolean;
  created_by: string | null;
  created_at: string;
}

export interface ChatConversationLabel {
  id: string;
  conversation_id: string;
  label_id: string;
  applied_by: string;
  applied_at: string;
  label?: ChatLabel;
}

export interface ChatUserBlock {
  id: string;
  blocker_id: string;
  blocked_id: string;
  created_at: string;
  blocked_name?: string;
  blocked_avatar?: string | null;
}

export type ReportReason =
  | 'spam' | 'scam' | 'harassment' | 'fake_listing'
  | 'offensive_content' | 'fraud' | 'copyright' | 'other';

export interface ChatReport {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  conversation_id: string | null;
  message_id: string | null;
  reason: ReportReason | string;
  description: string | null;
  status: 'open' | 'investigating' | 'resolved' | 'dismissed';
  resolved_by: string | null;
  resolution_notes: string | null;
  created_at: string;
  resolved_at: string | null;
}

export type ReminderType =
  | 'reply_tomorrow' | 'call_customer' | 'send_quotation' | 'confirm_payment' | 'custom';

export interface ChatFollowUpReminder {
  id: string;
  conversation_id: string;
  seller_id: string;
  reminder_type: ReminderType;
  title: string | null;
  due_at: string;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
}

export interface ChatCustomerTag {
  id: string;
  seller_id: string;
  customer_id: string;
  tag: string;
  created_at: string;
}

export type SpamFlagType =
  | 'duplicate_message' | 'excessive_rate' | 'suspicious_link'
  | 'unsafe_file' | 'promotional_repeat';

export interface ChatSpamFlag {
  id: string;
  conversation_id: string;
  user_id: string;
  flag_type: SpamFlagType;
  details: Record<string, unknown> | null;
  is_resolved: boolean;
  resolved_by: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface ChatConversationSummary {
  id: string;
  conversation_id: string;
  summary_text: string;
  bullet_points: string[] | null;
  message_count: number;
  generated_at: string;
}

export interface ChatAuditLog {
  id: string;
  admin_id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  conversation_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export type TrustIndicator =
  | 'verified_seller' | 'verified_buyer' | 'verified_business'
  | 'top_seller' | 'premium_seller' | 'admin' | 'moderator'
  | 'new_seller' | 'returning_customer';

export interface TrustIndicatorMeta {
  label: string;
  color: string;
  bg: string;
  icon: string;
}

export const TRUST_INDICATOR_META: Record<TrustIndicator, TrustIndicatorMeta> = {
  verified_seller: { label: 'Verified Seller', color: 'text-blue-700', bg: 'bg-blue-50', icon: 'badge-check' },
  verified_buyer: { label: 'Verified Buyer', color: 'text-cyan-700', bg: 'bg-cyan-50', icon: 'badge-check' },
  verified_business: { label: 'Verified Business', color: 'text-indigo-700', bg: 'bg-indigo-50', icon: 'building' },
  top_seller: { label: 'Top Seller', color: 'text-amber-700', bg: 'bg-amber-50', icon: 'crown' },
  premium_seller: { label: 'Premium Seller', color: 'text-purple-700', bg: 'bg-purple-50', icon: 'gem' },
  admin: { label: 'Admin', color: 'text-red-700', bg: 'bg-red-50', icon: 'shield' },
  moderator: { label: 'Moderator', color: 'text-orange-700', bg: 'bg-orange-50', icon: 'shield-check' },
  new_seller: { label: 'New Seller', color: 'text-gray-600', bg: 'bg-gray-100', icon: 'sparkles' },
  returning_customer: { label: 'Returning Customer', color: 'text-teal-700', bg: 'bg-teal-50', icon: 'repeat' },
};

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam' },
  { value: 'scam', label: 'Scam' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'fake_listing', label: 'Fake Listing' },
  { value: 'offensive_content', label: 'Offensive Content' },
  { value: 'fraud', label: 'Fraud' },
  { value: 'copyright', label: 'Copyright Violation' },
  { value: 'other', label: 'Other' },
];

export const REMINDER_TYPE_META: Record<ReminderType, { label: string; icon: string }> = {
  reply_tomorrow: { label: 'Reply Tomorrow', icon: 'clock' },
  call_customer: { label: 'Call Customer', icon: 'phone' },
  send_quotation: { label: 'Send Quotation', icon: 'file-text' },
  confirm_payment: { label: 'Confirm Payment', icon: 'dollar-sign' },
  custom: { label: 'Custom Reminder', icon: 'bell' },
};

export const SPAM_FLAG_TYPE_META: Record<SpamFlagType, { label: string }> = {
  duplicate_message: { label: 'Duplicate Message' },
  excessive_rate: { label: 'Excessive Messaging Rate' },
  suspicious_link: { label: 'Suspicious Link' },
  unsafe_file: { label: 'Unsafe File' },
  promotional_repeat: { label: 'Repeated Promotional Content' },
};

export interface ChatCustomerHistory {
  joined_date: string;
  total_conversations: number;
  total_purchases: number;
  total_orders: number;
  wishlist_count: number;
  previous_conversations: { id: string; context_type: string; title: string; last_message_at: string | null }[];
  recent_orders: { id: string; product_name: string; amount: number; status: string; created_at: string }[];
  location: string | null;
  response_rate: number | null;
}

export interface ChatAnalytics {
  new_conversations: number;
  avg_response_time_minutes: number | null;
  messages_sent: number;
  messages_received: number;
  unread_conversations: number;
  chat_to_purchase_conversions: number;
  top_inquiry_products: { product_id: string; product_name: string; count: number }[];
  peak_messaging_hours: { hour: number; count: number }[];
}
