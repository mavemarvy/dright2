import { supabase } from './supabase';

export interface UserPaymentPreferences {
  id: string;
  user_id: string;
  last_gateway: string | null;
  last_amount: number | null;
  last_bank_account_id: string | null;
  last_funding_amount: number | null;
  preferred_currency: string;
  recent_amounts: number[];
  metadata: Record<string, unknown>;
}

const STORAGE_KEY = 'dright_payment_prefs';

// Local storage fallback for when DB isn't available
interface LocalPrefs {
  last_gateway?: string;
  last_amount?: number;
  last_funding_amount?: number;
  recent_amounts?: number[];
  preferred_currency?: string;
}

function getLocalPrefs(): LocalPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setLocalPrefs(prefs: LocalPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

export async function fetchPaymentPreferences(userId: string): Promise<UserPaymentPreferences | null> {
  const { data, error } = await supabase
    .from('user_payment_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) {
    const local = getLocalPrefs();
    return {
      id: 'local',
      user_id: userId,
      last_gateway: local.last_gateway ?? null,
      last_amount: local.last_amount ?? null,
      last_bank_account_id: null,
      last_funding_amount: local.last_funding_amount ?? null,
      preferred_currency: local.preferred_currency ?? 'NGN',
      recent_amounts: local.recent_amounts ?? [],
      metadata: {},
    };
  }
  return data as UserPaymentPreferences;
}

export async function saveGatewayPreference(userId: string, gateway: string, amount?: number): Promise<void> {
  const local = getLocalPrefs();
  local.last_gateway = gateway;
  if (amount !== undefined) local.last_amount = amount;
  setLocalPrefs(local);

  try {
    const { data: existing } = await supabase
      .from('user_payment_preferences')
      .select('id, recent_amounts')
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      const recentAmounts = (existing.recent_amounts as number[]) || [];
      if (amount !== undefined && !recentAmounts.includes(amount)) {
        recentAmounts.unshift(amount);
        if (recentAmounts.length > 5) recentAmounts.pop();
      }

      await supabase
        .from('user_payment_preferences')
        .update({
          last_gateway: gateway,
          last_amount: amount ?? (existing as Record<string, unknown>).last_amount ?? null,
          recent_amounts: recentAmounts,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);
    } else {
      await supabase
        .from('user_payment_preferences')
        .insert({
          user_id: userId,
          last_gateway: gateway,
          last_amount: amount ?? null,
          recent_amounts: amount ? [amount] : [],
        });
    }
  } catch {
    // local storage fallback already handled
  }
}

export async function saveFundingAmount(userId: string, amount: number): Promise<void> {
  const local = getLocalPrefs();
  local.last_funding_amount = amount;
  setLocalPrefs(local);

  try {
    const { data: existing } = await supabase
      .from('user_payment_preferences')
      .select('id, recent_amounts')
      .eq('user_id', userId)
      .maybeSingle();

    const recentAmounts = (existing?.recent_amounts as number[]) || [];
    if (!recentAmounts.includes(amount)) {
      recentAmounts.unshift(amount);
      if (recentAmounts.length > 5) recentAmounts.pop();
    }

    if (existing) {
      await supabase
        .from('user_payment_preferences')
        .update({
          last_funding_amount: amount,
          recent_amounts: recentAmounts,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);
    } else {
      await supabase
        .from('user_payment_preferences')
        .insert({
          user_id: userId,
          last_funding_amount: amount,
          recent_amounts: [amount],
        });
    }
  } catch {
    // local storage fallback
  }
}

export async function saveBankPreference(userId: string, bankAccountId: string): Promise<void> {
  try {
    const { data: existing } = await supabase
      .from('user_payment_preferences')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('user_payment_preferences')
        .update({
          last_bank_account_id: bankAccountId,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);
    } else {
      await supabase
        .from('user_payment_preferences')
        .insert({
          user_id: userId,
          last_bank_account_id: bankAccountId,
        });
    }
  } catch {
    // non-critical
  }
}

// Abandoned payment management
export interface AbandonedPayment {
  id: string;
  reference: string;
  purpose: string;
  amount: number;
  currency: string;
  product_name: string | null;
  order_id: string | null;
  provider: string | null;
  status: string;
  created_at: string;
}

export async function saveAbandonedPayment(userId: string, data: {
  reference: string;
  purpose: string;
  amount: number;
  product_name?: string;
  order_id?: string;
  provider?: string;
}): Promise<void> {
  try {
    await supabase.from('abandoned_payments').insert({
      user_id: userId,
      reference: data.reference,
      purpose: data.purpose,
      amount: data.amount,
      currency: 'NGN',
      product_name: data.product_name || null,
      order_id: data.order_id || null,
      provider: data.provider || null,
      status: 'pending',
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
  } catch {
    // non-critical
  }
}

export async function fetchAbandonedPayments(userId: string): Promise<AbandonedPayment[]> {
  const { data, error } = await supabase
    .from('abandoned_payments')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(5);

  if (error || !data) return [];
  return data as AbandonedPayment[];
}

export async function dismissAbandonedPayment(id: string): Promise<void> {
  try {
    await supabase
      .from('abandoned_payments')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id);
  } catch {
    // non-critical
  }
}

export async function recoverAbandonedPayment(id: string): Promise<void> {
  try {
    await supabase
      .from('abandoned_payments')
      .update({ status: 'recovered', recovered_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id);
  } catch {
    // non-critical
  }
}
