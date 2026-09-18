import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Receipt, Search, Loader2, CheckCircle, Clock,
  DollarSign, AlertTriangle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { emitEvent } from '../../lib/notificationEvents';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency } from '../../lib/currency';

interface Settlement {
  id: string;
  seller_id: string;
  product_id: string | null;
  sale_id: string | null;
  amount: number;
  settlement_type: string;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  seller_email?: string;
  seller_name?: string;
}

type SettlementRpcResult = {
  success?: boolean;
  already_processed?: boolean;
  balance_after?: number;
};

export default function AdminSettlementsPage() {
  const { user } = useAuth();
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'settled' | 'all'>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    fetchSettlements();
  }, [statusFilter]);

  const fetchSettlements = async () => {
    setLoading(true);
    setActionError(null);
    try {
      let query = supabase.from('internal_settlements').select('*');
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      query = query.order('created_at', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;

      if (data && data.length > 0) {
        const rows = data as Settlement[];
        const sellerIds = [...new Set(rows.map((settlement) => settlement.seller_id))];
        const { data: sellers, error: sellersError } = await supabase
          .from('users')
          .select('id, email, full_name')
          .in('id', sellerIds);
        if (sellersError) throw sellersError;

        const sellerMap = new Map((sellers || []).map((seller) => [seller.id, { email: seller.email, name: seller.full_name }]));
        setSettlements(rows.map((settlement) => ({
          ...settlement,
          seller_email: sellerMap.get(settlement.seller_id)?.email || 'Unknown',
          seller_name: sellerMap.get(settlement.seller_id)?.name || 'Unknown',
        })));
      } else {
        setSettlements([]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load settlements';
      console.error('Error fetching settlements:', error);
      setActionError(message);
      setSettlements([]);
    } finally {
      setLoading(false);
    }
  };

  const settlePayment = async (settlement: Settlement) => {
    if (!user?.id) return;
    setProcessingId(settlement.id);
    setActionError(null);
    try {
      const { data, error } = await supabase.rpc('admin_settle_internal_settlement', {
        p_settlement_id: settlement.id,
      });
      if (error) throw error;

      const result = (data || {}) as SettlementRpcResult;
      if (!result.already_processed) {
        await emitEvent({
          module: 'wallet',
          eventType: 'payment_received',
          recipientIds: settlement.seller_id,
          actorId: user.id,
          metadata: {
            amount: Number(settlement.amount),
            currency: 'USD',
            reference: settlement.id,
          },
        });
      }

      await fetchSettlements();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to settle payment';
      console.error('Error settling payment:', error);
      setActionError(message);
    } finally {
      setProcessingId(null);
    }
  };

  const filteredSettlements = settlements.filter((settlement) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return settlement.seller_email?.toLowerCase().includes(query)
      || settlement.seller_name?.toLowerCase().includes(query)
      || settlement.settlement_type.toLowerCase().includes(query)
      || settlement.sale_id?.toLowerCase().includes(query);
  });

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Receipt className="w-6 h-6 text-warning" />
          Internal Settlements
        </h1>
        <p className="text-gray-500 mt-1">Settle approved sales/task proceeds into the seller’s canonical wallet</p>
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
            placeholder="Search by seller, type, or sale ID..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none bg-white text-gray-900"
          />
        </div>
        <div className="flex gap-2">
          {(['pending', 'settled', 'all'] as const).map((status) => (
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
      ) : filteredSettlements.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <Receipt className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-900 font-semibold text-lg">No settlements</p>
          <p className="text-sm text-gray-500 mt-1">{statusFilter === 'pending' ? 'Pending settlements will appear here.' : 'Try a different filter.'}</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600">Seller</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600">Type</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600">Sale</th>
                  <th className="text-right px-6 py-4 text-sm font-semibold text-gray-600">Amount</th>
                  <th className="text-center px-6 py-4 text-sm font-semibold text-gray-600">Status</th>
                  <th className="text-center px-6 py-4 text-sm font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredSettlements.map((settlement, index) => (
                  <motion.tr key={settlement.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: index * 0.02 }} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-900">{settlement.seller_name}</p>
                      <p className="text-xs text-gray-500">{settlement.seller_email}</p>
                    </td>
                    <td className="px-6 py-4 text-gray-600 capitalize">{settlement.settlement_type.replace(/_/g, ' ')}</td>
                    <td className="px-6 py-4">
                      <p className="text-xs font-mono text-gray-500">{settlement.sale_id ? `${settlement.sale_id.slice(0, 8)}…` : '—'}</p>
                      <p className="text-xs text-gray-400">{new Date(settlement.created_at).toLocaleDateString()}</p>
                    </td>
                    <td className="px-6 py-4 text-right font-semibold text-gray-900">{formatCurrency(Number(settlement.amount))}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${settlement.status === 'settled' ? 'bg-success-muted text-success' : 'bg-warning-muted text-warning'}`}>
                        {settlement.status === 'settled' ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                        {settlement.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {settlement.status === 'pending' && (
                        <button
                          onClick={() => settlePayment(settlement)}
                          disabled={processingId === settlement.id || !user?.id}
                          className="px-3 py-2 bg-success text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 inline-flex items-center gap-1"
                        >
                          {processingId === settlement.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
                          Settle
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
