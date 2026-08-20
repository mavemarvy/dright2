import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Banknote,
  Search,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
  CreditCard,
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
  user_email?: string;
  user_name?: string;
  user_balance?: number;
}

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

  useEffect(() => {
    fetchWithdrawals();
  }, [user, statusFilter]);

  const fetchWithdrawals = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('withdrawal_requests')
        .select('*');

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      query = query.order('created_at', { ascending: false });

      const { data } = await query;

      if (data && data.length > 0) {
        const userIds = [...new Set(data.map((w: WithdrawalRequest) => w.user_id))];
        const { data: users } = await supabase
          .from('users')
          .select('id, email, full_name, balance')
          .in('id', userIds);

        const userMap = new Map(
          users?.map(u => [u.id, { email: u.email, name: u.full_name, balance: u.balance }]) || []
        );

        setWithdrawals(data.map((w: WithdrawalRequest) => ({
          ...w,
          user_email: userMap.get(w.user_id)?.email || 'Unknown',
          user_name: userMap.get(w.user_id)?.name || 'Unknown',
          user_balance: userMap.get(w.user_id)?.balance || 0,
        })));
      } else {
        setWithdrawals([]);
      }
    } catch (error) {
      console.error('Error fetching withdrawals:', error);
    } finally {
      setLoading(false);
    }
  };

  const approveWithdrawal = async (withdrawal: WithdrawalRequest) => {
    setProcessingId(withdrawal.id);
    try {
      // Update withdrawal status
      await supabase
        .from('withdrawal_requests')
        .update({
          status: 'approved',
          processed_by: user?.id,
          processed_at: new Date().toISOString(),
        })
        .eq('id', withdrawal.id);

      // Log action
      await supabase.from('admin_logs').insert({
        admin_id: user?.id,
        action_type: 'approve_withdrawal',
        target_id: withdrawal.id,
        target_type: 'withdrawal_request',
        details: { withdrawal_id: withdrawal.id, amount: withdrawal.amount },
      });

      // Notify user
      await emitEvent({
        module: 'wallet',
        eventType: 'withdrawal_approved',
        recipientIds: withdrawal.user_id,
        actorId: user?.id,
        metadata: {
          amount: withdrawal.amount,
          currency: 'USD',
          reference: withdrawal.id,
        },
      });

      fetchWithdrawals();
    } catch (error) {
      console.error('Error approving withdrawal:', error);
    } finally {
      setProcessingId(null);
    }
  };

  const markAsPaid = async (withdrawal: WithdrawalRequest) => {
    setProcessingId(withdrawal.id);
    try {
      // Update withdrawal status
      await supabase
        .from('withdrawal_requests')
        .update({
          status: 'paid',
          processed_by: user?.id,
          processed_at: new Date().toISOString(),
        })
        .eq('id', withdrawal.id);

      // Deduct from user balance
      const newBalance = (withdrawal.user_balance || 0) - withdrawal.amount;
      await supabase
        .from('users')
        .update({ balance: Math.max(0, newBalance) })
        .eq('id', withdrawal.user_id);

      // Log action
      await supabase.from('admin_logs').insert({
        admin_id: user?.id,
        action_type: 'mark_withdrawal_paid',
        target_id: withdrawal.id,
        target_type: 'withdrawal_request',
        details: { withdrawal_id: withdrawal.id, amount: withdrawal.amount },
      });

      // Notify user
      await emitEvent({
        module: 'wallet',
        eventType: 'withdrawal_completed',
        recipientIds: withdrawal.user_id,
        actorId: user?.id,
        metadata: {
          amount: withdrawal.amount,
          currency: 'USD',
          reference: withdrawal.id,
        },
      });

      fetchWithdrawals();
    } catch (error) {
      console.error('Error marking as paid:', error);
    } finally {
      setProcessingId(null);
    }
  };

  const openRejectModal = (withdrawal: WithdrawalRequest) => {
    setSelectedWithdrawal(withdrawal);
    setRejectionReason('');
    setShowRejectModal(true);
  };

  const rejectWithdrawal = async () => {
    if (!selectedWithdrawal || !rejectionReason.trim()) return;

    setProcessingId(selectedWithdrawal.id);
    try {
      await supabase
        .from('withdrawal_requests')
        .update({
          status: 'rejected',
          admin_notes: rejectionReason.trim(),
          processed_by: user?.id,
          processed_at: new Date().toISOString(),
        })
        .eq('id', selectedWithdrawal.id);

      // Log action
      await supabase.from('admin_logs').insert({
        admin_id: user?.id,
        action_type: 'reject_withdrawal',
        target_id: selectedWithdrawal.id,
        target_type: 'withdrawal_request',
        details: { withdrawal_id: selectedWithdrawal.id, reason: rejectionReason.trim() },
      });

      // Notify user
      await emitEvent({
        module: 'wallet',
        eventType: 'withdrawal_rejected',
        recipientIds: selectedWithdrawal.user_id,
        actorId: user?.id,
        metadata: {
          amount: selectedWithdrawal.amount,
          currency: 'USD',
          reason: rejectionReason.trim(),
        },
      });

      setShowRejectModal(false);
      setSelectedWithdrawal(null);
      fetchWithdrawals();
    } catch (error) {
      console.error('Error rejecting withdrawal:', error);
    } finally {
      setProcessingId(null);
    }
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const filteredWithdrawals = withdrawals.filter(w => {
    const q = searchQuery.toLowerCase();
    return w.user_email?.toLowerCase().includes(q) || w.payment_method?.toLowerCase().includes(q);
  });

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Withdrawal Requests</h1>
        <p className="text-gray-500 mt-1">Process user withdrawal requests</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by user or method..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all bg-white text-gray-900"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['pending', 'approved', 'paid', 'rejected', 'all'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-3 rounded-xl font-medium transition-all min-h-[48px] ${
                statusFilter === status
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-primary-300'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-gray-300 border-t-warning rounded-full animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!loading && filteredWithdrawals.length === 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <Banknote className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-900 font-semibold text-lg">No withdrawal requests</p>
          <p className="text-sm text-gray-500 mt-1">
            {statusFilter === 'pending'
              ? 'Users can request withdrawals from their balance'
              : 'Try a different filter'}
          </p>
        </div>
      )}

      {/* Withdrawal List */}
      {!loading && filteredWithdrawals.length > 0 && (
        <div className="space-y-4">
          {filteredWithdrawals.map((withdrawal, index) => (
            <motion.div
              key={withdrawal.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
            >
              <div className="flex flex-col sm:flex-row gap-4 p-5">
                {/* Amount Badge */}
                <div className="shrink-0 flex items-center justify-center">
                  <div className="w-20 h-20 bg-gradient-to-br from-success to-green-600 rounded-2xl flex flex-col items-center justify-center text-white">
                    <Banknote className="w-6 h-6 mb-1" />
                    <span className="text-lg font-bold">{formatCurrency(withdrawal.amount)}</span>
                  </div>
                </div>

                {/* Withdrawal Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <p className="font-semibold text-gray-900">{withdrawal.user_name || 'Unknown'}</p>
                      <p className="text-sm text-gray-500">{withdrawal.user_email}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Balance: {formatCurrency(withdrawal.user_balance || 0)}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${
                        withdrawal.status === 'paid'
                          ? 'bg-success-muted text-success'
                          : withdrawal.status === 'approved'
                          ? 'bg-primary-100 text-primary-600'
                          : withdrawal.status === 'rejected'
                          ? 'bg-error-muted text-error'
                          : 'bg-warning-muted text-warning'
                      }`}>
                        {withdrawal.status === 'paid' && <CheckCircle className="w-3 h-3" />}
                        {withdrawal.status === 'approved' && <CheckCircle className="w-3 h-3" />}
                        {withdrawal.status === 'rejected' && <XCircle className="w-3 h-3" />}
                        {withdrawal.status === 'pending' && <Clock className="w-3 h-3" />}
                        {withdrawal.status.toUpperCase()}
                      </span>
                      <p className="text-xs text-gray-500 mt-1">{formatDate(withdrawal.created_at)}</p>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-xl p-3 mb-3">
                    <div className="flex items-center gap-2 mb-1">
                      <CreditCard className="w-4 h-4 text-gray-400" />
                      <span className="text-sm font-medium text-gray-700">
                        {withdrawal.payment_method || 'Bank Transfer'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 break-all">{withdrawal.account_details}</p>
                  </div>

                  {withdrawal.admin_notes && (
                    <div className="bg-error-muted rounded-lg p-2 text-sm text-error mb-3">
                      <strong>Note:</strong> {withdrawal.admin_notes}
                    </div>
                  )}

                  {/* Actions */}
                  {withdrawal.status === 'pending' && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => approveWithdrawal(withdrawal)}
                        disabled={processingId === withdrawal.id}
                        className="flex items-center gap-2 px-4 py-2 bg-success text-white rounded-xl font-medium hover:bg-green-700 transition-colors disabled:opacity-50 min-h-[44px]"
                      >
                        {processingId === withdrawal.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <CheckCircle className="w-4 h-4" />
                            Approve
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => openRejectModal(withdrawal)}
                        className="flex items-center gap-2 px-4 py-2 bg-error-muted text-error rounded-xl font-medium hover:bg-error hover:text-white transition-colors min-h-[44px]"
                      >
                        <XCircle className="w-4 h-4" />
                        Reject
                      </button>
                    </div>
                  )}

                  {withdrawal.status === 'approved' && (
                    <button
                      onClick={() => markAsPaid(withdrawal)}
                      disabled={processingId === withdrawal.id}
                      className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 min-h-[44px]"
                    >
                      {processingId === withdrawal.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Banknote className="w-4 h-4" />
                          Mark as Paid
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Reject Modal */}
      <AnimatePresence>
        {showRejectModal && selectedWithdrawal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowRejectModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-error-muted rounded-xl">
                  <AlertTriangle className="w-6 h-6 text-error" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">Reject Withdrawal</h3>
                  <p className="text-sm text-gray-500">
                    {formatCurrency(selectedWithdrawal.amount)} requested by {selectedWithdrawal.user_email}
                  </p>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reason for rejection
                </label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Explain why this withdrawal is being rejected..."
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-error focus:ring-2 focus:ring-error/20 outline-none transition-all text-gray-900 resize-none"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowRejectModal(false)}
                  className="flex-1 py-3 border border-gray-200 rounded-xl font-medium text-gray-600 hover:bg-gray-50 transition-colors min-h-[48px]"
                >
                  Cancel
                </button>
                <button
                  onClick={rejectWithdrawal}
                  disabled={!rejectionReason.trim() || processingId === selectedWithdrawal.id}
                  className="flex-1 py-3 bg-error text-white rounded-xl font-medium hover:bg-red-600 transition-colors disabled:opacity-50 min-h-[48px] flex items-center justify-center"
                >
                  {processingId === selectedWithdrawal.id ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    'Reject Withdrawal'
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
