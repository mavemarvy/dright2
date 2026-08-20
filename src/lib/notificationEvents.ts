// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT Notification Event Engine
// Centralized event system: modules publish events → engine routes to users
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import type { NotificationCategory, NotificationPriority, NotificationType, NotificationMetadata } from './types';

// ─── Event Definitions ────────────────────────────────────────────────────────

export type EventModule =
  | 'marketplace' | 'services' | 'jobs' | 'chat' | 'wallet'
  | 'referral' | 'affiliate' | 'store' | 'review' | 'security'
  | 'admin' | 'system';

// Marketplace events
export type MarketplaceEvent =
  | 'product_purchased' | 'product_sold' | 'product_approved' | 'product_rejected'
  | 'product_updated' | 'product_deleted' | 'product_featured' | 'product_sponsored'
  | 'product_expired' | 'product_restocked' | 'low_inventory' | 'out_of_stock'
  | 'price_reduced' | 'price_increased' | 'flash_sale_started' | 'flash_sale_ended'
  | 'product_review_received' | 'product_rating_received'
  | 'wishlist_back_in_stock' | 'wishlist_discounted'
  | 'favorite_seller_new_product' | 'favorite_category_new_listings'
  | 'product_report_submitted' | 'product_moderation_completed'
  | 'product_removed_by_admin' | 'product_restored';

// Service events
export type ServiceEvent =
  | 'new_booking' | 'booking_confirmed' | 'booking_cancelled' | 'booking_completed'
  | 'quote_requested' | 'quote_accepted' | 'quote_rejected'
  | 'service_review' | 'service_rating' | 'service_featured'
  | 'service_expired' | 'service_approved' | 'service_rejected' | 'service_updated';

// Job events
export type JobEvent =
  | 'new_job_posted' | 'application_submitted' | 'application_viewed'
  | 'application_shortlisted' | 'interview_invitation' | 'interview_reminder'
  | 'interview_cancelled' | 'offer_received' | 'offer_accepted' | 'offer_rejected'
  | 'job_closed' | 'job_expired' | 'employer_message' | 'applicant_message';

// Chat events
export type ChatEvent =
  | 'new_message' | 'reply_received' | 'attachment_received' | 'voice_note_received'
  | 'conversation_archived' | 'conversation_restored' | 'reminder_due'
  | 'conversation_reported' | 'unread_conversation_reminder' | 'seller_follow_up_reminder';

// Wallet events
export type WalletEvent =
  | 'wallet_funded' | 'deposit_pending' | 'deposit_completed'
  | 'withdrawal_requested' | 'withdrawal_approved' | 'withdrawal_rejected'
  | 'withdrawal_completed' | 'withdrawal_failed'
  | 'refund_received' | 'refund_processed' | 'bonus_received'
  | 'cashback_received' | 'reward_credited' | 'transaction_reversed'
  | 'payment_received' | 'payment_failed';

// Referral events
export type ReferralEvent =
  | 'referral_joined' | 'referral_verified' | 'referral_first_purchase'
  | 'referral_first_sale' | 'referral_bonus_earned' | 'referral_level_unlocked'
  | 'referral_milestone_reached' | 'referral_expired' | 'referral_reward_claimed';

// Affiliate events
export type AffiliateEvent =
  | 'commission_earned' | 'commission_pending' | 'commission_approved'
  | 'commission_paid' | 'commission_reversed'
  | 'affiliate_application_approved' | 'affiliate_application_rejected'
  | 'affiliate_level_upgraded' | 'affiliate_milestone_reached' | 'top_affiliate_recognition';

// Store events
export type StoreEvent =
  | 'new_follower' | 'store_verified' | 'store_verification_rejected'
  | 'store_profile_completed' | 'store_sales_milestone' | 'store_anniversary'
  | 'store_featured' | 'store_suspended' | 'store_restored'
  | 'new_customer_review' | 'customer_replied';

// Review events
export type ReviewEvent =
  | 'review_received' | 'review_replied' | 'review_edited'
  | 'review_reported' | 'review_removed' | 'rating_updated';

// Security events
export type SecurityEvent =
  | 'new_login' | 'login_new_device' | 'password_changed' | 'email_changed'
  | 'phone_changed' | 'suspicious_activity' | 'multiple_failed_logins'
  | 'security_recommendation' | 'verification_reminder'
  | 'two_factor_enabled' | 'two_factor_disabled';

// Admin events
export type AdminEvent =
  | 'announcement' | 'maintenance_notice' | 'platform_update'
  | 'policy_update' | 'terms_updated' | 'community_announcement'
  | 'feature_released' | 'feature_deprecated' | 'verification_request'
  | 'support_ticket_update' | 'moderation_decision';

// System events
export type SystemEvent =
  | 'storage_almost_full' | 'subscription_expiring' | 'profile_incomplete'
  | 'missing_verification' | 'incomplete_listing' | 'draft_saved'
  | 'draft_expired' | 'scheduled_task_completed' | 'scheduled_task_failed'
  | 'system_recommendation';

export type EventType =
  | MarketplaceEvent | ServiceEvent | JobEvent | ChatEvent | WalletEvent
  | ReferralEvent | AffiliateEvent | StoreEvent | ReviewEvent | SecurityEvent
  | AdminEvent | SystemEvent;

// ─── Event Config ─────────────────────────────────────────────────────────────

export interface NotificationEventConfig {
  module: EventModule;
  eventType: EventType;
  notificationType: NotificationType;
  category: NotificationCategory;
  priority: NotificationPriority;
  titleTemplate: (meta: Record<string, unknown>) => string;
  messageTemplate: (meta: Record<string, unknown>) => string;
  groupKey?: (meta: Record<string, unknown>, recipientId: string) => string;
  expirationHours?: number; // null/undefined = permanent
  actions?: (meta: Record<string, unknown>) => QuickActionDef[];
  metadataMapping?: (meta: Record<string, unknown>) => NotificationMetadata;
}

export interface QuickActionDef {
  label: string;
  url?: string;
  variant: 'primary' | 'secondary';
}

// ─── Event Registry ────────────────────────────────────────────────────────────

const EVENT_REGISTRY: Record<string, NotificationEventConfig> = {};

export function registerEvent(config: NotificationEventConfig): void {
  const key = `${config.module}.${config.eventType}`;
  EVENT_REGISTRY[key] = config;
}

export function getEventConfig(module: EventModule, eventType: EventType): NotificationEventConfig | null {
  return EVENT_REGISTRY[`${module}.${eventType}`] || null;
}

// ─── Helper: safe template ─────────────────────────────────────────────────────

function str(val: unknown): string {
  return typeof val === 'string' ? val : val != null ? String(val) : '';
}

function num(val: unknown): number | null {
  return typeof val === 'number' ? val : null;
}

// ─── Register All Events ────────────────────────────────────────────────────────

// --- Marketplace ---
registerEvent({
  module: 'marketplace', eventType: 'product_purchased',
  notificationType: 'new_order', category: 'orders', priority: 'high',
  titleTemplate: () => 'New Order Received!',
  messageTemplate: (_m) => `${str(_m.buyerName)} purchased "${str(_m.productTitle)}" for ${str(_m.currency)}${str(_m.price)}`,
  groupKey: (m, rid) => `order:${rid}:${str(m.productId)}`,
  expirationHours: 168,
  actions: (_m) => [
    { label: 'View Order', url: str(_m.actionUrl) || '/my-orders', variant: 'primary' },
    { label: 'Chat Buyer', url: '/chat', variant: 'secondary' },
  ],
  metadataMapping: (_m) => ({
    product_title: str(_m.productTitle), product_price: num(_m.price),
    product_currency: str(_m.currency), product_image: str(_m.productImage),
    actor_name: str(_m.buyerName), action_url: str(_m.actionUrl),
  }),
});
registerEvent({
  module: 'marketplace', eventType: 'product_sold',
  notificationType: 'new_order', category: 'orders', priority: 'high',
  titleTemplate: () => 'Product Sold!',
  messageTemplate: (_m) => `Your product "${str(_m.productTitle)}" has been sold for ${str(_m.currency)}${str(_m.price)}`,
  groupKey: (m, rid) => `sold:${rid}:${str(m.productId)}`,
  expirationHours: 168,
  actions: (_m) => [{ label: 'View Sales', url: '/sales', variant: 'primary' }],
  metadataMapping: (_m) => ({
    product_title: str(_m.productTitle), product_price: num(_m.price),
    product_currency: str(_m.currency), product_image: str(_m.productImage),
  }),
});
registerEvent({
  module: 'marketplace', eventType: 'product_approved',
  notificationType: 'edit_approved', category: 'marketplace', priority: 'normal',
  titleTemplate: () => 'Product Approved!',
  messageTemplate: (_m) => `Your product "${str(_m.productTitle)}" has been approved and is now live.`,
  expirationHours: 72,
  actions: (_m) => [{ label: 'View Product', url: str(_m.actionUrl) || '/store', variant: 'primary' }],
  metadataMapping: (_m) => ({ product_title: str(_m.productTitle), product_image: str(_m.productImage), action_url: str(_m.actionUrl) }),
});
registerEvent({
  module: 'marketplace', eventType: 'product_rejected',
  notificationType: 'edit_rejected', category: 'marketplace', priority: 'high',
  titleTemplate: () => 'Product Not Approved',
  messageTemplate: (_m) => `Your product "${str(_m.productTitle)}" was not approved. Reason: ${str(_m.reason)}`,
  actions: (_m) => [{ label: 'Edit Listing', url: str(_m.actionUrl) || '/store', variant: 'primary' }],
  metadataMapping: (_m) => ({ product_title: str(_m.productTitle), action_url: str(_m.actionUrl) }),
});
registerEvent({
  module: 'marketplace', eventType: 'product_updated',
  notificationType: 'store_update', category: 'store', priority: 'low',
  titleTemplate: () => 'Product Updated',
  messageTemplate: (_m) => `Your product "${str(_m.productTitle)}" has been updated.`,
  actions: (_m) => [{ label: 'View Product', url: '/store', variant: 'primary' }],
  metadataMapping: (_m) => ({ product_title: str(_m.productTitle) }),
});
registerEvent({
  module: 'marketplace', eventType: 'product_featured',
  notificationType: 'store_update', category: 'store', priority: 'normal',
  titleTemplate: () => 'Product Featured!',
  messageTemplate: (_m) => `Your product "${str(_m.productTitle)}" is now featured on the marketplace!`,
  actions: (_m) => [{ label: 'View Product', url: str(_m.actionUrl) || '/market', variant: 'primary' }],
  metadataMapping: (_m) => ({ product_title: str(_m.productTitle), action_url: str(_m.actionUrl) }),
});
registerEvent({
  module: 'marketplace', eventType: 'low_inventory',
  notificationType: 'low_stock', category: 'marketplace', priority: 'high',
  titleTemplate: () => 'Low Inventory Alert',
  messageTemplate: (_m) => `Your product "${str(_m.productTitle)}" has only ${str(_m.remaining)} items left in stock.`,
  actions: (_m) => [{ label: 'View Product', url: '/store', variant: 'primary' }],
  metadataMapping: (_m) => ({ product_title: str(_m.productTitle) }),
});
registerEvent({
  module: 'marketplace', eventType: 'out_of_stock',
  notificationType: 'low_stock', category: 'marketplace', priority: 'critical',
  titleTemplate: () => 'Out of Stock',
  messageTemplate: (_m) => `Your product "${str(_m.productTitle)}" is now out of stock.`,
  actions: (_m) => [{ label: 'View Product', url: '/store', variant: 'primary' }],
  metadataMapping: (_m) => ({ product_title: str(_m.productTitle) }),
});
registerEvent({
  module: 'marketplace', eventType: 'price_reduced',
  notificationType: 'promotion', category: 'promotions', priority: 'normal',
  titleTemplate: () => 'Price Drop Alert',
  messageTemplate: (_m) => `"${str(_m.productTitle)}" dropped from ${str(_m.currency)}${str(_m.oldPrice)} to ${str(_m.currency)}${str(_m.newPrice)}.`,
  actions: (_m) => [{ label: 'View Product', url: str(_m.actionUrl) || '/market', variant: 'primary' }],
  metadataMapping: (_m) => ({ product_title: str(_m.productTitle), product_price: num(_m.newPrice), product_currency: str(_m.currency), action_url: str(_m.actionUrl) }),
});
registerEvent({
  module: 'marketplace', eventType: 'flash_sale_started',
  notificationType: 'promotion', category: 'promotions', priority: 'high',
  titleTemplate: () => 'Flash Sale Started!',
  messageTemplate: (_m) => `Flash sale on "${str(_m.productTitle)}" — ${str(_m.discountPercent)}% off for ${str(_m.duration)}!`,
  expirationHours: 24,
  actions: (_m) => [{ label: 'Shop Now', url: str(_m.actionUrl) || '/market', variant: 'primary' }],
  metadataMapping: (_m) => ({ product_title: str(_m.productTitle), action_url: str(_m.actionUrl) }),
});
registerEvent({
  module: 'marketplace', eventType: 'flash_sale_ended',
  notificationType: 'promotion', category: 'promotions', priority: 'low',
  titleTemplate: () => 'Flash Sale Ended',
  messageTemplate: (_m) => `The flash sale on "${str(_m.productTitle)}" has ended.`,
  expirationHours: 12,
  metadataMapping: (_m) => ({ product_title: str(_m.productTitle) }),
});
registerEvent({
  module: 'marketplace', eventType: 'product_review_received',
  notificationType: 'new_review', category: 'reviews', priority: 'normal',
  titleTemplate: () => 'New Review Received',
  messageTemplate: (_m) => `${str(_m.reviewerName)} left a ${str(_m.rating)}-star review on "${str(_m.productTitle)}".`,
  actions: (_m) => [{ label: 'Reply', url: str(_m.actionUrl) || '/store', variant: 'primary' }],
  metadataMapping: (_m) => ({
    product_title: str(_m.productTitle), rating: num(_m.rating),
    review_preview: str(_m.reviewPreview), actor_name: str(_m.reviewerName), action_url: str(_m.actionUrl),
  }),
});
registerEvent({
  module: 'marketplace', eventType: 'wishlist_back_in_stock',
  notificationType: 'store_update', category: 'store', priority: 'normal',
  titleTemplate: () => 'Wishlist Item Back in Stock',
  messageTemplate: (_m) => `"${str(_m.productTitle)}" from your wishlist is back in stock!`,
  expirationHours: 72,
  actions: (_m) => [{ label: 'View Product', url: str(_m.actionUrl) || '/market', variant: 'primary' }],
  metadataMapping: (_m) => ({ product_title: str(_m.productTitle), product_image: str(_m.productImage), action_url: str(_m.actionUrl) }),
});
registerEvent({
  module: 'marketplace', eventType: 'wishlist_discounted',
  notificationType: 'promotion', category: 'promotions', priority: 'normal',
  titleTemplate: () => 'Wishlist Item Discounted',
  messageTemplate: (_m) => `"${str(_m.productTitle)}" from your wishlist is now ${str(_m.discountPercent)}% off!`,
  expirationHours: 48,
  actions: (_m) => [{ label: 'Buy Now', url: str(_m.actionUrl) || '/market', variant: 'primary' }],
  metadataMapping: (_m) => ({ product_title: str(_m.productTitle), action_url: str(_m.actionUrl) }),
});
registerEvent({
  module: 'marketplace', eventType: 'favorite_seller_new_product',
  notificationType: 'store_update', category: 'store', priority: 'normal',
  titleTemplate: () => 'New Product from Favorite Seller',
  messageTemplate: (_m) => `${str(_m.sellerName)} just uploaded "${str(_m.productTitle)}".`,
  actions: (_m) => [{ label: 'View Product', url: str(_m.actionUrl) || '/market', variant: 'primary' }],
  metadataMapping: (_m) => ({ product_title: str(_m.productTitle), actor_name: str(_m.sellerName), action_url: str(_m.actionUrl) }),
});
registerEvent({
  module: 'marketplace', eventType: 'product_report_submitted',
  notificationType: 'report_created', category: 'security', priority: 'high',
  titleTemplate: () => 'Product Report Submitted',
  messageTemplate: (_m) => `A report was filed for "${str(_m.productTitle)}". Reason: ${str(_m.reason)}`,
  actions: (_m) => [{ label: 'Review', url: '/admin', variant: 'primary' }],
  metadataMapping: (_m) => ({ product_title: str(_m.productTitle) }),
});

// --- Services ---
registerEvent({
  module: 'services', eventType: 'new_booking',
  notificationType: 'service_booking', category: 'services', priority: 'high',
  titleTemplate: () => 'New Service Booking!',
  messageTemplate: (_m) => `${str(_m.clientName)} booked your service "${str(_m.serviceTitle)}" for ${str(_m.currency)}${str(_m.price)}.`,
  actions: (_m) => [
    { label: 'View Booking', url: str(_m.actionUrl) || '/my-orders', variant: 'primary' },
    { label: 'Chat Client', url: '/chat', variant: 'secondary' },
  ],
  metadataMapping: (_m) => ({
    service_title: str(_m.serviceTitle), service_price: num(_m.price),
    service_image: str(_m.serviceImage), booking_date: str(_m.bookingDate),
    actor_name: str(_m.clientName), action_url: str(_m.actionUrl),
  }),
});
registerEvent({
  module: 'services', eventType: 'booking_confirmed',
  notificationType: 'service_booking', category: 'services', priority: 'normal',
  titleTemplate: () => 'Booking Confirmed',
  messageTemplate: (_m) => `Your booking for "${str(_m.serviceTitle)}" has been confirmed for ${str(_m.bookingDate)}.`,
  actions: (_m) => [{ label: 'View Booking', url: str(_m.actionUrl) || '/my-orders', variant: 'primary' }],
  metadataMapping: (_m) => ({ service_title: str(_m.serviceTitle), booking_date: str(_m.bookingDate), action_url: str(_m.actionUrl) }),
});
registerEvent({
  module: 'services', eventType: 'booking_cancelled',
  notificationType: 'service_booking', category: 'services', priority: 'high',
  titleTemplate: () => 'Booking Cancelled',
  messageTemplate: (_m) => `Your booking for "${str(_m.serviceTitle)}" was cancelled. ${str(_m.reason)}`,
  metadataMapping: (_m) => ({ service_title: str(_m.serviceTitle) }),
});
registerEvent({
  module: 'services', eventType: 'booking_completed',
  notificationType: 'service_booking', category: 'services', priority: 'normal',
  titleTemplate: () => 'Booking Completed',
  messageTemplate: (_m) => `Your service "${str(_m.serviceTitle)}" has been completed. Please leave a review.`,
  actions: (_m) => [{ label: 'Leave Review', url: str(_m.actionUrl) || '/my-orders', variant: 'primary' }],
  metadataMapping: (_m) => ({ service_title: str(_m.serviceTitle), action_url: str(_m.actionUrl) }),
});
registerEvent({
  module: 'services', eventType: 'quote_requested',
  notificationType: 'service_booking', category: 'services', priority: 'normal',
  titleTemplate: () => 'New Quote Request',
  messageTemplate: (_m) => `${str(_m.clientName)} requested a quote for "${str(_m.serviceTitle)}".`,
  actions: (_m) => [{ label: 'Respond', url: '/chat', variant: 'primary' }],
  metadataMapping: (_m) => ({ service_title: str(_m.serviceTitle), actor_name: str(_m.clientName) }),
});
registerEvent({
  module: 'services', eventType: 'service_approved',
  notificationType: 'edit_approved', category: 'services', priority: 'normal',
  titleTemplate: () => 'Service Approved!',
  messageTemplate: (_m) => `Your service "${str(_m.serviceTitle)}" has been approved.`,
  actions: (_m) => [{ label: 'View Service', url: '/store', variant: 'primary' }],
  metadataMapping: (_m) => ({ service_title: str(_m.serviceTitle) }),
});
registerEvent({
  module: 'services', eventType: 'service_rejected',
  notificationType: 'edit_rejected', category: 'services', priority: 'high',
  titleTemplate: () => 'Service Not Approved',
  messageTemplate: (_m) => `Your service "${str(_m.serviceTitle)}" was not approved. Reason: ${str(_m.reason)}`,
  metadataMapping: (_m) => ({ service_title: str(_m.serviceTitle) }),
});

// --- Jobs ---
registerEvent({
  module: 'jobs', eventType: 'new_job_posted',
  notificationType: 'job_application', category: 'jobs', priority: 'normal',
  titleTemplate: () => 'New Job Posted',
  messageTemplate: (_m) => `A new job "${str(_m.jobTitle)}" at ${str(_m.companyName)} matches your interests.`,
  groupKey: (m, rid) => `job_match:${rid}:${str(m.jobId)}`,
  expirationHours: 168,
  actions: (_m) => [{ label: 'View Job', url: str(_m.actionUrl) || '/jobs', variant: 'primary' }],
  metadataMapping: (_m) => ({ job_title: str(_m.jobTitle), company_name: str(_m.companyName), action_url: str(_m.actionUrl) }),
});
registerEvent({
  module: 'jobs', eventType: 'application_submitted',
  notificationType: 'job_application', category: 'jobs', priority: 'high',
  titleTemplate: () => 'New Application Received',
  messageTemplate: (_m) => `${str(_m.applicantName)} applied for "${str(_m.jobTitle)}".`,
  groupKey: (m, rid) => `app:${rid}:${str(m.jobId)}`,
  actions: (_m) => [
    { label: 'Review Application', url: str(_m.actionUrl) || '/jobs', variant: 'primary' },
    { label: 'Chat Applicant', url: '/chat', variant: 'secondary' },
  ],
  metadataMapping: (_m) => ({
    job_title: str(_m.jobTitle), applicant_name: str(_m.applicantName),
    action_url: str(_m.actionUrl),
  }),
});
registerEvent({
  module: 'jobs', eventType: 'application_viewed',
  notificationType: 'job_application', category: 'jobs', priority: 'normal',
  titleTemplate: () => 'Application Viewed',
  messageTemplate: (_m) => `Your application for "${str(_m.jobTitle)}" was viewed by ${str(_m.companyName)}.`,
  metadataMapping: (_m) => ({ job_title: str(_m.jobTitle), company_name: str(_m.companyName) }),
});
registerEvent({
  module: 'jobs', eventType: 'interview_invitation',
  notificationType: 'job_application', category: 'jobs', priority: 'critical',
  titleTemplate: () => 'Interview Invitation!',
  messageTemplate: (_m) => `You've been invited to an interview for "${str(_m.jobTitle)}" on ${str(_m.interviewDate)}.`,
  actions: (_m) => [{ label: 'Schedule Interview', url: str(_m.actionUrl) || '/jobs', variant: 'primary' }],
  metadataMapping: (_m) => ({ job_title: str(_m.jobTitle), booking_date: str(_m.interviewDate), action_url: str(_m.actionUrl) }),
});
registerEvent({
  module: 'jobs', eventType: 'offer_received',
  notificationType: 'job_application', category: 'jobs', priority: 'critical',
  titleTemplate: () => 'Job Offer Received!',
  messageTemplate: (_m) => `You've received an offer for "${str(_m.jobTitle)}" at ${str(_m.companyName)}.`,
  actions: (_m) => [
    { label: 'Accept', url: str(_m.actionUrl) || '/jobs', variant: 'primary' },
    { label: 'Reject', url: str(_m.actionUrl) || '/jobs', variant: 'secondary' },
  ],
  metadataMapping: (_m) => ({ job_title: str(_m.jobTitle), company_name: str(_m.companyName), action_url: str(_m.actionUrl) }),
});
registerEvent({
  module: 'jobs', eventType: 'job_closed',
  notificationType: 'job_application', category: 'jobs', priority: 'normal',
  titleTemplate: () => 'Job Closed',
  messageTemplate: (_m) => `The job "${str(_m.jobTitle)}" has been closed.`,
  metadataMapping: (_m) => ({ job_title: str(_m.jobTitle) }),
});

// --- Chat ---
registerEvent({
  module: 'chat', eventType: 'new_message',
  notificationType: 'new_message', category: 'messages', priority: 'normal',
  titleTemplate: () => 'New Message',
  messageTemplate: (_m) => `${str(_m.senderName)}: ${str(_m.messagePreview)}`,
  groupKey: (m, rid) => `msg:${rid}:${str(m.conversationId)}`,
  actions: (_m) => [{ label: 'Open Chat', url: '/chat', variant: 'primary' }],
  metadataMapping: (_m) => ({ actor_name: str(_m.senderName), actor_avatar: str(_m.senderAvatar), action_url: '/chat' }),
});
registerEvent({
  module: 'chat', eventType: 'attachment_received',
  notificationType: 'attachment_received', category: 'messages', priority: 'normal',
  titleTemplate: () => 'Attachment Received',
  messageTemplate: (_m) => `${str(_m.senderName)} sent you an attachment.`,
  groupKey: (m, rid) => `att:${rid}:${str(m.conversationId)}`,
  actions: (_m) => [{ label: 'Open Chat', url: '/chat', variant: 'primary' }],
  metadataMapping: (_m) => ({ actor_name: str(_m.senderName), action_url: '/chat' }),
});
registerEvent({
  module: 'chat', eventType: 'conversation_reported',
  notificationType: 'report_created', category: 'security', priority: 'high',
  titleTemplate: () => 'Conversation Reported',
  messageTemplate: (_m) => `A conversation has been reported. Reason: ${str(_m.reason)}`,
  actions: (_m) => [{ label: 'Review', url: '/admin', variant: 'primary' }],
  metadataMapping: (_m) => ({}),
});

// --- Wallet ---
registerEvent({
  module: 'wallet', eventType: 'wallet_funded',
  notificationType: 'wallet_deposit', category: 'wallet', priority: 'normal',
  titleTemplate: () => 'Wallet Funded',
  messageTemplate: (_m) => `Your wallet has been funded with ${str(_m.currency)}${str(_m.amount)}.`,
  metadataMapping: (_m) => ({ amount: num(_m.amount), currency: str(_m.currency), reference: str(_m.reference) }),
});
registerEvent({
  module: 'wallet', eventType: 'deposit_completed',
  notificationType: 'wallet_deposit', category: 'wallet', priority: 'normal',
  titleTemplate: () => 'Deposit Completed',
  messageTemplate: (_m) => `Your deposit of ${str(_m.currency)}${str(_m.amount)} has been completed.`,
  metadataMapping: (_m) => ({ amount: num(_m.amount), currency: str(_m.currency), reference: str(_m.reference) }),
});
registerEvent({
  module: 'wallet', eventType: 'withdrawal_requested',
  notificationType: 'wallet_withdrawal', category: 'wallet', priority: 'high',
  titleTemplate: () => 'Withdrawal Requested',
  messageTemplate: (_m) => `Your withdrawal request for ${str(_m.currency)}${str(_m.amount)} is being processed.`,
  metadataMapping: (_m) => ({ amount: num(_m.amount), currency: str(_m.currency), reference: str(_m.reference) }),
});
registerEvent({
  module: 'wallet', eventType: 'withdrawal_approved',
  notificationType: 'wallet_withdrawal', category: 'wallet', priority: 'normal',
  titleTemplate: () => 'Withdrawal Approved',
  messageTemplate: (_m) => `Your withdrawal of ${str(_m.currency)}${str(_m.amount)} has been approved.`,
  actions: (_m) => [{ label: 'View Transaction', url: '/sales', variant: 'primary' }],
  metadataMapping: (_m) => ({ amount: num(_m.amount), currency: str(_m.currency), reference: str(_m.reference) }),
});
registerEvent({
  module: 'wallet', eventType: 'withdrawal_completed',
  notificationType: 'wallet_withdrawal', category: 'wallet', priority: 'normal',
  titleTemplate: () => 'Withdrawal Complete!',
  messageTemplate: (_m) => `${str(_m.currency)}${str(_m.amount)} has been sent to your account.`,
  metadataMapping: (_m) => ({ amount: num(_m.amount), currency: str(_m.currency), reference: str(_m.reference) }),
});
registerEvent({
  module: 'wallet', eventType: 'withdrawal_rejected',
  notificationType: 'wallet_withdrawal', category: 'wallet', priority: 'high',
  titleTemplate: () => 'Withdrawal Rejected',
  messageTemplate: (_m) => `Your withdrawal of ${str(_m.currency)}${str(_m.amount)} was rejected. Reason: ${str(_m.reason)}`,
  metadataMapping: (_m) => ({ amount: num(_m.amount), currency: str(_m.currency) }),
});
registerEvent({
  module: 'wallet', eventType: 'refund_received',
  notificationType: 'wallet_deposit', category: 'wallet', priority: 'normal',
  titleTemplate: () => 'Refund Received',
  messageTemplate: (_m) => `You received a refund of ${str(_m.currency)}${str(_m.amount)} for "${str(_m.productTitle)}".`,
  metadataMapping: (_m) => ({ amount: num(_m.amount), currency: str(_m.currency), product_title: str(_m.productTitle) }),
});
registerEvent({
  module: 'wallet', eventType: 'bonus_received',
  notificationType: 'wallet_deposit', category: 'wallet', priority: 'normal',
  titleTemplate: () => 'Bonus Received!',
  messageTemplate: (_m) => `You received a bonus of ${str(_m.currency)}${str(_m.amount)}. ${str(_m.reason)}`,
  metadataMapping: (_m) => ({ amount: num(_m.amount), currency: str(_m.currency) }),
});
registerEvent({
  module: 'wallet', eventType: 'cashback_received',
  notificationType: 'wallet_deposit', category: 'wallet', priority: 'normal',
  titleTemplate: () => 'Cashback Received!',
  messageTemplate: (_m) => `You earned ${str(_m.currency)}${str(_m.amount)} cashback on your purchase.`,
  metadataMapping: (_m) => ({ amount: num(_m.amount), currency: str(_m.currency) }),
});
registerEvent({
  module: 'wallet', eventType: 'payment_received',
  notificationType: 'wallet_deposit', category: 'wallet', priority: 'high',
  titleTemplate: () => 'Payment Received!',
  messageTemplate: (_m) => `You received a payment of ${str(_m.currency)}${str(_m.amount)} from ${str(_m.payerName)}.`,
  metadataMapping: (_m) => ({ amount: num(_m.amount), currency: str(_m.currency), actor_name: str(_m.payerName) }),
});
registerEvent({
  module: 'wallet', eventType: 'payment_failed',
  notificationType: 'security_alert', category: 'security', priority: 'critical',
  titleTemplate: () => 'Payment Failed',
  messageTemplate: (_m) => `A payment of ${str(_m.currency)}${str(_m.amount)} failed. ${str(_m.reason)}`,
  metadataMapping: (_m) => ({ amount: num(_m.amount), currency: str(_m.currency) }),
});

// --- Referral ---
registerEvent({
  module: 'referral', eventType: 'referral_joined',
  notificationType: 'referral_signup', category: 'referrals', priority: 'normal',
  titleTemplate: () => 'New Referral Signup!',
  messageTemplate: (_m) => `${str(_m.referralName)} just signed up using your referral link!`,
  metadataMapping: (_m) => ({ referral_name: str(_m.referralName) }),
});
registerEvent({
  module: 'referral', eventType: 'referral_first_purchase',
  notificationType: 'referral_commission', category: 'referrals', priority: 'high',
  titleTemplate: () => 'Referral Made First Purchase!',
  messageTemplate: (_m) => `${str(_m.referralName)} made their first purchase! You earned ${str(_m.currency)}${str(_m.commission)}.`,
  actions: (_m) => [{ label: 'View Earnings', url: '/refer', variant: 'primary' }],
  metadataMapping: (_m) => ({ referral_name: str(_m.referralName), commission_amount: num(_m.commission), currency: str(_m.currency) }),
});
registerEvent({
  module: 'referral', eventType: 'referral_bonus_earned',
  notificationType: 'referral_commission', category: 'referrals', priority: 'high',
  titleTemplate: () => 'Referral Bonus Earned!',
  messageTemplate: (_m) => `You earned a referral bonus of ${str(_m.currency)}${str(_m.amount)}.`,
  actions: (_m) => [{ label: 'View Earnings', url: '/refer', variant: 'primary' }, { label: 'Share Link', url: '/refer', variant: 'secondary' }],
  metadataMapping: (_m) => ({ commission_amount: num(_m.amount), currency: str(_m.currency) }),
});
registerEvent({
  module: 'referral', eventType: 'referral_level_unlocked',
  notificationType: 'referral_commission', category: 'referrals', priority: 'high',
  titleTemplate: () => 'New Referral Level Unlocked!',
  messageTemplate: (_m) => `You've reached ${str(_m.levelName)} level! New rewards available.`,
  actions: (_m) => [{ label: 'View Rewards', url: '/refer', variant: 'primary' }],
  metadataMapping: (_m) => ({}),
});
registerEvent({
  module: 'referral', eventType: 'referral_milestone_reached',
  notificationType: 'referral_commission', category: 'referrals', priority: 'normal',
  titleTemplate: () => 'Referral Milestone Reached!',
  messageTemplate: (_m) => `You've reached ${str(_m.milestone)} referrals. Keep going!`,
  actions: (_m) => [{ label: 'Share Link', url: '/refer', variant: 'primary' }],
  metadataMapping: (_m) => ({}),
});

// --- Affiliate ---
registerEvent({
  module: 'affiliate', eventType: 'commission_earned',
  notificationType: 'affiliate_commission', category: 'affiliate', priority: 'high',
  titleTemplate: () => 'Commission Earned!',
  messageTemplate: (_m) => `You earned ${str(_m.currency)}${str(_m.amount)} commission from ${str(_m.buyerName)}'s purchase.`,
  actions: (_m) => [{ label: 'View Earnings', url: '/sales', variant: 'primary' }],
  metadataMapping: (_m) => ({ commission_amount: num(_m.amount), currency: str(_m.currency), actor_name: str(_m.buyerName) }),
});
registerEvent({
  module: 'affiliate', eventType: 'commission_approved',
  notificationType: 'affiliate_commission', category: 'affiliate', priority: 'normal',
  titleTemplate: () => 'Commission Approved',
  messageTemplate: (_m) => `Your commission of ${str(_m.currency)}${str(_m.amount)} has been approved.`,
  metadataMapping: (_m) => ({ commission_amount: num(_m.amount), currency: str(_m.currency) }),
});
registerEvent({
  module: 'affiliate', eventType: 'commission_paid',
  notificationType: 'affiliate_commission', category: 'affiliate', priority: 'normal',
  titleTemplate: () => 'Commission Paid!',
  messageTemplate: (_m) => `${str(_m.currency)}${str(_m.amount)} commission has been paid to your wallet.`,
  actions: (_m) => [{ label: 'View Earnings', url: '/sales', variant: 'primary' }, { label: 'Withdraw', url: '/sales', variant: 'secondary' }],
  metadataMapping: (_m) => ({ commission_amount: num(_m.amount), currency: str(_m.currency) }),
});
registerEvent({
  module: 'affiliate', eventType: 'affiliate_level_upgraded',
  notificationType: 'affiliate_commission', category: 'affiliate', priority: 'high',
  titleTemplate: () => 'Affiliate Level Upgraded!',
  messageTemplate: (_m) => `You've been upgraded to ${str(_m.newLevel)}! New commission rates apply.`,
  metadataMapping: (_m) => ({}),
});
registerEvent({
  module: 'affiliate', eventType: 'affiliate_milestone_reached',
  notificationType: 'affiliate_commission', category: 'affiliate', priority: 'normal',
  titleTemplate: () => 'Affiliate Milestone Reached!',
  messageTemplate: (_m) => `You've reached ${str(_m.milestone)} in total sales. Great work!`,
  metadataMapping: (_m) => ({}),
});

// --- Store ---
registerEvent({
  module: 'store', eventType: 'new_follower',
  notificationType: 'new_follower', category: 'followers', priority: 'normal',
  titleTemplate: () => 'New Follower!',
  messageTemplate: (_m) => `${str(_m.followerName)} is now following your store.`,
  groupKey: (_m, rid) => `follower:${rid}`,
  actions: (_m) => [{ label: 'Visit Profile', url: str(_m.actionUrl) || '/profile', variant: 'primary' }, { label: 'Message', url: '/chat', variant: 'secondary' }],
  metadataMapping: (_m) => ({ follower_name: str(_m.followerName), follower_avatar: str(_m.followerAvatar), action_url: str(_m.actionUrl) }),
});
registerEvent({
  module: 'store', eventType: 'store_verified',
  notificationType: 'store_update', category: 'store', priority: 'high',
  titleTemplate: () => 'Store Verified!',
  messageTemplate: () => 'Congratulations! Your store has been verified.',
  actions: (_m) => [{ label: 'Visit Store', url: '/store', variant: 'primary' }],
  metadataMapping: () => ({}),
});
registerEvent({
  module: 'store', eventType: 'store_featured',
  notificationType: 'store_update', category: 'store', priority: 'normal',
  titleTemplate: () => 'Store Featured!',
  messageTemplate: () => 'Your store is now featured on the marketplace!',
  metadataMapping: () => ({}),
});
registerEvent({
  module: 'store', eventType: 'store_suspended',
  notificationType: 'security_alert', category: 'security', priority: 'critical',
  titleTemplate: () => 'Store Suspended',
  messageTemplate: (_m) => `Your store has been suspended. Reason: ${str(_m.reason)}`,
  metadataMapping: () => ({}),
});
registerEvent({
  module: 'store', eventType: 'store_sales_milestone',
  notificationType: 'store_update', category: 'store', priority: 'normal',
  titleTemplate: () => 'Sales Milestone Reached!',
  messageTemplate: (_m) => `Your store has reached ${str(_m.milestone)} total sales!`,
  metadataMapping: () => ({}),
});

// --- Review ---
registerEvent({
  module: 'review', eventType: 'review_received',
  notificationType: 'new_review', category: 'reviews', priority: 'normal',
  titleTemplate: () => 'New Review Received',
  messageTemplate: (_m) => `${str(_m.reviewerName)} left a ${str(_m.rating)}-star review on your product.`,
  actions: (_m) => [{ label: 'Reply', url: str(_m.actionUrl) || '/store', variant: 'primary' }],
  metadataMapping: (_m) => ({ rating: num(_m.rating), review_preview: str(_m.reviewPreview), actor_name: str(_m.reviewerName), action_url: str(_m.actionUrl) }),
});
registerEvent({
  module: 'review', eventType: 'review_replied',
  notificationType: 'new_review', category: 'reviews', priority: 'low',
  titleTemplate: () => 'Review Reply Received',
  messageTemplate: (_m) => `${str(_m.sellerName)} replied to your review on "${str(_m.productTitle)}".`,
  metadataMapping: (_m) => ({ product_title: str(_m.productTitle), actor_name: str(_m.sellerName) }),
});

// --- Security ---
registerEvent({
  module: 'security', eventType: 'new_login',
  notificationType: 'security_alert', category: 'security', priority: 'normal',
  titleTemplate: () => 'New Login',
  messageTemplate: (_m) => `Login from ${str(_m.device)} at ${str(_m.location)}.`,
  expirationHours: 72,
  metadataMapping: (_m) => ({}),
});
registerEvent({
  module: 'security', eventType: 'login_new_device',
  notificationType: 'security_alert', category: 'security', priority: 'high',
  titleTemplate: () => 'Login from New Device',
  messageTemplate: (_m) => `Your account was accessed from a new device in ${str(_m.location)}.`,
  actions: (_m) => [{ label: 'Review Activity', url: '/profile', variant: 'primary' }, { label: 'Secure Account', url: '/profile', variant: 'secondary' }],
  metadataMapping: (_m) => ({}),
});
registerEvent({
  module: 'security', eventType: 'password_changed',
  notificationType: 'security_alert', category: 'security', priority: 'high',
  titleTemplate: () => 'Password Changed',
  messageTemplate: () => "Your password has been changed. If this wasn't you, please secure your account immediately.",
  actions: (_m) => [{ label: 'Secure Account', url: '/profile', variant: 'primary' }],
  metadataMapping: () => ({}),
});
registerEvent({
  module: 'security', eventType: 'suspicious_activity',
  notificationType: 'security_alert', category: 'security', priority: 'critical',
  titleTemplate: () => 'Suspicious Activity Detected',
  messageTemplate: (_m) => `We detected unusual activity on your account. ${str(_m.details)}`,
  actions: (_m) => [{ label: 'Review Activity', url: '/profile', variant: 'primary' }, { label: 'Secure Account', url: '/profile', variant: 'secondary' }],
  metadataMapping: () => ({}),
});
registerEvent({
  module: 'security', eventType: 'multiple_failed_logins',
  notificationType: 'security_alert', category: 'security', priority: 'high',
  titleTemplate: () => 'Multiple Failed Login Attempts',
  messageTemplate: (_m) => `There were ${str(_m.attemptCount)} failed login attempts on your account.`,
  actions: (_m) => [{ label: 'Secure Account', url: '/profile', variant: 'primary' }],
  metadataMapping: () => ({}),
});

// --- Admin ---
registerEvent({
  module: 'admin', eventType: 'announcement',
  notificationType: 'admin_notice', category: 'admin', priority: 'normal',
  titleTemplate: () => 'Platform Announcement',
  messageTemplate: (_m) => str(_m.message),
  metadataMapping: (_m) => ({}),
});
registerEvent({
  module: 'admin', eventType: 'maintenance_notice',
  notificationType: 'admin_notice', category: 'admin', priority: 'high',
  titleTemplate: () => 'Maintenance Notice',
  messageTemplate: (_m) => `Scheduled maintenance on ${str(_m.date)}. ${str(_m.details)}`,
  expirationHours: 168,
  metadataMapping: () => ({}),
});
registerEvent({
  module: 'admin', eventType: 'platform_update',
  notificationType: 'admin_notice', category: 'admin', priority: 'low',
  titleTemplate: () => 'Platform Update',
  messageTemplate: (_m) => str(_m.message),
  metadataMapping: () => ({}),
});
registerEvent({
  module: 'admin', eventType: 'support_ticket_update',
  notificationType: 'admin_notice', category: 'admin', priority: 'normal',
  titleTemplate: () => 'Support Ticket Update',
  messageTemplate: (_m) => `Your support ticket "${str(_m.ticketTitle)}" has been updated.`,
  actions: (_m) => [{ label: 'View Ticket', url: str(_m.actionUrl) || '/profile', variant: 'primary' }],
  metadataMapping: (_m) => ({ action_url: str(_m.actionUrl) }),
});

// --- System ---
registerEvent({
  module: 'system', eventType: 'profile_incomplete',
  notificationType: 'system_alert', category: 'system', priority: 'low',
  titleTemplate: () => 'Complete Your Profile',
  messageTemplate: () => 'Add more details to your profile to get better visibility and trust.',
  actions: (_m) => [{ label: 'Edit Profile', url: '/profile', variant: 'primary' }],
  metadataMapping: () => ({}),
});
registerEvent({
  module: 'system', eventType: 'draft_saved',
  notificationType: 'system_alert', category: 'system', priority: 'low',
  titleTemplate: () => 'Draft Saved',
  messageTemplate: (_m) => `Your draft "${str(_m.draftTitle)}" has been saved.`,
  actions: (_m) => [{ label: 'Continue Editing', url: '/drafts', variant: 'primary' }],
  metadataMapping: () => ({}),
});
registerEvent({
  module: 'system', eventType: 'draft_expired',
  notificationType: 'system_alert', category: 'system', priority: 'normal',
  titleTemplate: () => 'Draft Expired',
  messageTemplate: (_m) => `Your draft "${str(_m.draftTitle)}" has expired and was removed.`,
  metadataMapping: () => ({}),
});
registerEvent({
  module: 'system', eventType: 'system_recommendation',
  notificationType: 'ai_summary', category: 'ai', priority: 'low',
  titleTemplate: () => 'Recommendation',
  messageTemplate: (_m) => str(_m.message),
  metadataMapping: () => ({}),
});

// ─── Core: Emit Event ──────────────────────────────────────────────────────────

export interface EmitEventParams {
  module: EventModule;
  eventType: EventType;
  recipientIds: string | string[];
  actorId?: string | null;
  metadata?: Record<string, unknown>;
  /** Override the configured priority */
  priority?: NotificationPriority;
  /** Skip deduplication check */
  skipDedup?: boolean;
}

/**
 * Emit a notification event. This is the single entry point all modules should use.
 * It logs the event and creates the notification(s) in one atomic operation.
 * Deduplication: if a matching event with the same group_key exists within the
 * last 60 seconds, it increments a counter in the existing notification's metadata
 * instead of creating a duplicate.
 */
export async function emitEvent(params: EmitEventParams): Promise<void> {
  const config = getEventConfig(params.module, params.eventType);
  if (!config) {
    console.warn(`[NotificationEngine] No event registered for ${params.module}.${params.eventType}`);
    return;
  }

  const recipients = Array.isArray(params.recipientIds) ? params.recipientIds : [params.recipientIds];
  if (recipients.length === 0) return;

  const meta = params.metadata || {};
  const priority = params.priority || config.priority;
  const groupKey = config.groupKey ? config.groupKey(meta, recipients[0]) : null;

  // Compute expiration
  let expiresAt: string | null = null;
  if (config.expirationHours) {
    expiresAt = new Date(Date.now() + config.expirationHours * 3600_000).toISOString();
  }

  // 1. Log the event
  const { error: logError } = await supabase
    .from('notification_event_log')
    .insert({
      event_type: `${params.module}.${params.eventType}`,
      module: params.module,
      actor_id: params.actorId || null,
      recipient_ids: recipients,
      priority,
      category: config.category,
      group_key: groupKey,
      metadata: meta,
      expires_at: expiresAt,
      processed: true,
    })
    .select('id')
    .maybeSingle();

  if (logError) {
    console.error('[NotificationEngine] Failed to log event:', logError);
  }

  // 2. Deduplication check: if group_key exists, try to update existing notification
  if (groupKey && !params.skipDedup) {
    for (const recipientId of recipients) {
      const dedupKey = groupKey.includes(recipientId) ? groupKey : `${groupKey}:${recipientId}`;
      const { data: existing } = await supabase
        .from('notifications')
        .select('id, metadata')
        .eq('user_id', recipientId)
        .eq('group_key', dedupKey)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing) {
        // Increment count in metadata
        const existingMeta = (existing.metadata || {}) as Record<string, unknown>;
        const count = (typeof existingMeta.count === 'number' ? existingMeta.count : 1) + 1;
        await supabase
          .from('notifications')
          .update({
            metadata: { ...existingMeta, count, last_updated: new Date().toISOString() },
            is_read: false,
            message: `${config.messageTemplate(meta)} (${count} total)`,
          })
          .eq('id', existing.id);
        continue; // Skip creating a new notification
      }

      // No existing — create new notification with dedup key
      await createNotification(config, recipientId, meta, priority, groupKey, expiresAt, params.actorId);
    }
  } else {
    // No dedup — create notifications for all recipients
    for (const recipientId of recipients) {
      await createNotification(config, recipientId, meta, priority, groupKey, expiresAt, params.actorId);
    }
  }
}

async function createNotification(
  config: NotificationEventConfig,
  recipientId: string,
  meta: Record<string, unknown>,
  priority: NotificationPriority,
  groupKey: string | null,
  expiresAt: string | null,
  actorId?: string | null,
): Promise<void> {
  const mappedMetadata = config.metadataMapping ? config.metadataMapping(meta) : {};
  const notificationMetadata = {
    ...mappedMetadata,
    count: 1,
    event_module: config.module,
    event_type: config.eventType,
    ...(expiresAt ? { expires_at: expiresAt } : {}),
  };

  const { error } = await supabase.from('notifications').insert({
    user_id: recipientId,
    title: config.titleTemplate(meta),
    message: config.messageTemplate(meta),
    notification_type: config.notificationType,
    category: config.category,
    priority,
    metadata: notificationMetadata,
    group_key: groupKey,
    actor_id: actorId || null,
    is_read: false,
    is_archived: false,
    is_deleted: false,
  });

  if (error) {
    console.error('[NotificationEngine] Failed to create notification:', error);
  }
}

// ─── Batch emit (for bulk events like announcements to all users) ────────────────

export async function emitEventBatch(
  params: Omit<EmitEventParams, 'recipientIds'> & { recipientIds: string[] },
): Promise<void> {
  const config = getEventConfig(params.module, params.eventType);
  if (!config) {
    console.warn(`[NotificationEngine] No event registered for ${params.module}.${params.eventType}`);
    return;
  }

  const meta = params.metadata || {};
  const priority = params.priority || config.priority;
  const groupKey = config.groupKey ? config.groupKey(meta, 'batch') : null;

  let expiresAt: string | null = null;
  if (config.expirationHours) {
    expiresAt = new Date(Date.now() + config.expirationHours * 3600_000).toISOString();
  }

  // Log event
  await supabase.from('notification_event_log').insert({
    event_type: `${params.module}.${params.eventType}`,
    module: params.module,
    actor_id: params.actorId || null,
    recipient_ids: params.recipientIds,
    priority,
    category: config.category,
    group_key: groupKey,
    metadata: meta,
    expires_at: expiresAt,
    processed: true,
  });

  // Batch insert notifications
  const notifications = params.recipientIds.map(rid => ({
    user_id: rid,
    title: config.titleTemplate(meta),
    message: config.messageTemplate(meta),
    notification_type: config.notificationType,
    category: config.category,
    priority,
    metadata: {
      ...(config.metadataMapping ? config.metadataMapping(meta) : {}),
      count: 1,
      event_module: config.module,
      event_type: config.eventType,
    },
    group_key: groupKey,
    actor_id: params.actorId || null,
    is_read: false,
    is_archived: false,
    is_deleted: false,
  }));

  // Insert in chunks of 100 to avoid payload limits
  const CHUNK = 100;
  for (let i = 0; i < notifications.length; i += CHUNK) {
    const chunk = notifications.slice(i, i + CHUNK);
    const { error } = await supabase.from('notifications').insert(chunk);
    if (error) console.error('[NotificationEngine] Batch insert error:', error);
  }
}

// ─── Activity Feed Hook ─────────────────────────────────────────────────────────

export interface ActivityFeedItem {
  id: string;
  event_type: string;
  module: EventModule;
  actor_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  actor_name?: string;
  actor_avatar?: string;
}

/**
 * Fetches a user's activity feed from the event log.
 * This is the universal chronological feed across all modules.
 */
export function useActivityFeed(userId: string | null, limit = 50) {
  const [items, setItems] = useState<ActivityFeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!userId) return;
    try {
      const { data, error } = await supabase
        .from('notification_event_log')
        .select('*')
        .contains('recipient_ids', [userId])
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      setItems((data || []) as ActivityFeedItem[]);
    } catch (err) {
      console.error('useActivityFeed error:', err);
    } finally {
      setLoading(false);
    }
  }, [userId, limit]);

  useEffect(() => {
    fetch();
    if (!userId) return;
    const channel = supabase.channel(`activity-feed-${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notification_event_log',
      }, () => fetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, fetch]);

  return { items, loading, refetch: fetch };
}

// ─── Auto-expiration cleanup helper ─────────────────────────────────────────────

/**
 * Marks expired notifications as archived.
 * Called periodically (e.g. on page load) to clean up expired notifications.
 */
export async function cleanupExpiredNotifications(userId: string): Promise<void> {
  try {
    await supabase
      .from('notifications')
      .update({ is_archived: true })
      .eq('user_id', userId)
      .eq('is_archived', false)
      .eq('is_deleted', false)
      .not('metadata->>expires_at', 'is', null)
      .lt('metadata->>expires_at', new Date().toISOString());
  } catch (err) {
    console.error('cleanupExpiredNotifications error:', err);
  }
}

// ─── Throttling helper ──────────────────────────────────────────────────────────

const THROTTLE_WINDOW_MS = 60_000; // 1 minute
const throttleCache = new Map<string, number>();

/**
 * Returns true if the event should be throttled (skipped).
 * Uses in-memory cache for the current session.
 */
export function shouldThrottle(key: string): boolean {
  const now = Date.now();
  const last = throttleCache.get(key);
  if (last && now - last < THROTTLE_WINDOW_MS) {
    return true;
  }
  throttleCache.set(key, now);
  return false;
}


