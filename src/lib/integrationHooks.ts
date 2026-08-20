import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import type {
  IntegrationProvider,
  IntegrationProviderSetting,
  IntegrationProviderLog,
  IntegrationHealthCheck,
  IntegrationWebhook,
  IntegrationApiKey,
  IntegrationUsageStat,
  ProviderCategory,
} from './integrationTypes';

const ensure = <T,>(data: T | null | undefined, fallback: T): T => data ?? fallback;

// ─── Providers ──────────────────────────────────────────────────────────
export function useIntegrationProviders(categoryFilter?: ProviderCategory | 'all') {
  const [providers, setProviders] = useState<IntegrationProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('integration_providers')
      .select('*')
      .eq('is_deleted', false)
      .order('display_order', { ascending: true });
    if (categoryFilter && categoryFilter !== 'all') query = query.eq('category', categoryFilter);
    const { data, error } = await query;
    if (error) setError(error.message);
    else { setProviders(ensure(data, [])); setError(null); }
    setLoading(false);
  }, [categoryFilter]);

  useEffect(() => { void fetch(); }, [fetch]);
  return { providers, loading, error, refetch: fetch };
}

export function useIntegrationProvider(id: string | null) {
  const [provider, setProvider] = useState<IntegrationProvider | null>(null);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!id) { setProvider(null); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('integration_providers')
      .select('*')
      .eq('id', id)
      .eq('is_deleted', false)
      .maybeSingle();
    if (!error) setProvider(data);
    setLoading(false);
  }, [id]);

  useEffect(() => { void fetch(); }, [fetch]);
  return { provider, loading, refetch: fetch };
}

export async function updateProvider(id: string, updates: Partial<IntegrationProvider>): Promise<void> {
  const { error } = await supabase.from('integration_providers').update({
    ...updates,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw error;
}

export async function toggleProviderEnabled(id: string, enabled: boolean): Promise<void> {
  const { error } = await supabase.from('integration_providers').update({
    is_enabled: enabled,
    status: enabled ? 'active' : 'inactive',
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw error;
}

export async function setDefaultProvider(category: string, providerId: string): Promise<void> {
  const { error: clearErr } = await supabase.from('integration_providers')
    .update({ is_default: false, updated_at: new Date().toISOString() })
    .eq('category', category)
    .eq('is_default', true);
  if (clearErr) throw clearErr;
  const { error } = await supabase.from('integration_providers')
    .update({ is_default: true, updated_at: new Date().toISOString() })
    .eq('id', providerId);
  if (error) throw error;
}

// ─── Provider Settings ──────────────────────────────────────────────────
export function useProviderSettings(providerId: string | null) {
  const [settings, setSettings] = useState<IntegrationProviderSetting[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!providerId) { setSettings([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('integration_provider_settings')
      .select('*')
      .eq('provider_id', providerId)
      .eq('is_deleted', false)
      .order('setting_key', { ascending: true });
    if (!error) setSettings(ensure(data, []));
    setLoading(false);
  }, [providerId]);

  useEffect(() => { void fetch(); }, [fetch]);
  return { settings, loading, refetch: fetch };
}

export async function upsertSetting(providerId: string, key: string, value: string, isSecret: boolean): Promise<void> {
  const { error } = await supabase.from('integration_provider_settings').upsert({
    provider_id: providerId,
    setting_key: key,
    setting_value: value,
    is_secret: isSecret,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'provider_id,setting_key' });
  if (error) throw error;
}

export async function saveProviderSettings(providerId: string, settings: Record<string, string>, schema: Record<string, { type?: string }>): Promise<void> {
  const rows = Object.entries(settings).map(([key, value]) => ({
    provider_id: providerId,
    setting_key: key,
    setting_value: value,
    is_secret: schema[key]?.type === 'secret',
    updated_at: new Date().toISOString(),
  }));
  if (rows.length === 0) return;
  const { error } = await supabase.from('integration_provider_settings').upsert(rows, { onConflict: 'provider_id,setting_key' });
  if (error) throw error;
}

// ─── Provider Logs ──────────────────────────────────────────────────────
export function useProviderLogs(limit = 100, providerIdFilter?: string) {
  const [logs, setLogs] = useState<IntegrationProviderLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('integration_provider_logs')
      .select('*, admin:users!integration_provider_logs_admin_id_fkey(id, email, full_name, username), provider:integration_providers!integration_provider_logs_provider_id_fkey(id, provider_name, provider_key)')
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (providerIdFilter) query = query.eq('provider_id', providerIdFilter);
    const { data, error } = await query;
    if (!error) setLogs(ensure(data, []));
    setLoading(false);
  }, [limit, providerIdFilter]);

  useEffect(() => { void fetch(); }, [fetch]);
  return { logs, loading, refetch: fetch };
}

export async function logProviderEvent(input: {
  provider_id?: string;
  provider_key?: string;
  admin_id?: string;
  action: string;
  result?: string;
  error_message?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await supabase.from('integration_provider_logs').insert({
    provider_id: input.provider_id ?? null,
    provider_key: input.provider_key ?? null,
    admin_id: input.admin_id ?? null,
    action: input.action,
    result: input.result ?? 'success',
    error_message: input.error_message ?? null,
    metadata: input.metadata ?? {},
  });
  if (error) throw error;
}

// ─── Health Checks ──────────────────────────────────────────────────────
export function useHealthChecks(providerId?: string) {
  const [checks, setChecks] = useState<IntegrationHealthCheck[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('integration_health_checks')
      .select('*')
      .eq('is_deleted', false)
      .order('checked_at', { ascending: false })
      .limit(50);
    if (providerId) query = query.eq('provider_id', providerId);
    const { data, error } = await query;
    if (!error) setChecks(ensure(data, []));
    setLoading(false);
  }, [providerId]);

  useEffect(() => { void fetch(); }, [fetch]);
  return { checks, loading, refetch: fetch };
}

export async function recordHealthCheck(input: {
  provider_id: string;
  health_status: 'healthy' | 'degraded' | 'down' | 'unknown';
  response_time_ms?: number;
  error_message?: string;
  checked_by?: string;
}): Promise<void> {
  const { error } = await supabase.from('integration_health_checks').insert({
    provider_id: input.provider_id,
    health_status: input.health_status,
    response_time_ms: input.response_time_ms ?? null,
    error_message: input.error_message ?? null,
    checked_by: input.checked_by ?? null,
  });
  if (error) throw error;
}

// ─── Webhooks ───────────────────────────────────────────────────────────
export function useWebhooks(providerId: string | null) {
  const [webhooks, setWebhooks] = useState<IntegrationWebhook[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!providerId) { setWebhooks([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('integration_webhooks')
      .select('*')
      .eq('provider_id', providerId)
      .eq('is_deleted', false);
    if (!error) setWebhooks(ensure(data, []));
    setLoading(false);
  }, [providerId]);

  useEffect(() => { void fetch(); }, [fetch]);
  return { webhooks, loading, refetch: fetch };
}

export async function upsertWebhook(providerId: string, input: {
  webhook_url?: string;
  callback_url?: string;
  webhook_secret?: string;
  expected_events?: string[];
}): Promise<void> {
  const { error } = await supabase.from('integration_webhooks').upsert({
    provider_id: providerId,
    webhook_url: input.webhook_url ?? null,
    callback_url: input.callback_url ?? null,
    webhook_secret: input.webhook_secret ?? null,
    expected_events: input.expected_events ?? [],
    status: 'active',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'provider_id' });
  if (error) throw error;
}

// ─── API Keys ───────────────────────────────────────────────────────────
export function useApiKeys(providerId: string | null) {
  const [keys, setKeys] = useState<IntegrationApiKey[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!providerId) { setKeys([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('integration_api_keys')
      .select('*')
      .eq('provider_id', providerId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });
    if (!error) setKeys(ensure(data, []));
    setLoading(false);
  }, [providerId]);

  useEffect(() => { void fetch(); }, [fetch]);
  return { keys, loading, refetch: fetch };
}

export async function rotateApiKey(keyId: string, newValue: string): Promise<void> {
  const { error } = await supabase.from('integration_api_keys').update({
    key_value: newValue,
    last_rotated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', keyId);
  if (error) throw error;
}

// ─── Usage Statistics ───────────────────────────────────────────────────
export function useUsageStats(providerId?: string, days = 30) {
  const [stats, setStats] = useState<IntegrationUsageStat[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    const since = new Date();
    since.setDate(since.getDate() - days);
    let query = supabase
      .from('integration_usage_statistics')
      .select('*')
      .eq('is_deleted', false)
      .gte('period_date', since.toISOString().split('T')[0])
      .order('period_date', { ascending: true });
    if (providerId) query = query.eq('provider_id', providerId);
    const { data, error } = await query;
    if (!error) setStats(ensure(data, []));
    setLoading(false);
  }, [providerId, days]);

  useEffect(() => { void fetch(); }, [fetch]);
  return { stats, loading, refetch: fetch };
}

// ─── Test Connection ────────────────────────────────────────────────────
export async function testProviderConnection(
  provider: IntegrationProvider,
  adminId: string,
): Promise<{ success: boolean; responseTimeMs: number; error: string | null }> {
  const start = Date.now();
  try {
    let endpoint = '';
    if (provider.category === 'ai') endpoint = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-health`;
    else if (provider.category === 'payment') endpoint = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/env-health`;
    else endpoint = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/env-health`;

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    const responseTimeMs = Date.now() - start;
    const success = response.ok;
    const error = success ? null : `HTTP ${response.status}`;

    await recordHealthCheck({
      provider_id: provider.id,
      health_status: success ? 'healthy' : 'down',
      response_time_ms: responseTimeMs,
      error_message: error ?? undefined,
      checked_by: adminId,
    });

    await logProviderEvent({
      provider_id: provider.id,
      provider_key: provider.provider_key,
      admin_id: adminId,
      action: success ? 'connection_tested' : 'connection_failed',
      result: success ? 'success' : 'failure',
      error_message: error ?? undefined,
    });

    await updateProvider(provider.id, { is_connected: success });

    return { success, responseTimeMs, error };
  } catch (err) {
    const responseTimeMs = Date.now() - start;
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    await recordHealthCheck({
      provider_id: provider.id,
      health_status: 'down',
      response_time_ms: responseTimeMs,
      error_message: errorMsg,
      checked_by: adminId,
    });
    await logProviderEvent({
      provider_id: provider.id,
      provider_key: provider.provider_key,
      admin_id: adminId,
      action: 'connection_failed',
      result: 'failure',
      error_message: errorMsg,
    });
    return { success: false, responseTimeMs, error: errorMsg };
  }
}
