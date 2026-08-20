import { useMemo, useState } from 'react';
import {
  Share2, UserPlus, UserCheck, DollarSign, TrendingUp,
  Target, Award, Download,
} from 'lucide-react';
import { useAdminAnalyticsV2 } from '../../lib/analyticsHooksV2';
import { TimePeriodSelector, StatCard, BarChart } from '../../components/analytics/Charts';
import { AnalyticsState } from '../../components/analytics/AnalyticsState';
import { exportToCSV } from '../../lib/analyticsPlatformHooks';
import { formatCurrency } from '../../lib/currency';
import type { TimePeriod } from '../../components/analytics/Charts';

export default function AdminAffiliateAnalyticsPage() {
  const [period, setPeriod] = useState<TimePeriod>('30d');
  const days = useMemo(() => {
    const map: Record<TimePeriod, number> = { today: 1, yesterday: 1, '7d': 7, '30d': 30, '90d': 90, '1y': 365, lifetime: 9999 };
    return map[period];
  }, [period]);

  const { data, loading, error } = useAdminAnalyticsV2(days);
  const a = (data || {}) as Record<string, any>;

  const newAffiliates = Number(a.new_users || 0);
  const activeAffiliates = Number(a.live_active_users || 0);
  const commissionEarned = Number(a.affiliate_payouts || 0);
  const commissionPaid = Number(a.affiliate_payouts || 0);
  const referralGrowth = 0;
  const conversionRate = Number(a.conversion_rate || 0);
  const referralRevenue = Number(a.total_revenue || 0);
  const totalAffiliates = Number(a.total_sellers || 0);

  const cards = [
    { label: 'Total Affiliates', value: totalAffiliates, icon: Share2, color: 'text-indigo-500', bg: 'bg-indigo-50' },
    { label: 'New Affiliates', value: newAffiliates, icon: UserPlus, color: 'text-purple-500', bg: 'bg-purple-50' },
    { label: 'Active Affiliates', value: activeAffiliates, icon: UserCheck, color: 'text-green-500', bg: 'bg-green-50', live: true },
    { label: 'Commission Earned', value: formatCurrency(commissionEarned), icon: DollarSign, color: 'text-emerald-500', bg: 'bg-emerald-50' },
    { label: 'Commission Paid', value: formatCurrency(commissionPaid), icon: DollarSign, color: 'text-amber-500', bg: 'bg-amber-50' },
    { label: 'Referral Revenue', value: formatCurrency(referralRevenue), icon: TrendingUp, color: 'text-cyan-500', bg: 'bg-cyan-50' },
    { label: 'Conversion Rate', value: `${conversionRate.toFixed(2)}%`, icon: Target, color: 'text-pink-500', bg: 'bg-pink-50' },
    { label: 'Referral Growth', value: `${referralGrowth.toFixed(1)}%`, icon: TrendingUp, color: 'text-blue-500', bg: 'bg-blue-50' },
  ];

  const topAffiliates = (a.top_sellers || []).slice(0, 8) as Array<Record<string, number | string>>;

  const referralData = (a.daily_signups || []).slice(-14).map((d: Record<string, number | string>) => ({
    label: String(d.date || d.label || ''),
    value: Number(d.signups || d.count || d.value || 0),
  }));

  const handleExport = () => {
    exportToCSV('affiliate-analytics', ['Metric', 'Value'], [
      { Metric: 'Total Affiliates', Value: totalAffiliates },
      { Metric: 'New Affiliates', Value: newAffiliates },
      { Metric: 'Active Affiliates', Value: activeAffiliates },
      { Metric: 'Commission Earned', Value: commissionEarned },
      { Metric: 'Commission Paid', Value: commissionPaid },
      { Metric: 'Referral Revenue', Value: referralRevenue },
      { Metric: 'Conversion Rate', Value: `${conversionRate.toFixed(2)}%` },
      { Metric: 'Referral Growth', Value: `${referralGrowth.toFixed(1)}%` },
    ]);
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center">
            <Share2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Affiliate & Referral Analytics</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Commission, growth, and top performer tracking</p>
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
              <StatCard key={c.label} label={c.label} value={c.value} icon={c.icon} color={c.color} bg={c.bg} live={c.live} loading={loading} />
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Referral Signups (14 days)</h3>
              <BarChart data={referralData} color="#6366f1" height={200} formatValue={(v) => v.toLocaleString()} />
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-500" /> Top Affiliates
              </h3>
              <div className="space-y-2">
                {topAffiliates.length > 0 ? topAffiliates.map((aff, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-xs font-bold text-indigo-600">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{String(aff.name || aff.affiliate_name || '—')}</p>
                      <p className="text-xs text-gray-400">{Number(aff.referrals || aff.referral_count || 0)} referrals</p>
                    </div>
                    <span className="text-sm font-bold text-gray-900 dark:text-white">{formatCurrency(Number(aff.commission || 0))}</span>
                  </div>
                )) : <p className="text-sm text-gray-400 text-center py-4">No affiliate data yet</p>}
              </div>
            </div>
          </div>
        </div>
      </AnalyticsState>
    </div>
  );
}
