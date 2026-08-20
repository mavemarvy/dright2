// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT Funnel Analytics — Visual conversion funnel with abandonment rates
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo } from 'react';
import { Filter } from 'lucide-react';
import { FunnelChart, TimePeriodSelector, type TimePeriod, TIME_PERIODS } from './Charts';
import { AnalyticsState, AnalyticsNoData } from './AnalyticsState';
import { useFunnelAnalytics } from '../../lib/analyticsHooksV2';
import { useAuth } from '../../contexts/AuthContext';

export function FunnelAnalyticsSection() {
  const [period, setPeriod] = useState<TimePeriod>('30d');
  const days = useMemo(() => TIME_PERIODS.find((p) => p.value === period)?.days || 30, [period]);
  const { user } = useAuth();
  const { data, loading, error, syncing, offline } = useFunnelAnalytics(user?.id, days);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Filter className="w-5 h-5 text-indigo-500" />
          Conversion Funnel
        </h3>
        <TimePeriodSelector value={period} onChange={setPeriod} />
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm">
        <AnalyticsState loading={loading} error={error} syncing={syncing} offline={offline} hasData={!!data?.steps?.length}>
          {data?.steps && data.steps.length > 0 && data.steps[0].count > 0 ? (
            <FunnelChart steps={data.steps} />
          ) : (
            <AnalyticsNoData message="No funnel data yet" />
          )}
        </AnalyticsState>
      </div>

      {data?.steps && data.steps.length > 0 && data.steps[0].count > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {data.steps.slice(0, -1).map((s, i) => {
            const next = data.steps[i + 1];
            const dropoff = s.count > 0 ? ((s.count - next.count) / s.count * 100) : 0;
            return (
              <div key={i} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-3 shadow-sm">
                <p className="text-xs text-gray-500 dark:text-gray-400">{s.step} → {next.step}</p>
                <p className="text-2xl font-bold text-red-500">{dropoff.toFixed(1)}%</p>
                <p className="text-xs text-gray-400">abandonment</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
