// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT Admin Analytics Dashboard — Real-time, server-verified
// Platform-wide KPIs, top sellers/buyers/products, geographic data
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo } from 'react';
import {
  Users, UserCheck, Activity, Store, ShoppingBag, Package, DollarSign,
  TrendingUp, Eye, Search, AlertCircle, MessageCircle, Bell, Mail,
  Wallet, ArrowDownCircle, Cpu, Globe, Award, Tag,
} from 'lucide-react';
import { LineChart, BarChart, DonutChart, TimePeriodSelector, StatCard, type TimePeriod, TIME_PERIODS } from './Charts';
import { AnalyticsState, AnalyticsNoData } from './AnalyticsState';
import { useAdminAnalyticsV2 } from '../../lib/analyticsHooksV2';
import { formatCurrency } from '../../lib/currency';

const formatStatValue = (v: number | string) => formatCurrency(typeof v === "string" ? parseFloat(v) : v);

export function AdminAnalyticsDashboard() {
  const [period, setPeriod] = useState<TimePeriod>('30d');
  const days = useMemo(() => TIME_PERIODS.find((p) => p.value === period)?.days || 30, [period]);
  const { data, loading, error, syncing, offline } = useAdminAnalyticsV2(days);


  const dailyViewsData = useMemo(() => {
    if (!data?.daily_views?.length) return [];
    return data.daily_views.map((d) => ({ label: new Date(d.date).toLocaleDateString('en', { month: 'short', day: 'numeric' }), value: d.views }));
  }, [data?.daily_views]);

  const dailyRevenueData = useMemo(() => {
    if (!data?.daily_revenue?.length) return [];
    return data.daily_revenue.map((d) => ({ label: new Date(d.date).toLocaleDateString('en', { month: 'short', day: 'numeric' }), value: Number(d.revenue) }));
  }, [data?.daily_revenue]);

  const dailySignupsData = useMemo(() => {
    if (!data?.daily_signups?.length) return [];
    return data.daily_signups.map((d) => ({ label: new Date(d.date).toLocaleDateString('en', { month: 'short', day: 'numeric' }), value: d.signups }));
  }, [data?.daily_signups]);

  const hourlyData = useMemo(() => {
    if (!data?.hourly_activity?.length) return [];
    return data.hourly_activity.map((d) => ({ label: `${d.hour}:00`, value: d.count }));
  }, [data?.hourly_activity]);

  const categoryData = useMemo(() => {
    if (!data?.top_categories?.length) return [];
    return data.top_categories.map((d) => ({ label: d.category, value: d.count }));
  }, [data?.top_categories]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Activity className="w-5 h-5 text-indigo-500" />
          Platform Analytics
        </h2>
        <TimePeriodSelector value={period} onChange={setPeriod} />
      </div>

      <AnalyticsState loading={loading} error={error} syncing={syncing} offline={offline} hasData={!!data}>
        {data && (
          <div className="space-y-6">
            {/* Live KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              <StatCard label="Live Active Users" value={data.live_active_users} icon={Activity} color="text-green-500" bg="bg-green-50" live loading={loading} />
              <StatCard label="Online Sellers" value={data.online_sellers} icon={Store} color="text-purple-500" bg="bg-purple-50" live loading={loading} />
              <StatCard label="Online Buyers" value={data.online_buyers} icon={ShoppingBag} color="text-blue-500" bg="bg-blue-50" live loading={loading} />
              <StatCard label="Visitors Today" value={data.visitors_today} icon={Users} color="text-indigo-500" bg="bg-indigo-50" loading={loading} />
              <StatCard label="Visitors This Month" value={data.visitors_this_month} icon={UserCheck} color="text-cyan-500" bg="bg-cyan-50" loading={loading} />
              <StatCard label="Total Users" value={data.total_users} icon={Users} color="text-gray-500" bg="bg-gray-50" loading={loading} />
              <StatCard label="New Today" value={data.new_users_today} icon={UserCheck} color="text-green-500" bg="bg-green-50" loading={loading} />
              <StatCard label="Total Sellers" value={data.total_sellers} icon={Store} color="text-orange-500" bg="bg-orange-50" loading={loading} />
              <StatCard label="Total Buyers" value={data.total_buyers} icon={ShoppingBag} color="text-pink-500" bg="bg-pink-50" loading={loading} />
              <StatCard label="Total Listings" value={data.total_listings} icon={Package} color="text-amber-500" bg="bg-amber-50" loading={loading} />
              <StatCard label="Active Listings" value={data.active_listings} icon={Package} color="text-emerald-500" bg="bg-emerald-50" loading={loading} />
              <StatCard label="Pending Listings" value={data.pending_listings} icon={AlertCircle} color="text-yellow-500" bg="bg-yellow-50" loading={loading} />
              <StatCard label="Total Orders" value={data.total_orders} icon={ShoppingBag} color="text-indigo-500" bg="bg-indigo-50" loading={loading} />
              <StatCard label="Completed" value={data.completed_orders} icon={TrendingUp} color="text-green-500" bg="bg-green-50" loading={loading} />
              <StatCard label="Pending Orders" value={data.pending_orders} icon={AlertCircle} color="text-orange-500" bg="bg-orange-50" loading={loading} />
              <StatCard label="Cancelled" value={data.cancelled_orders} icon={AlertCircle} color="text-red-500" bg="bg-red-50" loading={loading} />
              <StatCard label="Revenue" value={data.total_revenue} icon={DollarSign} color="text-green-600" bg="bg-green-50" formatValue={formatStatValue} loading={loading} />
              <StatCard label="Refunds" value={data.refunds} icon={ArrowDownCircle} color="text-red-500" bg="bg-red-50" formatValue={formatStatValue} loading={loading} />
              <StatCard label="Disputes" value={data.disputes} icon={AlertCircle} color="text-red-500" bg="bg-red-50" loading={loading} />
              <StatCard label="Open Chats" value={data.open_chats} icon={MessageCircle} color="text-cyan-500" bg="bg-cyan-50" loading={loading} />
              <StatCard label="AI Requests" value={data.ai_requests} icon={Cpu} color="text-purple-500" bg="bg-purple-50" loading={loading} />
              <StatCard label="Push Sent" value={data.push_notifications_sent} icon={Bell} color="text-blue-500" bg="bg-blue-50" loading={loading} />
              <StatCard label="Emails Sent" value={data.emails_sent} icon={Mail} color="text-teal-500" bg="bg-teal-50" loading={loading} />
              <StatCard label="Affiliate Payouts" value={data.affiliate_payouts} icon={Wallet} color="text-violet-500" bg="bg-violet-50" formatValue={formatStatValue} loading={loading} />
              <StatCard label="Wallet Deposits" value={data.wallet_deposits} icon={Wallet} color="text-indigo-500" bg="bg-indigo-50" formatValue={formatStatValue} loading={loading} />
              <StatCard label="Withdrawals" value={data.wallet_withdrawals} icon={ArrowDownCircle} color="text-orange-500" bg="bg-orange-50" formatValue={formatStatValue} loading={loading} />
              <StatCard label="Total Views" value={data.total_views} icon={Eye} color="text-cyan-500" bg="bg-cyan-50" loading={loading} />
              <StatCard label="Searches" value={data.total_searches} icon={Search} color="text-teal-500" bg="bg-teal-50" loading={loading} />
              <StatCard label="Conversion Rate" value={`${data.conversion_rate}%`} icon={TrendingUp} color="text-indigo-500" bg="bg-indigo-50" loading={loading} />
              <StatCard label="Pending Verifications" value={data.pending_verifications} icon={AlertCircle} color="text-yellow-500" bg="bg-yellow-50" loading={loading} />
              <StatCard label="Pending Withdrawals" value={data.pending_withdrawals} icon={ArrowDownCircle} color="text-red-500" bg="bg-red-50" loading={loading} />
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <Eye className="w-4 h-4 text-indigo-500" /> Views Over Time
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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-green-500" /> Daily Signups
                </h3>
                {dailySignupsData.length ? <BarChart data={dailySignupsData} color="#10b981" /> : <AnalyticsNoData />}
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-purple-500" /> Hourly Activity
                </h3>
                {hourlyData.length ? <BarChart data={hourlyData} color="#8b5cf6" height={180} /> : <AnalyticsNoData />}
              </div>
            </div>

            {/* Top Products + Top Sellers */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <Package className="w-4 h-4 text-amber-500" /> Top Products
                </h3>
                {data.top_products?.length ? (
                  <div className="space-y-2">
                    {data.top_products.map((p, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
                        <span className="text-sm text-gray-700 dark:text-gray-300 truncate flex-1">{p.name}</span>
                        <div className="flex items-center gap-3 ml-2">
                          <span className="text-xs text-indigo-500">{p.views} views</span>
                          <span className="text-xs text-green-500">{p.sales} sales</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <AnalyticsNoData />}
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <Award className="w-4 h-4 text-purple-500" /> Top Sellers
                </h3>
                {data.top_sellers?.length ? (
                  <div className="space-y-2">
                    {data.top_sellers.map((s, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
                        <span className="text-sm text-gray-700 dark:text-gray-300 truncate flex-1">{s.name}</span>
                        <div className="flex items-center gap-3 ml-2">
                          <span className="text-xs text-indigo-500">{s.views} views</span>
                          <span className="text-xs text-green-500">{formatCurrency(s.revenue)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <AnalyticsNoData />}
              </div>
            </div>

            {/* Top Buyers + Top Search Keywords */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-blue-500" /> Top Buyers
                </h3>
                {data.top_buyers?.length ? (
                  <div className="space-y-2">
                    {data.top_buyers.map((b, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
                        <span className="text-sm text-gray-700 dark:text-gray-300 truncate flex-1">{b.name}</span>
                        <div className="flex items-center gap-3 ml-2">
                          <span className="text-xs text-indigo-500">{b.orders} orders</span>
                          <span className="text-xs text-green-500">{formatCurrency(b.spent)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <AnalyticsNoData />}
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <Search className="w-4 h-4 text-teal-500" /> Top Search Keywords
                </h3>
                {data.top_search_keywords?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {data.top_search_keywords.map((k, i) => (
                      <span key={i} className="px-3 py-1.5 rounded-lg bg-teal-50 dark:bg-teal-900/20 text-sm text-teal-700 dark:text-teal-400">
                        {k.keyword} <span className="font-medium">{k.count}</span>
                      </span>
                    ))}
                  </div>
                ) : <AnalyticsNoData />}
              </div>
            </div>

            {/* Categories + Countries */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <Tag className="w-4 h-4 text-amber-500" /> Top Categories
                </h3>
                {categoryData.length ? <DonutChart data={categoryData} /> : <AnalyticsNoData />}
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-cyan-500" /> Top Countries
                </h3>
                {data.top_countries?.length ? (
                  <div className="space-y-2">
                    {data.top_countries.map((c, i) => {
                      const max = data.top_countries[0]?.count || 1;
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <span className="text-sm text-gray-600 dark:text-gray-400 w-24 truncate">{c.country}</span>
                          <div className="flex-1 h-6 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden">
                            <div className="h-full bg-cyan-500 rounded-lg transition-all duration-500" style={{ width: `${(c.count / max * 100)}%` }} />
                          </div>
                          <span className="text-sm font-medium text-gray-900 dark:text-white w-12 text-right">{c.count}</span>
                        </div>
                      );
                    })}
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
