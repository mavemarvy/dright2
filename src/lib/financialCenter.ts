import { supabase } from './supabase';
import { formatCurrency } from './currency';

// ============================================================
// Types
// ============================================================

export type TransactionStatus =
  | 'pending' | 'processing' | 'completed' | 'failed'
  | 'cancelled' | 'refunded' | 'reversed' | 'disputed';

export type TransactionCategory =
  | 'wallet' | 'purchases' | 'withdrawals' | 'earnings'
  | 'referral' | 'affiliate' | 'advertising' | 'subscription' | 'escrow';

export type RefundStatus =
  | 'pending' | 'approved' | 'rejected' | 'processing' | 'completed' | 'cancelled';

export type PlatformAccountType =
  | 'operating' | 'escrow' | 'settlement' | 'reserve' | 'refund' | 'marketing' | 'tax';

export interface DetailedTransaction {
  id: string;
  wallet_id: string;
  user_id: string;
  type: 'credit' | 'debit';
  amount: number;
  balance_after: number | null;
  balance_before: number | null;
  campaign_id: string | null;
  description: string | null;
  metadata: Record<string, any>;
  reference: string | null;
  receipt_number: string | null;
  currency: string;
  exchange_rate: number;
  gateway: string | null;
  status: TransactionStatus;
  category: TransactionCategory | null;
  notes: string | null;
  payment_provider: string | null;
  device_info: string | null;
  ip_address: string | null;
  country: string | null;
  browser: string | null;
  related_order_id: string | null;
  related_escrow_id: string | null;
  related_subscription_id: string | null;
  related_withdrawal_id: string | null;
  created_at: string;
  email?: string;
  username?: string;
}

export interface PlatformAccount {
  id: string;
  account_type: PlatformAccountType;
  account_name: string;
  balance: number;
  currency: string;
  description: string | null;
  is_locked: boolean;
}

export interface PlatformLedgerEntry {
  id: string;
  entry_id: string;
  transaction_id: string | null;
  debit_account: string;
  credit_account: string;
  amount: number;
  currency: string;
  exchange_rate: number;
  debit_balance_before: number | null;
  debit_balance_after: number | null;
  credit_balance_before: number | null;
  credit_balance_after: number | null;
  reference_type: string | null;
  reference_id: string | null;
  description: string;
  created_by: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

export interface RefundRecord {
  id: string;
  refund_number: string;
  transaction_id: string;
  user_id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  reason: string;
  status: RefundStatus;
  approver_id: string | null;
  approved_at: string | null;
  processed_at: string | null;
  completed_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  refund_method: string | null;
  gateway_reference: string | null;
  timeline: any[];
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface FinancialAuditLog {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  actor_id: string;
  actor_role: string | null;
  actor_name: string | null;
  before_state: Record<string, any> | null;
  after_state: Record<string, any> | null;
  description: string | null;
  ip_address: string | null;
  user_agent: string | null;
  device_info: string | null;
  country: string | null;
  created_at: string;
}

export interface PlatformFinancialSummary {
  accounts: PlatformAccount[];
  total_wallet_funds: number;
  total_escrow: number;
  total_pending_balance: number;
  total_locked: number;
  total_referral: number;
  total_affiliate: number;
  total_creator: number;
  total_advertiser: number;
  total_seller_earnings: number;
  pending_withdrawals: number;
  pending_withdrawals_amount: number;
  pending_refunds: number;
  pending_refunds_amount: number;
  total_transactions: number;
  completed_transactions: number;
  failed_transactions: number;
  pending_transactions: number;
}

export interface TransactionHistoryFilters {
  status?: TransactionStatus | null;
  category?: TransactionCategory | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  search?: string | null;
  limit?: number;
  offset?: number;
}

// ============================================================
// Transaction History Service
// ============================================================

export async function getTransactionHistory(
  userId: string,
  filters: TransactionHistoryFilters = {}
): Promise<{ transactions: DetailedTransaction[]; total: number }> {
  const { data, error } = await supabase.rpc('get_user_transaction_history', {
    p_user_id: userId,
    p_status: filters.status || null,
    p_category: filters.category || null,
    p_date_from: filters.dateFrom || null,
    p_date_to: filters.dateTo || null,
    p_search: filters.search || null,
    p_limit: filters.limit || 20,
    p_offset: filters.offset || 0,
  });
  if (error) {
    console.error('Failed to get transaction history:', error);
    return { transactions: [], total: 0 };
  }
  const result = data as any;
  return {
    transactions: (result?.transactions || []) as DetailedTransaction[],
    total: result?.total || 0,
  };
}

export async function searchPlatformTransactions(
  filters: TransactionHistoryFilters & { userId?: string | null } = {}
): Promise<{ transactions: DetailedTransaction[]; total: number }> {
  const { data, error } = await supabase.rpc('search_platform_transactions', {
    p_search: filters.search || null,
    p_status: filters.status || null,
    p_category: filters.category || null,
    p_user_id: filters.userId || null,
    p_date_from: filters.dateFrom || null,
    p_date_to: filters.dateTo || null,
    p_limit: filters.limit || 50,
    p_offset: filters.offset || 0,
  });
  if (error) {
    console.error('Failed to search platform transactions:', error);
    return { transactions: [], total: 0 };
  }
  const result = data as any;
  return {
    transactions: (result?.transactions || []) as DetailedTransaction[],
    total: result?.total || 0,
  };
}

// ============================================================
// Platform Accounts Service
// ============================================================

export async function getPlatformAccounts(): Promise<PlatformAccount[]> {
  const { data, error } = await supabase.from('platform_accounts').select('*').order('account_type');
  if (error) {
    console.error('Failed to get platform accounts:', error);
    return [];
  }
  return (data || []) as PlatformAccount[];
}

export async function getPlatformFinancialSummary(): Promise<PlatformFinancialSummary | null> {
  const { data, error } = await supabase.rpc('get_platform_financial_summary');
  if (error) {
    console.error('Failed to get platform financial summary:', error);
    return null;
  }
  return data as PlatformFinancialSummary;
}

// ============================================================
// Platform Ledger Service
// ============================================================

export async function getPlatformLedgerEntries(
  limit = 50,
  offset = 0
): Promise<PlatformLedgerEntry[]> {
  const { data, error } = await supabase
    .from('platform_ledger_entries')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) {
    console.error('Failed to get platform ledger:', error);
    return [];
  }
  return (data || []) as PlatformLedgerEntry[];
}

// ============================================================
// Refund Service
// ============================================================

export async function getRefundRecords(
  statusFilter?: RefundStatus | null,
  limit = 50,
  offset = 0
): Promise<{ records: RefundRecord[]; total: number }> {
  let query = supabase.from('refund_records').select('*', { count: 'exact' });
  if (statusFilter) query = query.eq('status', statusFilter);
  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  const { data, error, count } = await query;
  if (error) {
    console.error('Failed to get refund records:', error);
    return { records: [], total: 0 };
  }
  return { records: (data || []) as RefundRecord[], total: count || 0 };
}

export async function createRefundRequest(
  transactionId: string,
  userId: string,
  amount: number,
  reason: string,
  orderId?: string
): Promise<{ success: boolean; refund?: RefundRecord; error?: string }> {
  const { data: refNum } = await supabase.rpc('generate_refund_number');
  const { data, error } = await supabase
    .from('refund_records')
    .insert({
      refund_number: refNum,
      transaction_id: transactionId,
      user_id: userId,
      order_id: orderId || null,
      amount,
      reason,
      status: 'pending',
      timeline: [{ action: 'created', timestamp: new Date().toISOString(), note: 'Refund request submitted' }],
    })
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, refund: data as RefundRecord };
}

export async function updateRefundStatus(
  refundId: string,
  status: RefundStatus,
  approverId: string,
  approverName: string,
  rejectionReason?: string
): Promise<{ success: boolean; error?: string }> {
  const updates: Record<string, any> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === 'approved') {
    updates.approver_id = approverId;
    updates.approved_at = new Date().toISOString();
  } else if (status === 'rejected') {
    updates.rejected_at = new Date().toISOString();
    updates.rejection_reason = rejectionReason || null;
  } else if (status === 'completed') {
    updates.completed_at = new Date().toISOString();
  } else if (status === 'processing') {
    updates.processed_at = new Date().toISOString();
  }

  const { data: existing } = await supabase
    .from('refund_records')
    .select('timeline')
    .eq('id', refundId)
    .single();

  const timeline = existing?.timeline || [];
  timeline.push({
    action: status,
    actor: approverName,
    timestamp: new Date().toISOString(),
    note: rejectionReason || `Status changed to ${status}`,
  });
  updates.timeline = timeline;

  const { error } = await supabase.from('refund_records').update(updates).eq('id', refundId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ============================================================
// Financial Audit Logs Service
// ============================================================

export async function getFinancialAuditLogs(
  limit = 50,
  offset = 0,
  actionFilter?: string
): Promise<{ logs: FinancialAuditLog[]; total: number }> {
  let query = supabase.from('financial_audit_logs').select('*', { count: 'exact' });
  if (actionFilter) query = query.eq('action', actionFilter);
  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  const { data, error, count } = await query;
  if (error) {
    console.error('Failed to get audit logs:', error);
    return { logs: [], total: 0 };
  }
  return { logs: (data || []) as FinancialAuditLog[], total: count || 0 };
}

// ============================================================
// Withdrawal Center Service
// ============================================================

export async function getWithdrawalQueue(
  statusFilter?: string | null,
  limit = 50,
  offset = 0
): Promise<{ records: any[]; total: number }> {
  let query = supabase.from('withdrawal_requests').select('*', { count: 'exact' });
  if (statusFilter) query = query.eq('status', statusFilter);
  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  const { data, error, count } = await query;
  if (error) {
    console.error('Failed to get withdrawal queue:', error);
    return { records: [], total: 0 };
  }
  return { records: data || [], total: count || 0 };
}

// ============================================================
// Export Functions
// ============================================================

export function exportTransactionsToCSV(transactions: DetailedTransaction[]): string {
  const headers = [
    'Transaction ID', 'Reference', 'Receipt Number', 'Date', 'Type', 'Amount',
    'Currency', 'Status', 'Category', 'Gateway', 'Description', 'Balance Before',
    'Balance After', 'Payment Provider',
  ];
  const rows = transactions.map(t => [
    t.id, t.reference || '', t.receipt_number || '',
    new Date(t.created_at).toISOString(), t.type, t.amount.toString(),
    t.currency, t.status, t.category || '', t.gateway || '',
    (t.description || '').replace(/,/g, ';'),
    t.balance_before?.toString() || '', t.balance_after?.toString() || '',
    t.payment_provider || '',
  ]);
  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

export function exportRefundsToCSV(refunds: RefundRecord[]): string {
  const headers = [
    'Refund Number', 'Transaction ID', 'Amount', 'Currency', 'Status',
    'Reason', 'Created At', 'Approved At', 'Completed At',
  ];
  const rows = refunds.map(r => [
    r.refund_number, r.transaction_id, r.amount.toString(), r.currency,
    r.status, (r.reason || '').replace(/,/g, ';'),
    new Date(r.created_at).toISOString(),
    r.approved_at ? new Date(r.approved_at).toISOString() : '',
    r.completed_at ? new Date(r.completed_at).toISOString() : '',
  ]);
  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

export function downloadCSVFile(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================================
// Helper Functions
// ============================================================

export const TRANSACTION_CATEGORIES: { value: TransactionCategory; label: string; icon: string }[] = [
  { value: 'wallet', label: 'Wallet', icon: 'wallet' },
  { value: 'purchases', label: 'Purchases', icon: 'shopping' },
  { value: 'withdrawals', label: 'Withdrawals', icon: 'arrow-down' },
  { value: 'earnings', label: 'Earnings', icon: 'trending-up' },
  { value: 'referral', label: 'Referral', icon: 'users' },
  { value: 'affiliate', label: 'Affiliate', icon: 'link' },
  { value: 'advertising', label: 'Advertising', icon: 'megaphone' },
  { value: 'subscription', label: 'Subscription', icon: 'repeat' },
  { value: 'escrow', label: 'Escrow', icon: 'shield' },
];

export const TRANSACTION_STATUSES: { value: TransactionStatus; label: string; color: string }[] = [
  { value: 'pending', label: 'Pending', color: 'amber' },
  { value: 'processing', label: 'Processing', color: 'blue' },
  { value: 'completed', label: 'Successful', color: 'green' },
  { value: 'failed', label: 'Failed', color: 'red' },
  { value: 'cancelled', label: 'Cancelled', color: 'gray' },
  { value: 'refunded', label: 'Refunded', color: 'purple' },
  { value: 'reversed', label: 'Reversed', color: 'orange' },
  { value: 'disputed', label: 'Disputed', color: 'pink' },
];

export const DATE_RANGES: { value: string; label: string; days: number | null }[] = [
  { value: 'today', label: 'Today', days: 0 },
  { value: 'yesterday', label: 'Yesterday', days: 1 },
  { value: '7days', label: 'Last 7 Days', days: 7 },
  { value: '30days', label: 'Last 30 Days', days: 30 },
  { value: 'this_month', label: 'This Month', days: null },
  { value: 'last_month', label: 'Last Month', days: null },
  { value: 'this_year', label: 'This Year', days: null },
  { value: 'custom', label: 'Custom', days: null },
];

export function getDateRange(value: string): { from: string | null; to: string | null } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (value) {
    case 'today':
      return { from: today.toISOString(), to: new Date(today.getTime() + 86400000).toISOString() };
    case 'yesterday': {
      const yesterday = new Date(today.getTime() - 86400000);
      return { from: yesterday.toISOString(), to: today.toISOString() };
    }
    case '7days':
      return { from: new Date(today.getTime() - 7 * 86400000).toISOString(), to: now.toISOString() };
    case '30days':
      return { from: new Date(today.getTime() - 30 * 86400000).toISOString(), to: now.toISOString() };
    case 'this_month':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), to: now.toISOString() };
    case 'last_month': {
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      return { from: lastMonth.toISOString(), to: lastMonthEnd.toISOString() };
    }
    case 'this_year':
      return { from: new Date(now.getFullYear(), 0, 1).toISOString(), to: now.toISOString() };
    default:
      return { from: null, to: null };
  }
}

export function getStatusColor(status: TransactionStatus): string {
  const found = TRANSACTION_STATUSES.find(s => s.value === status);
  return found?.color || 'gray';
}

export function getCategoryIcon(category: string | null): string {
  const found = TRANSACTION_CATEGORIES.find(c => c.value === category);
  return found?.icon || 'wallet';
}

export { formatCurrency };
