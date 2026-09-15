import { supabase } from './supabase';

export interface AlgorithmSettings {
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

  social_feed_batch_size: number;
  social_exploration_percentage: number;
  social_recency_weight: number;
  social_watch_weight: number;
  social_completion_weight: number;
  social_save_weight: number;
  social_share_weight: number;
  social_comment_weight: number;
  social_follow_weight: number;
  social_friend_affinity: number;
  social_creator_affinity: number;
  social_interest_weight: number;
  social_commerce_affinity_weight: number;
  social_trend_weight: number;
  social_fresh_boost: number;
  social_negative_penalty: number;
  social_creator_window: number;
  social_creator_max_per_window: number;
  social_category_window: number;
  social_category_max_per_window: number;
  social_qualified_view_ms: number;
  social_fast_skip_ms: number;

  marketplace_relevance_weight: number;
  marketplace_seller_verification_weight: number;
  marketplace_listing_quality_weight: number;
  marketplace_conversion_rate_weight: number;
  marketplace_sales_history_weight: number;
  marketplace_rating_weight: number;
  marketplace_freshness_weight: number;
  marketplace_trending_weight: number;
  marketplace_interest_weight: number;
  marketplace_seller_affinity_weight: number;
  marketplace_commerce_weight: number;
  marketplace_exploration_percentage: number;
  marketplace_page_size: number;
  search_personalization_weight: number;

  jobs_page_size: number;
  jobs_search_weight: number;
  jobs_category_affinity_weight: number;
  jobs_skills_weight: number;
  jobs_location_weight: number;
  jobs_application_history_weight: number;
  jobs_employer_affinity_weight: number;
  jobs_freshness_weight: number;
  jobs_exploration_percentage: number;

  communities_interest_weight: number;
  communities_friend_weight: number;
  communities_activity_weight: number;
  communities_growth_weight: number;
  communities_freshness_weight: number;
  communities_exploration_percentage: number;

  interest_half_life_days: number;
  interest_score_cap: number;
  interest_search_weight: number;
  interest_view_weight: number;
  interest_dwell_weight: number;
  interest_completion_weight: number;
  interest_reaction_weight: number;
  interest_comment_weight: number;
  interest_save_weight: number;
  interest_share_weight: number;
  interest_follow_weight: number;
  interest_profile_visit_weight: number;
  interest_wishlist_weight: number;
  interest_checkout_weight: number;
  interest_purchase_weight: number;
  interest_skip_penalty: number;
  interest_hide_penalty: number;
  interest_not_interested_penalty: number;
  interest_block_penalty: number;
  interest_recompute_window_days: number;
  interest_top_category_limit: number;

  promotion_interest_weight: number;
  promotion_min_relevance: number;

  semantic_recommendations_enabled: boolean;
  embedding_generation_enabled: boolean;
  semantic_provider: string;
  semantic_embedding_model: string;
  semantic_embedding_dimensions: number;
  semantic_embedding_version: number;
  semantic_similarity_weight: number;
  semantic_min_similarity: number;
  semantic_candidate_limit: number;
  semantic_cold_start_weight: number;
  semantic_search_weight: number;
  semantic_marketplace_weight: number;
  semantic_social_weight: number;
  semantic_jobs_weight: number;
  semantic_services_weight: number;
  semantic_courses_weight: number;
  semantic_communities_weight: number;
  semantic_promotion_weight: number;
  semantic_rollout_percentage: number;
  embedding_daily_request_limit: number;
  embedding_monthly_request_limit: number;
  embedding_estimated_cost_per_million_tokens: number;
}

export interface RecommendationDiagnostics {
  interest_profiles_total?: number;
  interest_profiles_pending?: number;
  profiles_recomputed_24h?: number;
  job_profiles_recomputed_24h?: number;
  marketplace_feed_v2?: boolean;
  jobs_feed_v2?: boolean;
  social_feed_v2?: boolean;
  promotion_delivery_v2?: boolean;
  canonical_source?: string;
  legacy_marketplace_sync?: boolean;
  interest_cron_active?: boolean;
  listing_intelligence_cron_active?: boolean;
  storage_cron_active?: boolean;
  listing_statistics_count?: number;
  listing_scores_count?: number;
  listing_intelligence_pending?: number;
  semantic_recommendations_enabled?: boolean;
  embedding_generation_enabled?: boolean;
  pgvector_available?: boolean;
  semantic_indexed?: number;
  semantic_pending?: number;
  semantic_failed?: number;
  semantic_stale?: number;
  algorithm_version?: number;
  generated_at?: string;
}

export interface SemanticEngineStatus {
  pgvector_available?: boolean;
  semantic_recommendations_enabled?: boolean;
  embedding_generation_enabled?: boolean;
  provider?: string;
  model?: string;
  dimensions?: number;
  version?: number;
  indexed_entities?: number;
  pending_embeddings?: number;
  failed_embeddings?: number;
  stale_embeddings?: number;
  last_successful_embedding?: string | null;
  generated_today?: number;
  generated_this_month?: number;
  failed_this_month?: number;
}

export const DEFAULT_ALGORITHM_SETTINGS: AlgorithmSettings = {
  search_weight: 30, click_weight: 15, conversion_weight: 20, rating_weight: 10,
  review_weight: 8, freshness_weight: 5, velocity_weight: 7, trust_weight: 5,
  trending_threshold: 50, fraud_sensitivity: 50, min_reviews_for_confidence: 5, trending_decay_rate: 0.85,

  social_feed_batch_size: 20, social_exploration_percentage: 10, social_recency_weight: 8,
  social_watch_weight: 20, social_completion_weight: 18, social_save_weight: 12, social_share_weight: 10,
  social_comment_weight: 8, social_follow_weight: 8, social_friend_affinity: 14, social_creator_affinity: 10,
  social_interest_weight: 14, social_commerce_affinity_weight: 4, social_trend_weight: 8, social_fresh_boost: 8,
  social_negative_penalty: 25, social_creator_window: 10, social_creator_max_per_window: 2,
  social_category_window: 10, social_category_max_per_window: 4, social_qualified_view_ms: 3000,
  social_fast_skip_ms: 1800,

  marketplace_relevance_weight: 30, marketplace_seller_verification_weight: 15,
  marketplace_listing_quality_weight: 10, marketplace_conversion_rate_weight: 15,
  marketplace_sales_history_weight: 10, marketplace_rating_weight: 10, marketplace_freshness_weight: 5,
  marketplace_trending_weight: 5, marketplace_interest_weight: 22, marketplace_seller_affinity_weight: 10,
  marketplace_commerce_weight: 18, marketplace_exploration_percentage: 8, marketplace_page_size: 30,
  search_personalization_weight: 8,

  jobs_page_size: 30, jobs_search_weight: 40, jobs_category_affinity_weight: 14, jobs_skills_weight: 20,
  jobs_location_weight: 8, jobs_application_history_weight: 18, jobs_employer_affinity_weight: 8,
  jobs_freshness_weight: 10, jobs_exploration_percentage: 8,

  communities_interest_weight: 20, communities_friend_weight: 12, communities_activity_weight: 10,
  communities_growth_weight: 8, communities_freshness_weight: 6, communities_exploration_percentage: 10,

  interest_half_life_days: 45, interest_score_cap: 100, interest_search_weight: 2, interest_view_weight: 3,
  interest_dwell_weight: 5, interest_completion_weight: 7, interest_reaction_weight: 5,
  interest_comment_weight: 6, interest_save_weight: 9, interest_share_weight: 8, interest_follow_weight: 10,
  interest_profile_visit_weight: 4, interest_wishlist_weight: 10, interest_checkout_weight: 14,
  interest_purchase_weight: 20, interest_skip_penalty: 2, interest_hide_penalty: 8,
  interest_not_interested_penalty: 12, interest_block_penalty: 20, interest_recompute_window_days: 365,
  interest_top_category_limit: 12,

  promotion_interest_weight: 20, promotion_min_relevance: 0.1,

  semantic_recommendations_enabled: false, embedding_generation_enabled: false,
  semantic_provider: 'openai', semantic_embedding_model: 'text-embedding-3-small',
  semantic_embedding_dimensions: 1536, semantic_embedding_version: 1,
  semantic_similarity_weight: 12, semantic_min_similarity: 0.35, semantic_candidate_limit: 40,
  semantic_cold_start_weight: 18, semantic_search_weight: 18, semantic_marketplace_weight: 12,
  semantic_social_weight: 6, semantic_jobs_weight: 16, semantic_services_weight: 14,
  semantic_courses_weight: 14, semantic_communities_weight: 10, semantic_promotion_weight: 6,
  semantic_rollout_percentage: 100, embedding_daily_request_limit: 1000,
  embedding_monthly_request_limit: 10000, embedding_estimated_cost_per_million_tokens: 0,
};

const numericKeys = new Set(
  Object.entries(DEFAULT_ALGORITHM_SETTINGS)
    .filter(([, value]) => typeof value === 'number')
    .map(([key]) => key),
);

export async function fetchAlgorithmSettings(): Promise<AlgorithmSettings> {
  const { data, error } = await supabase.from('algorithm_settings').select('*').eq('is_singleton', true).maybeSingle();
  if (error || !data) return DEFAULT_ALGORITHM_SETTINGS;
  const merged: Record<string, unknown> = { ...DEFAULT_ALGORITHM_SETTINGS, ...data };
  for (const key of numericKeys) merged[key] = Number(merged[key] ?? (DEFAULT_ALGORITHM_SETTINGS as unknown as Record<string, unknown>)[key]);
  return merged as unknown as AlgorithmSettings;
}

export async function updateAlgorithmSettings(settings: Partial<AlgorithmSettings>): Promise<void> {
  const payload: Record<string, unknown> = { ...settings, updated_at: new Date().toISOString() };
  delete payload.semantic_embedding_dimensions; // Current vector schema is fixed at 1536 until a reviewed migration changes it.
  const { error } = await supabase.from('algorithm_settings').update(payload).eq('is_singleton', true);
  if (error) throw error;
}

export async function fetchRecommendationDiagnostics(): Promise<RecommendationDiagnostics> {
  const { data, error } = await supabase.rpc('get_recommendation_system_diagnostics');
  if (error) throw error;
  return (data || {}) as RecommendationDiagnostics;
}

export async function fetchSemanticEngineStatus(): Promise<SemanticEngineStatus> {
  const { data, error } = await supabase.rpc('get_semantic_engine_status');
  if (error) throw error;
  return (data || {}) as SemanticEngineStatus;
}

export async function queueSemanticReindex(entityType?: string, status?: 'failed' | 'stale'): Promise<number> {
  const { data, error } = await supabase.functions.invoke('semantic-embeddings', {
    body: { action: 'queue-reindex', entityType: entityType || null, status: status || null },
  });
  if (error) throw error;
  if (!data?.success) throw new Error(data?.error || 'Unable to queue semantic reindex');
  return Number(data.queued || 0);
}

export async function processSemanticQueue(limit = 20): Promise<{ processed: number; ready: number; failed: number; paused: boolean }> {
  const { data, error } = await supabase.functions.invoke('semantic-embeddings', { body: { action: 'process', limit } });
  if (error) throw error;
  if (!data?.success) throw new Error(data?.error || 'Unable to process semantic queue');
  return {
    processed: Number(data.processed || 0), ready: Number(data.ready || 0),
    failed: Number(data.failed || 0), paused: Boolean(data.paused),
  };
}
