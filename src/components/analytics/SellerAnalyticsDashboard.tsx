// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT Seller Analytics Dashboard — Real-time, server-verified
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo } from 'react';
import {
  Eye, Users, UserCheck, Heart, Share2, MessageCircle, Phone, Globe,
  ShoppingCart, CheckCircle, XCircle, DollarSign, TrendingUp, Clock,
  BarChart3, Smartphone, Monitor, Save, Activity,
} from 'lucide-react';
import { LineChart, BarChart, DonutChart, TimePeriodSelector, StatCard, type TimePeriod, TIME_PERIODS } from './Charts';
import { AnalyticsState, AnalyticsNoData } from './AnalyticsState';
import { useSellerAnalyticsV2 } from '../../lib/analyticsHooksV2';
import { formatCurrency } from '../../lib/currency';

const formatStatValue = (v: number | string) => formatCurrency(typeof v === "string" ? parseFloat(v) : v);

export function SellerAnalyticsDashboard() {
  const [period, setPeriod] = useState<TimePeriod>('30d');
  const days = useMemo(() => TIME_PERIODS.find((p) => p.value === period)?.days || 30, [period]);
  const { data, loading, error, syncing, offline } = useSellerAnalyticsV2(days);

  const formatSeconds = (v: number | string) => {
    const n = typeof v === 'string' ? parseFloat(v) : v;
    if (!n) return '0s';
    if (n < 60) return `${Math.round(n)}s`;
    return `${Math.floor(n / 60)}m ${Math.round(n % 60)}s`;
  };

  const dailyViewsData = useMemo(() => {
    if (!data?.daily_views?.length) return [];
    return data.daily_views.map((d) => ({ label: new Date(d.date).toLocaleDateString('en', { month: 'short', day: 'numeric' }), value: d.count }));
  }, [data?.daily_views]);

  const dailyRevenueData = useMemo(() => {
    if (!data?.daily_revenue?.length) return [];
    return data.daily_revenue.map((d) => ({ label: new Date(d.date).toLocaleDateString('en', { month: 'short', day: 'numeric' }), value: Number(d.revenue) }));
  }, [data?.daily_revenue]);

  const hourlyData = useMemo(() => {
    if (!data?.hourly_activity?.length) return [];
    return data.hourly_activity.map((d) => ({ label: `${d.hour}:00`, value: d.count }));
  }, [data?.hourly_activity]);

  const deviceData = useMemo(() => {
    if (!data?.device_breakdown?.length) return [];
    return data.device_breakdown.map((d) => ({ label: d.device || 'Unknown', value: d.count }));
  }, [data?.device_breakdown]);

  const osData = useMemo(() => {
    if (!data?.os_breakdown?.length) return [];
    return data.os_breakdown.map((d) => ({ label: d.os || 'Unknown', value: d.count }));
  }, [data?.os_breakdown]);

  const browserData = useMemo(() => {
    if (!data?.browser_breakdown?.length) return [];
    return data.browser_breakdown.map((d) => ({ label: d.browser || 'Unknown', value: d.count }));
  }, [data?.browser_breakdown]);

  const trafficSourceData = useMemo(() => {
    if (!data?.traffic_sources?.length) return [];
    return data.traffic_sources.map((d) => ({ label: d.source || 'Direct', value: d.count }));
  }, [data?.traffic_sources]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Activity className="w-5 h-5 text-indigo-500" />
          Seller Analytics
        </h2>
        <TimePeriodSelector value={period} onChange={setPeriod} />
      </div>

      <AnalyticsState loading={loading} error={error} syncing={syncing} offline={offline} hasData={!!data}>
        {data && (
          <div className="space-y-6">
            {/* Live KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              <StatCard label="Live Views" value={data.live_views} icon={Eye} color="text-green-500" bg="bg-green-50" live loading={loading} />
              <StatCard label="Total Views" value={data.total_views} icon={Eye} color="text-indigo-500" bg="bg-indigo-50" loading={loading} />
              <StatCard label="Unique Visitors" value={data.unique_visitors} icon={Users} color="text-purple-500" bg="bg-purple-50" loading={loading} />
              <StatCard label="Returning Visitors" value={data.returning_visitors} icon={UserCheck} color="text-blue-500" bg="bg-blue-50" loading={loading} />
              <StatCard label="Favorites" value={data.favorites} icon={Heart} color="text-pink-500" bg="bg-pink-50" loading={loading} />
              <StatCard label="Shares" value={data.shares} icon={Share2} color="text-cyan-500" bg="bg-cyan-50" loading={loading} />
              <StatCard label="Chat Requests" value={data.chat_requests} icon={MessageCircle} color="text-orange-500" bg="bg-orange-50" loading={loading} />
              <StatCard label="Phone Clicks" value={data.phone_clicks} icon={Phone} color="text-teal-500" bg="bg-teal-50" loading={loading} />
              <StatCard label="Website Clicks" value={data.website_clicks} icon={Globe} color="text-sky-500" bg="bg-sky-50" loading={loading} />
              <StatCard label="Product Saves" value={data.product_saves} icon={Save} color="text-amber-500" bg="bg-amber-50" loading={loading} />
              <StatCard label="Cart Adds" value={data.cart_adds} icon={ShoppingCart} color="text-violet-500" bg="bg-violet-50" loading={loading} />
              <StatCard label="Checkout Starts" value={data.checkout_starts} icon={ShoppingCart} color="text-indigo-500" bg="bg-indigo-50" loading={loading} />
              <StatCard label="Purchases" value={data.purchases} icon={CheckCircle} color="text-green-500" bg="bg-green-50" loading={loading} />
              <StatCard label="Completed Orders" value={data.orders_completed} icon={CheckCircle} color="text-emerald-500" bg="bg-emerald-50" loading={loading} />
              <StatCard label="Cancelled Orders" value={data.orders_cancelled} icon={XCircle} color="text-red-500" bg="bg-red-50" loading={loading} />
              <StatCard label="Revenue" value={data.revenue} icon={DollarSign} color="text-green-600" bg="bg-green-50" formatValue={formatStatValue} loading={loading} />
              <StatCard label="Conversion Rate" value={`${data.conversion_rate}%`} icon={TrendingUp} color="text-indigo-500" bg="bg-indigo-50" loading={loading} />
              <StatCard label="Avg Session Time" value={data.avg_session_time} icon={Clock} color="text-purple-500" bg="bg-purple-50" formatValue={formatSeconds} loading={loading} />
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-indigo-500" /> Views Over Time
                </h3>
                {dailyViewsData.length ? <LineChart data={dailyViewsData} color="#6366f1" /> : <AnalyticsNoData />}
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-green-500" /> Revenue Over Time
                </h3>
                {dailyRevenueData.length ? <BarChart data={dailyRevenueData} color="#10b981" formatValue={formatStatValue} /> : <AnalyticsNoData />}
              </div>
            </div>

            {/* Hourly activity */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-purple-500" /> Hourly Activity
              </h3>
              {hourlyData.length ? <BarChart data={hourlyData} color="#8b5cf6" height={180} /> : <AnalyticsNoData />}
            </div>

            {/* Traffic Sources */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                <Globe className="w-4 h-4 text-cyan-500" /> Traffic Sources
              </h3>
              {trafficSourceData.length ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  {trafficSourceData.map((s, i) => {
                    const total = trafficSourceData.reduce((sum, x) => sum + x.value, 0);
                    const pct = total > 0 ? (s.value / total * 100).toFixed(1) : '0';
                    return (
                      <div key={i} className="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{s.value.toLocaleString()}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{s.label}</p>
                        <p className="text-xs text-indigo-500 font-medium">{pct}%</p>
                      </div>
                    );
                  })}
                </div>
              ) : <AnalyticsNoData />}
            </div>

            {/* Geographic + Device */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Top Countries</h3>
                {data.top_countries?.length ? (
                  <div className="space-y-2">
                    {data.top_countries.map((c, i) => {
                      const max = data.top_countries[0]?.count || 1;
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <span className="text-sm text-gray-600 dark:text-gray-400 w-32 truncate">{c.country}</span>
                          <div className="flex-1 h-6 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden">
                            <div className="h-full bg-indigo-500 rounded-lg transition-all duration-500" style={{ width: `${(c.count / max * 100)}%` }} />
                          </div>
                          <span className="text-sm font-medium text-gray-900 dark:text-white w-12 text-right">{c.count}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : <AnalyticsNoData />}
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Top Cities</h3>
                {data.top_cities?.length ? (
                  <div className="space-y-2">
                    {data.top_cities.map((c, i) => {
                      const max = data.top_cities[0]?.count || 1;
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <span className="text-sm text-gray-600 dark:text-gray-400 w-32 truncate">{c.city}</span>
                          <div className="flex-1 h-6 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden">
                            <div className="h-full bg-purple-500 rounded-lg transition-all duration-500" style={{ width: `${(c.count / max * 100)}%` }} />
                          </div>
                          <span className="text-sm font-medium text-gray-900 dark:text-white w-12 text-right">{c.count}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : <AnalyticsNoData />}
              </div>
            </div>

            {/* Device + OS + Browser breakdowns */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <Monitor className="w-4 h-4 text-blue-500" /> Device Types
                </h3>
                {deviceData.length ? <DonutChart data={deviceData} /> : <AnalyticsNoData />}
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-purple-500" /> Operating Systems
                </h3>
                {osData.length ? <DonutChart data={osData} /> : <AnalyticsNoData />}
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-cyan-500" /> Browsers
                </h3>
                {browserData.length ? <DonutChart data={browserData} /> : <AnalyticsNoData />}
              </div>
            </div>

            {/* Languages + Timezones */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Languages</h3>
                {data.languages?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {data.languages.map((l, i) => (
                      <span key={i} className="px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm text-gray-600 dark:text-gray-400">
                        {l.language} <span className="text-indigo-500 font-medium">{l.count}</span>
                      </span>
                    ))}
                  </div>
                ) : <AnalyticsNoData />}
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Timezones</h3>
                {data.timezones?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {data.timezones.map((t, i) => (
                      <span key={i} className="px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm text-gray-600 dark:text-gray-400">
                        {t.timezone} <span className="text-purple-500 font-medium">{t.count}</span>
                      </span>
                    ))}
                  </div>
                ) : <AnalyticsNoData />}
              </div>
            </div>
          </div>
        )}
      </AnalyticsState>
    </div>
  );
}
