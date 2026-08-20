import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Receipt, Calendar, Search, DollarSign, Clock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import UniversalAIAssistant from '../components/UniversalAIAssistant';
import { formatCurrency } from '../lib/currency';

interface SaleRecord {
  id: string;
  buyer_name: string;
  product_name: string;
  commission_amount: number;
  status: string;
  sale_date: string;
  created_at: string;
}

export default function SalesPage() {
  const { user } = useAuth();
    const [sales, setSales] = useState<SaleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'pending'>('all');
  const [stats, setStats] = useState({ totalEarned: 0, totalPending: 0 });

  useEffect(() => {
    if (user) {
      fetchSales();
    }
  }, [user]);

  const fetchSales = async () => {
    try {
      const { data, error } = await supabase
        .from('sales_records')
        .select('*')
        .eq('promoter_id', user?.id)
        .order('sale_date', { ascending: false });

      if (error) throw error;

      if (data) {
        setSales(data as SaleRecord[]);
        const totalEarned = data
          .filter(s => s.status === 'paid')
          .reduce((sum, s) => sum + Number(s.commission_amount), 0);
        const totalPending = data
          .filter(s => s.status === 'pending')
          .reduce((sum, s) => sum + Number(s.commission_amount), 0);
        setStats({ totalEarned, totalPending });
      }
    } catch (error) {
      console.error('Error fetching sales:', error);
    } finally {
      setLoading(false);
    }
  };


  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const filteredSales = sales.filter(sale => {
    const matchesSearch =
      sale.buyer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sale.product_name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || sale.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Sales Records</h1>
        <p className="text-gray-500 mt-1">Track your earnings and commission</p>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-success-muted rounded-xl">
              <DollarSign className="w-5 h-5 text-success" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Earned</p>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(stats.totalEarned)}</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-warning-muted rounded-xl">
              <Clock className="w-5 h-5 text-warning" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Pending</p>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(stats.totalPending)}</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by buyer or product..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all bg-white text-gray-900"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'paid', 'pending'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={`px-4 py-3 rounded-xl font-medium transition-all min-h-[48px] ${
                statusFilter === filter
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-primary-300'
              }`}
            >
              {filter.charAt(0).toUpperCase() + filter.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Sales List */}
      {filteredSales.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-white rounded-2xl p-12 text-center shadow-sm border border-gray-100"
        >
          <Receipt className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 text-lg">No sales records found</p>
          <p className="text-sm text-gray-400 mt-1">
            {searchQuery || statusFilter !== 'all'
              ? 'Try adjusting your filters'
              : 'Your sales will appear here'}
          </p>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {filteredSales.map((sale, index) => (
            <motion.div
              key={sale.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start gap-4">
                {/* Status Badge */}
                <div
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold uppercase tracking-wide ${
                    sale.status === 'paid'
                      ? 'bg-success-muted text-success'
                      : 'bg-warning-muted text-warning'
                  }`}
                >
                  {sale.status}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div>
                      <p className="font-semibold text-gray-900">{sale.buyer_name}</p>
                      <p className="text-sm text-gray-500">{sale.product_name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-gray-900">
                        {formatCurrency(Number(sale.commission_amount))}
                      </p>
                      <p className="text-xs text-gray-500">commission</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Calendar className="w-4 h-4" />
                    {formatDate(sale.sale_date)}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Desktop Table View */}
      <div className="hidden lg:block">
        {filteredSales.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mt-6">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600">Buyer</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600">Product</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600">Date</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600">Status</th>
                  <th className="text-right px-6 py-4 text-sm font-semibold text-gray-600">Commission</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredSales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">{sale.buyer_name}</td>
                    <td className="px-6 py-4 text-gray-600">{sale.product_name}</td>
                    <td className="px-6 py-4 text-gray-600">{formatDate(sale.sale_date)}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                          sale.status === 'paid'
                            ? 'bg-success-muted text-success'
                            : 'bg-warning-muted text-warning'
                        }`}
                      >
                        {sale.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-semibold text-gray-900">
                      {formatCurrency(Number(sale.commission_amount))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <UniversalAIAssistant type="seller" />
    </div>
  );
}
