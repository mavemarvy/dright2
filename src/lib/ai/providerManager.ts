import { supabase } from '../supabase';

export interface AIProviderModel { model: string; label: string; }
export interface AIProviderConfig {
  provider: string; display_name: string; enabled: boolean; is_default: boolean;
  fallback_priority: number; default_model: string; available_models: AIProviderModel[];
  max_tokens: number; temperature: number; timeout_ms: number;
  supports_streaming: boolean; supports_vision: boolean; supports_images: boolean;
  health_status: string; last_health_check: string | null;
}
export interface AIRateLimit {
  tier: string; feature: string; requests_per_minute: number; requests_per_hour: number;
  requests_per_day: number; burst_limit: number; cooldown_seconds: number;
}

let cachedProviders: AIProviderConfig[] | null = null;
let cachedAt = 0;
const CACHE_TTL = 60_000;

export async function getProviderConfig(force = false): Promise<AIProviderConfig[]> {
  if (!force && cachedProviders && Date.now() - cachedAt < CACHE_TTL) return cachedProviders;
  const { data, error } = await supabase.rpc('get_ai_provider_config');
  if (error) throw error;
  cachedProviders = (data as AIProviderConfig[]) || [];
  cachedAt = Date.now();
  return cachedProviders;
}

export function getDefaultProvider(config: AIProviderConfig[]): AIProviderConfig | undefined {
  return config.find(p => p.is_default) || config[0];
}

export function getFallbackChain(config: AIProviderConfig[]): AIProviderConfig[] {
  return [...config].filter(p => p.enabled).sort((a, b) => {
    if (a.is_default) return -1; if (b.is_default) return 1;
    return a.fallback_priority - b.fallback_priority;
  });
}

export async function getRateLimits(tier: string): Promise<AIRateLimit[]> {
  const { data, error } = await supabase.rpc('get_ai_rate_limits_for_tier', { p_tier: tier });
  if (error) throw error;
  return (data as AIRateLimit[]) || [];
}

export function getUserTier(role: string, isAdmin: boolean): string {
  if (isAdmin) return 'admin';
  if (role === 'premium' || role === 'seller_premium') return 'premium';
  return 'authenticated';
}

export function clearProviderCache(): void { cachedProviders = null; cachedAt = 0; }

export async function updateProviderConfig(provider: string, updates: Partial<AIProviderConfig>): Promise<void> {
  const { error } = await supabase.from('ai_provider_config').update(updates).eq('provider', provider);
  if (error) throw error;
  clearProviderCache();
}

export async function setDefaultProvider(provider: string): Promise<void> {
  await supabase.from('ai_provider_config').update({ is_default: false }).neq('provider', provider);
  await supabase.from('ai_provider_config').update({ is_default: true }).eq('provider', provider);
  clearProviderCache();
}

export async function updateRateLimit(tier: string, feature: string, updates: Partial<AIRateLimit>): Promise<void> {
  const { error } = await supabase.from('ai_rate_limits').update(updates).eq('tier', tier).eq('feature', feature);
  if (error) throw error;
}

export async function testProvider(provider: string, model: string): Promise<{ ok: boolean; latency: number; error?: string }> {
  const start = Date.now();
  try {
    const { error } = await supabase.functions.invoke('ai-proxy', { body: JSON.stringify({ feature: 'test', provider, model, prompt: 'Hello' }) });
    const latency = Date.now() - start;
    if (error) return { ok: false, latency, error: error.message };
    return { ok: true, latency };
  } catch (err: any) { return { ok: false, latency: Date.now() - start, error: err.message }; }
}
