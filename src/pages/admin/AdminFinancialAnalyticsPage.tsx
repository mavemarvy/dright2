import { useMemo, useState } from 'react';
import {
  DollarSign, TrendingUp, Wallet,
  ArrowDownCircle, ArrowUpCircle, AlertTriangle, Download,
  CreditCard, RefreshCw,
} from 'lucide-react';
import { useAdminAnalyticsV2 } from '../../lib/analyticsHooksV2';
import { TimePeriodSelector, StatCard, LineChart } from '../../components/analytics/Charts';
import { AnalyticsState } from '../../components/analytics/AnalyticsState';
import { exportToCSV } from '../../lib/analyticsPlatformHooks';
import { formatCurrency } from '../../lib/currency';
import type { TimePeriod } from '../../components/analytics/Charts';

export default function AdminFinancialAnalyticsPage() {
  const [period, setPeriod] = useState<TimePeriod>('30d');
  const days = useMemo(() => {
    const map: Record<TimePeriod, number> = { today: 1, yesterday: 1, '7d': 7, '30d': 30, '90d': 90, '1y': 365, lifetime: 9999 };
    return map[period];
  }, [period]);

  const { data, loading, error } = useAdminAnalyticsV2(days);
  const a = (data || {}) as Record<string, any>;

  const deposits = Number(a.wallet_deposits || 0);
  const withdrawals = Number(a.wallet_withdrawals || 0);
  const pendingWithdrawals = Number(a.pending_withdrawals || 0);
  const failedPayments = Number(a.cancelled_orders || 0);
  const refunds = Number(a.refunds || 0);
  const transactionVolume = Number(a.total_orders || 0);
  const totalRevenue = Number(a.total_revenue || 0);
  const netRevenue = totalRevenue - refunds;

  const cards = [
    { label: 'Deposits', value: formatCurrency(deposits), icon: ArrowDownCircle, color: 'text-green-500', bg: 'bg-green-50' },
    { label: 'Withdrawals', value: formatCurrency(withdrawals), icon: ArrowUpCircle, color: 'text-amber-500', bg: 'bg-amber-50' },
    { label: 'Pending Withdrawals', value: pendingWithdrawals, icon: Wallet, color: 'text-orange-500', bg: 'bg-orange-50' },
    { label: 'Failed Payments', value: failedPayments, icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-50' },
    { label: 'Refunds', value: formatCurrency(refunds), icon: RefreshCw, color: 'text-pink-500', bg: 'bg-pink-50' },
    { label: 'Transaction Volume', value: transactionVolume, icon: CreditCard, color: 'text-indigo-500', bg: 'bg-indigo-50' },
    { label: 'Gross Revenue', value: formatCurrency(totalRevenue), icon: DollarSign, color: 'text-emerald-500', bg: 'bg-emerald-50' },
    { label: 'Net Revenue', value: formatCurrency(netRevenue), icon: TrendingUp, color: 'text-teal-500', bg: 'bg-teal-50' },
  ];

  const revenueData = (a.daily_revenue || []).slice(-14).map((d: { date: string; revenue: number }) => ({
    label: d.date,
    value: d.revenue,
  }));

  const handleExport = () => {
    exportToCSV('financial-analytics', ['Metric', 'Value'], [
      { Metric: 'Deposits', Value: deposits },
      { Metric: 'Withdrawals', Value: withdrawals },
      { Metric: 'Pending Withdrawals', Value: pendingWithdrawals },
      { Metric: 'Failed Payments', Value: failedPayments },
      { Metric: 'Refunds', Value: refunds },
      { Metric: 'Transaction Volume', Value: transactionVolume },
      { Metric: 'Gross Revenue', Value: totalRevenue },
      { Metric: 'Net Revenue', Value: netRevenue },
    ]);
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Financial Analytics</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Deposits, withdrawals, refunds, and revenue trends</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleExport} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <Download className="w-4 h-4" /> Export
          </button>
          <TimePeriodSelector value={period} onChange={setPeriod} />
        </div>
      </div>

      <AnalyticsState loading={loading} error={error} syncing={false} offline={false} hasData={Object.keys(a).length > 0}>
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {cards.map(c => (
              <StatCard key={c.label} label={c.label} value={c.value} icon={c.icon} color={c.color} bg={c.bg} loading={loading} />
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Daily Revenue (14 days)</h3>
              <LineChart data={revenueData} color="#10b981" height={200} formatValue={(v) => formatCurrency(v)} />
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Revenue Breakdown</h3>
              <div className="space-y-3">
                <RevenueBar label="Gross Revenue" value={totalRevenue} max={totalRevenue || 1} color="bg-emerald-500" />
                <RevenueBar label="Refunds" value={refunds} max={totalRevenue || 1} color="bg-red-500" />
                <RevenueBar label="Net Revenue" value={netRevenue} max={totalRevenue || 1} color="bg-teal-500" />
                <RevenueBar label="Deposits" value={deposits} max={Math.max(deposits, withdrawals, 1)} color="bg-green-500" />
                <RevenueBar label="Withdrawals" value={withdrawals} max={Math.max(deposits, withdrawals, 1)} color="bg-amber-500" />
              </div>
            </div>
          </div>
        </div>
      </AnalyticsState>
    </div>
  );
}

function RevenueBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-gray-600 dark:text-gray-400">{label}</span>
        <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(value)}</span>
      </div>
      <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-lg h-2 overflow-hidden">
        <div className={`h-full rounded-lg ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
