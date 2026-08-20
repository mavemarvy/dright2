import { supabase } from '../supabase';

export type MemoryType = 'preference' | 'insight' | 'faq' | 'behavior' | 'context';
export type MemoryScope = 'user' | 'seller' | 'buyer' | 'affiliate' | 'admin';
export type MemorySource = 'conversation' | 'behavior' | 'explicit' | 'inferred';

export interface AIMemory {
  id: string; memory_type: MemoryType; scope: MemoryScope; key: string;
  value: Record<string, any>; confidence: number; source: MemorySource;
  access_count: number; last_accessed_at: string | null; updated_at: string;
}

export async function saveMemory(key: string, value: Record<string, any>, options?: {
  memory_type?: MemoryType; scope?: MemoryScope; confidence?: number; source?: MemorySource;
}): Promise<string | null> {
  const { data, error } = await supabase.rpc('save_ai_memory', {
    p_key: key, p_value: value,
    p_memory_type: options?.memory_type || 'context',
    p_scope: options?.scope || 'user',
    p_confidence: options?.confidence ?? 1.0,
    p_source: options?.source || 'inferred',
  });
  if (error) { console.error('Failed to save AI memory:', error); return null; }
  return data as string;
}

export async function getMemory(scope: MemoryScope = 'user', memoryType?: MemoryType): Promise<AIMemory[]> {
  const { data, error } = await supabase.rpc('get_ai_memory', { p_scope: scope, p_memory_type: memoryType || null });
  if (error) { console.error('Failed to get AI memory:', error); return []; }
  return (data as AIMemory[]) || [];
}

export async function searchMemory(query: string): Promise<AIMemory[]> {
  const { data, error } = await supabase.rpc('search_ai_memory', { p_query: query });
  if (error) { console.error('Failed to search AI memory:', error); return []; }
  return (data as AIMemory[]) || [];
}

export async function deleteMemory(id: string): Promise<void> {
  const { error } = await supabase.from('ai_memory').delete().eq('id', id);
  if (error) throw error;
}

export async function updateMemory(id: string, updates: { value?: Record<string, any>; confidence?: number }): Promise<void> {
  const { error } = await supabase.from('ai_memory').update(updates).eq('id', id);
  if (error) throw error;
}

export function buildMemoryContext(memories: AIMemory[]): string {
  if (!memories.length) return '';
  const lines = memories.map(m => {
    const valStr = typeof m.value === 'object' ? JSON.stringify(m.value) : String(m.value);
    return `- ${m.key}: ${valStr} (confidence: ${m.confidence})`;
  });
  return `User memories:\n${lines.join('\n')}`;
}

export async function rememberPreference(key: string, value: any, scope: MemoryScope = 'user'): Promise<void> {
  await saveMemory(key, { value }, { memory_type: 'preference', scope, source: 'explicit', confidence: 1.0 });
}
export async function rememberBehavior(key: string, value: any, scope: MemoryScope = 'user'): Promise<void> {
  await saveMemory(key, { value }, { memory_type: 'behavior', scope, source: 'behavior', confidence: 0.7 });
}
export async function rememberInsight(key: string, value: any, scope: MemoryScope = 'user', confidence = 0.8): Promise<void> {
  await saveMemory(key, { value }, { memory_type: 'insight', scope, source: 'inferred', confidence });
}
