import { useState } from 'react';
import { useAdminPerformance } from '../../lib/crmHooks';
import { PERIOD_TYPES } from '../../lib/crmTypes';
import { PageHeader, LoadingBar } from '../../components/admin/RbacComponents';
import { Trophy, Star, DollarSign, TrendingUp, Award, Medal, Crown } from 'lucide-react';

const PERIOD_LABELS: Record<string, string> = {
  daily: 'Admin of the Day',
  weekly: 'Admin of the Week',
  monthly: 'Admin of the Month',
  yearly: 'Admin of the Year',
};

export default function AdminAdminPerformancePage() {
  const { records, loading } = useAdminPerformance();
  const [period, setPeriod] = useState<string>('daily');

  const filtered = records.filter((r) => r.period_type === period);
  const sorted = [...filtered].sort((a, b) => Number(b.total_score) - Number(a.total_score));

  const topPerformer = sorted[0];
  const avgScore = sorted.length > 0 ? sorted.reduce((s, r) => s + Number(r.total_score), 0) / sorted.length : 0;
  const totalRevenue = sorted.reduce((s, r) => s + Number(r.revenue_influenced), 0);
  const avgSatisfaction = sorted.length > 0 ? sorted.reduce((s, r) => s + Number(r.customer_satisfaction_score), 0) / sorted.length : 0;

  const rankIcons = [
    <Crown key="1" className="w-5 h-5 text-amber-400" />,
    <Medal key="2" className="w-5 h-5 text-gray-400" />,
    <Award key="3" className="w-5 h-5 text-orange-400" />,
  ];

  return (
    <div className="p-4 md:p-8">
      <PageHeader title="Admin Performance Dashboard" subtitle="Track administrator performance with configurable leaderboards — daily, weekly, monthly, and yearly" />

      {loading && <LoadingBar />}

      {/* Period Selector */}
      <div className="flex gap-2 mb-6">
        {PERIOD_TYPES.map((p) => (
          <button key={p.value} onClick={() => setPeriod(p.value)}
            className={`px-4 py-2 text-sm font-medium rounded-xl transition-colors ${period === p.value ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
            {PERIOD_LABELS[p.value] ?? p.label}
          </button>
        ))}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard icon={<Trophy className="w-5 h-5" />} label="Total Admins" value={sorted.length.toString()} color="bg-primary-50 text-primary-600" />
        <StatCard icon={<TrendingUp className="w-5 h-5" />} label="Avg Score" value={avgScore.toFixed(1)} color="bg-blue-50 text-blue-600" />
        <StatCard icon={<DollarSign className="w-5 h-5" />} label="Revenue Influenced" value={`$${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 0 })}`} color="bg-green-50 text-green-600" />
        <StatCard icon={<Star className="w-5 h-5" />} label="Avg Satisfaction" value={`${avgSatisfaction.toFixed(2)}/5`} color="bg-amber-50 text-amber-600" />
      </div>

      {/* Top Performer Highlight */}
      {topPerformer && (
        <div className="bg-gradient-to-r from-primary-50 to-blue-50 rounded-2xl border border-primary-100 p-5 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-300 to-amber-500 flex items-center justify-center text-white text-xl font-bold">
              {(topPerformer.admin?.full_name ?? topPerformer.admin?.email ?? '?')[0]?.toUpperCase()}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Crown className="w-5 h-5 text-amber-400" />
                <span className="text-sm font-medium text-primary-600">{PERIOD_LABELS[period]}</span>
              </div>
              <h3 className="font-bold text-gray-900 text-lg">{topPerformer.admin?.full_name ?? topPerformer.admin?.username ?? 'Unknown'}</h3>
              <p className="text-xs text-gray-500">{topPerformer.admin?.email}</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-primary-600">{Number(topPerformer.total_score).toFixed(1)}</p>
              <p className="text-xs text-gray-400">Score</p>
            </div>
          </div>
        </div>
      )}

      {/* Leaderboard Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-sm text-gray-900 flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-400" /> Leaderboard</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Rank</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Admin</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Tickets</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Response Time</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Satisfaction</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden xl:table-cell">Listings</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden xl:table-cell">Recoveries</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden xl:table-cell">Revenue</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Compliance</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sorted.length === 0 && !loading && (
                <tr><td colSpan={10} className="text-center py-8 text-gray-400">No performance records for this period</td></tr>
              )}
              {sorted.map((r, i) => (
                <tr key={r.id} className={i < 3 ? 'bg-amber-50/30' : 'hover:bg-gray-50'}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {i < 3 ? rankIcons[i] : <span className="text-gray-400 text-sm w-5 text-center">{i + 1}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 text-xs font-bold flex-shrink-0">
                        {(r.admin?.full_name ?? r.admin?.email ?? '?')[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{r.admin?.full_name ?? r.admin?.username ?? 'Unknown'}</p>
                        <p className="text-xs text-gray-400">{r.admin?.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-gray-700">{r.tickets_resolved}</td>
                  <td className="px-4 py-3 hidden lg:table-cell text-gray-600 text-xs">
                    {Number(r.avg_response_time_minutes) > 0 ? `${Number(r.avg_response_time_minutes).toFixed(0)}m` : '—'}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    {Number(r.customer_satisfaction_score) > 0 ? (
                      <span className="flex items-center gap-1"><Star className="w-3 h-3 text-amber-400" /> {Number(r.customer_satisfaction_score).toFixed(2)}</span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 hidden xl:table-cell text-gray-600 text-xs">
                    <span className="text-green-600">{r.listings_approved}</span> / <span className="text-red-600">{r.listings_rejected}</span>
                  </td>
                  <td className="px-4 py-3 hidden xl:table-cell text-gray-600 text-xs">
                    {r.marketing_recoveries + r.subscription_renewals_recovered}
                  </td>
                  <td className="px-4 py-3 hidden xl:table-cell text-gray-700 text-xs">
                    ${Number(r.revenue_influenced).toLocaleString(undefined, { minimumFractionDigits: 0 })}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-gray-700">{r.compliance_reviews_completed}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-bold text-primary-600">{Number(r.total_score).toFixed(1)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Note */}
      <div className="mt-4 bg-gray-50 rounded-xl p-3">
        <p className="text-xs text-gray-400">
          Super Admin can configure scoring rules and disable leaderboards from System Settings. Scores are calculated from tickets resolved, response time, satisfaction, listings processed, recoveries, revenue influenced, and compliance reviews.
        </p>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${color}`}>{icon}</div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-lg font-bold text-gray-900">{value}</p>
    </div>
  );
}
