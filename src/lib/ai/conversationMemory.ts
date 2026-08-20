import { supabase } from '../supabase';

// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT AI Conversation Memory Service
//
// Persistent cross-session conversation storage. Survives page reloads.
// Supports: create, resume, rename, delete, search, archive, export.
// ─────────────────────────────────────────────────────────────────────────────

export interface AIConversation {
  id: string;
  user_id: string;
  title: string;
  archived: boolean;
  summary: string | null;
  provider: string;
  tokens_total: number;
  cost_total: number;
  created_at: string;
  updated_at: string;
}

export interface AIConversationMessage {
  id: string;
  conversation_id: string | null;
  user_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tokens: number;
  model: string;
  provider: string;
  feature: string;
  latency_ms: number;
  created_at: string;
}

export async function createConversation(userId: string, title = 'New Conversation'): Promise<AIConversation | null> {
  const { data, error } = await supabase
    .from('ai_conversations')
    .insert({ user_id: userId, title, context_type: 'chat' })
    .select('*')
    .single();
  if (error) { console.error('createConversation error:', error); return null; }
  return data as AIConversation;
}

export async function getConversations(userId: string, includeArchived = false): Promise<AIConversation[]> {
  let query = supabase.from('ai_conversations').select('*').eq('user_id', userId);
  if (!includeArchived) query = query.eq('archived', false);
  const { data, error } = await query.order('updated_at', { ascending: false });
  if (error) { console.error('getConversations error:', error); return []; }
  return (data || []) as AIConversation[];
}

export async function getConversationMessages(conversationId: string): Promise<AIConversationMessage[]> {
  const { data, error } = await supabase
    .from('ai_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (error) { console.error('getConversationMessages error:', error); return []; }
  return (data || []) as AIConversationMessage[];
}

export async function saveMessage(params: {
  conversationId: string;
  userId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tokens?: number;
  model?: string;
  provider?: string;
  feature?: string;
  latencyMs?: number;
}): Promise<void> {
  const { error } = await supabase.from('ai_messages').insert({
    conversation_id: params.conversationId,
    user_id: params.userId,
    role: params.role,
    content: params.content,
    tokens: params.tokens || 0,
    model: params.model || 'groq-llama-3.3-70b',
    provider: params.provider || 'groq',
    feature: params.feature || 'chat',
    latency_ms: params.latencyMs || 0,
  });
  if (error) console.error('saveMessage error:', error);
}

export async function renameConversation(conversationId: string, title: string): Promise<void> {
  const { error } = await supabase
    .from('ai_conversations')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('id', conversationId);
  if (error) console.error('renameConversation error:', error);
}

export async function archiveConversation(conversationId: string, archived = true): Promise<void> {
  const { error } = await supabase
    .from('ai_conversations')
    .update({ archived, updated_at: new Date().toISOString() })
    .eq('id', conversationId);
  if (error) console.error('archiveConversation error:', error);
}

export async function deleteConversation(conversationId: string): Promise<void> {
  // Delete messages first, then conversation
  await supabase.from('ai_messages').delete().eq('conversation_id', conversationId);
  const { error } = await supabase.from('ai_conversations').delete().eq('id', conversationId);
  if (error) console.error('deleteConversation error:', error);
}

export async function searchConversations(userId: string, query: string): Promise<AIConversation[]> {
  const { data, error } = await supabase
    .from('ai_conversations')
    .select('*')
    .eq('user_id', userId)
    .ilike('title', `%${query}%`)
    .order('updated_at', { ascending: false })
    .limit(20);
  if (error) { console.error('searchConversations error:', error); return []; }
  return (data || []) as AIConversation[];
}

export async function searchMessages(userId: string, query: string): Promise<AIConversationMessage[]> {
  const { data, error } = await supabase
    .from('ai_messages')
    .select('*')
    .eq('user_id', userId)
    .ilike('content', `%${query}%`)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) { console.error('searchMessages error:', error); return []; }
  return (data || []) as AIConversationMessage[];
}

export async function updateConversationStats(conversationId: string, tokensAdded: number, costAdded: number): Promise<void> {
  const { error } = await supabase.rpc('increment_conversation_stats', {
    p_conversation_id: conversationId,
    p_tokens: tokensAdded,
    p_cost: costAdded,
  }).then(
    () => ({ error: null }),
    (err: any) => ({ error: err }),
  ).then(async (result: any) => {
    if (result?.error) {
      // Fallback: read-then-write if RPC doesn't exist
      await supabase
        .from('ai_conversations')
        .update({
          tokens_total: tokensAdded,
          cost_total: costAdded,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId);
    }
    return result;
  });
  if (error) console.error('updateConversationStats error:', error);
}

export async function exportConversation(conversationId: string): Promise<string> {
  const { data: conv } = await supabase
    .from('ai_conversations')
    .select('*')
    .eq('id', conversationId)
    .maybeSingle();

  const messages = await getConversationMessages(conversationId);

  const exportData = {
    conversation: conv,
    messages: messages.map(m => ({
      role: m.role,
      content: m.content,
      timestamp: m.created_at,
      model: m.model,
      provider: m.provider,
      tokens: m.tokens,
    })),
    exportedAt: new Date().toISOString(),
  };

  return JSON.stringify(exportData, null, 2);
}
