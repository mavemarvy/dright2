import { supabase } from '../supabase';

export interface AIPrompt {
  id: string; key: string; title: string; description: string;
  system_prompt: string; user_prompt_template: string; version: number;
  is_active: boolean; feature: string; tags: string[];
  variables: Array<{ name: string; description: string }>;
  model_override: string | null; temperature_override: number | null;
  max_tokens_override: number | null; created_by: string | null; updated_by: string | null;
  created_at: string; updated_at: string;
}
export interface AIPromptVersion {
  id: string; prompt_id: string; version: number; system_prompt: string;
  user_prompt_template: string; changed_by: string | null; change_note: string; created_at: string;
}

export async function fetchPrompts(): Promise<AIPrompt[]> {
  const { data, error } = await supabase.from('ai_prompts').select('*').order('updated_at', { ascending: false });
  if (error) throw error;
  return (data as AIPrompt[]) || [];
}

export async function fetchPromptVersions(promptId: string): Promise<AIPromptVersion[]> {
  const { data, error } = await supabase.from('ai_prompt_versions').select('*').eq('prompt_id', promptId).order('version', { ascending: false });
  if (error) throw error;
  return (data as AIPromptVersion[]) || [];
}

export async function getPromptByKey(key: string): Promise<AIPrompt | null> {
  const { data, error } = await supabase.rpc('get_ai_prompt_by_key', { p_key: key });
  if (error) throw error;
  return (data as AIPrompt) || null;
}

export async function createPrompt(prompt: {
  key: string; title: string; description?: string; system_prompt: string;
  user_prompt_template?: string; feature?: string; tags?: string[];
  variables?: Array<{ name: string; description: string }>;
  model_override?: string; temperature_override?: number; max_tokens_override?: number;
}): Promise<AIPrompt | null> {
  const { data, error } = await supabase.from('ai_prompts').insert({
    key: prompt.key, title: prompt.title, description: prompt.description || '',
    system_prompt: prompt.system_prompt, user_prompt_template: prompt.user_prompt_template || '',
    feature: prompt.feature || 'chat', tags: prompt.tags || [], variables: prompt.variables || [],
    model_override: prompt.model_override || null, temperature_override: prompt.temperature_override || null,
    max_tokens_override: prompt.max_tokens_override || null,
  }).select('*').single();
  if (error) throw error;
  return data as AIPrompt;
}

export async function updatePrompt(id: string, updates: Partial<Pick<AIPrompt, 'title' | 'description' | 'system_prompt' | 'user_prompt_template' | 'is_active' | 'feature' | 'tags' | 'variables' | 'model_override' | 'temperature_override' | 'max_tokens_override'>>): Promise<void> {
  const { error } = await supabase.from('ai_prompts').update(updates).eq('id', id);
  if (error) throw error;
}

export async function deletePrompt(id: string): Promise<void> {
  const { error } = await supabase.from('ai_prompts').delete().eq('id', id);
  if (error) throw error;
}

export function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? '');
}

export function extractTemplateVariables(template: string): string[] {
  const matches = template.match(/\{\{(\w+)\}\}/g) || [];
  return [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '')))];
}
