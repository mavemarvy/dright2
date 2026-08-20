import { supabase } from '../supabase';

// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT AI Response Cache — Client-side + Server-side caching
//
// Uses the ai_cache table for persistent cross-session caching.
// TTL-based expiration. Automatic stale entry cleanup.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_TTL_SECONDS = 300; // 5 minutes
const MAX_KEY_LENGTH = 500;

function hashKey(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `cache_${Math.abs(hash).toString(36)}`;
}

export function getCacheKey(feature: string, prompt: string, context?: string): string {
  const raw = `${feature}:${prompt}:${context || ''}`;
  return hashKey(raw.slice(0, MAX_KEY_LENGTH));
}

// Features that are safe to cache (non-user-specific results)
const CACHEABLE_FEATURES = new Set([
  'search', 'recommend', 'summarize', 'translate', 'rewrite',
  'product-description', 'moderate', 'faq', 'product-qa',
  'marketplace-assistant',
]);

export function isCacheable(feature: string): boolean {
  return CACHEABLE_FEATURES.has(feature);
}

export async function getCachedResponse<T>(cacheKey: string): Promise<T | null> {
  try {
    const { data, error } = await supabase
      .from('ai_cache')
      .select('cache_value')
      .eq('cache_key', cacheKey)
      .maybeSingle();

    if (error || !data) return null;

    const value = data.cache_value as any;
    if (value && typeof value === 'object' && value.expires_at) {
      if (new Date(value.expires_at).getTime() < Date.now()) return null;
    }

    // Increment hit count
    try {
      const { error: rpcError } = await supabase.rpc('increment_cache_hits', { p_key: cacheKey });
      if (rpcError) {
        await supabase
          .from('ai_cache')
          .update({ hit_count: (value?.hit_count || 0) + 1 })
          .eq('cache_key', cacheKey);
      }
    } catch { /* non-fatal */ }

    return value?.response as T || null;
  } catch {
    return null;
  }
}

export async function setCachedResponse(
  cacheKey: string,
  response: unknown,
  feature: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<void> {
  try {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    await supabase.from('ai_cache').upsert({
      cache_key: cacheKey,
      cache_value: { response, expires_at: expiresAt },
      feature,
      ttl_seconds: ttlSeconds,
      expires_at: expiresAt,
      hit_count: 0,
    }, { onConflict: 'cache_key' });
  } catch (err) {
    console.error('setCachedResponse error:', err);
  }
}

export async function invalidateCache(feature?: string): Promise<void> {
  try {
    if (feature) {
      await supabase.from('ai_cache').delete().eq('feature', feature);
    } else {
      await supabase.from('ai_cache').delete().lt('expires_at', new Date().toISOString());
    }
  } catch (err) {
    console.error('invalidateCache error:', err);
  }
}

export async function getCacheStats(): Promise<{ totalEntries: number; totalHits: number; byFeature: Record<string, number> }> {
  try {
    const { data } = await supabase
      .from('ai_cache')
      .select('feature, hit_count')
      .gt('expires_at', new Date().toISOString());

    const rows = data || [];
    const byFeature: Record<string, number> = {};
    let totalHits = 0;

    for (const row of rows as any[]) {
      byFeature[row.feature] = (byFeature[row.feature] || 0) + 1;
      totalHits += row.hit_count || 0;
    }

    return { totalEntries: rows.length, totalHits, byFeature };
  } catch {
    return { totalEntries: 0, totalHits: 0, byFeature: {} };
  }
}
