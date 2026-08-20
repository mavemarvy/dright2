// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT Analytics Service — Server-Authoritative Event Tracking
// Replaces all client-side counter increments with server-verified events.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase';

export type AnalyticsEventType =
  | 'product_view' | 'service_view' | 'job_view' | 'course_view' | 'profile_view'
  | 'favorite' | 'share' | 'chat_started' | 'contact_seller'
  | 'purchase' | 'checkout_started' | 'checkout_completed'
  | 'search' | 'promotion_click' | 'promotion_impression'
  | 'coupon_used' | 'affiliate_click' | 'affiliate_conversion'
  | 'wallet_funding' | 'withdrawal' | 'login' | 'signup' | 'logout'
  | 'review' | 'rating' | 'message' | 'notification_open' | 'ai_request'
  | 'phone_click' | 'website_click' | 'product_save' | 'cart_add'
  | 'download' | 'email_sent' | 'button_click' | 'page_scroll'
  | 'image_click' | 'gallery_interaction';

export type EntityType = 'product' | 'service' | 'job' | 'course' | 'profile' | 'platform';

export type ViewSource = 'marketplace' | 'affiliate' | 'search' | 'profile' | 'store' | 'recommendation' | 'direct' | 'referral' | 'social' | 'external' | 'qr_code' | 'campaign' | 'advertisement';

export interface TrackEventInput {
  event_type: AnalyticsEventType;
  entity_type?: EntityType;
  entity_id?: string | null;
  seller_id?: string | null;
  source?: ViewSource;
  metadata?: Record<string, unknown>;
}

// Generate a stable session ID per browser session
let sessionId: string | null = null;

function getSessionId(): string {
  if (sessionId) return sessionId;
  const key = 'dright_analytics_session';
  const stored = sessionStorage.getItem(key);
  if (stored) {
    sessionId = stored;
    return sessionId;
  }
  sessionId = `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  sessionStorage.setItem(key, sessionId);
  return sessionId;
}

// In-flight dedup: prevent the same event from being sent twice in the same render cycle
const inflight = new Map<string, Promise<void>>();

function getDedupKey(input: TrackEventInput): string {
  return `${input.event_type}:${input.entity_id || 'none'}:${input.entity_type || 'product'}`;
}

// ─── Track Event (via edge function) ──────────────────────────────────────────

export async function trackEvent(input: TrackEventInput): Promise<void> {
  const dedupKey = getDedupKey(input);

  // If the same event is already in-flight, don't send again
  if (inflight.has(dedupKey)) return;

  const promise = (async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/track-event`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          event_type: input.event_type,
          entity_type: input.entity_type || 'product',
          entity_id: input.entity_id || null,
          seller_id: input.seller_id || null,
          session_id: getSessionId(),
          source: input.source || 'direct',
          metadata: input.metadata || {},
          device_type: detectDeviceType(),
          os: detectOS(),
          browser_name: detectBrowser(),
          language: navigator.language || null,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
        }),
      });
    } catch {
      // Silent fail — analytics should never break the UX
    } finally {
      inflight.delete(dedupKey);
    }
  })();

  inflight.set(dedupKey, promise);
  return promise;
}

// ─── Convenience wrappers ─────────────────────────────────────────────────────

export function trackProductView(productId: string, sellerId?: string | null, source?: ViewSource): void {
  trackEvent({
    event_type: 'product_view',
    entity_type: 'product',
    entity_id: productId,
    seller_id: sellerId || null,
    source: source || 'marketplace',
  });
}

export function trackServiceView(serviceId: string, sellerId?: string | null, source?: ViewSource): void {
  trackEvent({
    event_type: 'service_view',
    entity_type: 'service',
    entity_id: serviceId,
    seller_id: sellerId || null,
    source: source || 'marketplace',
  });
}

export function trackJobView(jobId: string, employerId?: string | null): void {
  trackEvent({
    event_type: 'job_view',
    entity_type: 'job',
    entity_id: jobId,
    seller_id: employerId || null,
    source: 'marketplace',
  });
}

export function trackCourseView(courseId: string, sellerId?: string | null): void {
  trackEvent({
    event_type: 'course_view',
    entity_type: 'course',
    entity_id: courseId,
    seller_id: sellerId || null,
    source: 'marketplace',
  });
}

export function trackProfileView(sellerId: string): void {
  trackEvent({
    event_type: 'profile_view',
    entity_type: 'profile',
    entity_id: sellerId,
    seller_id: sellerId,
    source: 'profile',
  });
}

export function trackFavorite(productId: string, sellerId?: string | null): void {
  trackEvent({
    event_type: 'favorite',
    entity_type: 'product',
    entity_id: productId,
    seller_id: sellerId || null,
  });
}

export function trackShare(productId: string, sellerId?: string | null): void {
  trackEvent({
    event_type: 'share',
    entity_type: 'product',
    entity_id: productId,
    seller_id: sellerId || null,
  });
}

export function trackContactSeller(sellerId: string, productId?: string): void {
  trackEvent({
    event_type: 'contact_seller',
    entity_type: productId ? 'product' : 'profile',
    entity_id: productId || sellerId,
    seller_id: sellerId,
  });
}

export function trackChatStart(sellerId: string, productId?: string): void {
  trackEvent({
    event_type: 'chat_started',
    entity_type: productId ? 'product' : 'profile',
    entity_id: productId || sellerId,
    seller_id: sellerId,
  });
}

export function trackCheckoutStart(productId: string, sellerId: string): void {
  trackEvent({
    event_type: 'checkout_started',
    entity_type: 'product',
    entity_id: productId,
    seller_id: sellerId,
  });
}

export function trackPurchase(productId: string, sellerId: string, amount: number): void {
  trackEvent({
    event_type: 'purchase',
    entity_type: 'product',
    entity_id: productId,
    seller_id: sellerId,
    metadata: { amount },
  });
}

export function trackSearch(query: string, resultCount: number): void {
  trackEvent({
    event_type: 'search',
    entity_type: 'platform',
    entity_id: null,
    metadata: { query, result_count: resultCount },
  });
}

export function trackPromotionClick(campaignId: string): void {
  trackEvent({
    event_type: 'promotion_click',
    entity_type: 'platform',
    entity_id: campaignId,
  });
}

export function trackPromotionImpression(campaignId: string): void {
  trackEvent({
    event_type: 'promotion_impression',
    entity_type: 'platform',
    entity_id: campaignId,
  });
}

export function trackAffiliateClick(referrerId: string, productId?: string): void {
  trackEvent({
    event_type: 'affiliate_click',
    entity_type: 'product',
    entity_id: productId || null,
    seller_id: referrerId,
    source: 'affiliate',
  });
}

// ─── React Hook ───────────────────────────────────────────────────────────────

import { useCallback } from 'react';

export function useAnalytics() {
  const track = useCallback((input: TrackEventInput) => {
    trackEvent(input);
  }, []);

  return { track };
}

// ─── Device Detection ─────────────────────────────────────────────────────────

function detectDeviceType(): string {
  const ua = navigator.userAgent;
  if (/tablet|ipad/i.test(ua)) return 'tablet';
  if (/mobile|iphone|ipod|android/i.test(ua)) return 'mobile';
  return 'desktop';
}

function detectOS(): string | null {
  const ua = navigator.userAgent;
  if (/windows/i.test(ua)) return 'windows';
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/mac os x|macintosh/i.test(ua)) return 'mac';
  if (/linux/i.test(ua)) return 'linux';
  return null;
}

function detectBrowser(): string | null {
  const ua = navigator.userAgent;
  if (/edg/i.test(ua)) return 'edge';
  if (/chrome|chromium|crios/i.test(ua)) return 'chrome';
  if (/firefox|fxios/i.test(ua)) return 'firefox';
  if (/safari/i.test(ua)) return 'safari';
  if (/opera|opr/i.test(ua)) return 'opera';
  return null;
}
