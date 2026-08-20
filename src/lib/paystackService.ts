import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';

export interface PaystackTransaction {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  channel: string | null;
  purpose: string;
  status: string;
  gateway_response: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface SubscriptionPlan {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  plan_type: string;
  amount: number;
  currency: string;
  interval: string;
  trial_days: number;
  grace_period_days: number;
  features: string[];
  is_active: boolean;
  sort_order: number;
}

export interface UserSubscription {
  id: string;
  user_id: string;
  plan_id: string;
  status: string;
  current_period_start: string;
  current_period_end: string;
  trial_end: string | null;
  cancel_at_period_end: boolean;
  failed_renewal_count: number;
  plan?: SubscriptionPlan;
}

export interface EscrowPayment {
  id: string;
  order_id: string;
  buyer_id: string;
  seller_id: string;
  amount: number;
  platform_fee: number;
  seller_earnings: number;
  status: string;
  held_at: string;
  released_at: string | null;
  auto_release_at: string | null;
  refund_amount: number | null;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
export const PAYSTACK_PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || '';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token || ANON_KEY;
  return {
    'Authorization': `Bearer ${accessToken}`,
    'apikey': ANON_KEY,
    'Content-Type': 'application/json',
  };
}

export async function initializePayment(params: {
  amount: number;
  purpose?: string;
  reference_id?: string;
  metadata?: Record<string, any>;
  channels?: string[];
}): Promise<{ authorization_url: string; reference: string } | { error: string }> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/paystack-initialize`, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({
      amount: params.amount * 100,
      purpose: params.purpose || 'wallet_funding',
      reference_id: params.reference_id,
      metadata: params.metadata || {},
      channels: params.channels,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    return { error: err.error || `Request failed (${res.status})` };
  }

  const data = await res.json();
  if (data.error) return { error: data.error };
  return { authorization_url: data.authorization_url, reference: data.reference };
}

export async function verifyPayment(reference: string): Promise<{ success: boolean; status: string; amount?: number; message?: string }> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/paystack-verify?reference=${reference}`, {
    headers: await getAuthHeaders(),
  });

  if (!res.ok) return { success: false, status: 'failed', message: 'Verification request failed' };
  const data = await res.json();
  return { success: data.success, status: data.status, amount: data.amount, message: data.message };
}

export function usePaymentTransactions(userId: string | undefined, limit: number = 20) {
  const [transactions, setTransactions] = useState<PaystackTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('paystack_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    setLoading(false);
    if (!error && data) setTransactions(data as PaystackTransaction[]);
  }, [userId, limit]);

  useEffect(() => { load(); }, [load]);
  return { transactions, loading, reload: load };
}

export function useSubscriptionPlans() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');
    setLoading(false);
    if (!error && data) setPlans(data as SubscriptionPlan[]);
  }, []);

  useEffect(() => { load(); }, [load]);
  return { plans, loading, reload: load };
}

export function useUserSubscriptions(userId: string | undefined) {
  const [subscriptions, setSubscriptions] = useState<UserSubscription[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('user_subscriptions')
      .select('*, plan:subscription_plans(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    setLoading(false);
    if (!error && data) setSubscriptions(data as UserSubscription[]);
  }, [userId]);

  useEffect(() => { load(); }, [load]);
  return { subscriptions, loading, reload: load };
}

export function useEscrowPayments(userId: string | undefined) {
  const [escrows, setEscrows] = useState<EscrowPayment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('escrow_payments')
      .select('*')
      .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
      .order('created_at', { ascending: false });
    setLoading(false);
    if (!error && data) setEscrows(data as EscrowPayment[]);
  }, [userId]);

  useEffect(() => { load(); }, [load]);
  return { escrows, loading, reload: load };
}

export function useAdminFinancialDashboard() {
  const [dashboard, setDashboard] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_admin_financial_dashboard');
    setLoading(false);
    if (!error && data) setDashboard(data as Record<string, number>);
  }, []);

  useEffect(() => { load(); }, [load]);
  return { dashboard, loading, reload: load };
}

export async function subscribeToPlan(userId: string, planId: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from('user_subscriptions').insert({
    user_id: userId,
    plan_id: planId,
    status: 'trialing',
    current_period_start: new Date().toISOString(),
    current_period_end: new Date(Date.now() + 30 * 86400000).toISOString(),
    trial_end: new Date(Date.now() + 7 * 86400000).toISOString(),
    grace_period_end: new Date(Date.now() + 10 * 86400000).toISOString(),
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function cancelSubscription(subId: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from('user_subscriptions')
    .update({ cancel_at_period_end: true, updated_at: new Date().toISOString() })
    .eq('id', subId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export const PAYMENT_PURPOSES = {
  wallet_funding: 'Wallet Funding',
  product_purchase: 'Product Purchase',
  subscription: 'Subscription',
  escrow: 'Escrow Payment',
  advertiser_funding: 'Advertiser Funding',
  affiliate_subscription: 'Affiliate Subscription',
  vendor_subscription: 'Vendor Subscription',
} as const;

export const TX_STATUS_COLORS: Record<string, string> = {
  success: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
  pending: 'bg-amber-100 text-amber-700',
  initialized: 'bg-blue-100 text-blue-700',
  abandoned: 'bg-gray-100 text-gray-600',
  reversed: 'bg-orange-100 text-orange-700',
};
