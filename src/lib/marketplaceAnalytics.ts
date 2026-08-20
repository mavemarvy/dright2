// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT Marketplace Intelligence — Event Tracking Service
// Centralized tracking for listing events: impressions, clicks, favorites,
// shares, purchases, reviews, search, etc. Includes fraud detection hooks.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase';

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
  user_id?: string | null;
  metadata?: Record<string, unknown>;
  session_id?: string;
  view_source?: ViewSource;
}

// ─── Simple in-memory dedup buffer (prevents duplicate events in same session) ──

const recentEvents = new Map<string, number>();
const DEDUP_WINDOW_MS = 5000;

function isDuplicate(key: string): boolean {
  const now = Date.now();
  const last = recentEvents.get(key);
  if (last && now - last < DEDUP_WINDOW_MS) return true;
  recentEvents.set(key, now);
  // Cleanup old entries periodically
  if (recentEvents.size > 500) {
    for (const [k, t] of recentEvents) {
      if (now - t > DEDUP_WINDOW_MS) recentEvents.delete(k);
    }
  }
  return false;
}

// ─── Track Event ─────────────────────────────────────────────────────────────────

export async function trackListingEvent(input: ListingEventInput): Promise<void> {
  const dedupKey = `${input.listing_id}:${input.event_type}:${input.user_id || 'anon'}`;
  if (isDuplicate(dedupKey)) return;

  try {
    await supabase.from('listing_events').insert({
      listing_id: input.listing_id,
      listing_type: input.listing_type,
      event_type: input.event_type,
      user_id: input.user_id || null,
      metadata: input.metadata || null,
      session_id: input.session_id || null,
      view_source: input.view_source || 'marketplace',
    });
  } catch (err) {
    console.error('trackListingEvent error:', err);
  }
}

// ─── Track Search ─────────────────────────────────────────────────────────────────

export async function trackSearch(
  query: string,
  resultCount: number,
  userId?: string | null,
  category?: string,
  filters?: Record<string, unknown>,
  clickedListingId?: string,
): Promise<void> {
  if (!query.trim()) return;
  try {
    await supabase.from('search_history').insert({
      user_id: userId || null,
      query: query.trim(),
      category: category || null,
      filters: filters || null,
      result_count: resultCount,
      clicked_listing_id: clickedListingId || null,
    });
  } catch (err) {
    console.error('trackSearch error:', err);
  }
}

// ─── Track User Activity ──────────────────────────────────────────────────────────

export async function trackUserActivity(
  userId: string,
  activityType: string,
  listingId?: string,
  listingType?: ListingType,
  category?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase.from('user_activity').insert({
      user_id: userId,
      activity_type: activityType,
      listing_id: listingId || null,
      listing_type: listingType || null,
      category: category || null,
      metadata: metadata || null,
    });
  } catch (err) {
    console.error('trackUserActivity error:', err);
  }
}

// ─── Fraud Detection Foundation ───────────────────────────────────────────────────

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
    console.error('flagFraudEvent error:', err);
  }
}

// ─── Fraud Detection Heuristics ───────────────────────────────────────────────────

// Detect rapid repeated views from same user (click farming indicator)
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
    flagFraudEvent('repeated_views', 'medium', listingId, userId, `Rapid views: ${recent.length} in 60s`, {
      viewCount: recent.length,
      windowMs: RAPID_VIEW_WINDOW_MS,
    });
    return true;
  }
  return false;
}

// Detect suspicious search patterns (bot searches)
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
    flagFraudEvent('fake_searches', 'low', undefined, userId, `Rapid searches: ${recent.length} in 60s`, {
      query,
      searchCount: recent.length,
    });
    return true;
  }
  return false;
}

// ─── React Hook for Event Tracking ────────────────────────────────────────────────

import { useCallback, useRef } from 'react';

export function useListingTracking(userId: string | null) {
  const sessionId = useRef(`s_${Date.now()}_${Math.random().toString(36).slice(2)}`).current;

  const track = useCallback((listingId: string, listingType: ListingType, eventType: ListingEventType, metadata?: Record<string, unknown>, viewSource?: ViewSource) => {
    if (userId) {
      checkRapidViews(listingId, userId);
    }
    trackListingEvent({
      listing_id: listingId,
      listing_type: listingType,
      event_type: eventType,
      user_id: userId,
      metadata,
      session_id: sessionId,
      view_source: viewSource,
    });
    if (userId) {
      trackUserActivity(userId, eventType, listingId, listingType, undefined, metadata);
    }
  }, [userId, sessionId]);

  const trackSearchEvent = useCallback((query: string, resultCount: number, category?: string, filters?: Record<string, unknown>, clickedListingId?: string) => {
    if (userId) checkRapidSearches(userId, query);
    trackSearch(query, resultCount, userId, category, filters, clickedListingId);
  }, [userId]);

  return { track, trackSearchEvent, sessionId };
}
