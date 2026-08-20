import { supabase } from './supabase';
import { getCurrencyInfo } from './currency';

export type BalanceField = 'balance' | 'pending_balance' | 'locked_balance' | 'escrow_balance' | 'referral_balance' | 'affiliate_balance' | 'creator_balance' | 'advertiser_budget' | 'seller_earnings';
export type TransactionType = 'credit' | 'debit';
export type ReferenceType = 'purchase' | 'withdrawal' | 'deposit' | 'refund' | 'escrow_hold' | 'escrow_release' | 'affiliate_payout' | 'referral_payout' | 'creator_payout' | 'promotion' | 'subscription' | 'manual_adjustment';

export interface WalletBalances {
  wallet_id: string; balance: number; pending_balance: number; locked_balance: number;
  escrow_balance: number; referral_balance: number; affiliate_balance: number;
  creator_balance: number; advertiser_budget: number; seller_earnings: number;
  currency: string; is_frozen: boolean; frozen_reason: string | null;
}

export interface WalletTransaction {
  id: string; wallet_id: string; type: TransactionType; amount: number;
  balance_after: number | null; description: string | null; metadata: Record<string, any>;
  created_at: string;
}

export interface WalletSummary extends WalletBalances {
  total_deposited: number; total_withdrawn: number; total_paid_out: number;
}

export async function getWalletBalances(userId: string): Promise<WalletBalances | null> {
  const { data, error } = await supabase.rpc('get_wallet_balances', { p_user_id: userId });
  if (error) { console.error('Failed to get wallet balances:', error); return null; }
  const arr = data as WalletBalances[];
  return arr?.[0] || null;
}

export async function getWalletSummary(userId: string): Promise<WalletSummary | null> {
  const { data, error } = await supabase.rpc('get_wallet_summary', { p_user_id: userId });
  if (error) { console.error('Failed to get wallet summary:', error); return null; }
  const arr = data as WalletSummary[];
  return arr?.[0] || null;
}

export async function getOrCreateWallet(userId: string): Promise<string | null> {
  const { data: existing } = await supabase.from('cc_wallets').select('id').eq('user_id', userId).maybeSingle();
  if (existing?.id) return existing.id;
  const { data: created, error } = await supabase.from('cc_wallets').insert({ user_id: userId }).select('id').single();
  if (error) { console.error('Failed to create wallet:', error); return null; }
  return created.id;
}

export async function processTransaction(params: {
  userId: string; walletId: string; type: TransactionType; amount: number;
  description?: string; referenceType?: ReferenceType; referenceId?: string;
  metadata?: Record<string, any>; balanceField?: BalanceField;
}): Promise<{ success: boolean; transaction_id?: string; balance_after?: number; error?: string }> {
  const { data, error } = await supabase.rpc('process_wallet_transaction', {
    p_user_id: params.userId, p_wallet_id: params.walletId, p_type: params.type,
    p_amount: params.amount, p_description: params.description || null,
    p_reference_type: params.referenceType || null, p_reference_id: params.referenceId || null,
    p_metadata: params.metadata || {}, p_balance_field: params.balanceField || 'balance',
  });
  if (error) { console.error('Transaction failed:', error); return { success: false, error: error.message }; }
  return data as any;
}

export async function getTransactions(userId: string, limit = 20, offset = 0): Promise<WalletTransaction[]> {
  const { data, error } = await supabase.rpc('get_wallet_transactions', {
    p_user_id: userId, p_limit: limit, p_offset: offset,
  });
  if (error) { console.error('Failed to get transactions:', error); return []; }
  return (data as WalletTransaction[]) || [];
}

export async function getLedgerEntries(userId: string, limit = 50): Promise<any[]> {
  const { data, error } = await supabase.from('ledger_entries')
    .select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(limit);
  if (error) { console.error('Failed to get ledger:', error); return []; }
  return data || [];
}

export function exportTransactionsCSV(transactions: WalletTransaction[]): string {
  const headers = ['Date', 'Type', 'Amount', 'Balance After', 'Description'];
  const rows = transactions.map(t => [
    new Date(t.created_at).toISOString(), t.type, t.amount.toString(),
    t.balance_after?.toString() || '', (t.description || '').replace(/,/g, ';'),
  ]);
  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

export function downloadCSV(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export { formatCurrency } from './currency';
export function formatCurrencyRaw(amount: number, currency = 'NGN'): string {
  const info = getCurrencyInfo(currency);
  try {
    return new Intl.NumberFormat(info.locale, {
      style: 'currency', currency: info.code,
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${info.symbol}${amount.toFixed(2)}`;
  }
}
