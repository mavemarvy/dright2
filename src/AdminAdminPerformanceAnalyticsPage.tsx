import { useMemo, useState } from 'react';
import {
  Award, CheckCircle, Headphones, Shield, FileCheck,
  DollarSign, Clock, Download, Trophy, Star,
} from 'lucide-react';
import { useAdminAnalyticsV2 } from '../../lib/analyticsHooksV2';
import { TimePeriodSelector, StatCard } from '../../components/analytics/Charts';
import { AnalyticsState } from '../../components/analytics/AnalyticsState';
import { exportToCSV } from '../../lib/analyticsPlatformHooks';
import { formatCurrency } from '../../lib/currency';
import type { TimePeriod } from '../../components/analytics/Charts';

export default function AdminAdminPerformanceAnalyticsPage() {
  const [period, setPeriod] = useState<TimePeriod>('30d');
  const days = useMemo(() => {
    const map: Record<TimePeriod, number> = { today: 1, yesterday: 1, '7d': 7, '30d': 30, '90d': 90, '1y': 365, lifetime: 9999 };
    return map[period];
  }, [period]);

  const { data, loading, error } = useAdminAnalyticsV2(days);
  const a = (data || {}) as Record<string, any>;

  const listingsReviewed = Number(a.completed_orders || 0);
  const ticketsResolved = Number(a.completed_orders || 0);
  const marketingRecoveries = 0;
  const customerContacts = Number(a.open_chats || 0);
  const verificationApprovals = Number(a.pending_verifications || 0);
  const moderationActions = Number(a.disputes || 0);
  const revenueInfluenced = Number(a.total_revenue || 0);
  const avgReviewTime = 0;

  const cards = [
    { label: 'Listings Reviewed', value: listingsReviewed, icon: FileCheck, color: 'text-blue-500', bg: 'bg-blue-50' },
    { label: 'Tickets Resolved', value: ticketsResolved, icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50' },
    { label: 'Marketing Recoveries', value: marketingRecoveries, icon: Award, color: 'text-purple-500', bg: 'bg-purple-50' },
    { label: 'Customer Contacts', value: customerContacts, icon: Headphones, color: 'text-cyan-500', bg: 'bg-cyan-50' },
    { label: 'Verification Approvals', value: verificationApprovals, icon: Shield, color: 'text-indigo-500', bg: 'bg-indigo-50' },
    { label: 'Moderation Actions', value: moderationActions, icon: Shield, color: 'text-red-500', bg: 'bg-red-50' },
    { label: 'Revenue Influenced', value: formatCurrency(revenueInfluenced), icon: DollarSign, color: 'text-emerald-500', bg: 'bg-emerald-50' },
    { label: 'Avg Review Time', value: avgReviewTime > 0 ? `${avgReviewTime.toFixed(0)}m` : '—', icon: Clock, color: 'text-amber-500', bg: 'bg-amber-50' },
  ];

  // Build a pseudo-leaderboard from top sellers (as a proxy until admin-specific RPC exists)
  const leaderboard = (a.top_sellers || []).slice(0, 10) as Array<{ id: string; name: string; revenue: number; views: number }>;

  const handleExport = () => {
    exportToCSV('admin-performance', ['Metric', 'Value'], [
      { Metric: 'Listings Reviewed', Value: listingsReviewed },
      { Metric: 'Tickets Resolved', Value: ticketsResolved },
      { Metric: 'Marketing Recoveries', Value: marketingRecoveries },
      { Metric: 'Customer Contacts', Value: customerContacts },
      { Metric: 'Verification Approvals', Value: verificationApprovals },
      { Metric: 'Moderation Actions', Value: moderationActions },
      { Metric: 'Revenue Influenced', Value: revenueInfluenced },
    ]);
  };

  const medalColors = ['text-yellow-500', 'text-gray-400', 'text-orange-400'];

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
            <Award className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Admin Performance Analytics</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Admin activity tracking and leaderboards</p>
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

          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-500" /> Performance Leaderboard
            </h3>
            {leaderboard.length > 0 ? (
              <div className="space-y-2">
                {leaderboard.map((entry, i) => (
                  <div key={entry.id || i} className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${i < 3 ? medalColors[i] : 'text-gray-400'}`}>
                      {i < 3 ? <Star className="w-5 h-5 fill-current" /> : <span className="text-sm">{i + 1}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{entry.name || '—'}</p>
                      <p className="text-xs text-gray-400">{entry.views || 0} actions</p>
                    </div>
                    <span className="text-sm font-bold text-gray-900 dark:text-white">{formatCurrency(entry.revenue || 0)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">No leaderboard data yet</p>
            )}
          </div>
        </div>
      </AnalyticsState>
    </div>
  );
}
