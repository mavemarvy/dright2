import { supabase } from './supabase';

let cachedEnabled = true;
let cachedMessage = 'AI features are temporarily turned off by DRIGHT.';
let cachedAt = 0;
const TTL = 15_000;

export async function getAIMasterStatus(force = false): Promise<{ enabled: boolean; disabledMessage: string }> {
  if (!force && Date.now() - cachedAt < TTL) {
    return { enabled: cachedEnabled, disabledMessage: cachedMessage };
  }

  const { data, error } = await supabase.rpc('get_ai_master_status');
  if (!error && data && typeof data === 'object') {
    const row = data as Record<string, unknown>;
    cachedEnabled = row.enabled !== false;
    cachedMessage = String(row.disabled_message || 'AI features are temporarily turned off by DRIGHT.');
    cachedAt = Date.now();
  }

  return { enabled: cachedEnabled, disabledMessage: cachedMessage };
}

export async function assertAIEnabled(): Promise<void> {
  const status = await getAIMasterStatus();
  if (!status.enabled) throw new Error(status.disabledMessage);
}

export function clearAIMasterCache() {
  cachedAt = 0;
}
