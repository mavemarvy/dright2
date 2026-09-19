import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';

export interface PaystackBank {
  id?: number | null;
  name: string;
  slug?: string | null;
  code: string;
  longcode?: string | null;
  type?: string | null;
  active?: boolean;
  country?: string | null;
  currency?: string | null;
}

export interface BankAccount {
  id: string;
  user_id: string;
  bank_code: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  recipient_code: string | null;
  is_default: boolean;
  is_verified: boolean;
  verification_status: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export async function fetchBankAccounts(userId: string): Promise<BankAccount[]> {
  const { data, error } = await supabase
    .from('bank_accounts')
    .select('*')
    .eq('user_id', userId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data as BankAccount[];
}

export async function addBankAccount(
  userId: string,
  params: {
    bank_code: string;
    bank_name: string;
    account_number: string;
    account_name: string;
    is_default?: boolean;
  }
): Promise<{ success: boolean; error?: string; data?: BankAccount }> {
  if (params.is_default) {
    await supabase
      .from('bank_accounts')
      .update({ is_default: false })
      .eq('user_id', userId)
      .eq('is_default', true);
  }

  const { data, error } = await supabase
    .from('bank_accounts')
    .insert({
      user_id: userId,
      bank_code: params.bank_code,
      bank_name: params.bank_name,
      account_number: params.account_number,
      account_name: params.account_name,
      is_default: params.is_default ?? false,
      verification_status: 'unverified',
    })
    .select('*')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: data as BankAccount };
}

export async function updateBankAccount(
  accountId: string,
  updates: Partial<Pick<BankAccount, 'bank_name' | 'account_name' | 'is_default'>>
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('bank_accounts')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', accountId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function deleteBankAccount(accountId: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('bank_accounts')
    .delete()
    .eq('id', accountId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function setDefaultBankAccount(userId: string, accountId: string): Promise<{ success: boolean; error?: string }> {
  await supabase
    .from('bank_accounts')
    .update({ is_default: false })
    .eq('user_id', userId)
    .eq('is_default', true);

  const { error } = await supabase
    .from('bank_accounts')
    .update({ is_default: true, updated_at: new Date().toISOString() })
    .eq('id', accountId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function verifyBankAccount(
  accountId: string,
  _accountNumber: string,
  _bankCode: string
): Promise<{ success: boolean; verified: boolean; account_name?: string; bank_name?: string; bank_code?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke('paystack-bank-account', {
    body: { account_id: accountId },
  });

  if (error) {
    return { success: false, verified: false, error: error.message || 'Paystack account verification failed' };
  }

  const result = data as {
    success?: boolean;
    verified?: boolean;
    account_name?: string;
    bank_name?: string;
    bank_code?: string;
    error?: string;
  } | null;

  if (!result?.success || result.verified !== true) {
    return {
      success: false,
      verified: false,
      error: result?.error || 'Paystack could not verify this bank account',
    };
  }

  return {
    success: true,
    verified: true,
    account_name: result.account_name,
    bank_name: result.bank_name,
    bank_code: result.bank_code,
  };
}

export async function fetchPaystackBanks(): Promise<{ banks: PaystackBank[]; source: 'paystack' | 'fallback'; error?: string }> {
  const { data, error } = await supabase.functions.invoke('paystack-banks', {
    body: {},
  });

  const result = data as { success?: boolean; banks?: PaystackBank[]; error?: string } | null;
  if (!error && result?.success && Array.isArray(result.banks) && result.banks.length > 0) {
    return {
      banks: [...result.banks].sort((a, b) => a.name.localeCompare(b.name)),
      source: 'paystack',
    };
  }

  return {
    banks: NIGERIAN_BANKS,
    source: 'fallback',
    error: result?.error || error?.message || 'Unable to load Paystack bank directory',
  };
}

export function useBankAccounts(userId: string | undefined) {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    const data = await fetchBankAccounts(userId);
    setAccounts(data);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  return { accounts, loading, reload: load };
}

// Conservative fallback only. The UI normally loads Paystack's live Nigerian
// bank/MFB directory through the paystack-banks Edge Function.
export const NIGERIAN_BANKS: PaystackBank[] = [
  { code: '044', name: 'Access Bank' },
  { code: '023', name: 'Citibank Nigeria' },
  { code: '050', name: 'Ecobank Nigeria' },
  { code: '070', name: 'Fidelity Bank' },
  { code: '011', name: 'First Bank of Nigeria' },
  { code: '214', name: 'First City Monument Bank' },
  { code: '00103', name: 'Globus Bank' },
  { code: '058', name: 'Guaranty Trust Bank' },
  { code: '301', name: 'Jaiz Bank' },
  { code: '082', name: 'Keystone Bank' },
  { code: '076', name: 'Polaris Bank' },
  { code: '105', name: 'PremiumTrust Bank' },
  { code: '101', name: 'Providus Bank' },
  { code: '221', name: 'Stanbic IBTC Bank' },
  { code: '068', name: 'Standard Chartered Bank' },
  { code: '232', name: 'Sterling Bank' },
  { code: '100', name: 'SunTrust Bank' },
  { code: '102', name: 'Titan Trust Bank' },
  { code: '032', name: 'Union Bank of Nigeria' },
  { code: '033', name: 'United Bank for Africa' },
  { code: '215', name: 'Unity Bank' },
  { code: '035', name: 'Wema Bank' },
  { code: '057', name: 'Zenith Bank' },
];
