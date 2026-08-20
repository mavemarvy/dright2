// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT Recommendation Engine
// Personalized recommendations, user interest profiles, collaborative filtering,
// and related listings. Builds on Phase 1 analytics + DDS scores.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase';

// ─── Types ───────────────────────────────────────────────────────────────────

export type RecommendationStrategy =
  | 'recommended_for_you'
  | 'because_you_viewed'
  | 'people_also_viewed'
  | 'similar_listings'
  | 'trending_in_interests'
  | 'best_sellers_in_interests'
  | 'highly_rated_in_interests'
  | 'new_listings_you_may_like'
  | 'recommended_sellers'
  | 'recommended_categories';

export interface InterestProfile {
  scores: Record<string, number>;
  topCategories: string[];
  interactionCount: number;
}

// Event weights — how much each activity contributes to interest score
const EVENT_WEIGHTS: Record<string, number> = {
  impression: 1,
  click: 3,
  open: 4,
  favorite: 8,
  wishlist_add: 8,
  share: 6,
  copy_link: 3,
  contact_seller: 5,
  chat_opened: 5,
  seller_profile_visit: 4,
  purchase: 15,
  service_order: 15,
  course_enrollment: 15,
  checkout_completed: 12,
  review_submitted: 10,
  rating_submitted: 8,
  time_on_page: 2,
  video_play: 3,
};

const DECAY_FACTOR = 0.98; // recent interactions weighted higher

// ─── User Interest Profile ───────────────────────────────────────────────────

/**
 * Computes a user's interest profile from their activity in listing_events
 * and user_activity tables. Returns category → score (0-100).
 */
export async function computeInterestProfile(userId: string): Promise<InterestProfile> {
  try {
    // Fetch recent events for this user from listing_events
    const { data: events } = await supabase
      .from('listing_events')
      .select('listing_id, event_type, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(500);

    if (!events || events.length === 0) {
      return { scores: {}, topCategories: [], interactionCount: 0 };
    }

    // Get categories for these listings
    const listingIds = [...new Set(events.map(e => e.listing_id))];
    const { data: listings } = await supabase
      .from('products')
      .select('id, category')
      .in('id', listingIds);

    const categoryMap = new Map((listings || []).map(l => [l.id, l.category]));

    // Aggregate weighted scores per category with time decay
    const rawScores: Record<string, number> = {};
    const now = Date.now();
    const sortedEvents = [...events].reverse(); // oldest first for decay

    for (const event of sortedEvents) {
      const category = categoryMap.get(event.listing_id);
      if (!category) continue;
      const weight = EVENT_WEIGHTS[event.event_type] ?? 1;
      const ageDays = (now - new Date(event.created_at).getTime()) / 86400000;
      const decay = Math.pow(DECAY_FACTOR, ageDays);
      rawScores[category] = (rawScores[category] || 0) + weight * decay;
    }

    // Normalize to 0-100 scale
    const maxScore = Math.max(...Object.values(rawScores), 1);
    const scores: Record<string, number> = {};
    for (const [cat, raw] of Object.entries(rawScores)) {
      scores[cat] = Math.round((raw / maxScore) * 100);
    }

    // Top categories sorted by score
    const topCategories = Object.entries(scores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cat]) => cat);

    return {
      scores,
      topCategories,
      interactionCount: events.length,
    };
  } catch (err) {
    console.error('computeInterestProfile error:', err);
    return { scores: {}, topCategories: [], interactionCount: 0 };
  }
}

/**
 * Saves a user's interest profile to the database (upsert).
 */
export async function saveInterestProfile(userId: string, profile: InterestProfile): Promise<void> {
  try {
    await supabase.from('user_interest_profiles').upsert({
      user_id: userId,
      scores: profile.scores,
      top_categories: profile.topCategories,
      interaction_count: profile.interactionCount,
      last_updated: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  } catch (err) {
    console.error('saveInterestProfile error:', err);
  }
}

/**
 * Fetches a cached interest profile, or computes + caches a new one.
 */
export async function getInterestProfile(userId: string): Promise<InterestProfile> {
  try {
    const { data } = await supabase
      .from('user_interest_profiles')
      .select('scores, top_categories, interaction_count, last_updated')
      .eq('user_id', userId)
      .maybeSingle();

    // Recompute if no profile or older than 1 hour
    const stale = !data || (Date.now() - new Date(data.last_updated).getTime()) > 3600000;
    if (stale) {
      const profile = await computeInterestProfile(userId);
      if (profile.interactionCount > 0) {
        await saveInterestProfile(userId, profile);
      }
      return profile;
    }

    return {
      scores: (data.scores as Record<string, number>) || {},
      topCategories: (data.top_categories as string[]) || [],
      interactionCount: data.interaction_count || 0,
    };
  } catch {
    return { scores: {}, topCategories: [], interactionCount: 0 };
  }
}

// ─── Recommendation Strategies ───────────────────────────────────────────────

interface RecommenderContext {
  userId: string;
  profile: InterestProfile;
  excludeIds?: string[];
  limit?: number;
}

/**
 * Recommended For You — blends interest-based + trending + best sellers.
 */
export async function recommendForYou(ctx: RecommenderContext): Promise<{ ids: string[]; reason: string }> {
  const limit = ctx.limit ?? 12;
  const exclude = new Set(ctx.excludeIds || []);

  if (ctx.profile.topCategories.length === 0) {
    // Cold start: trending + top rated
    return coldStartRecommendations(limit, exclude);
  }

  // Fetch from top categories, ranked by DDS
  const { data } = await supabase
    .from('products')
    .select('id, category, average_rating, total_reviews, total_sales, created_at')
    .in('category', ctx.profile.topCategories)
    .eq('is_active', true)
    .eq('is_hidden', false)
    .eq('approval_status', 'approved')
    .limit(60);

  if (!data || data.length === 0) {
    return coldStartRecommendations(limit, exclude);
  }

  // Score by interest weight × DDS-like heuristic
  const scored = data
    .filter(p => !exclude.has(p.id))
    .map(p => {
      const interestWeight = ctx.profile.scores[p.category] || 0;
      const salesScore = Math.min(Math.log10((p.total_sales || 0) + 1) / 2, 1);
      const ratingScore = (p.total_reviews || 0) > 0 ? (p.average_rating || 0) / 5 : 0.5;
      const freshness = Math.max(0, 1 - (Date.now() - new Date(p.created_at).getTime()) / (30 * 86400000));
      return { id: p.id, score: interestWeight * 0.5 + salesScore * 25 + ratingScore * 15 + freshness * 10 };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(p => p.id);

  return { ids: scored, reason: `Based on your interest in ${ctx.profile.topCategories.slice(0, 2).join(', ')}` };
}

/**
 * Because You Viewed — listings similar to recently viewed.
 */
export async function becauseYouViewed(ctx: RecommenderContext, viewedIds: string[]): Promise<{ ids: string[]; reason: string }> {
  if (viewedIds.length === 0) return { ids: [], reason: '' };
  const limit = ctx.limit ?? 8;
  const exclude = new Set([...(ctx.excludeIds || []), ...viewedIds]);

  // Get categories of viewed listings
  const { data: viewed } = await supabase
    .from('products')
    .select('id, category')
    .in('id', viewedIds.slice(0, 5));

  const categories = [...new Set((viewed || []).map(v => v.category).filter(Boolean))];
  if (categories.length === 0) return { ids: [], reason: '' };

  const { data } = await supabase
    .from('products')
    .select('id, category, total_sales, average_rating, total_reviews')
    .in('category', categories)
    .eq('is_active', true)
    .eq('is_hidden', false)
    .eq('approval_status', 'approved')
    .limit(40);

  const ids = (data || [])
    .filter(p => !exclude.has(p.id))
    .sort((a, b) => (b.total_sales || 0) - (a.total_sales || 0))
    .slice(0, limit)
    .map(p => p.id);

  return { ids, reason: 'Because you viewed similar listings' };
}

/**
 * People Also Viewed — collaborative filtering via listing_similarity table.
 */
export async function peopleAlsoViewed(listingId: string, excludeIds: string[] = [], limit = 8): Promise<{ ids: string[]; reason: string }> {
  try {
    const { data } = await supabase
      .from('listing_similarity')
      .select('listing_b, score, reasons')
      .eq('listing_a', listingId)
      .order('score', { ascending: false })
      .limit(limit * 2);

    const exclude = new Set([listingId, ...excludeIds]);
    const ids = (data || [])
      .filter(r => !exclude.has(r.listing_b))
      .slice(0, limit)
      .map(r => r.listing_b);

    return { ids, reason: 'People also viewed' };
  } catch {
    return { ids: [], reason: '' };
  }
}

/**
 * Similar Listings — content-based similarity (category + tags + seller).
 */
export async function similarListings(listingId: string, excludeIds: string[] = [], limit = 6): Promise<{ ids: string[]; reason: string }> {
  try {
    // Get the source listing's category + seller
    const { data: source } = await supabase
      .from('products')
      .select('category, uploaded_by')
      .eq('id', listingId)
      .maybeSingle();

    if (!source) return { ids: [], reason: '' };

    const exclude = new Set([listingId, ...excludeIds]);

    // Same category, different listings, ranked by DDS/sales
    const { data } = await supabase
      .from('products')
      .select('id, total_sales, average_rating, total_reviews, created_at')
      .eq('category', source.category)
      .eq('is_active', true)
      .eq('is_hidden', false)
      .eq('approval_status', 'approved')
      .neq('id', listingId)
      .limit(30);

    const ids = (data || [])
      .filter(p => !exclude.has(p.id))
      .sort((a, b) => {
        const aScore = (a.total_sales || 0) + (a.average_rating || 0) * (a.total_reviews || 0);
        const bScore = (b.total_sales || 0) + (b.average_rating || 0) * (b.total_reviews || 0);
        return bScore - aScore;
      })
      .slice(0, limit)
      .map(p => p.id);

    return { ids, reason: 'Similar listings' };
  } catch {
    return { ids: [], reason: '' };
  }
}

/**
 * Trending In Your Interests — trending listings in user's top categories.
 */
export async function trendingInInterests(ctx: RecommenderContext): Promise<{ ids: string[]; reason: string }> {
  if (ctx.profile.topCategories.length === 0) {
    return coldStartRecommendations(ctx.limit ?? 8, new Set(ctx.excludeIds || []));
  }
  try {
    const { data } = await supabase
      .from('listing_scores')
      .select('listing_id, trending_score')
      .eq('is_trending', true)
      .order('trending_score', { ascending: false })
      .limit(40);

    if (!data || data.length === 0) {
      return coldStartRecommendations(ctx.limit ?? 8, new Set(ctx.excludeIds || []));
    }

    // Filter to user's interest categories
    const trendingIds = data.map(d => d.listing_id);
    const { data: listings } = await supabase
      .from('products')
      .select('id, category')
      .in('id', trendingIds)
      .in('category', ctx.profile.topCategories);

    const exclude = new Set(ctx.excludeIds || []);
    const ids = (listings || [])
      .filter(p => !exclude.has(p.id))
      .slice(0, ctx.limit ?? 8)
      .map(p => p.id);

    return { ids, reason: `Trending in ${ctx.profile.topCategories.slice(0, 2).join(', ')}` };
  } catch {
    return { ids: [], reason: '' };
  }
}

/**
 * Best Sellers In Your Interests.
 */
export async function bestSellersInInterests(ctx: RecommenderContext): Promise<{ ids: string[]; reason: string }> {
  if (ctx.profile.topCategories.length === 0) {
    return coldStartRecommendations(ctx.limit ?? 8, new Set(ctx.excludeIds || []));
  }
  try {
    const { data } = await supabase
      .from('products')
      .select('id, category, total_sales')
      .in('category', ctx.profile.topCategories)
      .eq('is_active', true)
      .eq('is_hidden', false)
      .eq('approval_status', 'approved')
      .order('total_sales', { ascending: false })
      .limit(50);

    const exclude = new Set(ctx.excludeIds || []);
    const ids = (data || [])
      .filter(p => !exclude.has(p.id))
      .slice(0, ctx.limit ?? 8)
      .map(p => p.id);

    return { ids, reason: 'Best sellers in your interests' };
  } catch {
    return { ids: [], reason: '' };
  }
}

/**
 * Highly Rated In Your Interests — confidence-weighted.
 */
export async function highlyRatedInInterests(ctx: RecommenderContext): Promise<{ ids: string[]; reason: string }> {
  if (ctx.profile.topCategories.length === 0) {
    return coldStartRecommendations(ctx.limit ?? 8, new Set(ctx.excludeIds || []));
  }
  try {
    const { data } = await supabase
      .from('products')
      .select('id, category, average_rating, total_reviews')
      .in('category', ctx.profile.topCategories)
      .eq('is_active', true)
      .eq('is_hidden', false)
      .eq('approval_status', 'approved')
      .gte('total_reviews', 3)
      .order('average_rating', { ascending: false })
      .limit(50);

    const exclude = new Set(ctx.excludeIds || []);
    // Sort by confidence-weighted rating (reviews matter)
    const ids = (data || [])
      .filter(p => !exclude.has(p.id))
      .sort((a, b) => {
        const aConf = (a.average_rating || 0) * Math.min(Math.log10((a.total_reviews || 0) + 1), 2);
        const bConf = (b.average_rating || 0) * Math.min(Math.log10((b.total_reviews || 0) + 1), 2);
        return bConf - aConf;
      })
      .slice(0, ctx.limit ?? 8)
      .map(p => p.id);

    return { ids, reason: 'Highly rated in your interests' };
  } catch {
    return { ids: [], reason: '' };
  }
}

/**
 * New Listings You May Like — fresh listings in interest categories.
 */
export async function newListingsYouMayLike(ctx: RecommenderContext): Promise<{ ids: string[]; reason: string }> {
  const categories = ctx.profile.topCategories.length > 0 ? ctx.profile.topCategories : undefined;
  try {
    let query = supabase
      .from('products')
      .select('id, category, created_at')
      .eq('is_active', true)
      .eq('is_hidden', false)
      .eq('approval_status', 'approved')
      .order('created_at', { ascending: false })
      .limit(40);
    if (categories) query = query.in('category', categories);

    const { data } = await query;
    const exclude = new Set(ctx.excludeIds || []);
    const ids = (data || [])
      .filter(p => !exclude.has(p.id))
      .slice(0, ctx.limit ?? 8)
      .map(p => p.id);

    return { ids, reason: categories ? 'New listings in your interests' : 'New listings you may like' };
  } catch {
    return { ids: [], reason: '' };
  }
}

// ─── Cold Start Strategy ─────────────────────────────────────────────────────

/**
 * Cold start: for new users with no activity — top rated + trending + best sellers.
 */
export async function coldStartRecommendations(limit: number, exclude: Set<string>): Promise<{ ids: string[]; reason: string }> {
  try {
    const [topRated, trending, bestSellers] = await Promise.all([
      supabase
        .from('products')
        .select('id, average_rating, total_reviews')
        .eq('is_active', true)
        .eq('is_hidden', false)
        .eq('approval_status', 'approved')
        .gte('total_reviews', 3)
        .order('average_rating', { ascending: false })
        .limit(20),
      supabase
        .from('listing_scores')
        .select('listing_id')
        .eq('is_trending', true)
        .order('trending_score', { ascending: false })
        .limit(20),
      supabase
        .from('products')
        .select('id, total_sales')
        .eq('is_active', true)
        .eq('is_hidden', false)
        .eq('approval_status', 'approved')
        .order('total_sales', { ascending: false })
        .limit(20),
    ]);

    // Blend: interleave trending + best sellers + top rated
    const trendingIds = (trending.data || []).map(d => d.listing_id);
    const bestIds = (bestSellers.data || []).map(d => d.id);
    const ratedIds = (topRated.data || []).map(d => d.id);

    const blended: string[] = [];
    const maxLen = Math.max(trendingIds.length, bestIds.length, ratedIds.length);
    for (let i = 0; i < maxLen && blended.length < limit; i++) {
      if (trendingIds[i] && !exclude.has(trendingIds[i]) && !blended.includes(trendingIds[i])) blended.push(trendingIds[i]);
      if (bestIds[i] && !exclude.has(bestIds[i]) && !blended.includes(bestIds[i])) blended.push(bestIds[i]);
      if (ratedIds[i] && !exclude.has(ratedIds[i]) && !blended.includes(ratedIds[i])) blended.push(ratedIds[i]);
    }

    return { ids: blended.slice(0, limit), reason: 'Popular right now' };
  } catch {
    return { ids: [], reason: '' };
  }
}

// ─── Recommendation Logger (feedback loop) ───────────────────────────────────

export async function logRecommendationShown(userId: string, listingId: string, strategy: RecommendationStrategy): Promise<void> {
  try {
    await supabase.from('recommendation_logs').insert({
      user_id: userId,
      listing_id: listingId,
      strategy,
      shown: true,
      clicked: false,
    });
  } catch (err) {
    console.error('logRecommendationShown error:', err);
  }
}

export async function logRecommendationClicked(userId: string, listingId: string, strategy: RecommendationStrategy): Promise<void> {
  try {
    await supabase.from('recommendation_logs').insert({
      user_id: userId,
      listing_id: listingId,
      strategy,
      shown: true,
      clicked: true,
    });
  } catch (err) {
    console.error('logRecommendationClicked error:', err);
  }
}

// ─── Browse History Management ───────────────────────────────────────────────

export interface BrowseHistoryEntry {
  listing_id: string;
  listing_name: string;
  listing_image: string | null;
  category: string;
  viewed_at: string;
  view_count: number;
}

export async function fetchBrowseHistory(userId: string, limit = 20): Promise<BrowseHistoryEntry[]> {
  try {
    const { data } = await supabase
      .from('recently_viewed')
      .select('product_id, viewed_at, view_count')
      .eq('user_id', userId)
      .order('viewed_at', { ascending: false })
      .limit(limit);

    if (!data || data.length === 0) return [];

    const productIds = data.map(d => d.product_id);
    const { data: products } = await supabase
      .from('products')
      .select('id, name, image_url, category')
      .in('id', productIds);

    const productMap = new Map((products || []).map(p => [p.id, p]));
    return data
      .map(d => {
        const p = productMap.get(d.product_id);
        if (!p) return null;
        return {
          listing_id: d.product_id,
          listing_name: p.name,
          listing_image: p.image_url,
          category: p.category,
          viewed_at: d.viewed_at,
          view_count: d.view_count || 1,
        };
      })
      .filter((x): x is BrowseHistoryEntry => x !== null);
  } catch {
    return [];
  }
}

export async function removeBrowseHistoryEntry(userId: string, productId: string): Promise<void> {
  try {
    await supabase
      .from('recently_viewed')
      .delete()
      .eq('user_id', userId)
      .eq('product_id', productId);
  } catch (err) {
    console.error('removeBrowseHistoryEntry error:', err);
  }
}

export async function clearBrowseHistory(userId: string): Promise<void> {
  try {
    await supabase
      .from('recently_viewed')
      .delete()
      .eq('user_id', userId);
  } catch (err) {
    console.error('clearBrowseHistory error:', err);
  }
}

// ─── Search History Management ───────────────────────────────────────────────

export interface SearchHistoryEntry {
  id: string;
  query: string;
  category: string | null;
  result_count: number;
  created_at: string;
}

export async function fetchSearchHistory(userId: string, limit = 20): Promise<SearchHistoryEntry[]> {
  try {
    const { data } = await supabase
      .from('search_history')
      .select('id, query, category, result_count, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data || []) as SearchHistoryEntry[];
  } catch {
    return [];
  }
}

export async function removeSearchHistoryEntry(userId: string, entryId: string): Promise<void> {
  try {
    await supabase
      .from('search_history')
      .delete()
      .eq('id', entryId)
      .eq('user_id', userId);
  } catch (err) {
    console.error('removeSearchHistoryEntry error:', err);
  }
}

export async function clearSearchHistory(userId: string): Promise<void> {
  try {
    await supabase
      .from('search_history')
      .delete()
      .eq('user_id', userId);
  } catch (err) {
    console.error('clearSearchHistory error:', err);
  }
}
