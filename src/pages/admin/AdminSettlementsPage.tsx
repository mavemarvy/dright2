import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Receipt,
  Search,
  Loader2,
  CheckCircle,
  Clock,
  DollarSign,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { emitEvent } from '../../lib/notificationEvents';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency } from '../../lib/currency';

interface Settlement {
  id: string;
  user_id: string;
  amount: number;
  settlement_type: string;
  status: string;
  sales_record_id: string | null;
  product_id: string | null;
  notes: string | null;
  created_at: string;
  user_email?: string;
  user_name?: string;
}

export default function AdminSettlementsPage() {
  const { user } = useAuth();
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'settled' | 'all'>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    fetchSettlements();
  }, [statusFilter]);

  const fetchSettlements = async () => {
    setLoading(true);
    let query = supabase.from('internal_settlements').select('*');
    if (statusFilter !== 'all') query = query.eq('status', statusFilter);
    query = query.order('created_at', { ascending: false });
    const { data } = await query;

    if (data && data.length > 0) {
      const userIds = [...new Set(data.map((s) => s.user_id))];
      const { data: users } = await supabase
        .from('users')
        .select('id, email, full_name')
        .in('id', userIds);
      const userMap = new Map(users?.map((u) => [u.id, { email: u.email, name: u.full_name }]) || []);
      setSettlements(
        (data as Settlement[]).map((s) => ({
          ...s,
          user_email: userMap.get(s.user_id)?.email || 'Unknown',
          user_name: userMap.get(s.user_id)?.name || 'Unknown',
        }))
      );
    } else {
      setSettlements([]);
    }
    setLoading(false);
  };

  const settlePayment = async (settlement: Settlement) => {
    setProcessingId(settlement.id);
    try {
      // Add amount to user's available balance
      const { data: userData } = await supabase
        .from('users')
        .select('available_balance')
        .eq('id', settlement.user_id)
        .maybeSingle();

      if (userData) {
        const newBalance = Number(userData.available_balance) + Number(settlement.amount);
        await supabase
          .from('users')
          .update({ available_balance: newBalance })
          .eq('id', settlement.user_id);
      }

      // Mark as settled
      await supabase
        .from('internal_settlements')
        .update({
          status: 'settled',
          notes: `Settled by admin ${user?.id}`,
        })
        .eq('id', settlement.id);

      await supabase.from('admin_logs').insert({
        admin_id: user?.id,
        action_type: 'settle_payment',
        target_id: settlement.id,
        target_type: 'internal_settlement',
        details: { settlement_id: settlement.id, amount: settlement.amount },
      });

      await emitEvent({
        module: 'wallet',
        eventType: 'withdrawal_completed',
        recipientIds: settlement.user_id,
        actorId: user?.id,
        metadata: {
          amount: Number(settlement.amount),
          currency: 'USD',
          reference: settlement.id,
        },
      });

      fetchSettlements();
    } catch (err) {
      console.error('Error settling payment:', err);
    } finally {
      setProcessingId(null);
    }
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const filteredSettlements = settlements.filter((s) => {
    const q = searchQuery.toLowerCase();
    return s.user_email?.toLowerCase().includes(q) || s.settlement_type.toLowerCase().includes(q);
  });

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Receipt className="w-6 h-6 text-warning" />
          Internal Settlements
        </h1>
        <p className="text-gray-500 mt-1">Approve task/sales payments routing to seller and sales team balances</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by user or type..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none bg-white text-gray-900"
          />
        </div>
        <div className="flex gap-2">
          {(['pending', 'settled', 'all'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-4 py-3 rounded-xl font-medium transition-all min-h-[48px] ${
                statusFilter === s
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-primary-300'
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-gray-300 border-t-warning rounded-full animate-spin" />
        </div>
      ) : filteredSettlements.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <Receipt className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-900 font-semibold text-lg">No settlements</p>
          <p className="text-sm text-gray-500 mt-1">
            {statusFilter === 'pending'
              ? 'Pending task/sales payments will appear here'
              : 'Try a different filter'}
          </p>
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
                  <th className="text-center px-6 py-4 text-sm font-semibold text-gray-600">Status</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600">Date</th>
                  <th className="text-center px-6 py-4 text-sm font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredSettlements.map((s, idx) => (
                  <motion.tr
                    key={s.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: idx * 0.03 }}
                    className="hover:bg-gray-50"
                  >
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-900">{s.user_name}</p>
                      <p className="text-xs text-gray-500">{s.user_email}</p>
                    </td>
                    <td className="px-6 py-4 text-gray-600 capitalize">
                      {s.settlement_type.replace('_', ' ')}
                    </td>
                    <td className="px-6 py-4 text-right font-semibold text-gray-900">
                      {formatCurrency(Number(s.amount))}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                        s.status === 'settled'
                          ? 'bg-success-muted text-success'
                          : 'bg-warning-muted text-warning'
                      }`}>
                        {s.status === 'settled' && <CheckCircle className="w-3 h-3" />}
                        {s.status === 'pending' && <Clock className="w-3 h-3" />}
                        {s.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{formatDate(s.created_at)}</td>
                    <td className="px-6 py-4 text-center">
                      {s.status === 'pending' && (
                        <button
                          onClick={() => settlePayment(s)}
                          disabled={processingId === s.id}
                          className="px-3 py-2 bg-success text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50 min-h-[40px] flex items-center gap-1 mx-auto"
                        >
                          {processingId === s.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <DollarSign className="w-4 h-4" />
                              Settle
                            </>
                          )}
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
    </div>
  );
}
