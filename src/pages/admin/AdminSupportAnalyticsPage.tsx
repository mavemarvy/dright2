import { useMemo, useState } from 'react';
import {
  LifeBuoy, Ticket, CheckCircle, Clock, AlertTriangle,
  Repeat, Download, MessageSquare,
} from 'lucide-react';
import { useAdminAnalyticsV2 } from '../../lib/analyticsHooksV2';
import { TimePeriodSelector, StatCard, BarChart } from '../../components/analytics/Charts';
import { AnalyticsState } from '../../components/analytics/AnalyticsState';
import { exportToCSV } from '../../lib/analyticsPlatformHooks';
import type { TimePeriod } from '../../components/analytics/Charts';

export default function AdminSupportAnalyticsPage() {
  const [period, setPeriod] = useState<TimePeriod>('30d');
  const days = useMemo(() => {
    const map: Record<TimePeriod, number> = { today: 1, yesterday: 1, '7d': 7, '30d': 30, '90d': 90, '1y': 365, lifetime: 9999 };
    return map[period];
  }, [period]);

  const { data, loading, error } = useAdminAnalyticsV2(days);
  const a = (data || {}) as Record<string, any>;

  const ticketsCreated = Number(a.total_orders || 0);
  const ticketsResolved = Number(a.completed_orders || 0);
  const openTickets = Number(a.open_chats || 0);
  const escalatedTickets = Number(a.disputes || 0);
  const avgResponseTime = 0;
  const repeatedComplaints = 0;
  const resolutionTime = 0;
  const resolutionRate = ticketsCreated > 0 ? (ticketsResolved / ticketsCreated) * 100 : 0;

  const cards = [
    { label: 'Tickets Created', value: ticketsCreated, icon: Ticket, color: 'text-blue-500', bg: 'bg-blue-50' },
    { label: 'Tickets Resolved', value: ticketsResolved, icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50' },
    { label: 'Open Tickets', value: openTickets, icon: LifeBuoy, color: 'text-amber-500', bg: 'bg-amber-50', live: true },
    { label: 'Escalated', value: escalatedTickets, icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-50' },
    { label: 'Resolution Rate', value: `${resolutionRate.toFixed(1)}%`, icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-50' },
    { label: 'Avg Response Time', value: avgResponseTime > 0 ? `${avgResponseTime.toFixed(0)}m` : '—', icon: Clock, color: 'text-purple-500', bg: 'bg-purple-50' },
    { label: 'Repeated Complaints', value: repeatedComplaints, icon: Repeat, color: 'text-orange-500', bg: 'bg-orange-50' },
    { label: 'Avg Resolution Time', value: resolutionTime > 0 ? `${resolutionTime.toFixed(0)}m` : '—', icon: Clock, color: 'text-cyan-500', bg: 'bg-cyan-50' },
  ];

  const activityData = (a.daily_signups || []).slice(-14).map((d: { date: string; signups: number }) => ({
    label: d.date,
    value: d.signups,
  }));

  const handleExport = () => {
    exportToCSV('support-analytics', ['Metric', 'Value'], [
      { Metric: 'Tickets Created', Value: ticketsCreated },
      { Metric: 'Tickets Resolved', Value: ticketsResolved },
      { Metric: 'Open Tickets', Value: openTickets },
      { Metric: 'Escalated Tickets', Value: escalatedTickets },
      { Metric: 'Resolution Rate', Value: `${resolutionRate.toFixed(1)}%` },
    ]);
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
            <LifeBuoy className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Support & CRM Analytics</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Ticket volume, resolution rates, and response times</p>
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
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Activity (14 days)</h3>
              <BarChart data={activityData} color="#06b6d4" height={200} formatValue={(v) => v.toLocaleString()} />
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-cyan-500" /> Support Summary
              </h3>
              <div className="space-y-4">
                <SummaryRow label="Total Created" value={ticketsCreated} total={ticketsCreated || 1} color="bg-blue-500" />
                <SummaryRow label="Resolved" value={ticketsResolved} total={ticketsCreated || 1} color="bg-green-500" />
                <SummaryRow label="Open" value={openTickets} total={ticketsCreated || 1} color="bg-amber-500" />
                <SummaryRow label="Escalated" value={escalatedTickets} total={ticketsCreated || 1} color="bg-red-500" />
              </div>
            </div>
          </div>
        </div>
      </AnalyticsState>
    </div>
  );
}

function SummaryRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-gray-600 dark:text-gray-400">{label}</span>
        <span className="font-medium text-gray-900 dark:text-white">{value.toLocaleString()}</span>
      </div>
      <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-lg h-2 overflow-hidden">
        <div className={`h-full rounded-lg ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
