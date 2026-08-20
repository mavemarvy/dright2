import { useState, useEffect, useCallback } from 'react';
import {
  BarChart3, Loader2, DollarSign, TrendingUp, TrendingDown,
  Clock, CheckCircle, XCircle, Activity, Globe,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/currency';

interface AnalyticsData {
  totalRevenue: number;
  totalEscrow: number;
  totalFailed: number;
  totalRefunds: number;
  totalAbandoned: number;
  totalWithdrawals: number;
  totalWalletFunding: number;
  totalSubscriptionRevenue: number;
  paymentCount: number;
  failedCount: number;
  abandonedCount: number;
  successRate: number;
  avgProcessingTime: number | null;
}

export default function AdminPaymentAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today');

  const load = useCallback(async () => {
    setLoading(true);

    const now = new Date();
    const start = new Date();
    if (period === 'today') start.setHours(0, 0, 0, 0);
    else if (period === 'week') start.setDate(now.getDate() - 7);
    else start.setDate(now.getDate() - 30);

    const startISO = start.toISOString();

    // Fetch payment transactions
    const { data: txs } = await supabase
      .from('paystack_transactions')
      .select('status, amount, purpose, created_at')
      .gte('created_at', startISO);

    const allTxs = txs || [];
    const successful = allTxs.filter((t) => t.status === 'success');
    const failed = allTxs.filter((t) => t.status === 'failed');
    const abandoned = allTxs.filter((t) => t.status === 'abandoned');

    const totalRevenue = successful.reduce((sum, t) => sum + (Number(t.amount) || 0) / 100, 0);
    const fundingTxs = successful.filter((t) => t.purpose === 'wallet_funding');
    const productTxs = successful.filter((t) => t.purpose === 'product_purchase');
    void productTxs;
    const subTxs = successful.filter((t) => t.purpose === 'subscription');

    const totalWalletFunding = fundingTxs.reduce((sum, t) => sum + (Number(t.amount) || 0) / 100, 0);
    const totalSubscriptionRevenue = subTxs.reduce((sum, t) => sum + (Number(t.amount) || 0) / 100, 0);

    // Fetch escrow
    const { data: escrowData } = await supabase
      .from('escrow_payments')
      .select('amount, status')
      .gte('created_at', startISO);

    const totalEscrow = (escrowData || []).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    // Fetch refunds
    const { data: refunds } = await supabase
      .from('wallet_transactions')
      .select('amount')
      .eq('transaction_type', 'refund')
      .gte('created_at', startISO);

    const totalRefunds = (refunds || []).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

    // Fetch withdrawals
    const { data: withdrawals } = await supabase
      .from('withdrawal_requests')
      .select('amount')
      .gte('created_at', startISO);

    const totalWithdrawals = (withdrawals || []).reduce((sum, w) => sum + (Number(w.amount) || 0), 0);

    // Fetch abandoned payments
    const { data: abandonedPays } = await supabase
      .from('abandoned_payments')
      .select('amount')
      .gte('created_at', startISO);

    const totalAbandoned = (abandonedPays || []).reduce((sum, a) => sum + (Number(a.amount) || 0), 0);

    const successRate = allTxs.length > 0 ? (successful.length / allTxs.length) * 100 : 0;

    setData({
      totalRevenue,
      totalEscrow,
      totalFailed: failed.reduce((sum, t) => sum + (Number(t.amount) || 0) / 100, 0),
      totalRefunds,
      totalAbandoned,
      totalWithdrawals,
      totalWalletFunding,
      totalSubscriptionRevenue,
      paymentCount: successful.length,
      failedCount: failed.length,
      abandonedCount: abandoned.length + (abandonedPays || []).length,
      successRate,
      avgProcessingTime: null,
    });

    setLoading(false);
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const fmt = (v: number) => formatCurrency(v || 0, 'NGN');

  if (loading || !data) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-primary-500 animate-spin" /></div>;
  }

  const revenueCards = [
    { label: 'Total Revenue', value: fmt(data.totalRevenue), icon: DollarSign, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Wallet Funding', value: fmt(data.totalWalletFunding), icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Product Purchases', value: fmt(data.totalRevenue - data.totalWalletFunding - data.totalSubscriptionRevenue), icon: DollarSign, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Subscriptions', value: fmt(data.totalSubscriptionRevenue), icon: Activity, color: 'text-indigo-600', bg: 'bg-indigo-50' },
  ];

  const transactionCards = [
    { label: 'Successful Payments', value: data.paymentCount, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Failed Payments', value: data.failedCount, icon: XCircle, color: 'text-red-500', bg: 'bg-red-50' },
    { label: 'Abandoned', value: data.abandonedCount, icon: TrendingDown, color: 'text-gray-500', bg: 'bg-gray-50' },
    { label: 'Success Rate', value: `${data.successRate.toFixed(1)}%`, icon: Activity, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  ];

  const escrowCards = [
    { label: 'Escrow Held', value: fmt(data.totalEscrow), icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Refunds', value: fmt(data.totalRefunds), icon: TrendingDown, color: 'text-red-500', bg: 'bg-red-50' },
    { label: 'Withdrawals', value: fmt(data.totalWithdrawals), icon: DollarSign, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Abandoned Value', value: fmt(data.totalAbandoned), icon: TrendingDown, color: 'text-gray-500', bg: 'bg-gray-50' },
  ];

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Payment Analytics</h1>
            <p className="text-sm text-gray-500">Transaction metrics and gateway performance</p>
          </div>
        </div>

        {/* Period selector */}
        <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1">
          {(['today', 'week', 'month'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
                period === p ? 'bg-primary-600 text-white' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              {p === 'today' ? 'Today' : p === 'week' ? '7 Days' : '30 Days'}
            </button>
          ))}
        </div>
      </div>

      {/* Revenue Section */}
      <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
        <DollarSign className="w-4 h-4 text-green-600" /> Revenue
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {revenueCards.map((c) => (
          <div key={c.label} className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center mb-2`}>
              <c.icon className={`w-5 h-5 ${c.color}`} />
            </div>
            <p className="text-lg font-bold text-gray-900">{c.value}</p>
            <p className="text-sm text-gray-500">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Transaction Stats */}
      <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
        <Activity className="w-4 h-4 text-blue-600" /> Transactions
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {transactionCards.map((c) => (
          <div key={c.label} className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center mb-2`}>
              <c.icon className={`w-5 h-5 ${c.color}`} />
            </div>
            <p className="text-xl font-bold text-gray-900">{c.value}</p>
            <p className="text-sm text-gray-500">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Escrow & Financial */}
      <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
        <Clock className="w-4 h-4 text-amber-600" /> Escrow & Financial
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {escrowCards.map((c) => (
          <div key={c.label} className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center mb-2`}>
              <c.icon className={`w-5 h-5 ${c.color}`} />
            </div>
            <p className="text-lg font-bold text-gray-900">{c.value}</p>
            <p className="text-sm text-gray-500">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Gateway Performance */}
      <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
        <Globe className="w-4 h-4 text-purple-600" /> Gateway Performance
      </h3>
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">Paystack</p>
            <p className="text-xs text-gray-500">Active gateway</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs text-gray-400">Success Rate</p>
              <p className="text-sm font-bold text-emerald-600">{data.successRate.toFixed(1)}%</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">Transactions</p>
              <p className="text-sm font-bold text-gray-900">{data.paymentCount + data.failedCount}</p>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Operational
            </span>
          </div>
        </div>
        {/* Success rate bar */}
        <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-green-600 rounded-full transition-all"
            style={{ width: `${data.successRate}%` }}
          />
        </div>
        <div className="flex justify-between mt-1.5 text-xs text-gray-400">
          <span>{data.paymentCount} successful</span>
          <span>{data.failedCount} failed</span>
        </div>
      </div>
    </div>
  );
}
