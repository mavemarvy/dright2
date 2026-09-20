import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Banknote, Search, CheckCircle, XCircle, Clock,
  Loader2, CreditCard, AlertTriangle, X, Copy, ShieldCheck,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { emitEvent } from '../../lib/notificationEvents';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency } from '../../lib/currency';

interface WithdrawalRequest {
  id: string;
  user_id: string;
  amount: number;
  payment_method: string | null;
  account_details: string;
  status: string;
  admin_notes: string | null;
  processed_at: string | null;
  created_at: string;
  reference?: string | null;
  bank_account_id?: string | null;
  user_email?: string;
  user_name?: string;
  bank_name?: string | null;
  verified_account_number?: string | null;
  verified_account_name?: string | null;
  verified_account?: boolean;
  payout_queue_status?: string | null;
}

type WithdrawalRpcResult = {
  success?: boolean;
  already_processed?: boolean;
  action?: string;
  predebited?: boolean;
};

export default function AdminWithdrawalsPage() {
  const { user } = useAuth();
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected' | 'paid' | 'all'>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<WithdrawalRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [copiedWithdrawalId, setCopiedWithdrawalId] = useState<string | null>(null);

  useEffect(() => {
    fetchWithdrawals();
  }, [statusFilter]);

  const fetchWithdrawals = async () => {
    setLoading(true);
    setActionError(null);
    try {
      let query = supabase.from('withdrawal_requests').select('*');
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      query = query.order('created_at', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;

      if (data && data.length > 0) {
        const rows = data as WithdrawalRequest[];
        const userIds = [...new Set(rows.map((withdrawal) => withdrawal.user_id))];
        const withdrawalIds = rows.map((withdrawal) => withdrawal.id);
        const bankAccountIds = [...new Set(rows.map((withdrawal) => withdrawal.bank_account_id).filter(Boolean))] as string[];

        const [{ data: users, error: usersError }, { data: queues, error: queueError }, bankResult] = await Promise.all([
          supabase.from('users').select('id, email, full_name').in('id', userIds),
          supabase
            .from('withdrawal_queue')
            .select('withdrawal_request_id, account_number, account_name, recipient_code, status')
            .in('withdrawal_request_id', withdrawalIds),
          bankAccountIds.length > 0
            ? supabase.from('bank_accounts').select('id, bank_name, is_verified, verification_status').in('id', bankAccountIds)
            : Promise.resolve({ data: [], error: null }),
        ]);

        if (usersError) throw usersError;
        if (queueError) throw queueError;
        if (bankResult.error) throw bankResult.error;

        const userMap = new Map((users || []).map((item) => [item.id, { email: item.email, name: item.full_name }]));
        const queueMap = new Map((queues || []).map((item) => [item.withdrawal_request_id, item]));
        const bankMap = new Map((bankResult.data || []).map((item) => [item.id, item]));

        setWithdrawals(rows.map((withdrawal) => {
          const queue = queueMap.get(withdrawal.id);
          const bank = withdrawal.bank_account_id ? bankMap.get(withdrawal.bank_account_id) : null;
          const fallbackBankName = withdrawal.account_details?.split(' - ')[0] || null;
          return {
            ...withdrawal,
            user_email: userMap.get(withdrawal.user_id)?.email || 'Unknown',
            user_name: userMap.get(withdrawal.user_id)?.name || 'Unknown',
            bank_name: bank?.bank_name || fallbackBankName,
            verified_account_number: queue?.account_number || null,
            verified_account_name: queue?.account_name || null,
            verified_account: Boolean(
              queue?.recipient_code ||
              bank?.is_verified ||
              bank?.verification_status === 'verified'
            ),
            payout_queue_status: queue?.status || null,
          };
        }));
      } else {
        setWithdrawals([]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load withdrawals';
      console.error('Error fetching withdrawals:', error);
      setActionError(message);
    } finally {
      setLoading(false);
    }
  };

  const runWithdrawalAction = async (
    withdrawal: WithdrawalRequest,
    action: 'approve' | 'reject' | 'paid',
    reason?: string,
  ) => {
    if (!user?.id) return false;
    setProcessingId(withdrawal.id);
    setActionError(null);
    try {
      const { data, error } = await supabase.rpc('admin_manage_withdrawal', {
        p_withdrawal_id: withdrawal.id,
        p_action: action,
        p_reason: reason?.trim() || null,
      });
      if (error) throw error;

      const result = (data || {}) as WithdrawalRpcResult;
      if (!result.already_processed) {
        const eventType = action === 'approve'
          ? 'withdrawal_approved'
          : action === 'reject'
            ? 'withdrawal_rejected'
            : 'withdrawal_completed';

        await emitEvent({
          module: 'wallet',
          eventType,
          recipientIds: withdrawal.user_id,
          actorId: user.id,
          metadata: {
            amount: Number(withdrawal.amount),
            currency: 'NGN',
            reference: withdrawal.reference || withdrawal.id,
            reason: reason?.trim() || undefined,
          },
        });
      }

      await fetchWithdrawals();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : `Failed to ${action} withdrawal`;
      console.error(`Error running withdrawal action ${action}:`, error);
      setActionError(message);
      return false;
    } finally {
      setProcessingId(null);
    }
  };

  const approveWithdrawal = async (withdrawal: WithdrawalRequest) => {
    await runWithdrawalAction(withdrawal, 'approve');
  };

  const markManualAsPaid = async (withdrawal: WithdrawalRequest) => {
    if (!user?.id) return;

    const payoutName = withdrawal.verified_account_name || 'the verified account holder';
    const payoutNumber = withdrawal.verified_account_number || 'the saved account number';
    const confirmed = window.confirm(
      `Only continue after you have manually sent ${formatCurrency(Number(withdrawal.amount), 'NGN')} to ${payoutName} (${payoutNumber}). Mark this withdrawal as paid?`
    );
    if (!confirmed) return;

    setProcessingId(withdrawal.id);
    setActionError(null);
    try {
      const { data, error } = await supabase.functions.invoke('admin-manual-withdrawal-paid', {
        body: { withdrawal_id: withdrawal.id },
      });
      if (error) throw error;

      const result = data as { success?: boolean; error?: string; status?: string } | null;
      if (!result?.success) throw new Error(result?.error || 'Unable to mark manual withdrawal as paid');

      await emitEvent({
        module: 'wallet',
        eventType: 'withdrawal_completed',
        recipientIds: withdrawal.user_id,
        actorId: user.id,
        metadata: {
          amount: Number(withdrawal.amount),
          currency: 'NGN',
          reference: withdrawal.reference || withdrawal.id,
          method: 'manual_bank_transfer',
        },
      });

      await fetchWithdrawals();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to mark manual withdrawal as paid';
      console.error('Error completing manual withdrawal:', error);
      setActionError(message);
    } finally {
      setProcessingId(null);
    }
  };

  const copyAccountNumber = async (withdrawal: WithdrawalRequest) => {
    const accountNumber = withdrawal.verified_account_number;
    if (!accountNumber) return;
    try {
      await navigator.clipboard.writeText(accountNumber);
      setCopiedWithdrawalId(withdrawal.id);
      window.setTimeout(() => setCopiedWithdrawalId((current) => current === withdrawal.id ? null : current), 1500);
    } catch {
      setActionError('Could not copy the account number. Press and hold the number to copy it manually.');
    }
  };

  const openRejectModal = (withdrawal: WithdrawalRequest) => {
    setSelectedWithdrawal(withdrawal);
    setRejectionReason('');
    setActionError(null);
    setShowRejectModal(true);
  };

  const rejectWithdrawal = async () => {
    if (!selectedWithdrawal || !rejectionReason.trim()) return;
    const success = await runWithdrawalAction(selectedWithdrawal, 'reject', rejectionReason);
    if (success) {
      setShowRejectModal(false);
      setSelectedWithdrawal(null);
      setRejectionReason('');
    }
  };

  const filteredWithdrawals = withdrawals.filter((withdrawal) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return withdrawal.user_email?.toLowerCase().includes(query)
      || withdrawal.user_name?.toLowerCase().includes(query)
      || withdrawal.payment_method?.toLowerCase().includes(query)
      || withdrawal.reference?.toLowerCase().includes(query)
      || withdrawal.bank_name?.toLowerCase().includes(query)
      || withdrawal.verified_account_name?.toLowerCase().includes(query)
      || withdrawal.verified_account_number?.includes(query);
  });

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Withdrawal Requests</h1>
        <p className="text-gray-500 mt-1">Review verified payout details, send bank transfers manually, then mark withdrawals paid</p>
      </div>

      {actionError && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by user, method, or reference..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all bg-white text-gray-900"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['pending', 'approved', 'paid', 'rejected', 'all'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-3 rounded-xl font-medium transition-all min-h-[48px] ${statusFilter === status ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-primary-300'}`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>
      ) : filteredWithdrawals.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <Banknote className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-900 font-semibold text-lg">No withdrawal requests</p>
          <p className="text-sm text-gray-500 mt-1">{statusFilter === 'pending' ? 'New withdrawal requests will appear here.' : 'Try a different filter.'}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredWithdrawals.map((withdrawal, index) => (
            <motion.div
              key={withdrawal.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
            >
              <div className="flex flex-col sm:flex-row gap-4 p-5">
                <div className="shrink-0 flex items-center justify-center">
                  <div className="w-20 h-20 bg-gradient-to-br from-success to-green-600 rounded-2xl flex flex-col items-center justify-center text-white">
                    <Banknote className="w-6 h-6 mb-1" />
                    <span className="text-sm font-bold">{formatCurrency(Number(withdrawal.amount), 'NGN')}</span>
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <p className="font-semibold text-gray-900">{withdrawal.user_name || 'Unknown'}</p>
                      <p className="text-sm text-gray-500">{withdrawal.user_email}</p>
                      {withdrawal.reference && <p className="text-xs font-mono text-gray-400 mt-1">{withdrawal.reference}</p>}
                    </div>
                    <div className="text-right">
                      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${withdrawal.status === 'paid' ? 'bg-success-muted text-success' : withdrawal.status === 'approved' ? 'bg-primary-100 text-primary-600' : withdrawal.status === 'rejected' ? 'bg-error-muted text-error' : 'bg-warning-muted text-warning'}`}>
                        {withdrawal.status === 'rejected' ? <XCircle className="w-3 h-3" /> : withdrawal.status === 'pending' ? <Clock className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
                        {withdrawal.status.toUpperCase()}
                      </span>
                      <p className="text-xs text-gray-500 mt-1">{new Date(withdrawal.created_at).toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-3">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-blue-600" />
                        <span className="text-sm font-semibold text-blue-900">Manual bank payout details</span>
                      </div>
                      {withdrawal.verified_account && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-semibold">
                          <ShieldCheck className="w-3 h-3" />Verified
                        </span>
                      )}
                    </div>

                    {withdrawal.verified_account_number && withdrawal.verified_account_name ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-blue-500 font-semibold">Bank</p>
                          <p className="font-semibold text-gray-900 mt-0.5">{withdrawal.bank_name || 'Verified bank account'}</p>
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-blue-500 font-semibold">Amount to send</p>
                          <p className="font-bold text-gray-900 mt-0.5">{formatCurrency(Number(withdrawal.amount), 'NGN')}</p>
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-blue-500 font-semibold">Verified account name</p>
                          <p className="font-semibold text-gray-900 mt-0.5 break-words">{withdrawal.verified_account_name}</p>
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-blue-500 font-semibold">Account number</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="font-mono font-bold text-gray-900 text-base select-all">{withdrawal.verified_account_number}</p>
                            <button
                              type="button"
                              onClick={() => void copyAccountNumber(withdrawal)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-blue-200 text-blue-700 text-xs font-medium hover:bg-blue-100"
                            >
                              <Copy className="w-3 h-3" />
                              {copiedWithdrawalId === withdrawal.id ? 'Copied' : 'Copy'}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-600 break-words">{withdrawal.account_details || 'No verified payout details were found for this withdrawal.'}</p>
                    )}

                    <p className="text-[11px] text-blue-600 mt-3">
                      Send this exact NGN amount manually. Only mark the withdrawal paid after your bank confirms the transfer.
                    </p>
                  </div>

                  {withdrawal.admin_notes && (
                    <div className="mb-3 p-3 rounded-xl bg-red-50 text-sm text-red-700">
                      {withdrawal.admin_notes}
                    </div>
                  )}

                  <div className="flex gap-2 flex-wrap">
                    {withdrawal.status === 'pending' && (
                      <>
                        <button
                          onClick={() => void markManualAsPaid(withdrawal)}
                          disabled={processingId === withdrawal.id || !user?.id || !withdrawal.verified_account_number || !withdrawal.verified_account_name}
                          className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1"
                        >
                          {processingId === withdrawal.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                          Mark Paid — Manual Transfer
                        </button>
                        <button
                          onClick={() => approveWithdrawal(withdrawal)}
                          disabled={processingId === withdrawal.id || !user?.id}
                          className="px-4 py-2 bg-primary-50 text-primary-700 rounded-lg text-sm font-medium hover:bg-primary-100 disabled:opacity-50"
                        >
                          Approve only
                        </button>
                        <button
                          onClick={() => openRejectModal(withdrawal)}
                          disabled={processingId === withdrawal.id || !user?.id}
                          className="px-4 py-2 bg-red-50 text-red-700 rounded-lg text-sm font-medium hover:bg-red-100 disabled:opacity-50 inline-flex items-center gap-1"
                        >
                          <XCircle className="w-4 h-4" /> Reject
                        </button>
                      </>
                    )}
                    {withdrawal.status === 'approved' && (
                      <>
                        <button
                          onClick={() => void markManualAsPaid(withdrawal)}
                          disabled={processingId === withdrawal.id || !user?.id}
                          className="px-4 py-2 bg-success text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 inline-flex items-center gap-1"
                        >
                          {processingId === withdrawal.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                          Mark Paid — Manual Transfer
                        </button>
                        <button
                          onClick={() => openRejectModal(withdrawal)}
                          disabled={processingId === withdrawal.id || !user?.id}
                          className="px-4 py-2 bg-red-50 text-red-700 rounded-lg text-sm font-medium hover:bg-red-100 disabled:opacity-50"
                        >
                          Reject / refund
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showRejectModal && selectedWithdrawal && (
          <motion.div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowRejectModal(false)}>
            <motion.div className="w-full max-w-md bg-white rounded-2xl p-6" initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }} onClick={(event) => event.stopPropagation()}>
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Reject withdrawal</h2>
                  <p className="text-sm text-gray-500">For canonical pre-debited withdrawals, the server will refund the wallet atomically.</p>
                </div>
                <button onClick={() => setShowRejectModal(false)} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
              </div>
              <textarea
                value={rejectionReason}
                onChange={(event) => setRejectionReason(event.target.value)}
                rows={4}
                placeholder="Required rejection reason"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none focus:border-red-400 resize-none mb-4"
              />
              <button
                onClick={rejectWithdrawal}
                disabled={!rejectionReason.trim() || processingId === selectedWithdrawal.id || !user?.id}
                className="w-full py-3 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {processingId === selectedWithdrawal.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                Reject withdrawal
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
