// ─────────────────────────────────────────────────────────────────────────────
// Creator Campaign Library — data access layer
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase';
import type {
  Campaign, CampaignCategory, CampaignSubmission, CampaignWallet,
  CampaignTransaction, WorkerProfile, CreatorProfile, WorkerLevelDef,
  CampaignBookmark, LeaderboardEntry, CampaignMedia,
} from './campaignTypes';

// ─── Categories ───────────────────────────────────────────────────────────────

export async function fetchCategories(): Promise<CampaignCategory[]> {
  const { data, error } = await supabase
    .from('cc_categories')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');
  if (error) throw error;
  return (data || []) as CampaignCategory[];
}

// ─── Campaigns ───────────────────────────────────────────────────────────────

export async function fetchCampaigns(opts: {
  status?: string;
  category?: string;
  sortBy?: 'trending' | 'new' | 'reward' | 'ending';
  search?: string;
  limit?: number;
  offset?: number;
  creatorId?: string;
}): Promise<{ campaigns: Campaign[]; total: number }> {
  let query = supabase
    .from('cc_campaigns')
    .select('*, category:cc_categories(*)', { count: 'exact' });

  if (opts.status) query = query.eq('status', opts.status);
  else query = query.in('status', ['active', 'paused']);
  if (opts.category) query = query.eq('category_id', opts.category);
  if (opts.creatorId) query = query.eq('creator_id', opts.creatorId);
  if (opts.search) query = query.or(`name.ilike.%${opts.search}%,description.ilike.%${opts.search}%,tags.cs.{${opts.search}}`);

  switch (opts.sortBy) {
    case 'trending': query = query.order('workers_count', { ascending: false }); break;
    case 'new': query = query.order('created_at', { ascending: false }); break;
    case 'reward': query = query.order('reward_per_completion', { ascending: false }); break;
    case 'ending': query = query.order('ends_at', { ascending: true, nullsFirst: false }); break;
    default: query = query.order('is_featured', { ascending: false }).order('created_at', { ascending: false });
  }

  const limit = opts.limit ?? 12;
  const offset = opts.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { campaigns: (data || []) as unknown as Campaign[], total: count || 0 };
}

export async function fetchCampaignById(id: string): Promise<Campaign | null> {
  const { data, error } = await supabase
    .from('cc_campaigns')
    .select('*, category:cc_categories(*)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as Campaign | null;
}

export async function fetchCampaignMedia(campaignId: string): Promise<CampaignMedia[]> {
  const { data, error } = await supabase
    .from('cc_media')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('position');
  if (error) throw error;
  return (data || []) as CampaignMedia[];
}

export async function createCampaign(input: Partial<Campaign>): Promise<Campaign> {
  const { data, error } = await supabase
    .from('cc_campaigns')
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as Campaign;
}

export async function updateCampaign(id: string, patch: Partial<Campaign>): Promise<void> {
  const { error } = await supabase.from('cc_campaigns').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function recordView(campaignId: string, userId: string | null): Promise<void> {
  try {
    await supabase.from('cc_views').insert({ campaign_id: campaignId, user_id: userId });
    await supabase.rpc('increment_cc_view', { p_campaign_id: campaignId }).then(() => {});
  } catch { /* non-critical */ }
}

// ─── Submissions ──────────────────────────────────────────────────────────────

export async function fetchSubmissions(opts: {
  workerId?: string;
  campaignId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ submissions: CampaignSubmission[]; total: number }> {
  let query = supabase
    .from('cc_submissions')
    .select('*, campaign:cc_campaigns(*), worker:users!cc_submissions_worker_id_fkey(id, full_name, avatar_url)', { count: 'exact' });

  if (opts.workerId) query = query.eq('worker_id', opts.workerId);
  if (opts.campaignId) query = query.eq('campaign_id', opts.campaignId);
  if (opts.status) query = query.eq('status', opts.status);

  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;
  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { submissions: (data || []) as unknown as CampaignSubmission[], total: count || 0 };
}

export async function submitTask(campaignId: string, evidence: {
  evidence_urls: string[];
  evidence_text: string;
  evidence_links: string[];
  notes: string;
}): Promise<CampaignSubmission> {
  const { data: campaign } = await supabase.from('cc_campaigns').select('reward_per_completion').eq('id', campaignId).single();
  const reward = Number(campaign?.reward_per_completion) || 0;

  const { data, error } = await supabase
    .from('cc_submissions')
    .insert({
      campaign_id: campaignId,
      status: 'pending',
      evidence_urls: evidence.evidence_urls,
      evidence_text: evidence.evidence_text,
      evidence_links: evidence.evidence_links,
      notes: evidence.notes,
      reward_amount: reward,
    })
    .select()
    .single();
  if (error) throw error;

  // Increment campaign pending count
  await supabase.rpc('increment_cc_pending', { p_campaign_id: campaignId }).then(() => {});
  // Log history
  await supabase.from('cc_history').insert({ campaign_id: campaignId, action: 'submitted' }).then(() => {});

  return data as unknown as CampaignSubmission;
}

export async function reviewSubmission(submissionId: string, verdict: 'approved' | 'rejected' | 'revision_requested', notes: string): Promise<void> {
  const { data: sub } = await supabase
    .from('cc_submissions')
    .select('campaign_id, worker_id, reward_amount')
    .eq('id', submissionId)
    .single();
  if (!sub) throw new Error('Submission not found');

  const update: Record<string, unknown> = {
    status: verdict,
    creator_notes: notes,
    reviewed_at: new Date().toISOString(),
    reviewed_by: (await supabase.auth.getUser()).data.user?.id,
  };

  if (verdict === 'approved') {
    update.paid_at = new Date().toISOString();
    // Pay out reward to worker wallet
    const reward = Number(sub.reward_amount) || 0;
    const { data: wallet } = await supabase.from('cc_wallets').select('id, balance').eq('user_id', sub.worker_id).maybeSingle();
    if (wallet) {
      await supabase.from('cc_wallets').update({ balance: Number(wallet.balance) + reward, total_paid_out: supabase.rpc('add_paid', { w: wallet.id, amt: reward }) }).eq('id', wallet.id);
    }
    // Update campaign counts
    await supabase.rpc('approve_cc_submission', { p_campaign_id: sub.campaign_id, p_reward: reward }).then(() => {});
  } else if (verdict === 'rejected') {
    await supabase.rpc('reject_cc_submission', { p_campaign_id: sub.campaign_id }).then(() => {});
  }

  const { error } = await supabase.from('cc_submissions').update(update).eq('id', submissionId);
  if (error) throw error;

  // Notify worker
  await supabase.from('cc_notifications').insert({
    user_id: sub.worker_id,
    campaign_id: sub.campaign_id,
    type: `submission_${verdict}`,
    title: `Submission ${verdict.replace('_', ' ')}`,
    message: verdict === 'approved' ? 'Your task has been approved and reward paid to your wallet.' : `Your submission needs attention: ${notes || 'rejected'}`,
  }).then(() => {});
}

// ─── Wallet ───────────────────────────────────────────────────────────────────

export async function getOrCreateWallet(userId: string): Promise<CampaignWallet> {
  const { data: existing } = await supabase.from('cc_wallets').select('*').eq('user_id', userId).maybeSingle();
  if (existing) return existing as CampaignWallet;

  const { data, error } = await supabase.from('cc_wallets').insert({ user_id: userId }).select().single();
  if (error) throw error;
  return data as CampaignWallet;
}

export async function depositFunds(userId: string, amount: number): Promise<void> {
  const wallet = await getOrCreateWallet(userId);
  const newBalance = Number(wallet.balance) + amount;
  await supabase.from('cc_wallets').update({ balance: newBalance, total_deposited: Number(wallet.total_deposited) + amount, updated_at: new Date().toISOString() }).eq('id', wallet.id);
  await supabase.from('cc_transactions').insert({
    wallet_id: wallet.id,
    user_id: userId,
    type: 'deposit',
    amount,
    balance_after: newBalance,
    description: 'Wallet deposit',
  });
}

export async function withdrawFunds(userId: string, amount: number): Promise<void> {
  const wallet = await getOrCreateWallet(userId);
  if (Number(wallet.balance) < amount) throw new Error('Insufficient balance');
  const newBalance = Number(wallet.balance) - amount;
  await supabase.from('cc_wallets').update({ balance: newBalance, total_withdrawn: Number(wallet.total_withdrawn) + amount, updated_at: new Date().toISOString() }).eq('id', wallet.id);
  await supabase.from('cc_transactions').insert({
    wallet_id: wallet.id,
    user_id: userId,
    type: 'withdrawal',
    amount: -amount,
    balance_after: newBalance,
    description: 'Wallet withdrawal',
  });
}

export async function fetchTransactions(userId: string, limit = 50): Promise<CampaignTransaction[]> {
  const { data, error } = await supabase
    .from('cc_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []) as CampaignTransaction[];
}

// ─── Profiles ─────────────────────────────────────────────────────────────────

export async function getOrCreateWorkerProfile(userId: string): Promise<WorkerProfile> {
  const { data: existing } = await supabase.from('cc_worker_profiles').select('*').eq('user_id', userId).maybeSingle();
  if (existing) return existing as WorkerProfile;
  const { data, error } = await supabase.from('cc_worker_profiles').insert({ user_id: userId }).select().single();
  if (error) throw error;
  return data as WorkerProfile;
}

export async function getOrCreateCreatorProfile(userId: string): Promise<CreatorProfile> {
  const { data: existing } = await supabase.from('cc_creator_profiles').select('*').eq('user_id', userId).maybeSingle();
  if (existing) return existing as CreatorProfile;
  const { data, error } = await supabase.from('cc_creator_profiles').insert({ user_id: userId }).select().single();
  if (error) throw error;
  return data as CreatorProfile;
}

export async function fetchWorkerLevels(): Promise<WorkerLevelDef[]> {
  const { data, error } = await supabase.from('cc_worker_levels').select('*').order('sort_order');
  if (error) throw error;
  return (data || []) as unknown as WorkerLevelDef[];
}

// ─── Bookmarks ────────────────────────────────────────────────────────────────

export async function fetchBookmarks(userId: string): Promise<CampaignBookmark[]> {
  const { data, error } = await supabase.from('cc_bookmarks').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as CampaignBookmark[];
}

export async function toggleBookmark(campaignId: string, userId: string): Promise<boolean> {
  const { data: existing } = await supabase.from('cc_bookmarks').select('id').eq('campaign_id', campaignId).eq('user_id', userId).maybeSingle();
  if (existing) {
    await supabase.from('cc_bookmarks').delete().eq('id', existing.id);
    return false;
  }
  await supabase.from('cc_bookmarks').insert({ campaign_id: campaignId, user_id: userId });
  return true;
}

export async function isBookmarked(campaignId: string, userId: string): Promise<boolean> {
  const { data } = await supabase.from('cc_bookmarks').select('id').eq('campaign_id', campaignId).eq('user_id', userId).maybeSingle();
  return !!data;
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────

export async function fetchLeaderboard(limit = 50): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase
    .from('cc_leaderboard')
    .select('*')
    .eq('period', 'all')
    .order('total_earnings', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []) as LeaderboardEntry[];
}

// ─── Notifications ────────────────────────────────────────────────────────────

export async function fetchCampaignNotifications(userId: string, limit = 20): Promise<{ id: string; type: string; title: string; message: string | null; is_read: boolean; created_at: string; campaign_id: string | null }[]> {
  const { data, error } = await supabase
    .from('cc_notifications')
    .select('id, type, title, message, is_read, created_at, campaign_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []) as { id: string; type: string; title: string; message: string | null; is_read: boolean; created_at: string; campaign_id: string | null }[];
}

export async function markNotificationRead(id: string): Promise<void> {
  await supabase.from('cc_notifications').update({ is_read: true }).eq('id', id);
}

// ─── File Upload ──────────────────────────────────────────────────────────────

export async function uploadCampaignFile(userId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop();
  const fileName = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const { error: uploadError } = await supabase.storage.from('campaign-media').upload(fileName, file);
  if (uploadError) throw uploadError;
  const { data: urlData } = supabase.storage.from('campaign-media').getPublicUrl(fileName);
  return urlData.publicUrl;
}
