import { supabase } from '../supabase';
import { getCacheStats } from './responseCache';

// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT AI Usage Analytics Service
//
// Expanded monitoring: daily requests, tokens, cost, latency, provider,
// fallback frequency, failures, cache hits, avg response time, popular prompts,
// feature usage, user usage.
// ─────────────────────────────────────────────────────────────────────────────

export interface AIAnalytics {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  avgLatency: number;
  errorRate: number;
  cacheHitRate: number;
  fallbackRate: number;
  dailyRequests: Array<{ date: string; count: number }>;
  byFeature: Array<{ feature: string; requests: number; tokens: number; cost: number }>;
  byProvider: Array<{ provider: string; requests: number; tokens: number; errors: number; avgLatency: number }>;
  popularPrompts: Array<{ prompt: string; count: number }>;
  topUsers: Array<{ userId: string; requests: number; tokens: number }>;
  cacheStats: { totalEntries: number; totalHits: number; byFeature: Record<string, number> };
}

export async function getAIAnalytics(days: number = 7): Promise<AIAnalytics> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data: usageRows, error } = await supabase
    .from('ai_usage')
    .select('*')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(10000);

  if (error) {
    console.error('getAIAnalytics error:', error);
    return getEmptyAnalytics();
  }

  const rows = (usageRows || []) as any[];
  const total = rows.length;
  const errors = rows.filter(r => r.success === false).length;
  const cacheHits = rows.filter(r => r.cache_hit === true).length;
  const fallbacks = rows.filter(r => r.fallback_used === true).length;
  const tokens = rows.reduce((s, r) => s + (r.tokens || 0), 0);
  const cost = rows.reduce((s, r) => s + Number(r.estimated_cost || 0), 0);
  const latencySum = rows.reduce((s, r) => s + (r.latency_ms || 0), 0);

  // Daily requests
  const dailyMap = new Map<string, number>();
  for (const r of rows) {
    const day = new Date(r.created_at).toISOString().split('T')[0];
    dailyMap.set(day, (dailyMap.get(day) || 0) + 1);
  }
  const dailyRequests = Array.from(dailyMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-30)
    .map(([date, count]) => ({ date, count }));

  // By feature
  const featureMap = new Map<string, { requests: number; tokens: number; cost: number }>();
  for (const r of rows) {
    const f = r.feature || 'unknown';
    const existing = featureMap.get(f) || { requests: 0, tokens: 0, cost: 0 };
    existing.requests++;
    existing.tokens += r.tokens || 0;
    existing.cost += Number(r.estimated_cost || 0);
    featureMap.set(f, existing);
  }
  const byFeature = Array.from(featureMap.entries())
    .map(([feature, stats]) => ({ feature, ...stats }))
    .sort((a, b) => b.requests - a.requests);

  // By provider
  const providerMap = new Map<string, { requests: number; tokens: number; errors: number; latencySum: number }>();
  for (const r of rows) {
    const p = r.provider || 'unknown';
    const existing = providerMap.get(p) || { requests: 0, tokens: 0, errors: 0, latencySum: 0 };
    existing.requests++;
    existing.tokens += r.tokens || 0;
    if (r.success === false) existing.errors++;
    existing.latencySum += r.latency_ms || 0;
    providerMap.set(p, existing);
  }
  const byProvider = Array.from(providerMap.entries())
    .map(([provider, stats]) => ({
      provider,
      requests: stats.requests,
      tokens: stats.tokens,
      errors: stats.errors,
      avgLatency: stats.requests > 0 ? Math.round(stats.latencySum / stats.requests) : 0,
    }))
    .sort((a, b) => b.requests - a.requests);

  // Popular prompts (top 10 most repeated)
  const promptMap = new Map<string, number>();
  for (const r of rows) {
    if (r.prompt) {
      const key = r.prompt.slice(0, 100);
      promptMap.set(key, (promptMap.get(key) || 0) + 1);
    }
  }
  const popularPrompts = Array.from(promptMap.entries())
    .filter(([, count]) => count > 1)
    .map(([prompt, count]) => ({ prompt, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Top users
  const userMap = new Map<string, { requests: number; tokens: number }>();
  for (const r of rows) {
    if (r.user_id) {
      const existing = userMap.get(r.user_id) || { requests: 0, tokens: 0 };
      existing.requests++;
      existing.tokens += r.tokens || 0;
      userMap.set(r.user_id, existing);
    }
  }
  const topUsers = Array.from(userMap.entries())
    .map(([userId, stats]) => ({ userId, ...stats }))
    .sort((a, b) => b.requests - a.requests)
    .slice(0, 10);

  // Cache stats
  const cacheStats = await getCacheStats();

  return {
    totalRequests: total,
    totalTokens: tokens,
    totalCost: cost,
    avgLatency: total > 0 ? Math.round(latencySum / total) : 0,
    errorRate: total > 0 ? (errors / total) * 100 : 0,
    cacheHitRate: total > 0 ? (cacheHits / total) * 100 : 0,
    fallbackRate: total > 0 ? (fallbacks / total) * 100 : 0,
    dailyRequests,
    byFeature,
    byProvider,
    popularPrompts,
    topUsers,
    cacheStats,
  };
}

function getEmptyAnalytics(): AIAnalytics {
  return {
    totalRequests: 0,
    totalTokens: 0,
    totalCost: 0,
    avgLatency: 0,
    errorRate: 0,
    cacheHitRate: 0,
    fallbackRate: 0,
    dailyRequests: [],
    byFeature: [],
    byProvider: [],
    popularPrompts: [],
    topUsers: [],
    cacheStats: { totalEntries: 0, totalHits: 0, byFeature: {} },
  };
}
