import { supabase } from './supabase';

export type SocialFeedMode = 'social' | 'following' | 'friends' | 'mine' | 'community';
export type SocialMediaType = 'image' | 'video';
export type SocialReactionType = 'like' | 'love' | 'care' | 'haha' | 'wow' | 'sad' | 'angry';

export type SocialFeedItem = {
  id: string;
  author_id: string;
  author_name: string | null;
  author_username: string | null;
  author_avatar: string | null;
  author_verified: boolean;
  body: string;
  media_path: string | null;
  media_type: SocialMediaType | null;
  media_width: number | null;
  media_height: number | null;
  media_url?: string | null;
  visibility: 'public' | 'followers' | 'friends' | 'private';
  comments_enabled: boolean;
  allowed_reactions: SocialReactionType[];
  created_at: string;
  updated_at: string;
  edited_at: string | null;
  is_following: boolean;
  is_friend: boolean;
  view_count: number;
  unique_view_count: number;
  click_count: number;
  reaction_count: number;
  comment_count: number;
  save_count: number;
  current_reaction: SocialReactionType | null;
  is_saved: boolean;
  community_id: string | null;
  community_name: string | null;
  community_slug: string | null;
  community_avatar: string | null;
  source_type: 'user' | 'community';
  category: string | null;
  topic_tags: string[];
  linked_entity_type: 'product' | 'service' | 'course' | 'job' | 'store' | 'creator' | 'community' | null;
  linked_entity_id: string | null;
  linked_entity_url: string | null;
  is_pinned: boolean;
  recommendation_reason?: string | null;
};

export type SocialFeedResponse = {
  items: SocialFeedItem[];
  next_cursor: string | null;
  has_more: boolean;
  session_id: string;
  feed: SocialFeedMode;
};

export type SocialAccountSuggestion = {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  followers: number;
  mutual_score: number;
};

export type SocialRuntimeSettings = {
  algorithm?: { social_feed_batch_size?: number; social_qualified_view_ms?: number; social_fast_skip_ms?: number };
  social?: { session_expiry_hours?: number; recommendation_reasons?: boolean };
  community?: { creation_enabled?: boolean; creation_min_followers?: number; max_communities_per_user?: number; monetization_enabled?: boolean };
  sponsored?: { enabled?: boolean; min_organic_between_ads?: number; max_ads_per_session?: number; same_campaign_daily_cap?: number };
};

export async function signSocialMedia(items: SocialFeedItem[]): Promise<SocialFeedItem[]> {
  return Promise.all(items.map(async (item) => {
    if (!item.media_path) return { ...item, media_url: null };
    const { data, error } = await supabase.storage.from('social-media').createSignedUrl(item.media_path, 60 * 60);
    return { ...item, media_url: error ? null : data.signedUrl };
  }));
}

export async function fetchSocialFeed(params: {
  feed: SocialFeedMode;
  cursor?: string | null;
  sessionId?: string | null;
  targetId?: string | null;
  communityId?: string | null;
  limit?: number;
}): Promise<SocialFeedResponse> {
  const { data, error } = await supabase.rpc('get_social_feed_v2', {
    p_feed: params.feed,
    p_cursor: params.cursor || null,
    p_limit: params.limit || null,
    p_session_id: params.sessionId || null,
    p_target_id: params.targetId || null,
    p_community_id: params.communityId || null,
  });
  if (error) throw error;
  const result = (data || {}) as SocialFeedResponse;
  return { ...result, items: await signSocialMedia(Array.isArray(result.items) ? result.items : []) };
}

export async function fetchSocialSuggestions(mode: 'following' | 'friends', limit = 12): Promise<SocialAccountSuggestion[]> {
  const { data, error } = await supabase.rpc('get_social_account_suggestions', { p_mode: mode, p_limit: limit });
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as SocialAccountSuggestion[];
}

export async function fetchSocialRuntimeSettings(): Promise<SocialRuntimeSettings> {
  const { data, error } = await supabase.rpc('get_social_runtime_settings');
  if (error) throw error;
  return (data || {}) as SocialRuntimeSettings;
}

export async function recordSocialClick(postId: string, sessionId: string | null) {
  const { data, error } = await supabase.rpc('record_social_post_click', { p_post_id: postId, p_session_id: sessionId });
  if (error) throw error;
  return (data || {}) as { click_count?: number; click_id?: string | null; recorded?: boolean };
}

export async function recordVideoStart(postId: string, sessionId: string | null) {
  const { data, error } = await supabase.rpc('record_social_video_start', { p_post_id: postId, p_session_id: sessionId });
  if (error) throw error;
  return (data || {}) as { view_count?: number; unique_view_count?: number; viewer_play_count?: number };
}

export async function recordVideoProgress(postId: string, eventType: 'qualified_view' | 'pause' | 'resume' | 'watch_complete' | 'replay' | 'skip' | 'dwell', watchMs: number, completionRatio: number, sessionId: string | null) {
  const { error } = await supabase.rpc('record_social_video_progress', { p_post_id: postId, p_event_type: eventType, p_watch_ms: Math.max(0, Math.round(watchMs)), p_completion_ratio: Math.max(0, completionRatio), p_session_id: sessionId });
  if (error) throw error;
}

export async function recordSocialEvent(postId: string, eventType: 'impression' | 'share' | 'not_interested' | 'hide_creator' | 'profile_visit' | 'follow' | 'unfollow' | 'report' | 'dwell', dwellMs?: number | null) {
  const { error } = await supabase.rpc('record_social_post_event', { p_post_id: postId, p_event_type: eventType, p_dwell_ms: dwellMs ?? null });
  if (error) throw error;
}

export async function recordEntityClick(postId: string, sessionId: string | null) {
  const { data, error } = await supabase.rpc('record_social_entity_click', { p_post_id: postId, p_session_id: sessionId });
  if (error) throw error;
  return (data || {}) as { click_id: string; entity_type: string; entity_id: string | null; url: string | null };
}

export async function updateSocialPosition(sessionId: string, postId: string, position: number) {
  await supabase.rpc('update_social_session_position', { p_session_id: sessionId, p_post_id: postId, p_position: position });
}
