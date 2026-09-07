// DRIGHT Analytics Service — canonical frontend event client.
// All observational analytics flow through the existing track-event Edge Function.
// Financial truth remains in orders/payments/ledgers; analytics_events is the observation layer.

import { useCallback } from 'react';
import { supabase } from './supabase';

export type AnalyticsEventType =
  | 'product_view' | 'service_view' | 'job_view' | 'course_view' | 'profile_view' | 'page_view'
  | 'impression' | 'click' | 'open' | 'gallery_interaction' | 'video_play'
  | 'scroll_depth' | 'time_on_page' | 'exit'
  | 'favorite' | 'unfavorite' | 'save' | 'share' | 'copy_link' | 'product_save'
  | 'seller_profile_visit' | 'contact_seller' | 'chat_opened' | 'chat_started'
  | 'purchase' | 'service_order' | 'course_enrollment' | 'job_application'
  | 'checkout_initiated' | 'checkout_started' | 'checkout_completed' | 'payment_completed'
  | 'review' | 'rating' | 'review_submitted' | 'rating_submitted'
  | 'refund' | 'cancellation' | 'dispute' | 'repeat_purchase'
  | 'wishlist_add' | 'wishlist_remove' | 'cart_add'
  | 'search' | 'promotion_click' | 'promotion_impression'
  | 'coupon_used' | 'affiliate_click' | 'affiliate_conversion' | 'referral_click' | 'referral_conversion'
  | 'wallet_funding' | 'withdrawal' | 'login' | 'signup' | 'logout'
  | 'message' | 'notification_open' | 'ai_request'
  | 'phone_click' | 'website_click' | 'download' | 'email_sent' | 'button_click'
  | 'page_scroll' | 'image_click';

export type EntityType =
  | 'product' | 'service' | 'job' | 'course' | 'digital_download' | 'profile' | 'platform'
  | 'campaign' | 'promotion' | 'affiliate' | 'referral' | 'order' | 'payment' | 'wallet';

export type ViewSource =
  | 'marketplace' | 'affiliate' | 'search' | 'profile' | 'store' | 'recommendation' | 'direct'
  | 'referral' | 'social' | 'external' | 'qr_code' | 'campaign' | 'advertisement'
  | 'checkout' | 'payment' | 'system';

export interface TrackEventInput {
  event_type: AnalyticsEventType;
  entity_type?: EntityType;
  entity_id?: string | null;
  seller_id?: string | null;
  source?: ViewSource;
  metadata?: Record<string, unknown>;
}

export interface TrackEventResult {
  success: boolean;
  tracked: boolean;
  reason?: string;
  event_id?: string;
  error_code?: string;
}

let sessionId: string | null = null;

export function getAnalyticsSessionId(): string {
  if (sessionId) return sessionId;
  const key = 'dright_analytics_session';
  if (typeof window !== 'undefined') {
    const stored = window.sessionStorage.getItem(key);
    if (stored) {
      sessionId = stored;
      return stored;
    }
  }
  sessionId = `s_${Date.now()}_${crypto.randomUUID?.() || Math.random().toString(36).slice(2, 12)}`.slice(0, 150);
  if (typeof window !== 'undefined') window.sessionStorage.setItem(key, sessionId);
  return sessionId;
}

const inflight = new Map<string, Promise<TrackEventResult>>();

function getDedupKey(input: TrackEventInput): string {
  const metadata = input.metadata || {};
  const authorityKey = metadata.order_id || metadata.payment_id || metadata.transaction_id || metadata.campaign_id || '';
  return `${input.event_type}:${input.entity_type || 'platform'}:${input.entity_id || 'none'}:${input.source || 'direct'}:${String(authorityKey)}`;
}

export async function trackEvent(input: TrackEventInput): Promise<TrackEventResult> {
  const dedupKey = getDedupKey(input);
  const active = inflight.get(dedupKey);
  if (active) return active;

  const promise = (async (): Promise<TrackEventResult> => {
    try {
      const metadata = {
        ...(input.metadata || {}),
        page_path: typeof window !== 'undefined' ? window.location.pathname : undefined,
      };

      const { data, error } = await supabase.functions.invoke('track-event', {
        body: {
          event_type: input.event_type,
          entity_type: input.entity_type || 'platform',
          entity_id: input.entity_id || null,
          seller_id: input.seller_id || null,
          session_id: getAnalyticsSessionId(),
          source: input.source || 'direct',
          metadata,
          device_type: detectDeviceType(),
          os: detectOS(),
          browser_name: detectBrowser(),
          language: typeof navigator !== 'undefined' ? navigator.language || null : null,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
        },
      });

      if (error || data?.success === false) {
        if (import.meta.env.DEV) console.warn('[analytics] event not recorded', input.event_type, data?.error?.code || error?.message);
        return { success: false, tracked: false, error_code: data?.error?.code || 'ANALYTICS_REQUEST_FAILED' };
      }

      return {
        success: true,
        tracked: data?.tracked !== false,
        reason: data?.reason,
        event_id: data?.event_id,
      };
    } catch (error) {
      if (import.meta.env.DEV) console.warn('[analytics] event exception', input.event_type, error);
      return { success: false, tracked: false, error_code: 'ANALYTICS_REQUEST_FAILED' };
    } finally {
      inflight.delete(dedupKey);
    }
  })();

  inflight.set(dedupKey, promise);
  return promise;
}

export function trackProductView(productId: string, sellerId?: string | null, source?: ViewSource): void {
  void trackEvent({ event_type: 'product_view', entity_type: 'product', entity_id: productId, seller_id: sellerId || null, source: source || 'marketplace' });
}

export function trackServiceView(serviceId: string, sellerId?: string | null, source?: ViewSource): void {
  void trackEvent({ event_type: 'service_view', entity_type: 'service', entity_id: serviceId, seller_id: sellerId || null, source: source || 'marketplace' });
}

export function trackJobView(jobId: string, employerId?: string | null): void {
  void trackEvent({ event_type: 'job_view', entity_type: 'job', entity_id: jobId, seller_id: employerId || null, source: 'marketplace' });
}

export function trackCourseView(courseId: string, sellerId?: string | null): void {
  void trackEvent({ event_type: 'course_view', entity_type: 'course', entity_id: courseId, seller_id: sellerId || null, source: 'marketplace' });
}

export function trackProfileView(sellerId: string): void {
  void trackEvent({ event_type: 'profile_view', entity_type: 'profile', entity_id: sellerId, seller_id: sellerId, source: 'profile' });
}

export function trackFavorite(productId: string, sellerId?: string | null): void {
  void trackEvent({ event_type: 'favorite', entity_type: 'product', entity_id: productId, seller_id: sellerId || null, source: 'marketplace' });
}

export function trackShare(productId: string, sellerId?: string | null): void {
  void trackEvent({ event_type: 'share', entity_type: 'product', entity_id: productId, seller_id: sellerId || null, source: 'marketplace' });
}

export function trackContactSeller(sellerId: string, productId?: string): void {
  void trackEvent({ event_type: 'contact_seller', entity_type: productId ? 'product' : 'profile', entity_id: productId || sellerId, seller_id: sellerId, source: productId ? 'marketplace' : 'profile' });
}

export function trackChatStart(sellerId: string, productId?: string): void {
  void trackEvent({ event_type: 'chat_started', entity_type: productId ? 'product' : 'profile', entity_id: productId || sellerId, seller_id: sellerId, source: productId ? 'marketplace' : 'profile' });
}

export function trackCheckoutStart(productId: string, sellerId: string, metadata?: Record<string, unknown>): void {
  void trackEvent({ event_type: 'checkout_started', entity_type: 'product', entity_id: productId, seller_id: sellerId, source: 'checkout', metadata });
}

export function trackPurchase(productId: string, sellerId: string, amount: number, metadata?: Record<string, unknown>): void {
  void trackEvent({ event_type: 'purchase', entity_type: 'product', entity_id: productId, seller_id: sellerId, source: 'payment', metadata: { amount, ...(metadata || {}) } });
}

export function trackSearch(query: string, resultCount: number, metadata?: Record<string, unknown>): void {
  if (!query.trim()) return;
  void trackEvent({ event_type: 'search', entity_type: 'platform', source: 'search', metadata: { query: query.trim(), result_count: resultCount, ...(metadata || {}) } });
}

export function trackPromotionClick(campaignId: string): void {
  void trackEvent({ event_type: 'promotion_click', entity_type: 'campaign', entity_id: campaignId, source: 'campaign', metadata: { campaign_id: campaignId } });
}

export function trackPromotionImpression(campaignId: string): void {
  void trackEvent({ event_type: 'promotion_impression', entity_type: 'campaign', entity_id: campaignId, source: 'campaign', metadata: { campaign_id: campaignId } });
}

export function trackAffiliateClick(referrerId: string, productId?: string): void {
  void trackEvent({ event_type: 'affiliate_click', entity_type: productId ? 'product' : 'affiliate', entity_id: productId || referrerId, source: 'affiliate', metadata: { referrer_id: referrerId } });
}

export function useAnalytics() {
  const track = useCallback((input: TrackEventInput) => {
    void trackEvent(input);
  }, []);
  return { track };
}

function detectDeviceType(): string {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent;
  if (/tablet|ipad/i.test(ua)) return 'tablet';
  if (/mobile|iphone|ipod|android/i.test(ua)) return 'mobile';
  return 'desktop';
}

function detectOS(): string | null {
  if (typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent;
  if (/windows/i.test(ua)) return 'windows';
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/mac os x|macintosh/i.test(ua)) return 'mac';
  if (/linux/i.test(ua)) return 'linux';
  return null;
}

function detectBrowser(): string | null {
  if (typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent;
  if (/edg/i.test(ua)) return 'edge';
  if (/chrome|chromium|crios/i.test(ua)) return 'chrome';
  if (/firefox|fxios/i.test(ua)) return 'firefox';
  if (/opera|opr/i.test(ua)) return 'opera';
  if (/safari/i.test(ua)) return 'safari';
  return null;
}
