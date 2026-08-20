// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT Search Analytics — Admin search insights
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo } from 'react';
import { Search, TrendingUp, AlertCircle, BarChart3 } from 'lucide-react';
import { BarChart, TimePeriodSelector, type TimePeriod, TIME_PERIODS } from './Charts';
import { AnalyticsState, AnalyticsNoData } from './AnalyticsState';
import { useSearchAnalytics } from '../../lib/analyticsHooksV2';

export function SearchAnalyticsSection() {
  const [period, setPeriod] = useState<TimePeriod>('30d');
  const days = useMemo(() => TIME_PERIODS.find((p) => p.value === period)?.days || 30, [period]);
  const { data, loading, error, syncing, offline } = useSearchAnalytics(days);

  const dailySearchData = useMemo(() => {
    if (!data?.daily_searches?.length) return [];
    return data.daily_searches.map((d) => ({ label: new Date(d.date).toLocaleDateString('en', { month: 'short', day: 'numeric' }), value: d.count }));
  }, [data?.daily_searches]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Search className="w-5 h-5 text-indigo-500" />
          Search Analytics
        </h3>
        <TimePeriodSelector value={period} onChange={setPeriod} />
      </div>

      <AnalyticsState loading={loading} error={error} syncing={syncing} offline={offline} hasData={!!data}>
        {data && (
          <div className="space-y-4">
            {/* Summary stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
                <p className="text-xs text-gray-500 dark:text-gray-400">Total Searches</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{data.total_searches.toLocaleString()}</p>
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
                <p className="text-xs text-gray-500 dark:text-gray-400">No-Result Searches</p>
                <p className="text-2xl font-bold text-amber-500">{data.no_result_searches.toLocaleString()}</p>
                <p className="text-xs text-gray-400">{data.total_searches > 0 ? `${(data.no_result_searches / data.total_searches * 100).toFixed(1)}%` : '0%'} of total</p>
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
                <p className="text-xs text-gray-500 dark:text-gray-400">Search CTR</p>
                <p className="text-2xl font-bold text-green-500">{data.search_ctr}%</p>
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
                <p className="text-xs text-gray-500 dark:text-gray-400">Daily Avg</p>
                <p className="text-2xl font-bold text-indigo-500">{data.daily_searches?.length ? Math.round(data.total_searches / data.daily_searches.length) : 0}</p>
              </div>
            </div>

            {/* Daily searches chart */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-indigo-500" /> Searches Over Time
              </h4>
              {dailySearchData.length ? <BarChart data={dailySearchData} color="#6366f1" /> : <AnalyticsNoData />}
            </div>

            {/* Trending + Popular */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-orange-500" /> Trending Searches (24h)
                </h4>
                {data.trending_searches?.length ? (
                  <div className="space-y-2">
                    {data.trending_searches.map((s, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
                        <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{s.query}</span>
                        <span className="text-sm font-medium text-orange-500">{s.count}</span>
                      </div>
                    ))}
                  </div>
                ) : <AnalyticsNoData />}
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-indigo-500" /> Popular Searches
                </h4>
                {data.popular_searches?.length ? (
                  <div className="space-y-2">
                    {data.popular_searches.map((s, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
                        <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{s.query}</span>
                        <span className="text-sm font-medium text-indigo-500">{s.count}</span>
                      </div>
                    ))}
                  </div>
                ) : <AnalyticsNoData />}
              </div>
            </div>

            {/* No-result searches warning */}
            {data.no_result_searches > 0 && (
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800 p-4">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                  <AlertCircle className="w-5 h-5" />
                  <p className="text-sm font-medium">
                    {data.no_result_searches.toLocaleString()} searches returned no results — consider adding products for these queries
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </AnalyticsState>
    </div>
  );
}
