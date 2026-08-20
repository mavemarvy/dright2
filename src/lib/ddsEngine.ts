// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT Demand Score (DDS) Engine
// Computes dynamic listing scores from event data, statistics, and seller
// reputation. Includes trending engine and confidence-weighted rating
// intelligence. Reads configurable weights from algorithm_settings.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase';

export interface AlgorithmWeights {
  search_weight: number;
  click_weight: number;
  conversion_weight: number;
  rating_weight: number;
  review_weight: number;
  freshness_weight: number;
  velocity_weight: number;
  trust_weight: number;
  trending_threshold: number;
  fraud_sensitivity: number;
  min_reviews_for_confidence: number;
  trending_decay_rate: number;
}

export const DEFAULT_WEIGHTS: AlgorithmWeights = {
  search_weight: 30,
  click_weight: 15,
  conversion_weight: 20,
  rating_weight: 10,
  review_weight: 8,
  freshness_weight: 5,
  velocity_weight: 7,
  trust_weight: 5,
  trending_threshold: 50,
  fraud_sensitivity: 50,
  min_reviews_for_confidence: 5,
  trending_decay_rate: 0.85,
};

// ─── Fetch Configurable Weights ──────────────────────────────────────────────────

export async function fetchAlgorithmWeights(): Promise<AlgorithmWeights> {
  try {
    const { data, error } = await supabase
      .from('algorithm_settings')
      .select('*')
      .maybeSingle();
    if (error || !data) return DEFAULT_WEIGHTS;
    return {
      search_weight: Number(data.search_weight) || DEFAULT_WEIGHTS.search_weight,
      click_weight: Number(data.click_weight) || DEFAULT_WEIGHTS.click_weight,
      conversion_weight: Number(data.conversion_weight) || DEFAULT_WEIGHTS.conversion_weight,
      rating_weight: Number(data.rating_weight) || DEFAULT_WEIGHTS.rating_weight,
      review_weight: Number(data.review_weight) || DEFAULT_WEIGHTS.review_weight,
      freshness_weight: Number(data.freshness_weight) || DEFAULT_WEIGHTS.freshness_weight,
      velocity_weight: Number(data.velocity_weight) || DEFAULT_WEIGHTS.velocity_weight,
      trust_weight: Number(data.trust_weight) || DEFAULT_WEIGHTS.trust_weight,
      trending_threshold: Number(data.trending_threshold) || DEFAULT_WEIGHTS.trending_threshold,
      fraud_sensitivity: Number(data.fraud_sensitivity) || DEFAULT_WEIGHTS.fraud_sensitivity,
      min_reviews_for_confidence: data.min_reviews_for_confidence || DEFAULT_WEIGHTS.min_reviews_for_confidence,
      trending_decay_rate: Number(data.trending_decay_rate) || DEFAULT_WEIGHTS.trending_decay_rate,
    };
  } catch {
    return DEFAULT_WEIGHTS;
  }
}

// ─── Update Weights (Admin) ──────────────────────────────────────────────────────

export async function updateAlgorithmWeights(weights: Partial<AlgorithmWeights>): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('algorithm_settings')
      .update({ ...weights, updated_at: new Date().toISOString() })
      .eq('is_singleton', true);
    return !error;
  } catch {
    return false;
  }
}

// ─── Rating Intelligence: Confidence-Weighted Score ──────────────────────────────

/**
 * Computes a confidence-weighted rating score.
 * A 5-star listing with 3 reviews does NOT outrank a 4.8-star listing with
 * 2,000 reviews. Uses Bayesian average with a prior based on review volume.
 */
export function computeConfidenceWeightedRating(
  avgRating: number,
  totalReviews: number,
  minReviewsForConfidence: number = 5,
): number {
  if (totalReviews === 0) return 0;
  // Bayesian average: pull toward 3.5 (neutral) when review count is low
  const PRIOR_RATING = 3.5;
  const priorWeight = Math.max(minReviewsForConfidence, 1);
  const bayesianRating = ((avgRating * totalReviews) + (PRIOR_RATING * priorWeight)) / (totalReviews + priorWeight);
  // Confidence factor: 0 when 0 reviews, approaches 1 as reviews → ∞
  const confidence = Math.min(totalReviews / (totalReviews + priorWeight), 1);
  // Normalize to 0-1 scale (5 stars = 1.0)
  return (bayesianRating / 5) * confidence;
}

// ─── DDS Score Computation ────────────────────────────────────────────────────────

export interface ListingScoreInput {
  listing_id: string;
  listing_type: string;
  total_impressions: number;
  unique_impressions: number;
  total_clicks: number;
  unique_clicks: number;
  total_favorites: number;
  total_shares: number;
  total_messages: number;
  total_purchases: number;
  completed_orders: number;
  conversion_rate: number;
  avg_rating: number;
  total_reviews: number;
  refund_rate: number;
  dispute_rate: number;
  velocity_1h: number;
  velocity_24h: number;
  velocity_7d: number;
  velocity_30d: number;
  seller_verified: boolean;
  seller_completion_rate: number;
  seller_rating_confidence: number;
  created_at: string;
}

export interface ListingScoreResult {
  dds_score: number;
  relevance_score: number;
  engagement_score: number;
  conversion_score: number;
  rating_score: number;
  freshness_score: number;
  velocity_score: number;
  trust_score: number;
  trending_score: number;
  is_trending: boolean;
  trending_tier: string | null;
}

export function computeDDS(
  input: ListingScoreInput,
  weights: AlgorithmWeights,
): ListingScoreResult {
  // 1. Relevance/Engagement: CTR + favorites + shares + messages
  const ctr = input.total_impressions > 0 ? input.unique_clicks / input.total_impressions : 0;
  const engagementRaw = (ctr * 40) + Math.min(input.total_favorites / 100, 1) * 20 +
    Math.min(input.total_shares / 50, 1) * 15 + Math.min(input.total_messages / 100, 1) * 25;
  const engagement_score = Math.min(engagementRaw, 100) * (weights.click_weight / 100);

  // 2. Conversion: conversion rate + completed orders
  const conversion_score = (input.conversion_rate * 60 + Math.min(input.completed_orders / 50, 1) * 40) * (weights.conversion_weight / 100);

  // 3. Rating Intelligence: confidence-weighted
  const ratingConfidence = computeConfidenceWeightedRating(
    input.avg_rating, input.total_reviews, weights.min_reviews_for_confidence,
  );
  const reviewVolumeScore = Math.min(Math.log10(input.total_reviews + 1) / 3, 1);
  const rating_score = (ratingConfidence * 70 + reviewVolumeScore * 30) * (weights.rating_weight / 100);

  // 4. Freshness: decays over 30 days
  const ageDays = (Date.now() - new Date(input.created_at).getTime()) / 86400000;
  const freshness_score = Math.max(0, 1 - ageDays / 30) * weights.freshness_weight;

  // 5. Velocity: recent momentum (1h, 24h, 7d, 30d weighted)
  const velocityRaw = input.velocity_1h * 0.4 + input.velocity_24h * 0.3 +
    input.velocity_7d * 0.2 + input.velocity_30d * 0.1;
  const velocity_score = Math.min(velocityRaw / 100, 1) * weights.velocity_weight;

  // 6. Trust: seller verification + completion rate + low dispute/refund
  const trustRaw = (input.seller_verified ? 30 : 0) +
    (input.seller_completion_rate * 30) +
    (input.seller_rating_confidence * 20) +
    ((1 - Math.min(input.refund_rate, 1)) * 10) +
    ((1 - Math.min(input.dispute_rate, 1)) * 10);
  const trust_score = trustRaw * (weights.trust_weight / 100);

  // 7. Trending: velocity combined with growth acceleration
  const trendingRaw = velocityRaw + (input.velocity_24h > 0 ? (input.velocity_1h / input.velocity_24h) * 20 : 0);
  const trending_score = Math.min(trendingRaw, 100);
  const is_trending = trending_score >= weights.trending_threshold;
  const trending_tier = is_trending
    ? trending_score >= 80 ? 'hot' : trending_score >= 65 ? 'rising' : 'emerging'
    : null;

  // 8. DDS total: weighted sum
  const dds_score = engagement_score + conversion_score + rating_score +
    freshness_score + velocity_score + trust_score;

  return {
    dds_score: Math.round(dds_score * 100) / 100,
    relevance_score: Math.round(engagement_score * 100) / 100,
    engagement_score: Math.round(engagement_score * 100) / 100,
    conversion_score: Math.round(conversion_score * 100) / 100,
    rating_score: Math.round(rating_score * 100) / 100,
    freshness_score: Math.round(freshness_score * 100) / 100,
    velocity_score: Math.round(velocity_score * 100) / 100,
    trust_score: Math.round(trust_score * 100) / 100,
    trending_score: Math.round(trending_score * 100) / 100,
    is_trending,
    trending_tier,
  };
}

// ─── Save Score to listing_scores ────────────────────────────────────────────────

export async function saveListingScore(listingId: string, result: ListingScoreResult): Promise<void> {
  try {
    await supabase.from('listing_scores').upsert({
      listing_id: listingId,
      dds_score: result.dds_score,
      relevance_score: result.relevance_score,
      engagement_score: result.engagement_score,
      conversion_score: result.conversion_score,
      rating_score: result.rating_score,
      freshness_score: result.freshness_score,
      velocity_score: result.velocity_score,
      trust_score: result.trust_score,
      trending_score: result.trending_score,
      is_trending: result.is_trending,
      trending_tier: result.trending_tier,
      calculated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('saveListingScore error:', err);
  }
}

// ─── Fetch Trending Listings ──────────────────────────────────────────────────────

export async function fetchTrendingListings(limit = 20, listingType?: string): Promise<{ listing_id: string; trending_score: number; trending_tier: string }[]> {
  try {
    let query = supabase
      .from('listing_scores')
      .select('listing_id, trending_score, trending_tier')
      .eq('is_trending', true)
      .order('trending_score', { ascending: false })
      .limit(limit);
    if (listingType) {
      query = query.eq('listing_type', listingType);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(d => ({
      listing_id: d.listing_id,
      trending_score: Number(d.trending_score),
      trending_tier: d.trending_tier || 'emerging',
    }));
  } catch {
    return [];
  }
}

// ─── Fetch Top Search Trends ──────────────────────────────────────────────────────

export async function fetchSearchTrends(periodType = 'daily', limit = 20): Promise<{ term: string; search_count: number; growth_rate: number }[]> {
  try {
    const { data, error } = await supabase
      .from('search_trends')
      .select('term, search_count, growth_rate')
      .eq('period_type', periodType)
      .order('growth_rate', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []).map(d => ({
      term: d.term,
      search_count: d.search_count,
      growth_rate: Number(d.growth_rate),
    }));
  } catch {
    return [];
  }
}

// ─── Fetch System Metrics ─────────────────────────────────────────────────────────

export async function fetchSystemMetrics(days = 7): Promise<{ metric_type: string; period_date: string; value: number }[]> {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const { data, error } = await supabase
      .from('system_metrics')
      .select('metric_type, period_date, value')
      .gte('period_date', startDate.toISOString().split('T')[0])
      .order('period_date', { ascending: true });
    if (error) throw error;
    return (data || []).map(d => ({
      metric_type: d.metric_type,
      period_date: d.period_date,
      value: Number(d.value),
    }));
  } catch {
    return [];
  }
}

// ─── Batch Recalculate DDS for a Listing ──────────────────────────────────────────

export async function recalculateDDSForListing(listingId: string): Promise<ListingScoreResult | null> {
  try {
    const [statsResult, sellerResult, productResult, weights] = await Promise.all([
      supabase.from('listing_statistics').select('*').eq('listing_id', listingId).maybeSingle(),
      supabase.from('seller_statistics').select('*').maybeSingle(),
      supabase.from('products').select('uploaded_by, created_at').eq('id', listingId).maybeSingle(),
      fetchAlgorithmWeights(),
    ]);

    const stats = statsResult.data;
    const seller = sellerResult.data;
    const product = productResult.data;
    if (!stats || !product) return null;

    const input: ListingScoreInput = {
      listing_id: listingId,
      listing_type: stats.listing_type || 'product',
      total_impressions: stats.total_impressions || 0,
      unique_impressions: stats.unique_impressions || 0,
      total_clicks: stats.total_clicks || 0,
      unique_clicks: stats.unique_clicks || 0,
      total_favorites: stats.total_favorites || 0,
      total_shares: stats.total_shares || 0,
      total_messages: stats.total_messages || 0,
      total_purchases: stats.total_purchases || 0,
      completed_orders: stats.completed_orders || 0,
      conversion_rate: Number(stats.conversion_rate) || 0,
      avg_rating: Number(stats.avg_rating) || 0,
      total_reviews: stats.total_reviews || 0,
      refund_rate: Number(stats.refund_rate) || 0,
      dispute_rate: Number(stats.dispute_rate) || 0,
      velocity_1h: Number(stats.velocity_1h) || 0,
      velocity_24h: Number(stats.velocity_24h) || 0,
      velocity_7d: Number(stats.velocity_7d) || 0,
      velocity_30d: Number(stats.velocity_30d) || 0,
      seller_verified: seller?.is_verified || false,
      seller_completion_rate: Number(seller?.completion_rate) || 0,
      seller_rating_confidence: Number(seller?.rating_confidence) || 0,
      created_at: product.created_at,
    };

    const result = computeDDS(input, weights);
    await saveListingScore(listingId, result);
    return result;
  } catch (err) {
    console.error('recalculateDDSForListing error:', err);
    return null;
  }
}
