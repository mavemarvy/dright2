// DRIGHT Marketplace Intelligence — compatibility layer over the canonical analytics pipeline.
// listing_events/search_history remain populated server-side by track_analytics_event for legacy dashboards.

import { useCallback } from 'react';
import { supabase } from './supabase';
import { trackEvent, getAnalyticsSessionId, type ViewSource as AnalyticsViewSource } from './analyticsService';

export type ListingEventType =
  | 'impression' | 'click' | 'open' | 'gallery_interaction' | 'video_play'
  | 'scroll_depth' | 'time_on_page' | 'exit'
  | 'favorite' | 'unfavorite' | 'save' | 'share' | 'copy_link'
  | 'seller_profile_visit' | 'contact_seller' | 'chat_opened'
  | 'purchase' | 'service_order' | 'course_enrollment' | 'job_application'
  | 'checkout_initiated' | 'checkout_completed' | 'payment_completed'
  | 'review_submitted' | 'rating_submitted'
  | 'refund' | 'cancellation' | 'dispute'
  | 'repeat_purchase' | 'wishlist_add' | 'wishlist_remove';

export type ListingType = 'product' | 'service' | 'job' | 'course' | 'digital_download';
export type ViewSource = 'marketplace' | 'affiliate' | 'profile' | 'store' | 'recommendation' | 'search' | 'direct';

export interface ListingEventInput {
  listing_id: string;
  listing_type: ListingType;
  event_type: ListingEventType;
  user_id?: string | null; // compatibility only; viewer identity is derived server-side from JWT
  metadata?: Record<string, unknown>;
  session_id?: string;
  view_source?: ViewSource;
}

const recentEvents = new Map<string, number>();
const DEDUP_WINDOW_MS = 5000;

function isDuplicate(key: string): boolean {
  const now = Date.now();
  const last = recentEvents.get(key);
  if (last && now - last < DEDUP_WINDOW_MS) return true;
  recentEvents.set(key, now);
  if (recentEvents.size > 500) {
    for (const [k, t] of recentEvents) if (now - t > DEDUP_WINDOW_MS) recentEvents.delete(k);
  }
  return false;
}

export async function trackListingEvent(input: ListingEventInput): Promise<void> {
  const dedupKey = `${input.listing_id}:${input.event_type}`;
  if (isDuplicate(dedupKey)) return;

  await trackEvent({
    event_type: input.event_type,
    entity_type: input.listing_type,
    entity_id: input.listing_id,
    source: (input.view_source || 'marketplace') as AnalyticsViewSource,
    metadata: {
      ...(input.metadata || {}),
      legacy_listing_type: input.listing_type,
    },
  });
}

export async function trackSearch(
  query: string,
  resultCount: number,
  _userId?: string | null,
  category?: string,
  filters?: Record<string, unknown>,
  clickedListingId?: string,
): Promise<void> {
  if (!query.trim()) return;
  await trackEvent({
    event_type: 'search',
    entity_type: 'platform',
    source: 'search',
    metadata: {
      query: query.trim(),
      result_count: resultCount,
      category: category || null,
      filters: filters || null,
      clicked_listing_id: clickedListingId || null,
    },
  });
}

// user_activity is a personalization/behavior table, not the analytics source of truth.
export async function trackUserActivity(
  userId: string,
  activityType: string,
  listingId?: string,
  listingType?: ListingType,
  category?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    const { error } = await supabase.from('user_activity').insert({
      user_id: userId,
      activity_type: activityType,
      listing_id: listingId || null,
      listing_type: listingType || null,
      category: category || null,
      metadata: metadata || null,
    });
    if (error && import.meta.env.DEV) console.warn('trackUserActivity error:', error.message);
  } catch (err) {
    if (import.meta.env.DEV) console.warn('trackUserActivity error:', err);
  }
}

export type FraudType =
  | 'bot_traffic' | 'click_farming' | 'fake_searches' | 'repeated_views'
  | 'fake_ratings' | 'fake_reviews' | 'mass_account_abuse' | 'suspicious_purchase';

export async function flagFraudEvent(
  fraudType: FraudType,
  severity: 'low' | 'medium' | 'high' = 'low',
  listingId?: string,
  userId?: string | null,
  description?: string,
  evidence?: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase.from('fraud_events').insert({
      fraud_type: fraudType,
      listing_id: listingId || null,
      user_id: userId || null,
      severity,
      status: 'flagged',
      description: description || null,
      evidence: evidence || null,
    });
  } catch (err) {
    if (import.meta.env.DEV) console.warn('flagFraudEvent error:', err);
  }
}

const viewTimestamps = new Map<string, number[]>();
const RAPID_VIEW_THRESHOLD = 10;
const RAPID_VIEW_WINDOW_MS = 60000;

export function checkRapidViews(listingId: string, userId: string | null): boolean {
  if (!userId) return false;
  const key = `${listingId}:${userId}`;
  const now = Date.now();
  const timestamps = viewTimestamps.get(key) || [];
  const recent = timestamps.filter(t => now - t < RAPID_VIEW_WINDOW_MS);
  recent.push(now);
  viewTimestamps.set(key, recent);

  if (recent.length > RAPID_VIEW_THRESHOLD) {
    void flagFraudEvent('repeated_views', 'medium', listingId, userId, `Rapid views: ${recent.length} in 60s`, {
      viewCount: recent.length,
      windowMs: RAPID_VIEW_WINDOW_MS,
    });
    return true;
  }
  return false;
}

const searchTimestamps = new Map<string, number[]>();
const RAPID_SEARCH_THRESHOLD = 20;
const RAPID_SEARCH_WINDOW_MS = 60000;

export function checkRapidSearches(userId: string | null, query: string): boolean {
  if (!userId) return false;
  const key = `${userId}:${query}`;
  const now = Date.now();
  const timestamps = searchTimestamps.get(key) || [];
  const recent = timestamps.filter(t => now - t < RAPID_SEARCH_WINDOW_MS);
  recent.push(now);
  searchTimestamps.set(key, recent);

  if (recent.length > RAPID_SEARCH_THRESHOLD) {
    void flagFraudEvent('fake_searches', 'low', undefined, userId, `Rapid searches: ${recent.length} in 60s`, {
      query,
      searchCount: recent.length,
      windowMs: RAPID_SEARCH_WINDOW_MS,
    });
    return true;
  }
  return false;
}

export function useListingTracking(userId: string | null) {
  const sessionId = getAnalyticsSessionId();

  const track = useCallback((listingId: string, listingType: ListingType, eventType: ListingEventType, metadata?: Record<string, unknown>, viewSource?: ViewSource) => {
    if (userId) checkRapidViews(listingId, userId);
    void trackListingEvent({
      listing_id: listingId,
      listing_type: listingType,
      event_type: eventType,
      user_id: userId,
      metadata,
      session_id: sessionId,
      view_source: viewSource,
    });
    if (userId) void trackUserActivity(userId, eventType, listingId, listingType, undefined, metadata);
  }, [userId, sessionId]);

  const trackSearchEvent = useCallback((query: string, resultCount: number, category?: string, filters?: Record<string, unknown>, clickedListingId?: string) => {
    if (userId) checkRapidSearches(userId, query);
    void trackSearch(query, resultCount, userId, category, filters, clickedListingId);
  }, [userId]);

  return { track, trackSearchEvent, sessionId };
}
