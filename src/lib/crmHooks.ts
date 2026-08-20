import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import type {
  CrmCustomer,
  CustomerTimelineEvent,
  SubscriptionReminder,
  RecoveryQueueItem,
  CustomerContact,
  CustomerContactLog,
  MarketingCampaign,
  PromotionStatistic,
  AdminPerformance,
  PayoutMethod,
  AiCustomerInsight,
} from './crmTypes';

const ensure = <T,>(data: T | null | undefined, fallback: T): T => data ?? fallback;

// ─── CRM Customers ────────────────────────────────────────────────────
export function useCrmCustomers(search?: string) {
  const [customers, setCustomers] = useState<CrmCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('crm_customers')
      .select('*, user:users!crm_customers_user_id_fkey(id, email, full_name, username, phone, is_admin, verification_status, created_at, last_sign_in_at)')
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });
    if (search) query = query.or(`notes.ilike.%${search}%`);
    const { data, error } = await query;
    if (error) setError(error.message);
    else { setCustomers(ensure(data, [])); setError(null); }
    setLoading(false);
  }, [search]);

  useEffect(() => { void fetch(); }, [fetch]);
  return { customers, loading, error, refetch: fetch };
}

export function useCrmCustomer(userId: string | null) {
  const [customer, setCustomer] = useState<CrmCustomer | null>(null);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!userId) { setCustomer(null); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('crm_customers')
      .select('*, user:users!crm_customers_user_id_fkey(id, email, full_name, username, phone, is_admin, verification_status, created_at, last_sign_in_at)')
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .maybeSingle();
    if (!error) setCustomer(data);
    setLoading(false);
  }, [userId]);

  useEffect(() => { void fetch(); }, [fetch]);
  return { customer, loading, refetch: fetch };
}

export async function updateCrmCustomer(id: string, updates: Partial<CrmCustomer>): Promise<void> {
  const { error } = await supabase.from('crm_customers').update({
    ...updates,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw error;
}

// ─── Customer Timeline ────────────────────────────────────────────────
export function useCustomerTimeline(userId: string | null, limit = 100) {
  const [events, setEvents] = useState<CustomerTimelineEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!userId) { setEvents([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('customer_timelines')
      .select('*')
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (!error) setEvents(ensure(data, []));
    setLoading(false);
  }, [userId, limit]);

  useEffect(() => { void fetch(); }, [fetch]);
  return { events, loading, refetch: fetch };
}

export async function addTimelineEvent(input: {
  user_id: string;
  event_type: string;
  event_title: string;
  event_category?: string;
  event_description?: string;
  event_data?: Record<string, unknown>;
  related_entity_type?: string;
  related_entity_id?: string;
  performed_by?: string;
}): Promise<void> {
  const { error } = await supabase.from('customer_timelines').insert({
    user_id: input.user_id,
    event_type: input.event_type,
    event_title: input.event_title,
    event_category: input.event_category ?? 'general',
    event_description: input.event_description ?? null,
    event_data: input.event_data ?? {},
    related_entity_type: input.related_entity_type ?? null,
    related_entity_id: input.related_entity_id ?? null,
    performed_by: input.performed_by ?? null,
  });
  if (error) throw error;
}

// ─── Subscription Reminders ───────────────────────────────────────────
export function useSubscriptionReminders(statusFilter?: string) {
  const [reminders, setReminders] = useState<SubscriptionReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('subscription_reminders')
      .select('*, user:users!subscription_reminders_user_id_fkey(id, email, full_name, username)')
      .eq('is_deleted', false)
      .order('expiry_date', { ascending: true });
    if (statusFilter) query = query.eq('status', statusFilter);
    const { data, error } = await query;
    if (error) setError(error.message);
    else { setReminders(ensure(data, [])); setError(null); }
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { void fetch(); }, [fetch]);
  return { reminders, loading, error, refetch: fetch };
}

export async function updateSubscriptionReminder(id: string, updates: Partial<SubscriptionReminder>): Promise<void> {
  const { error } = await supabase.from('subscription_reminders').update({
    ...updates,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw error;
}

// ─── Recovery Queue ────────────────────────────────────────────────────
export function useRecoveryQueue(statusFilter?: string, reasonFilter?: string) {
  const [items, setItems] = useState<RecoveryQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('customer_recovery_queue')
      .select('*, user:users!customer_recovery_queue_user_id_fkey(id, email, full_name, username), assigned_admin:users!customer_recovery_queue_assigned_admin_id_fkey(id, email, full_name)')
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });
    if (statusFilter) query = query.eq('status', statusFilter);
    if (reasonFilter) query = query.eq('recovery_reason', reasonFilter);
    const { data, error } = await query;
    if (error) setError(error.message);
    else { setItems(ensure(data, [])); setError(null); }
    setLoading(false);
  }, [statusFilter, reasonFilter]);

  useEffect(() => { void fetch(); }, [fetch]);
  return { items, loading, error, refetch: fetch };
}

export async function updateRecoveryItem(id: string, updates: Partial<RecoveryQueueItem>): Promise<void> {
  const updateData: Record<string, unknown> = { ...updates, updated_at: new Date().toISOString() };
  if (updates.outcome === 'recovered' || updates.outcome === 'lost') {
    updateData.resolved_at = new Date().toISOString();
    updateData.status = 'resolved';
  }
  const { error } = await supabase.from('customer_recovery_queue').update(updateData).eq('id', id);
  if (error) throw error;
}

// ─── Customer Contacts ────────────────────────────────────────────────
export function useCustomerContacts(userId?: string) {
  const [contacts, setContacts] = useState<CustomerContact[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('customer_contacts')
      .select('*, user:users!customer_contacts_user_id_fkey(id, email, full_name, username), staff:users!customer_contacts_staff_id_fkey(id, email, full_name)')
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });
    if (userId) query = query.eq('user_id', userId);
    const { data, error } = await query;
    if (!error) setContacts(ensure(data, []));
    setLoading(false);
  }, [userId]);

  useEffect(() => { void fetch(); }, [fetch]);
  return { contacts, loading, refetch: fetch };
}

export async function createContact(input: {
  user_id: string;
  staff_id: string;
  channel: string;
  subject?: string;
  summary: string;
  follow_up_reminder?: string;
  outcome?: string;
}): Promise<CustomerContact | null> {
  const { data, error } = await supabase.from('customer_contacts').insert({
    user_id: input.user_id,
    staff_id: input.staff_id,
    channel: input.channel,
    subject: input.subject ?? null,
    summary: input.summary,
    follow_up_reminder: input.follow_up_reminder ?? null,
    outcome: input.outcome ?? 'open',
  }).select().single();
  if (error) throw error;
  return data;
}

export async function updateContact(id: string, updates: Partial<CustomerContact>): Promise<void> {
  const { error } = await supabase.from('customer_contacts').update({
    ...updates,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw error;
}

export function useContactLogs(contactId: string | null) {
  const [logs, setLogs] = useState<CustomerContactLog[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!contactId) { setLogs([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('customer_contact_logs')
      .select('*')
      .eq('contact_id', contactId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true });
    if (!error) setLogs(ensure(data, []));
    setLoading(false);
  }, [contactId]);

  useEffect(() => { void fetch(); }, [fetch]);
  return { logs, loading, refetch: fetch };
}

export async function addContactLog(input: {
  contact_id: string;
  user_id: string;
  staff_id: string;
  log_type?: string;
  content: string;
  channel?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await supabase.from('customer_contact_logs').insert({
    contact_id: input.contact_id,
    user_id: input.user_id,
    staff_id: input.staff_id,
    log_type: input.log_type ?? 'message',
    content: input.content,
    channel: input.channel ?? 'in_app',
    metadata: input.metadata ?? {},
  });
  if (error) throw error;
}

// ─── Marketing Campaigns ──────────────────────────────────────────────
export function useMarketingCampaigns(statusFilter?: string, typeFilter?: string) {
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('marketing_campaigns')
      .select('*, owner:users!marketing_campaigns_owner_id_fkey(id, email, full_name, username)')
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });
    if (statusFilter) query = query.eq('status', statusFilter);
    if (typeFilter) query = query.eq('campaign_type', typeFilter);
    const { data, error } = await query;
    if (error) setError(error.message);
    else { setCampaigns(ensure(data, [])); setError(null); }
    setLoading(false);
  }, [statusFilter, typeFilter]);

  useEffect(() => { void fetch(); }, [fetch]);
  return { campaigns, loading, error, refetch: fetch };
}

export async function updateMarketingCampaign(id: string, updates: Partial<MarketingCampaign>): Promise<void> {
  const { error } = await supabase.from('marketing_campaigns').update({
    ...updates,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw error;
}

// ─── Promotion Statistics ─────────────────────────────────────────────
export function usePromotionStatistics(campaignId?: string) {
  const [stats, setStats] = useState<PromotionStatistic[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('promotion_statistics')
      .select('*')
      .eq('is_deleted', false)
      .order('recording_date', { ascending: false });
    if (campaignId) query = query.eq('campaign_id', campaignId);
    const { data, error } = await query;
    if (!error) setStats(ensure(data, []));
    setLoading(false);
  }, [campaignId]);

  useEffect(() => { void fetch(); }, [fetch]);
  return { stats, loading, refetch: fetch };
}

// ─── Admin Performance ────────────────────────────────────────────────
export function useAdminPerformance(periodType?: string, limit = 50) {
  const [records, setRecords] = useState<AdminPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('admin_performance')
      .select('*, admin:users!admin_performance_admin_id_fkey(id, email, full_name, username)')
      .eq('is_deleted', false)
      .order('total_score', { ascending: false })
      .limit(limit);
    if (periodType) query = query.eq('period_type', periodType);
    const { data, error } = await query;
    if (error) setError(error.message);
    else { setRecords(ensure(data, [])); setError(null); }
    setLoading(false);
  }, [periodType, limit]);

  useEffect(() => { void fetch(); }, [fetch]);
  return { records, loading, error, refetch: fetch };
}

export async function updateAdminPerformance(id: string, updates: Partial<AdminPerformance>): Promise<void> {
  const { error } = await supabase.from('admin_performance').update({
    ...updates,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw error;
}

// ─── Payout Methods ───────────────────────────────────────────────────
export function usePayoutMethods(userId: string | null) {
  const [methods, setMethods] = useState<PayoutMethod[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!userId) { setMethods([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('payout_methods')
      .select('*')
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) setError(error.message);
    else { setMethods(ensure(data, [])); setError(null); }
    setLoading(false);
  }, [userId]);

  useEffect(() => { void fetch(); }, [fetch]);
  return { methods, loading, error, refetch: fetch };
}

export async function createPayoutMethod(input: Omit<PayoutMethod, 'id' | 'created_at' | 'updated_at' | 'is_deleted' | 'status' | 'is_verified' | 'metadata'> & { metadata?: Record<string, unknown> }): Promise<PayoutMethod | null> {
  const { data, error } = await supabase.from('payout_methods').insert({
    ...input,
    is_verified: false,
    metadata: input.metadata ?? {},
    status: 'active',
  }).select().single();
  if (error) throw error;
  return data;
}

export async function updatePayoutMethod(id: string, updates: Partial<PayoutMethod>): Promise<void> {
  const { error } = await supabase.from('payout_methods').update({
    ...updates,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw error;
}

export async function setPrimaryPayoutMethod(userId: string, methodId: string): Promise<void> {
  await supabase.from('payout_methods').update({ is_primary: false }).eq('user_id', userId).eq('is_primary', true);
  const { error } = await supabase.from('payout_methods').update({ is_primary: true }).eq('id', methodId);
  if (error) throw error;
}

export async function deletePayoutMethod(id: string): Promise<void> {
  const { error } = await supabase.from('payout_methods').update({ is_deleted: true }).eq('id', id);
  if (error) throw error;
}

// ─── AI Customer Insights ─────────────────────────────────────────────
export function useAiInsights(dismissed?: boolean) {
  const [insights, setInsights] = useState<AiCustomerInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('ai_customer_insights')
      .select('*')
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });
    if (dismissed === false) query = query.eq('is_dismissed', false);
    const { data, error } = await query;
    if (error) setError(error.message);
    else { setInsights(ensure(data, [])); setError(null); }
    setLoading(false);
  }, [dismissed]);

  useEffect(() => { void fetch(); }, [fetch]);
  return { insights, loading, error, refetch: fetch };
}

export async function dismissInsight(id: string, dismissedBy: string): Promise<void> {
  const { error } = await supabase.from('ai_customer_insights').update({
    is_dismissed: true,
    dismissed_by: dismissedBy,
    dismissed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw error;
}

export async function createAiInsight(input: {
  insight_type: string;
  insight_category?: string;
  title: string;
  description?: string;
  affected_user_ids?: string[];
  severity?: string;
  confidence_score?: number;
  recommended_action?: string;
  ai_provider?: string;
  ai_model?: string;
  insight_data?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await supabase.from('ai_customer_insights').insert({
    insight_type: input.insight_type,
    insight_category: input.insight_category ?? 'general',
    title: input.title,
    description: input.description ?? null,
    affected_user_ids: input.affected_user_ids ?? [],
    severity: input.severity ?? 'medium',
    confidence_score: input.confidence_score ?? 0,
    recommended_action: input.recommended_action ?? null,
    ai_provider: input.ai_provider ?? 'openai',
    ai_model: input.ai_model ?? null,
    insight_data: input.insight_data ?? {},
  });
  if (error) throw error;
}
