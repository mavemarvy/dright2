// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT Groq AI Frontend Service
// All AI calls go through the secure ai-proxy edge function.
// GROQ_API_KEY is never exposed to the frontend.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase';

const EDGE_FUNCTION = 'ai-proxy';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AIGroqResult {
  success: boolean;
  content: string;
  tokens: number;
  model: string;
  provider?: string;
  latencyMs: number;
  error?: string;
  fallbackUsed?: boolean;
}

export interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface SmartSearchResult {
  keywords: string[];
  category?: string;
  intent?: string;
  ranked_terms?: { term: string; score: number }[];
}

export interface ModerationResult {
  flagged: boolean;
  categories: string[];
  severity: 'low' | 'medium' | 'high';
  reasons: string[];
  recommendation: 'approve' | 'review' | 'reject';
}

export interface RecommendationResult {
  recommendations: { title: string; reason: string; category: string; keywords: string[] }[];
  summary: string;
}

// ─── In-Memory Prompt Cache ──────────────────────────────────────────────────

const promptCache = new Map<string, { result: AIGroqResult; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCached(cacheKey: string): AIGroqResult | null {
  const entry = promptCache.get(cacheKey);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
    return entry.result;
  }
  if (entry) promptCache.delete(cacheKey);
  return null;
}

function setCached(cacheKey: string, result: AIGroqResult): void {
  if (promptCache.size > 100) {
    const oldest = Array.from(promptCache.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
    if (oldest) promptCache.delete(oldest[0]);
  }
  promptCache.set(cacheKey, { result, timestamp: Date.now() });
}

// ─── Core Request Function ───────────────────────────────────────────────────

async function callAIProxy(params: {
  feature: string;
  prompt: string;
  context?: string;
  messages?: GroqMessage[];
  userId?: string;
  conversationId?: string;
  locale?: string;
  useCache?: boolean;
}): Promise<AIGroqResult> {
  const cacheKey = params.useCache
    ? `${params.feature}:${params.prompt}:${params.context || ''}`
    : '';

  if (cacheKey) {
    const cached = getCached(cacheKey);
    if (cached) return cached;
  }

  try {
    const { data, error } = await supabase.functions.invoke(EDGE_FUNCTION, {
      body: {
        feature: params.feature,
        prompt: params.prompt,
        context: params.context,
        messages: params.messages,
        userId: params.userId,
        conversationId: params.conversationId,
        locale: params.locale,
      },
    });

    if (error) {
      return {
        success: false,
        content: '',
        tokens: 0,
        model: '',
        latencyMs: 0,
        error: error.message || 'Failed to call AI service',
      };
    }

    const result = data as AIGroqResult;

    if (result.success && cacheKey) {
      setCached(cacheKey, result);
    }

    return result;
  } catch (err) {
    return {
      success: false,
      content: '',
      tokens: 0,
      model: '',
      provider: 'none',
      latencyMs: 0,
      error: err instanceof Error ? err.message : 'Network error calling AI service',
    };
  }
}

// ─── Public API: Reusable Groq Service ───────────────────────────────────────

export async function generateText(
  prompt: string,
  context?: string,
  userId?: string,
): Promise<AIGroqResult> {
  return callAIProxy({ feature: 'generate-text', prompt, context, userId, useCache: true });
}

export async function generateProductDescription(
  productName: string,
  category: string,
  keyFeatures: string,
  userId?: string,
): Promise<AIGroqResult> {
  const prompt = `Product Name: ${productName}\nCategory: ${category}\nKey Features: ${keyFeatures}\n\nGenerate a compelling product description for this marketplace listing.`;
  return callAIProxy({ feature: 'product-description', prompt, userId, useCache: true });
}

export async function chat(
  message: string,
  history: GroqMessage[],
  userId?: string,
  conversationId?: string,
): Promise<AIGroqResult> {
  return callAIProxy({
    feature: 'chat',
    prompt: message,
    messages: history,
    userId,
    conversationId,
    useCache: false,
  });
}

export async function summarize(
  content: string,
  userId?: string,
): Promise<AIGroqResult> {
  return callAIProxy({ feature: 'summarize', prompt: content, userId, useCache: true });
}

export async function translate(
  content: string,
  targetLanguage: string,
  userId?: string,
): Promise<AIGroqResult> {
  const prompt = `Translate the following text to ${targetLanguage}:\n\n${content}`;
  return callAIProxy({ feature: 'translate', prompt, userId, useCache: true });
}

export async function rewrite(
  content: string,
  userId?: string,
  context?: string,
): Promise<AIGroqResult> {
  return callAIProxy({ feature: 'rewrite', prompt: content, context, userId, useCache: true });
}

export async function recommend(
  query: string,
  context: string,
  userId?: string,
): Promise<AIGroqResult> {
  return callAIProxy({ feature: 'recommend', prompt: query, context, userId, useCache: true });
}

export async function smartSearch(
  query: string,
  userId?: string,
): Promise<SmartSearchResult | null> {
  const result = await callAIProxy({ feature: 'search', prompt: query, userId, useCache: true });
  if (!result.success) return null;
  try {
    return JSON.parse(result.content) as SmartSearchResult;
  } catch {
    return null;
  }
}

export async function moderateContent(
  content: string,
  userId?: string,
): Promise<ModerationResult | null> {
  const result = await callAIProxy({ feature: 'moderate', prompt: content, userId, useCache: false });
  if (!result.success) return null;
  try {
    return JSON.parse(result.content) as ModerationResult;
  } catch {
    return null;
  }
}

// ─── Unified Health Check (calls ai-health edge function) ───────────────────

export interface AIHealthResponse {
  success: boolean;
  provider: string;
  configured: boolean;
  error?: string;
  providers?: {
    groq: { provider: string; configured: boolean; model: string; success: boolean; error?: string };
    gemini: { provider: string; configured: boolean; model: string; success: boolean; error?: string };
  };
  primary?: string;
  fallback?: string;
  any_available?: boolean;
}

export async function checkAIHealth(): Promise<{ success: boolean; provider: string; configured: boolean; model?: string; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke(EDGE_FUNCTION, { method: 'GET' });
    if (error || !data) return { success: false, provider: 'Groq', configured: false };
    const groqProvider = data.providers?.groq;
    return {
      success: data.success ?? false,
      provider: 'Groq',
      configured: groqProvider?.configured ?? false,
      model: groqProvider?.model || 'llama-3.3-70b',
    };
  } catch {
    return { success: false, provider: 'Groq', configured: false };
  }
}

export async function checkAllProvidersHealth(): Promise<AIHealthResponse> {
  try {
    const { data, error } = await supabase.functions.invoke('ai-health', { method: 'GET' });
    if (error || !data) {
      return { success: false, provider: 'none', configured: false, error: 'Failed to reach ai-health endpoint' };
    }
    return data as AIHealthResponse;
  } catch {
    return { success: false, provider: 'none', configured: false, error: 'Network error' };
  }
}

// ─── Gemini Test (dedicated Gemini endpoint) ─────────────────────────────────

export async function testGemini(userId?: string): Promise<AIGroqResult> {
  try {
    const { data, error } = await supabase.functions.invoke('gemini-proxy', {
      body: { feature: 'test', prompt: 'Hello DRIGHT', userId },
    });
    if (error || !data) {
      return { success: false, content: '', tokens: 0, model: '', provider: 'gemini', latencyMs: 0, error: error?.message || 'Gemini test failed' };
    }
    return data as AIGroqResult;
  } catch (err) {
    return { success: false, content: '', tokens: 0, model: '', provider: 'gemini', latencyMs: 0, error: err instanceof Error ? err.message : 'Network error' };
  }
}

export async function checkGeminiHealth(): Promise<{ success: boolean; provider: string; configured: boolean; model?: string; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('gemini-proxy', { method: 'GET' });
    if (error || !data) return { success: false, provider: 'Google Gemini', configured: false };
    return data;
  } catch {
    return { success: false, provider: 'Google Gemini', configured: false };
  }
}

// ─── AI Test ─────────────────────────────────────────────────────────────────

export async function testAI(userId?: string): Promise<AIGroqResult> {
  return callAIProxy({ feature: 'test', prompt: 'Hello DRIGHT', userId, useCache: false });
}

// ─── Usage Analytics (for admin dashboard) ───────────────────────────────────

export async function getAIUsageStats(days: number = 7): Promise<{
  totalRequests: number;
  totalTokens: number;
  avgLatency: number;
  errors: number;
  estimatedCost: number;
  byFeature: Record<string, { requests: number; tokens: number }>;
  byProvider: Record<string, { requests: number; tokens: number; errors: number; cost: number }>;
  dailyRequests: { date: string; count: number }[];
}> {
  try {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('ai_usage')
      .select('feature, tokens, latency_ms, success, created_at, provider, estimated_cost')
      .gte('created_at', since)
      .order('created_at', { ascending: true });

    if (error || !data) {
      return { totalRequests: 0, totalTokens: 0, avgLatency: 0, errors: 0, estimatedCost: 0, byFeature: {}, byProvider: {}, dailyRequests: [] };
    }

    const rows = data as { feature: string; tokens: number; latency_ms: number; success: boolean; created_at: string; provider: string; estimated_cost: string | number }[];
    const totalRequests = rows.length;
    const totalTokens = rows.reduce((s, r) => s + r.tokens, 0);
    const avgLatency = totalRequests > 0 ? Math.round(rows.reduce((s, r) => s + r.latency_ms, 0) / totalRequests) : 0;
    const errors = rows.filter((r) => !r.success).length;
    const estimatedCost = rows.reduce((s, r) => s + Number(r.estimated_cost || 0), 0);

    const byFeature: Record<string, { requests: number; tokens: number }> = {};
    for (const r of rows) {
      if (!byFeature[r.feature]) byFeature[r.feature] = { requests: 0, tokens: 0 };
      byFeature[r.feature].requests++;
      byFeature[r.feature].tokens += r.tokens;
    }

    const byProvider: Record<string, { requests: number; tokens: number; errors: number; cost: number }> = {};
    for (const r of rows) {
      const p = r.provider || 'groq';
      if (!byProvider[p]) byProvider[p] = { requests: 0, tokens: 0, errors: 0, cost: 0 };
      byProvider[p].requests++;
      byProvider[p].tokens += r.tokens;
      if (!r.success) byProvider[p].errors++;
      byProvider[p].cost += Number(r.estimated_cost || 0);
    }

    const dailyMap = new Map<string, number>();
    for (const r of rows) {
      const date = r.created_at.slice(0, 10);
      dailyMap.set(date, (dailyMap.get(date) || 0) + 1);
    }
    const dailyRequests = Array.from(dailyMap.entries()).map(([date, count]) => ({ date, count }));

    return { totalRequests, totalTokens, avgLatency, errors, estimatedCost, byFeature, byProvider, dailyRequests };
  } catch {
    return { totalRequests: 0, totalTokens: 0, avgLatency: 0, errors: 0, estimatedCost: 0, byFeature: {}, byProvider: {}, dailyRequests: [] };
  }
}
