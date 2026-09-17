import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DollarSign, Search, CheckCircle, Clock, Loader2,
  Percent, Save, AlertTriangle, X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { emitEvent } from '../../lib/notificationEvents';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency } from '../../lib/currency';

interface PayoutRecord {
  id: string;
  user_id: string;
  amount: number;
  payout_type: string;
  status: string;
  admin_approval_percentage: number;
  notes: string | null;
  sales_record_id: string | null;
  verification_id: string | null;
  product_id: string | null;
  processed_at: string | null;
  created_at: string;
  user_email?: string;
  user_name?: string;
}

type PayoutRpcResult = {
  success?: boolean;
  already_processed?: boolean;
  status?: string;
  approved_amount?: number;
  balance_after?: number;
};

export default function AdminPayoutsPage() {
  const { user } = useAuth();
  const [payouts, setPayouts] = useState<PayoutRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'paid' | 'all'>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [selectedPayout, setSelectedPayout] = useState<PayoutRecord | null>(null);
  const [approvalPercentage, setApprovalPercentage] = useState('100');
  const [approvalNotes, setApprovalNotes] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    fetchPayouts();
  }, [statusFilter]);

  const fetchPayouts = async () => {
    setLoading(true);
    setActionError(null);
    try {
      let query = supabase.from('payout_records').select('*');
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      query = query.order('created_at', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;

      if (data && data.length > 0) {
        const userIds = [...new Set((data as PayoutRecord[]).map((payout) => payout.user_id))];
        const { data: users, error: usersError } = await supabase
          .from('users')
          .select('id, email, full_name')
          .in('id', userIds);
        if (usersError) throw usersError;

        const userMap = new Map((users || []).map((item) => [item.id, { email: item.email, name: item.full_name }]));
        setPayouts((data as PayoutRecord[]).map((payout) => ({
          ...payout,
          user_email: userMap.get(payout.user_id)?.email || 'Unknown',
          user_name: userMap.get(payout.user_id)?.name || 'Unknown',
        })));
      } else {
        setPayouts([]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load payouts';
      console.error('Error fetching payouts:', error);
      setActionError(message);
    } finally {
      setLoading(false);
    }
  };

  const openApprovalModal = (payout: PayoutRecord) => {
    setSelectedPayout(payout);
    setApprovalPercentage('100');
    setApprovalNotes('');
    setActionError(null);
    setShowApprovalModal(true);
  };

  const approvePayout = async () => {
    if (!selectedPayout || !user?.id) return;

    const percentage = Number(approvalPercentage);
    if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100) {
      setActionError('Approval percentage must be greater than 0 and no more than 100.');
      return;
    }

    setProcessingId(selectedPayout.id);
    setActionError(null);
    try {
      const { data, error } = await supabase.rpc('admin_approve_payout_record', {
        p_payout_id: selectedPayout.id,
        p_approval_percentage: percentage,
        p_notes: approvalNotes.trim() || null,
      });
      if (error) throw error;

      const result = (data || {}) as PayoutRpcResult;
      const approvedAmount = result.approved_amount ?? (selectedPayout.amount * percentage) / 100;

      if (!result.already_processed) {
        await emitEvent({
          module: 'wallet',
          eventType: 'payment_received',
          recipientIds: selectedPayout.user_id,
          actorId: user.id,
          metadata: {
            amount: approvedAmount,
            currency: 'USD',
            reference: selectedPayout.id,
          },
        });
      }

      setShowApprovalModal(false);
      setSelectedPayout(null);
      await fetchPayouts();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to approve payout';
      console.error('Error approving payout:', error);
      setActionError(message);
    } finally {
      setProcessingId(null);
    }
  };

  const markAsPaid = async (payout: PayoutRecord) => {
    if (!user?.id) return;
    setProcessingId(payout.id);
    setActionError(null);
    try {
      const { data, error } = await supabase.rpc('admin_mark_payout_paid', {
        p_payout_id: payout.id,
      });
      if (error) throw error;

      const result = (data || {}) as PayoutRpcResult;
      if (!result.already_processed) {
        const approvedAmount = payout.amount * (Number(payout.admin_approval_percentage || 100) / 100);
        await emitEvent({
          module: 'wallet',
          eventType: 'withdrawal_completed',
          recipientIds: payout.user_id,
          actorId: user.id,
          metadata: {
            amount: approvedAmount,
            currency: 'USD',
            reference: payout.id,
          },
        });
      }

      await fetchPayouts();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to mark payout as paid';
      console.error('Error marking payout as paid:', error);
      setActionError(message);
    } finally {
      setProcessingId(null);
    }
  };

  const filteredPayouts = payouts.filter((payout) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return payout.user_email?.toLowerCase().includes(query)
      || payout.user_name?.toLowerCase().includes(query)
      || payout.payout_type.toLowerCase().includes(query);
  });

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Payout Records</h1>
        <p className="text-gray-500 mt-1">Review payout records through atomic wallet operations</p>
      </div>

      {actionError && (
        <div className="mb-4 p-3 rounded-xl border border-red-100 bg-red-50 text-red-700 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by user or type..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all bg-white text-gray-900"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['pending', 'approved', 'paid', 'all'] as const).map((status) => (
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
      ) : filteredPayouts.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <DollarSign className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-900 font-semibold text-lg">No payout records</p>
          <p className="text-sm text-gray-500 mt-1">{statusFilter === 'pending' ? 'Pending payout records will appear here.' : 'Try a different filter.'}</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600">User</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600">Type</th>
                  <th className="text-right px-6 py-4 text-sm font-semibold text-gray-600">Amount</th>
                  <th className="text-center px-6 py-4 text-sm font-semibold text-gray-600">Approval %</th>
                  <th className="text-center px-6 py-4 text-sm font-semibold text-gray-600">Status</th>
                  <th className="text-center px-6 py-4 text-sm font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredPayouts.map((payout, index) => (
                  <motion.tr key={payout.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: index * 0.02 }} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-900">{payout.user_name || 'Unknown'}</p>
                      <p className="text-xs text-gray-500">{payout.user_email}</p>
                    </td>
                    <td className="px-6 py-4 text-gray-600 capitalize">{payout.payout_type.replace(/_/g, ' ')}</td>
                    <td className="px-6 py-4 text-right font-semibold text-gray-900">{formatCurrency(Number(payout.amount))}</td>
                    <td className="px-6 py-4 text-center">
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">{Number(payout.admin_approval_percentage || 0)}%</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${payout.status === 'paid' ? 'bg-success-muted text-success' : payout.status === 'approved' ? 'bg-primary-100 text-primary-600' : 'bg-warning-muted text-warning'}`}>
                        {payout.status === 'pending' ? <Clock className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
                        {payout.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {payout.status === 'pending' && (
                        <button onClick={() => openApprovalModal(payout)} disabled={processingId === payout.id || !user?.id} className="px-3 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
                          Review
                        </button>
                      )}
                      {payout.status === 'approved' && (
                        <button onClick={() => markAsPaid(payout)} disabled={processingId === payout.id || !user?.id} className="px-3 py-2 bg-success text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 inline-flex items-center gap-1">
                          {processingId === payout.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                          Mark paid
                        </button>
                      )}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AnimatePresence>
        {showApprovalModal && selectedPayout && (
          <motion.div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowApprovalModal(false)}>
            <motion.div className="w-full max-w-md bg-white rounded-2xl p-6" initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }} onClick={(event) => event.stopPropagation()}>
              <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Approve payout</h2>
                  <p className="text-sm text-gray-500">Original amount: {formatCurrency(Number(selectedPayout.amount))}</p>
                </div>
                <button onClick={() => setShowApprovalModal(false)} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
              </div>

              <label className="block text-sm font-medium text-gray-700 mb-2">Approval percentage</label>
              <div className="relative mb-4">
                <Percent className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="number" min="0.01" max="100" step="0.01" value={approvalPercentage} onChange={(event) => setApprovalPercentage(event.target.value)} className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 outline-none focus:border-primary-500" />
              </div>

              <label className="block text-sm font-medium text-gray-700 mb-2">Review notes</label>
              <textarea value={approvalNotes} onChange={(event) => setApprovalNotes(event.target.value)} rows={3} placeholder="Optional internal note" className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none focus:border-primary-500 resize-none mb-5" />

              <div className="rounded-xl bg-gray-50 p-3 mb-5 flex items-center justify-between">
                <span className="text-sm text-gray-500">Amount to credit</span>
                <span className="font-bold text-gray-900">{formatCurrency(Number(selectedPayout.amount) * (Number(approvalPercentage || 0) / 100))}</span>
              </div>

              <button onClick={approvePayout} disabled={processingId === selectedPayout.id || !user?.id} className="w-full py-3 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700 disabled:opacity-50 inline-flex items-center justify-center gap-2">
                {processingId === selectedPayout.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Approve and credit wallet
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
