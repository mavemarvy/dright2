import { useEffect, useMemo, useState } from 'react';
import {
  LifeBuoy, Ticket, CheckCircle, Clock, AlertTriangle,
  Download, MessageSquare,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { TimePeriodSelector, StatCard, BarChart } from '../../components/analytics/Charts';
import { AnalyticsState } from '../../components/analytics/AnalyticsState';
import { exportToCSV } from '../../lib/analyticsPlatformHooks';
import type { TimePeriod } from '../../components/analytics/Charts';

interface SupportAnalytics {
  tickets_created: number;
  tickets_resolved: number;
  open_tickets: number;
  escalated_tickets: number;
  avg_first_response_minutes: number;
  avg_resolution_minutes: number;
  daily_created: Array<{ date: string; count: number }>;
}

const EMPTY_ANALYTICS: SupportAnalytics = {
  tickets_created: 0,
  tickets_resolved: 0,
  open_tickets: 0,
  escalated_tickets: 0,
  avg_first_response_minutes: 0,
  avg_resolution_minutes: 0,
  daily_created: [],
};

export default function AdminSupportAnalyticsPage() {
  const [period, setPeriod] = useState<TimePeriod>('30d');
  const [data, setData] = useState<SupportAnalytics>(EMPTY_ANALYTICS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const days = useMemo(() => {
    const map: Record<TimePeriod, number> = { today: 1, yesterday: 1, '7d': 7, '30d': 30, '90d': 90, '1y': 365, lifetime: 3650 };
    return map[period];
  }, [period]);

  useEffect(() => {
    let mounted = true;
    const fetchAnalytics = async () => {
      setLoading(true);
      setError(null);
      const { data: result, error: rpcError } = await supabase.rpc('get_support_analytics', { p_days: days });
      if (!mounted) return;
      if (rpcError) {
        setError(rpcError.message);
        setData(EMPTY_ANALYTICS);
      } else {
        const value = (result || {}) as Partial<SupportAnalytics>;
        setData({
          tickets_created: Number(value.tickets_created || 0),
          tickets_resolved: Number(value.tickets_resolved || 0),
          open_tickets: Number(value.open_tickets || 0),
          escalated_tickets: Number(value.escalated_tickets || 0),
          avg_first_response_minutes: Number(value.avg_first_response_minutes || 0),
          avg_resolution_minutes: Number(value.avg_resolution_minutes || 0),
          daily_created: Array.isArray(value.daily_created) ? value.daily_created : [],
        });
      }
      setLoading(false);
    };

    void fetchAnalytics();
    return () => { mounted = false; };
  }, [days]);

  const ticketsCreated = data.tickets_created;
  const ticketsResolved = data.tickets_resolved;
  const openTickets = data.open_tickets;
  const escalatedTickets = data.escalated_tickets;
  const avgResponseTime = data.avg_first_response_minutes;
  const resolutionTime = data.avg_resolution_minutes;
  const resolutionRate = ticketsCreated > 0 ? (ticketsResolved / ticketsCreated) * 100 : 0;

  const cards = [
    { label: 'Tickets Created', value: ticketsCreated, icon: Ticket, color: 'text-blue-500', bg: 'bg-blue-50' },
    { label: 'Tickets Resolved', value: ticketsResolved, icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50' },
    { label: 'Open Queue', value: openTickets, icon: LifeBuoy, color: 'text-amber-500', bg: 'bg-amber-50', live: true },
    { label: 'Escalated', value: escalatedTickets, icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-50' },
    { label: 'Resolution Rate', value: `${resolutionRate.toFixed(1)}%`, icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-50' },
    { label: 'Avg First Response', value: avgResponseTime > 0 ? `${avgResponseTime.toFixed(0)}m` : '—', icon: Clock, color: 'text-purple-500', bg: 'bg-purple-50' },
    { label: 'Avg Resolution Time', value: resolutionTime > 0 ? `${resolutionTime.toFixed(0)}m` : '—', icon: Clock, color: 'text-cyan-500', bg: 'bg-cyan-50' },
  ];

  const activityData = data.daily_created.slice(-14).map(item => ({
    label: String(item.date),
    value: Number(item.count || 0),
  }));

  const handleExport = () => {
    exportToCSV('support-analytics', ['Metric', 'Value'], [
      { Metric: 'Tickets Created', Value: ticketsCreated },
      { Metric: 'Tickets Resolved', Value: ticketsResolved },
      { Metric: 'Open Queue', Value: openTickets },
      { Metric: 'Escalated Tickets', Value: escalatedTickets },
      { Metric: 'Resolution Rate', Value: `${resolutionRate.toFixed(1)}%` },
      { Metric: 'Average First Response (minutes)', Value: avgResponseTime.toFixed(2) },
      { Metric: 'Average Resolution Time (minutes)', Value: resolutionTime.toFixed(2) },
    ]);
  };

  const hasData = ticketsCreated > 0 || openTickets > 0 || escalatedTickets > 0;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
            <LifeBuoy className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Support & CRM Analytics</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Live ticket volume, resolution rates, escalation, and response time</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleExport} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <Download className="w-4 h-4" /> Export
          </button>
          <TimePeriodSelector value={period} onChange={setPeriod} />
        </div>
      </div>

      <AnalyticsState loading={loading} error={error} syncing={false} offline={false} hasData={hasData}>
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {cards.map(card => (
              <StatCard key={card.label} label={card.label} value={card.value} icon={card.icon} color={card.color} bg={card.bg} live={card.live} loading={loading} />
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Tickets Created (last 14 active days)</h3>
              {activityData.length > 0 ? (
                <BarChart data={activityData} color="#06b6d4" height={200} formatValue={(v) => v.toLocaleString()} />
              ) : (
                <div className="h-[200px] flex items-center justify-center text-sm text-gray-400">No ticket activity in this period.</div>
              )}
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-cyan-500" /> Support Summary
              </h3>
              <div className="space-y-4">
                <SummaryRow label="Created in period" value={ticketsCreated} total={ticketsCreated || 1} color="bg-blue-500" />
                <SummaryRow label="Resolved in period" value={ticketsResolved} total={ticketsCreated || 1} color="bg-green-500" />
                <SummaryRow label="Current open queue" value={openTickets} total={Math.max(openTickets + escalatedTickets, 1)} color="bg-amber-500" />
                <SummaryRow label="Current escalated queue" value={escalatedTickets} total={Math.max(openTickets + escalatedTickets, 1)} color="bg-red-500" />
              </div>
            </div>
          </div>
        </div>
      </AnalyticsState>
    </div>
  );
}

function SummaryRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = Math.min(100, total > 0 ? (value / total) * 100 : 0);
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
