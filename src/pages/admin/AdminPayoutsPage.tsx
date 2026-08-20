import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DollarSign,
  Search,
  CheckCircle,
  Clock,
  Loader2,
  Percent,
  Save,
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

  useEffect(() => {
    fetchPayouts();
  }, [user, statusFilter]);

  const fetchPayouts = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('payout_records')
        .select('*');

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      query = query.order('created_at', { ascending: false });

      const { data } = await query;

      if (data && data.length > 0) {
        const userIds = [...new Set(data.map((p: PayoutRecord) => p.user_id))];
        const { data: users } = await supabase
          .from('users')
          .select('id, email, full_name')
          .in('id', userIds);

        const userMap = new Map(
          users?.map(u => [u.id, { email: u.email, name: u.full_name }]) || []
        );

        setPayouts(data.map((p: PayoutRecord) => ({
          ...p,
          user_email: userMap.get(p.user_id)?.email || 'Unknown',
          user_name: userMap.get(p.user_id)?.name || 'Unknown',
        })));
      } else {
        setPayouts([]);
      }
    } catch (error) {
      console.error('Error fetching payouts:', error);
    } finally {
      setLoading(false);
    }
  };

  const openApprovalModal = (payout: PayoutRecord) => {
    setSelectedPayout(payout);
    setApprovalPercentage('100');
    setApprovalNotes('');
    setShowApprovalModal(true);
  };

  const approvePayout = async () => {
    if (!selectedPayout) return;

    setProcessingId(selectedPayout.id);
    try {
      const percentage = parseFloat(approvalPercentage) || 100;
      const approvedAmount = (selectedPayout.amount * percentage) / 100;

      // Update payout status
      await supabase
        .from('payout_records')
        .update({
          status: 'approved',
          admin_approval_percentage: percentage,
          notes: approvalNotes.trim() || null,
          processed_by: user?.id,
          processed_at: new Date().toISOString(),
        })
        .eq('id', selectedPayout.id);

      // Add amount to user balance
      const { data: userData } = await supabase
        .from('users')
        .select('balance')
        .eq('id', selectedPayout.user_id)
        .single();

      if (userData) {
        const newBalance = (userData.balance || 0) + approvedAmount;
        await supabase
          .from('users')
          .update({ balance: newBalance })
          .eq('id', selectedPayout.user_id);
      }

      // Log action
      await supabase.from('admin_logs').insert({
        admin_id: user?.id,
        action_type: 'approve_payout',
        target_id: selectedPayout.id,
        target_type: 'payout_record',
        details: {
          payout_id: selectedPayout.id,
          original_amount: selectedPayout.amount,
          approved_amount: approvedAmount,
          percentage: percentage,
        },
      });

      // Notify user
      await emitEvent({
        module: 'wallet',
        eventType: 'withdrawal_completed',
        recipientIds: selectedPayout.user_id,
        actorId: user?.id,
        metadata: {
          amount: approvedAmount,
          currency: 'USD',
          reference: selectedPayout.id,
        },
      });

      setShowApprovalModal(false);
      setSelectedPayout(null);
      fetchPayouts();
    } catch (error) {
      console.error('Error approving payout:', error);
    } finally {
      setProcessingId(null);
    }
  };

  const markAsPaid = async (payout: PayoutRecord) => {
    setProcessingId(payout.id);
    try {
      await supabase
        .from('payout_records')
        .update({
          status: 'paid',
          processed_by: user?.id,
          processed_at: new Date().toISOString(),
        })
        .eq('id', payout.id);

      await supabase.from('admin_logs').insert({
        admin_id: user?.id,
        action_type: 'mark_paid',
        target_id: payout.id,
        target_type: 'payout_record',
        details: { payout_id: payout.id },
      });

      await emitEvent({
        module: 'wallet',
        eventType: 'withdrawal_completed',
        recipientIds: payout.user_id,
        actorId: user?.id,
        metadata: {
          amount: payout.amount,
          currency: 'USD',
          reference: payout.id,
        },
      });

      fetchPayouts();
    } catch (error) {
      console.error('Error marking as paid:', error);
    } finally {
      setProcessingId(null);
    }
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  const filteredPayouts = payouts.filter(p => {
    const q = searchQuery.toLowerCase();
    return p.user_email?.toLowerCase().includes(q) || p.payout_type.toLowerCase().includes(q);
  });

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Payout Records</h1>
        <p className="text-gray-500 mt-1">Review and approve commission payouts</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by user or type..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all bg-white text-gray-900"
          />
        </div>
        <div className="flex gap-2">
          {(['pending', 'approved', 'paid', 'all'] as const).map((status) => (
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
      {!loading && filteredPayouts.length === 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <DollarSign className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-900 font-semibold text-lg">No payout records</p>
          <p className="text-sm text-gray-500 mt-1">
            {statusFilter === 'pending'
              ? 'Approved verifications will create payout records'
              : 'Try a different filter'}
          </p>
        </div>
      )}

      {/* Payout List */}
      {!loading && filteredPayouts.length > 0 && (
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
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600">Date</th>
                  <th className="text-center px-6 py-4 text-sm font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredPayouts.map((payout, index) => (
                  <motion.tr
                    key={payout.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: index * 0.03 }}
                    className="hover:bg-gray-50"
                  >
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-900">{payout.user_name || 'Unknown'}</p>
                      <p className="text-xs text-gray-500">{payout.user_email}</p>
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {payout.payout_type.replace('_', ' ')}
                    </td>
                    <td className="px-6 py-4 text-right font-semibold text-gray-900">
                      {formatCurrency(payout.amount)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        payout.admin_approval_percentage >= 100
                          ? 'bg-success-muted text-success'
                          : payout.admin_approval_percentage > 0
                          ? 'bg-warning-muted text-warning'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {payout.admin_approval_percentage}%
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                        payout.status === 'paid'
                          ? 'bg-success-muted text-success'
                          : payout.status === 'approved'
                          ? 'bg-primary-100 text-primary-600'
                          : 'bg-warning-muted text-warning'
                      }`}>
                        {payout.status === 'paid' && <CheckCircle className="w-3 h-3" />}
                        {payout.status === 'approved' && <CheckCircle className="w-3 h-3" />}
                        {payout.status === 'pending' && <Clock className="w-3 h-3" />}
                        {payout.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {formatDate(payout.created_at)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center gap-2">
                        {payout.status === 'pending' && (
                          <button
                            onClick={() => openApprovalModal(payout)}
                            disabled={processingId === payout.id}
                            className="px-3 py-2 bg-success text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50 min-h-[40px]"
                          >
                            {processingId === payout.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              'Approve'
                            )}
                          </button>
                        )}
                        {payout.status === 'approved' && (
                          <button
                            onClick={() => markAsPaid(payout)}
                            disabled={processingId === payout.id}
                            className="px-3 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 min-h-[40px]"
                          >
                            {processingId === payout.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              'Mark Paid'
                            )}
                          </button>
                        )}
                        {!['pending', 'approved'].includes(payout.status) && (
                          <span className="text-xs text-gray-400">No actions</span>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Approval Modal */}
      <AnimatePresence>
        {showApprovalModal && selectedPayout && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowApprovalModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-success-muted rounded-xl">
                  <DollarSign className="w-6 h-6 text-success" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">Approve Payout</h3>
                  <p className="text-sm text-gray-500">
                    {formatCurrency(selectedPayout.amount)} to {selectedPayout.user_email}
                  </p>
                </div>
              </div>

              <div className="space-y-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Approval Percentage
                  </label>
                  <div className="relative">
                    <Percent className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={approvalPercentage}
                      onChange={(e) => setApprovalPercentage(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all text-gray-900"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    User receives: {formatCurrency((selectedPayout.amount * (parseFloat(approvalPercentage) || 0)) / 100)}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Notes (optional)
                  </label>
                  <textarea
                    value={approvalNotes}
                    onChange={(e) => setApprovalNotes(e.target.value)}
                    placeholder="Add any notes about this approval..."
                    rows={2}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all text-gray-900 resize-none"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowApprovalModal(false)}
                  className="flex-1 py-3 border border-gray-200 rounded-xl font-medium text-gray-600 hover:bg-gray-50 transition-colors min-h-[48px]"
                >
                  Cancel
                </button>
                <button
                  onClick={approvePayout}
                  disabled={processingId === selectedPayout.id}
                  className="flex-1 py-3 bg-success text-white rounded-xl font-medium hover:bg-green-700 transition-colors disabled:opacity-50 min-h-[48px] flex items-center justify-center gap-2"
                >
                  {processingId === selectedPayout.id ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Approve
                    </>
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
