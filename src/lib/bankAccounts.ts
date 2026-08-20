import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';

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
  accountNumber: string,
  bankCode: string
): Promise<{ success: boolean; verified: boolean; account_name?: string; error?: string }> {
  const { data, error } = await supabase
    .rpc('resolve_bank_account', { p_account_number: accountNumber, p_bank_code: bankCode });

  if (error || !data) {
    return { success: false, verified: false, error: error?.message || 'Resolution failed' };
  }

  const result = data as { success: boolean; status?: string; error?: string };
  if (!result.success) {
    return { success: false, verified: false, error: result.error };
  }

  // Mark as pending verification
  await supabase
    .from('bank_accounts')
    .update({
      verification_status: 'pending',
      updated_at: new Date().toISOString(),
    })
    .eq('id', accountId);

  return { success: true, verified: false };
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

// Common Nigerian banks with Paystack codes
export const NIGERIAN_BANKS: Array<{ code: string; name: string }> = [
  { code: '044', name: 'Access Bank' },
  { code: '035A', name: 'ALAT by WEMA' },
  { code: '401', name: 'ASO Savings and Loans' },
  { code: '050', name: 'Ecobank Nigeria' },
  { code: '011', name: 'First Bank of Nigeria' },
  { code: '214', name: 'First City Monument Bank' },
  { code: '058', name: 'Guaranty Trust Bank' },
  { code: '070', name: 'Fidelity Bank' },
  { code: '057', name: 'Zenith Bank' },
  { code: '032', name: 'Union Bank of Nigeria' },
  { code: '033', name: 'United Bank For Africa' },
  { code: '232', name: 'Sterling Bank' },
  { code: '037', name: 'Polaris Bank' },
  { code: '215', name: 'Sparkasse Bank' },
  { code: '221', name: 'Stanbic IBTC Bank' },
  { code: '063', name: 'Diamond Bank' },
  { code: '082', name: 'Keystone Bank' },
  { code: '030', name: 'Heritage Bank' },
  { code: '076', name: 'Polaris Bank' },
  { code: '084', name: 'Providus Bank' },
  { code: '101', name: 'Providus Bank' },
  { code: '023', name: 'Citibank Nigeria' },
  { code: '068', name: 'Standard Chartered Bank' },
  { code: '090001', name: 'Kuda Microfinance Bank' },
  { code: '090267', name: 'Opay' },
  { code: '090115', name: 'Palmpay' },
  { code: '090110', name: 'Titan Trust Bank' },
  { code: '090205', name: 'Rubies Bank' },
  { code: '090112', name: 'Suntrust Bank' },
  { code: '090003', name: 'TAJ Bank' },
  { code: '090097', name: 'Fina Trust MFB' },
  { code: '090110', name: 'VFD Microfinance Bank' },
  { code: '999999', name: 'Wema Bank' },
  { code: '058', name: 'GTBank' },
];
