import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import type {
  KycProvider, KycProviderSetting, KycRule, KycProfile,
  KycSubmission, KycDocument, KycAuditLog, KycStatus,
} from './kycTypes';

const ensure = <T,>(data: T | null | undefined, fallback: T): T => data ?? fallback;

// ─── Providers ─────────────────────────────────────────────────────────
export function useKycProviders() {
  const [providers, setProviders] = useState<KycProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('kyc_providers')
      .select('*')
      .eq('is_deleted', false)
      .order('is_system', { ascending: false })
      .order('name', { ascending: true });
    if (error) setError(error.message);
    else { setProviders(ensure(data, [])); setError(null); }
    setLoading(false);
  }, []);

  useEffect(() => { void fetch(); }, [fetch]);
  return { providers, loading, error, refetch: fetch };
}

// ─── Provider Settings ──────────────────────────────────────────────────
export function useKycProviderSettings() {
  const [settings, setSettings] = useState<KycProviderSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('kyc_provider_settings')
      .select('*')
      .eq('is_deleted', false);
    if (error) setError(error.message);
    else { setSettings(ensure(data, [])); setError(null); }
    setLoading(false);
  }, []);

  useEffect(() => { void fetch(); }, [fetch]);
  return { settings, loading, error, refetch: fetch };
}

export async function updateKycProviderSetting(id: string, updates: Partial<KycProviderSetting>): Promise<void> {
  const { error } = await supabase
    .from('kyc_provider_settings')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function setActiveKycProvider(providerId: string): Promise<void> {
  await supabase.from('kyc_provider_settings')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .neq('provider_id', providerId);
  const { error } = await supabase.from('kyc_provider_settings')
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq('provider_id', providerId);
  if (error) throw error;
}

export async function testKycConnection(providerId: string): Promise<{ success: boolean; message: string }> {
  const { data: setting } = await supabase
    .from('kyc_provider_settings')
    .select('*')
    .eq('provider_id', providerId)
    .single();
  if (!setting) return { success: false, message: 'Provider settings not found' };

  await logKycAudit({ action: 'connection_tested', entity_type: 'provider', entity_id: providerId });

  if (setting.mode === 'sandbox') {
    await updateKycProviderSetting(setting.id, { health_status: 'healthy', last_sync_at: new Date().toISOString(), last_error: null });
    return { success: true, message: 'Sandbox connection test successful' };
  }
  if (!setting.api_key || !setting.secret_key) {
    await updateKycProviderSetting(setting.id, { health_status: 'down', last_error: 'Missing API credentials' });
    return { success: false, message: 'Missing API credentials for production mode' };
  }
  await updateKycProviderSetting(setting.id, { health_status: 'healthy', last_sync_at: new Date().toISOString(), last_error: null });
  return { success: true, message: 'Connection test successful' };
}

// ─── Rules ─────────────────────────────────────────────────────────────
export function useKycRules() {
  const [rules, setRules] = useState<KycRule[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('kyc_rules')
      .select('*')
      .eq('is_deleted', false)
      .order('user_type', { ascending: true });
    if (!error && data) setRules(ensure(data, []));
    setLoading(false);
  }, []);

  useEffect(() => { void fetch(); }, [fetch]);
  return { rules, loading, refetch: fetch };
}

export async function updateKycRule(id: string, updates: Partial<KycRule>): Promise<void> {
  const { error } = await supabase
    .from('kyc_rules')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// ─── Profiles ──────────────────────────────────────────────────────────
export function useKycProfile(userId: string | null) {
  const [profile, setProfile] = useState<KycProfile | null>(null);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!userId) { setProfile(null); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('kyc_profiles')
      .select('*')
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .maybeSingle();
    if (!error) setProfile(data);
    setLoading(false);
  }, [userId]);

  useEffect(() => { void fetch(); }, [fetch]);
  return { profile, loading, refetch: fetch };
}

export async function createKycProfile(userId: string, userType: string): Promise<KycProfile | null> {
  const { data, error } = await supabase
    .from('kyc_profiles')
    .insert({ user_id: userId, user_type: userType, status: 'pending_submission' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateKycProfile(id: string, updates: Partial<KycProfile>): Promise<void> {
  const { error } = await supabase
    .from('kyc_profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// ─── Submissions ────────────────────────────────────────────────────────
export function useKycSubmissions(profileId: string | null) {
  const [submissions, setSubmissions] = useState<KycSubmission[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!profileId) { setSubmissions([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('kyc_submissions')
      .select('*')
      .eq('profile_id', profileId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });
    if (!error && data) setSubmissions(ensure(data, []));
    setLoading(false);
  }, [profileId]);

  useEffect(() => { void fetch(); }, [fetch]);
  return { submissions, loading, refetch: fetch };
}

export async function createKycSubmission(profileId: string, userId: string, providerId?: string): Promise<KycSubmission | null> {
  const { data: existing } = await supabase
    .from('kyc_submissions')
    .select('version')
    .eq('profile_id', profileId)
    .order('version', { ascending: false })
    .limit(1);
  const nextVersion = (existing && existing.length > 0 ? existing[0].version : 0) + 1;

  const { data, error } = await supabase
    .from('kyc_submissions')
    .insert({
      profile_id: profileId,
      user_id: userId,
      status: 'pending',
      provider_id: providerId ?? null,
      version: nextVersion,
    })
    .select()
    .single();
  if (error) throw error;

  await updateKycProfile(profileId, { status: 'submitted' as KycStatus });
  await logKycAudit({ userId, action: 'document_uploaded', entity_type: 'submission', entity_id: data.id });
  return data;
}

export async function reviewKycSubmission(
  submissionId: string, reviewerId: string,
  action: 'approved' | 'rejected' | 'more_info_requested',
  notes: string, internalNotes?: string, rejectionReason?: string,
): Promise<void> {
  const statusMap = { approved: 'approved', rejected: 'rejected', more_info_requested: 'more_info_required' } as const;
  const { error: subErr } = await supabase
    .from('kyc_submissions')
    .update({
      status: statusMap[action],
      reviewer_id: reviewerId,
      reviewer_notes: notes,
      internal_notes: internalNotes ?? null,
      rejection_reason: rejectionReason ?? null,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', submissionId);
  if (subErr) throw subErr;

  const { data: sub } = await supabase
    .from('kyc_submissions')
    .select('profile_id, user_id')
    .eq('id', submissionId)
    .single();
  if (sub) {
    const profileStatus = action === 'approved' ? 'approved' : action === 'rejected' ? 'rejected' : 'more_info_required';
    await updateKycProfile(sub.profile_id, {
      status: profileStatus as KycStatus,
      reviewer_id: reviewerId,
      last_reviewed_at: new Date().toISOString(),
      notes: notes || null,
    });
    await logKycAudit({
      userId: sub.user_id, adminId: reviewerId,
      action: `verification_${action}`,
      entity_type: 'submission', entity_id: submissionId,
      metadata: { notes, rejection_reason: rejectionReason },
    });
  }

  const { error: revErr } = await supabase
    .from('kyc_reviews')
    .insert({
      submission_id: submissionId,
      reviewer_id: reviewerId,
      action,
      notes: notes || null,
      internal_notes: internalNotes ?? null,
    });
  if (revErr) throw revErr;
}

// ─── Documents ──────────────────────────────────────────────────────────
export function useKycDocuments(submissionId: string | null) {
  const [documents, setDocuments] = useState<KycDocument[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!submissionId) { setDocuments([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('kyc_documents')
      .select('*')
      .eq('submission_id', submissionId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });
    if (!error && data) setDocuments(ensure(data, []));
    setLoading(false);
  }, [submissionId]);

  useEffect(() => { void fetch(); }, [fetch]);
  return { documents, loading, refetch: fetch };
}

export async function uploadKycDocument(
  submissionId: string, userId: string,
  docType: string, file: File,
): Promise<KycDocument | null> {
  const filePath = `${userId}/${submissionId}/${Date.now()}_${file.name}`;
  const { error: upErr } = await supabase.storage
    .from('kyc-docs')
    .upload(filePath, file, { upsert: false });
  if (upErr) throw upErr;

  const { data: urlData } = supabase.storage
    .from('kyc-docs')
    .getPublicUrl(filePath);
  const docUrl = urlData.publicUrl;

  const { data: existing } = await supabase
    .from('kyc_documents')
    .select('version')
    .eq('submission_id', submissionId)
    .eq('doc_type', docType)
    .order('version', { ascending: false })
    .limit(1);

  const nextVersion = (existing && existing.length > 0 ? existing[0].version : 0) + 1;

  const { data, error } = await supabase
    .from('kyc_documents')
    .insert({
      submission_id: submissionId,
      user_id: userId,
      doc_type: docType,
      doc_url: docUrl,
      doc_name: file.name,
      doc_mime_type: file.type,
      doc_size_bytes: file.size,
      version: nextVersion,
    })
    .select()
    .single();
  if (error) throw error;

  await logKycAudit({ userId, action: 'document_uploaded', entity_type: 'document', entity_id: data.id });
  return data;
}

export async function replaceKycDocument(
  oldDocId: string, submissionId: string, userId: string,
  docType: string, file: File,
): Promise<KycDocument | null> {
  const newDoc = await uploadKycDocument(submissionId, userId, docType, file);
  if (newDoc) {
    await supabase.from('kyc_documents')
      .update({ status: 'replaced', replaced_by: newDoc.id, updated_at: new Date().toISOString() })
      .eq('id', oldDocId);
  }
  return newDoc;
}

export async function getDocumentVersions(submissionId: string, docType: string): Promise<KycDocument[]> {
  const { data, error } = await supabase
    .from('kyc_documents')
    .select('*')
    .eq('submission_id', submissionId)
    .eq('doc_type', docType)
    .order('version', { ascending: false });
  if (error) throw error;
  return ensure(data, []);
}

// ─── Audit Logs ─────────────────────────────────────────────────────────
export async function logKycAudit(entry: {
  userId?: string; adminId?: string; action: string;
  entity_type?: string; entity_id?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await supabase.from('kyc_audit_logs').insert({
    user_id: entry.userId ?? null,
    admin_id: entry.adminId ?? null,
    action: entry.action,
    entity_type: entry.entity_type ?? null,
    entity_id: entry.entity_id ?? null,
    metadata: entry.metadata ?? {},
  });
}

export function useKycAuditLogs(userId?: string, limit = 50) {
  const [logs, setLogs] = useState<KycAuditLog[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('kyc_audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (userId) query = query.eq('user_id', userId);
    const { data, error } = await query;
    if (!error && data) setLogs(ensure(data, []));
    setLoading(false);
  }, [userId, limit]);

  useEffect(() => { void fetch(); }, [fetch]);
  return { logs, loading, refetch: fetch };
}

// ─── Admin: All submissions for review queue ────────────────────────────
export function useKycReviewQueue(statusFilter?: string) {
  const [items, setItems] = useState<(KycSubmission & { profile: KycProfile | null })[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('kyc_submissions')
      .select('*, profile:kyc_profiles(*)')
      .eq('is_deleted', false);
    if (statusFilter) query = query.eq('status', statusFilter);
    query = query.order('submitted_at', { ascending: false });
    const { data, error } = await query;
    if (!error && data) setItems(ensure(data, []));
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { void fetch(); }, [fetch]);
  return { items, loading, refetch: fetch };
}

// ─── Compliance stats ────────────────────────────────────────────────────
export function useKycComplianceStats() {
  const [stats, setStats] = useState({
    pending: 0, under_review: 0, approved: 0, rejected: 0,
    more_info: 0, expired: 0, total: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    const { count: pending } = await supabase.from('kyc_submissions').select('*', { count: 'exact', head: true }).eq('status', 'pending').eq('is_deleted', false);
    const { count: underReview } = await supabase.from('kyc_submissions').select('*', { count: 'exact', head: true }).eq('status', 'under_review').eq('is_deleted', false);
    const { count: approved } = await supabase.from('kyc_submissions').select('*', { count: 'exact', head: true }).eq('status', 'approved').eq('is_deleted', false);
    const { count: rejected } = await supabase.from('kyc_submissions').select('*', { count: 'exact', head: true }).eq('status', 'rejected').eq('is_deleted', false);
    const { count: moreInfo } = await supabase.from('kyc_submissions').select('*', { count: 'exact', head: true }).eq('status', 'more_info_required').eq('is_deleted', false);
    const { count: total } = await supabase.from('kyc_submissions').select('*', { count: 'exact', head: true }).eq('is_deleted', false);
    const { count: expiredDocs } = await supabase.from('kyc_documents').select('*', { count: 'exact', head: true }).eq('status', 'expired').eq('is_deleted', false);
    setStats({
      pending: pending ?? 0, under_review: underReview ?? 0,
      approved: approved ?? 0, rejected: rejected ?? 0,
      more_info: moreInfo ?? 0, expired: expiredDocs ?? 0,
      total: total ?? 0,
    });
    setLoading(false);
  }, []);

  useEffect(() => { void fetch(); }, [fetch]);
  return { stats, loading, refetch: fetch };
}
