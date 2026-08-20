import { useMemo, useState } from 'react';
import {
  Users, UserPlus, UserCheck, Repeat, Heart,
  TrendingDown, TrendingUp, ShieldCheck,
} from 'lucide-react';
import { useAdminAnalyticsV2 } from '../../lib/analyticsHooksV2';
import { TimePeriodSelector, StatCard, BarChart, DonutChart } from '../../components/analytics/Charts';
import { AnalyticsState } from '../../components/analytics/AnalyticsState';
import { exportToCSV } from '../../lib/analyticsPlatformHooks';
import { formatCurrency } from '../../lib/currency';
import type { TimePeriod } from '../../components/analytics/Charts';

export default function AdminCustomerAnalyticsPage() {
  const [period, setPeriod] = useState<TimePeriod>('30d');
  const days = useMemo(() => {
    const map: Record<TimePeriod, number> = { today: 1, yesterday: 1, '7d': 7, '30d': 30, '90d': 90, '1y': 365, lifetime: 9999 };
    return map[period];
  }, [period]);

  const { data, loading, error } = useAdminAnalyticsV2(days);
  const a = (data || {}) as Record<string, any>;

  const newCustomers = Number(a.new_users || 0);
  const activeCustomers = Number(a.active_users || 0);
  const totalUsers = Number(a.total_users || 0);
  const verifiedUsers = Number(a.verified_users || 0);
  const totalBuyers = Number(a.total_buyers || 0);
  const totalSellers = Number(a.total_sellers || 0);
  const totalSales = Number(a.total_sales || 0);
  const returningCustomers = Math.max(activeCustomers - newCustomers, 0);
  const retentionRate = activeCustomers > 0 ? (returningCustomers / activeCustomers * 100) : 0;
  const repeatPurchaseRate = totalBuyers > 0 ? Math.min((totalSales / totalBuyers) * 100, 100) : 0;
  const churnRate = totalUsers > 0 ? Math.max(((totalUsers - activeCustomers) / totalUsers) * 100, 0) : 0;
  const verificationCompletion = totalUsers > 0 ? (verifiedUsers / totalUsers * 100) : 0;
  const clv = totalBuyers > 0 ? Number(a.revenue_month || 0) / totalBuyers : 0;

  const cards = [
    { label: 'New Customers', value: newCustomers, icon: UserPlus, color: 'text-purple-500', bg: 'bg-purple-50' },
    { label: 'Returning Customers', value: returningCustomers, icon: Repeat, color: 'text-blue-500', bg: 'bg-blue-50' },
    { label: 'Active Customers', value: activeCustomers, icon: UserCheck, color: 'text-green-500', bg: 'bg-green-50', live: true },
    { label: 'Total Buyers', value: totalBuyers, icon: Users, color: 'text-indigo-500', bg: 'bg-indigo-50' },
    { label: 'Retention Rate', value: `${retentionRate.toFixed(1)}%`, icon: Heart, color: 'text-pink-500', bg: 'bg-pink-50' },
    { label: 'Customer LTV', value: formatCurrency(clv), icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-50' },
    { label: 'Repeat Purchase Rate', value: `${repeatPurchaseRate.toFixed(1)}%`, icon: Repeat, color: 'text-cyan-500', bg: 'bg-cyan-50' },
    { label: 'Churn Rate', value: `${churnRate.toFixed(1)}%`, icon: TrendingDown, color: 'text-red-500', bg: 'bg-red-50' },
    { label: 'Verification Completion', value: `${verificationCompletion.toFixed(1)}%`, icon: ShieldCheck, color: 'text-teal-500', bg: 'bg-teal-50' },
  ];

  const signupsData = (a.daily_signups || []).slice(-14).map((d: Record<string, number | string>) => ({
    label: String(d.date || d.label || ''),
    value: Number(d.signups || d.count || d.value || 0),
  }));

  const userTypeData = [
    { label: 'Buyers', value: totalBuyers },
    { label: 'Sellers', value: totalSellers },
    { label: 'Verified', value: verifiedUsers },
    { label: 'Unverified', value: Math.max(totalUsers - verifiedUsers, 0) },
  ].filter(d => d.value > 0);

  const handleExport = () => {
    exportToCSV('customer-analytics', ['Metric', 'Value'], [
      { Metric: 'New Customers', Value: newCustomers },
      { Metric: 'Returning Customers', Value: returningCustomers },
      { Metric: 'Active Customers', Value: activeCustomers },
      { Metric: 'Total Buyers', Value: totalBuyers },
      { Metric: 'Retention Rate', Value: `${retentionRate.toFixed(1)}%` },
      { Metric: 'Customer LTV', Value: clv },
      { Metric: 'Repeat Purchase Rate', Value: `${repeatPurchaseRate.toFixed(1)}%` },
      { Metric: 'Churn Rate', Value: `${churnRate.toFixed(1)}%` },
      { Metric: 'Verification Completion', Value: `${verificationCompletion.toFixed(1)}%` },
    ]);
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Customer Analytics</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Retention, churn, lifetime value, and verification</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleExport} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            Export
          </button>
          <TimePeriodSelector value={period} onChange={setPeriod} />
        </div>
      </div>

      <AnalyticsState loading={loading} error={error} syncing={false} offline={false} hasData={Object.keys(a).length > 0}>
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {cards.map(c => (
              <StatCard key={c.label} label={c.label} value={c.value} icon={c.icon} color={c.color} bg={c.bg} live={c.live} loading={loading} />
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">New Signups (14 days)</h3>
              <BarChart data={signupsData} color="#8b5cf6" height={200} formatValue={(v) => v.toLocaleString()} />
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">User Distribution</h3>
              {userTypeData.length > 0 ? <DonutChart data={userTypeData} /> : <div className="flex items-center justify-center text-gray-400 text-sm h-[180px]">No data</div>}
            </div>
          </div>
        </div>
      </AnalyticsState>
    </div>
  );
}
